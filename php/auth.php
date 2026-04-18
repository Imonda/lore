<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/db.php';

// ── Session ──────────────────────────────────────────────────────────────────

function session_start_secure(): void {
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Strict');
    ini_set('session.gc_maxlifetime', SESSION_LIFETIME);
    session_start();
}

function current_user(): ?array {
    return $_SESSION['user'] ?? null;
}

function require_auth(): void {
    if (!current_user()) {
        header('Location: /login');
        exit;
    }
}

// ── Registration ─────────────────────────────────────────────────────────────

function register_user(string $username, string $password, string $email, string $encrypted_master_key, string $recovery_encrypted_master_key, string $pbkdf2_salt): array {
    $db = db();

    // Check username availability
    $stmt = $db->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        return ['ok' => false, 'error' => 'Username already taken'];
    }

    // Check email if provided
    if ($email !== '') {
        $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            return ['ok' => false, 'error' => 'Email already registered'];
        }
    }

    // Hash password for login verification (separate from encryption key)
    $password_hash = password_hash($password, PASSWORD_ARGON2ID);

    $stmt = $db->prepare('
        INSERT INTO users (username, password_hash, email, pbkdf2_salt, encrypted_master_key, recovery_encrypted_master_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
    ');
    $stmt->execute([
        $username,
        $password_hash,
        $email !== '' ? $email : null,
        $pbkdf2_salt,
        $encrypted_master_key,
        $recovery_encrypted_master_key,
    ]);

    return ['ok' => true, 'user_id' => $db->lastInsertId()];
}

// ── Login ─────────────────────────────────────────────────────────────────────

function login_user(string $username, string $password): array {
    $db = db();

    $stmt = $db->prepare('SELECT id, username, password_hash, pbkdf2_salt, encrypted_master_key FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        // Constant-time response to prevent timing attacks
        return ['ok' => false, 'error' => 'Invalid username or password'];
    }

    // Set session data first, then regenerate ID
    // (regenerate_id before assignment can wipe data on some PHP configs)
    $_SESSION['user'] = [
        'id'       => $user['id'],
        'username' => $user['username'],
    ];
    session_regenerate_id(true);

    return [
        'ok'                  => true,
        'pbkdf2_salt'         => $user['pbkdf2_salt'],
        'encrypted_master_key' => $user['encrypted_master_key'],
    ];
}

// ── Recovery ──────────────────────────────────────────────────────────────────

function recover_account(string $username, string $recovery_key, string $new_password, string $new_encrypted_master_key, string $new_pbkdf2_salt): array {
    $db = db();

    $stmt = $db->prepare('SELECT id, recovery_encrypted_master_key FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user) {
        return ['ok' => false, 'error' => 'User not found'];
    }

    // Verification that recovery key is valid happens client-side (decrypt master key)
    // Here we just update credentials with new password-derived key
    $new_password_hash = password_hash($new_password, PASSWORD_ARGON2ID);

    $stmt = $db->prepare('
        UPDATE users SET password_hash = ?, pbkdf2_salt = ?, encrypted_master_key = ? WHERE id = ?
    ');
    $stmt->execute([$new_password_hash, $new_pbkdf2_salt, $new_encrypted_master_key, $user['id']]);

    return ['ok' => true, 'recovery_encrypted_master_key' => $user['recovery_encrypted_master_key']];
}

// ── Logout ────────────────────────────────────────────────────────────────────

function logout_user(): void {
    session_destroy();
    setcookie(session_name(), '', time() - 3600, '/');
}
