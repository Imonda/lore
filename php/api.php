<?php
/**
 * api.php — REST-style API endpoint
 * All data arriving here is already encrypted by the browser.
 * This file never sees plaintext conversation content.
 */

require_once __DIR__ . '/../php/auth.php';
require_once __DIR__ . '/../php/db.php';

session_start_secure();

header('Content-Type: application/json');

// Auth guard
$user = current_user();
if (!$user) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
    exit;
}

// Parse request
$body   = json_decode(file_get_contents('php://input'), true);
$action = $body['action'] ?? '';

switch ($action) {

    // ── Import a single conversation ──────────────────────────────────────────
    case 'import_conversation':
        $db = db();

        $source     = $body['source']     ?? '';
        $ext_id     = $body['ext_id']     ?? '';
        $title      = $body['title']      ?? '';
        $created_at = $body['created_at'] ?? null;
        $updated_at = $body['updated_at'] ?? null;
        $messages   = $body['messages']   ?? [];

        if (!in_array($source, ['claude', 'chatgpt', 'gemini', 'lechat'], true) || !$ext_id || !$title) {
            echo json_encode(['ok' => false, 'error' => 'Invalid payload']);
            exit;
        }

        // Normalize dates
        $created_at = $created_at ? date('Y-m-d H:i:s', strtotime($created_at)) : date('Y-m-d H:i:s');
        $updated_at = $updated_at ? date('Y-m-d H:i:s', strtotime($updated_at)) : $created_at;

        try {
            // Check for duplicate
            $stmt = $db->prepare('SELECT id FROM conversations WHERE user_id = ? AND source = ? AND ext_id = ?');
            $stmt->execute([$user['id'], $source, $ext_id]);
            if ($existing = $stmt->fetch()) {
                echo json_encode(['ok' => true, 'duplicate' => true, 'id' => $existing['id']]);
                exit;
            }

            $db->beginTransaction();

            // Insert conversation
            $stmt = $db->prepare('
                INSERT INTO conversations (user_id, source, ext_id, title, created_at, updated_at, msg_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ');
            $stmt->execute([$user['id'], $source, $ext_id, $title, $created_at, $updated_at, count($messages)]);
            $conv_id = $db->lastInsertId();

            // Insert messages
            $stmt = $db->prepare('
                INSERT INTO messages (conversation_id, role, content, created_at)
                VALUES (?, ?, ?, ?)
            ');
            foreach ($messages as $msg) {
                $role       = in_array($msg['role'], ['user', 'assistant', 'system'], true) ? $msg['role'] : 'user';
                $msg_date   = !empty($msg['created_at']) ? date('Y-m-d H:i:s', strtotime($msg['created_at'])) : $created_at;
                $stmt->execute([$conv_id, $role, $msg['content'], $msg_date]);
            }

            $db->commit();
            echo json_encode(['ok' => true, 'id' => $conv_id]);

        } catch (Exception $e) {
            $db->rollBack();
            error_log('Lore import error: ' . $e->getMessage());
            echo json_encode(['ok' => false, 'error' => 'Database error']);
        }
        break;

    // ── Fetch all conversations (encrypted titles only) ───────────────────────
    case 'get_conversations':
        $db   = db();
        $stmt = $db->prepare('
            SELECT id, source, ext_id, title, created_at, updated_at, msg_count
            FROM conversations
            WHERE user_id = ?
            ORDER BY updated_at DESC
        ');
        $stmt->execute([$user['id']]);
        echo json_encode(['ok' => true, 'conversations' => $stmt->fetchAll()]);
        break;

    // ── Fetch messages for one conversation ───────────────────────────────────
    case 'get_messages':
        $conv_id = (int)($body['conversation_id'] ?? 0);
        if (!$conv_id) {
            echo json_encode(['ok' => false, 'error' => 'Missing conversation_id']);
            exit;
        }

        $db = db();

        // Verify ownership
        $stmt = $db->prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?');
        $stmt->execute([$conv_id, $user['id']]);
        if (!$stmt->fetch()) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'Forbidden']);
            exit;
        }

        $stmt = $db->prepare('SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC');
        $stmt->execute([$conv_id]);
        echo json_encode(['ok' => true, 'messages' => $stmt->fetchAll()]);
        break;

    // ── Delete a conversation ─────────────────────────────────────────────────
    case 'delete_conversation':
        $conv_id = (int)($body['conversation_id'] ?? 0);
        if (!$conv_id) {
            echo json_encode(['ok' => false, 'error' => 'Missing conversation_id']);
            exit;
        }

        $db = db();
        $stmt = $db->prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?');
        $stmt->execute([$conv_id, $user['id']]);
        echo json_encode(['ok' => true, 'deleted' => $stmt->rowCount() > 0]);
        break;

    // ── Export: return all encrypted conversation IDs for client-side pull ──────
    // The actual decryption happens in the browser — this just confirms ownership
    // and returns the full list so the client can iterate get_messages per conv.
    case 'export_conversations':
        $db   = db();
        $stmt = $db->prepare('
            SELECT id, source, ext_id, title, created_at, updated_at, msg_count
            FROM conversations
            WHERE user_id = ?
            ORDER BY updated_at DESC
        ');
        $stmt->execute([$user['id']]);
        echo json_encode(['ok' => true, 'conversations' => $stmt->fetchAll()]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Unknown action']);
}
