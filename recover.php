<?php
require_once __DIR__ . '/php/auth.php';
session_start_secure();

if (current_user()) {
    header('Location: ' . APP_BASE . '/');
    exit;
}

$error   = '';
$step    = 'form'; // form | reset
$payload = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action   = $_POST['action'] ?? '';
    $username = trim($_POST['username'] ?? '');

    if ($action === 'lookup') {
        if (!$username) {
            $error = 'Please enter your username.';
        } else {
            $db   = db();
            $stmt = $db->prepare('SELECT id, recovery_encrypted_master_key, pbkdf2_salt FROM users WHERE username = ?');
            $stmt->execute([$username]);
            $user = $stmt->fetch();

            if (!$user) {
                // Intentionally vague — don't reveal if username exists
                $error = 'If this account exists, recovery data has been loaded.';
            } else {
                $step    = 'reset';
                $payload = htmlspecialchars(json_encode([
                    'username'                     => $username,
                    'recovery_encrypted_master_key' => $user['recovery_encrypted_master_key'],
                ]), ENT_QUOTES);
            }
        }

    } elseif ($action === 'reset') {
        $username              = trim($_POST['username'] ?? '');
        $new_password          = $_POST['new_password'] ?? '';
        $new_encrypted_mk      = $_POST['new_encrypted_master_key'] ?? '';
        $new_salt              = $_POST['new_pbkdf2_salt'] ?? '';

        if (strlen($new_password) < 8) {
            $error = 'New password must be at least 8 characters.';
            $step  = 'reset';
        } elseif (!$new_encrypted_mk || !$new_salt) {
            $error = 'Encryption data missing. Please try again.';
            $step  = 'reset';
        } else {
            $result = recover_account($username, '', $new_password, $new_encrypted_mk, $new_salt);
            if ($result['ok']) {
                header('Location: ' . APP_BASE . '/login?recovered=1');
                exit;
            }
            $error = $result['error'];
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Account Recovery - Lore</title>
    <link rel="stylesheet" href="<?= APP_BASE ?>/css/dark.css">
    <link rel="stylesheet" href="<?= APP_BASE ?>/css/light.css">
    <link rel="stylesheet" href="<?= APP_BASE ?>/css/style.css">
    <link rel="stylesheet" href="<?= APP_BASE ?>/css/auth.css">
</head>
<body class="auth-page">

<div class="auth-wrap">
    <div class="auth-box">
        <div class="auth-logo">LORE<span>.</span></div>
        <div class="auth-subtitle">Account recovery</div>

        <?php if ($error): ?>
            <div class="auth-error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <?php if ($step === 'form'): ?>
        <!-- Step 1: enter username -->
        <form method="POST">
            <input type="hidden" name="action" value="lookup">
            <div class="auth-field">
                <label>Username</label>
                <input type="text" name="username" autocomplete="username" autofocus>
            </div>
            <button type="submit" class="btn primary full">Continue →</button>
        </form>
        <div class="auth-link"><a href="<?= APP_BASE ?>/login">← Back to sign in</a></div>

        <?php elseif ($step === 'reset'): ?>
        <!-- Step 2: enter recovery phrase + new password -->
        <div class="kit-desc" style="margin-bottom:20px;">
            Enter your <strong>Emergency Kit</strong> recovery phrase and choose a new password.
            Your existing conversations will be preserved.
        </div>

        <div class="auth-field">
            <label>Recovery phrase</label>
            <textarea id="recovery-phrase" rows="3"
                style="width:100%; background:var(--bg3); border:1px solid var(--border2); color:var(--text);
                       font-family:var(--mono); font-size:12px; padding:9px 12px; outline:none;
                       resize:vertical; transition:border-color 0.2s;"
                placeholder="xxxx-xxxx-xxxx-…"></textarea>
        </div>
        <div class="auth-field">
            <label>New password</label>
            <input type="password" id="new-password" autocomplete="new-password">
        </div>
        <div class="auth-field">
            <label>Confirm new password</label>
            <input type="password" id="confirm-password" autocomplete="new-password">
        </div>

        <button class="btn primary full" id="btn-recover">Reset password</button>
        <div class="auth-link"><a href="<?= APP_BASE ?>/login">← Back to sign in</a></div>

        <!-- Hidden form submitted after client-side crypto -->
        <form id="recover-form" method="POST" style="display:none">
            <input type="hidden" name="action" value="reset">
            <input type="hidden" name="username" value="<?= htmlspecialchars($_POST['username'] ?? '') ?>">
            <input type="hidden" name="new_password" id="f-new-password">
            <input type="hidden" name="new_encrypted_master_key" id="f-new-emk">
            <input type="hidden" name="new_pbkdf2_salt" id="f-new-salt">
        </form>

        <script src="<?= APP_BASE ?>/js/crypto.js"></script>
        <script>
        const PAYLOAD = JSON.parse('<?= $payload ?>');

        document.getElementById('btn-recover').addEventListener('click', async () => {
            const phrase   = document.getElementById('recovery-phrase').value.trim();
            const password = document.getElementById('new-password').value;
            const confirm  = document.getElementById('confirm-password').value;

            if (!phrase)             return alert('Please enter your recovery phrase.');
            if (password.length < 8) return alert('Password must be at least 8 characters.');
            if (password !== confirm) return alert('Passwords do not match.');

            const btn = document.getElementById('btn-recover');
            btn.textContent = 'Verifying…';
            btn.disabled    = true;

            try {
                // Attempt to decrypt master key with recovery phrase
                const masterKey = await Crypto.unwrapMasterKeyWithPhrase(
                    phrase,
                    PAYLOAD.recovery_encrypted_master_key
                );

                // Re-wrap master key with new password
                const { salt, encryptedMasterKey } = await Crypto.rewrapMasterKey(masterKey, password);

                document.getElementById('f-new-password').value = password;
                document.getElementById('f-new-emk').value      = encryptedMasterKey;
                document.getElementById('f-new-salt').value     = salt;
                document.getElementById('recover-form').submit();

            } catch (e) {
                alert('Recovery phrase is incorrect. Please check your Emergency Kit.');
                btn.textContent = 'Reset password';
                btn.disabled    = false;
            }
        });
        </script>
        <?php endif; ?>
    </div>
</div>

<script src="<?= APP_BASE ?>/js/theme.js"></script>
</body>
</html>
