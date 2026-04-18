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
        header('Location: ' . APP_BASE . '/login');
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

// ── Brute-force protection ────────────────────────────────────────────────────

/**
 * Returns the real client IP, preferring REMOTE_ADDR.
 * X-Forwarded-For is intentionally ignored — it can be spoofed and would
 * allow an attacker to bypass IP-based limits by faking the header.
 */
function get_client_ip(): string {
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * Prune expired rows, then count recent failures for this IP + username.
 * Returns ['blocked' => bool, 'attempts' => int, 'retry_after' => int]
 */
function check_rate_limit(string $ip, string $username): array {
    $db = db();
    $now = time();

    // Remove attempts outside the sliding window
    $db->prepare('DELETE FROM login_attempts WHERE attempted_at < ?')
       ->execute([$now - LOGIN_WINDOW_SECONDS]);

    // Count failures in the window for this IP or username
    $stmt = $db->prepare('
        SELECT COUNT(*) AS cnt,
               MAX(attempted_at) AS last_attempt
        FROM login_attempts
        WHERE (ip = ? OR username = ?)
          AND attempted_at >= ?
    ');
    $stmt->execute([$ip, $username, $now - LOGIN_WINDOW_SECONDS]);
    $row = $stmt->fetch();

    $attempts = (int) $row['cnt'];
    $last     = (int) $row['last_attempt'];

    if ($attempts >= LOGIN_MAX_ATTEMPTS) {
        $retry_after = ($last + LOGIN_LOCKOUT_SECONDS) - $now;
        return ['blocked' => true, 'attempts' => $attempts, 'retry_after' => max(1, $retry_after)];
    }

    return ['blocked' => false, 'attempts' => $attempts, 'retry_after' => 0];
}

/**
 * Record a failed login attempt.
 */
function record_failed_attempt(string $ip, string $username): void {
    $db = db();
    $db->prepare('INSERT INTO login_attempts (ip, username, attempted_at) VALUES (?, ?, ?)')
       ->execute([$ip, $username, time()]);
}

/**
 * Clear all attempts for this IP + username on successful login.
 */
function clear_attempts(string $ip, string $username): void {
    $db = db();
    $db->prepare('DELETE FROM login_attempts WHERE ip = ? OR username = ?')
       ->execute([$ip, $username]);
}

/**
 * Progressive delay: sleep 0 for first failures, then 1s, 2s, 4s, 8s… (capped at 32s).
 * Kicks in only after LOGIN_MAX_ATTEMPTS / 2 failures so legitimate typos feel instant.
 */
function apply_progressive_delay(int $attempts): void {
    $threshold = (int) ceil(LOGIN_MAX_ATTEMPTS / 2);
    if ($attempts < $threshold) return;

    $exponent = min($attempts - $threshold, 5); // cap at 2^5 = 32s
    $delay    = LOGIN_DELAY_BASE * (2 ** $exponent);
    sleep($delay);
}

// ── Login ─────────────────────────────────────────────────────────────────────

function login_user(string $username, string $password): array {
    $db  = db();
    $ip  = get_client_ip();

    // ── Rate limit check ──────────────────────────────────────────────────────
    $limit = check_rate_limit($ip, $username);
    if ($limit['blocked']) {
        $minutes = (int) ceil($limit['retry_after'] / 60);
        return [
            'ok'          => false,
            'error'       => "Too many failed attempts. Try again in {$minutes} minute(s).",
            'retry_after' => $limit['retry_after'],
        ];
    }

    // Progressive delay based on previous failures (runs before DB query)
    apply_progressive_delay($limit['attempts']);

    // ── Credential check ──────────────────────────────────────────────────────
    $stmt = $db->prepare('SELECT id, username, password_hash, pbkdf2_salt, encrypted_master_key FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        record_failed_attempt($ip, $username);
        // Generic message — do not reveal whether username exists
        return ['ok' => false, 'error' => 'Invalid username or password'];
    }

    // ── Success ───────────────────────────────────────────────────────────────
    clear_attempts($ip, $username);

    // Set session data first, then regenerate ID
    // (regenerate_id before assignment can wipe data on some PHP configs)
    $_SESSION['user'] = [
        'id'       => $user['id'],
        'username' => $user['username'],
    ];
    session_regenerate_id(true);

    return [
        'ok'                   => true,
        'pbkdf2_salt'          => $user['pbkdf2_salt'],
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
