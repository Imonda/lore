<?php
require_once __DIR__ . '/php/auth.php';
session_start_secure();

if (current_user()) {
    header('Location: ' . APP_BASE . '/');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username                 = trim($_POST['username'] ?? '');
    $password                 = $_POST['password'] ?? '';
    $email                    = trim($_POST['email'] ?? '');
    $encrypted_master_key     = $_POST['encrypted_master_key'] ?? '';
    $recovery_encrypted_master = $_POST['recovery_encrypted_master_key'] ?? '';
    $pbkdf2_salt              = $_POST['pbkdf2_salt'] ?? '';

    if (strlen($username) < 3 || strlen($username) > 64) {
        $error = 'Username must be 3–64 characters.';
    } elseif (strlen($password) < 8) {
        $error = 'Password must be at least 8 characters.';
    } elseif (!$encrypted_master_key || !$recovery_encrypted_master || !$pbkdf2_salt) {
        $error = 'Encryption data missing. Please try again.';
    } else {
        $result = register_user($username, $password, $email, $encrypted_master_key, $recovery_encrypted_master, $pbkdf2_salt);
        if ($result['ok']) {
            header('Location: ' . APP_BASE . '/login?registered=1');
            exit;
        }
        $error = $result['error'];
    }
}
?>
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Register - Lore</title>
    <link rel="stylesheet" href="<?= APP_BASE ?>/css/dark.css">
    <link rel="stylesheet" href="<?= APP_BASE ?>/css/light.css">
    <link rel="stylesheet" href="<?= APP_BASE ?>/css/style.css">
    <link rel="stylesheet" href="<?= APP_BASE ?>/css/auth.css">
    <link rel="icon" type="image/x-icon" href="<?= APP_BASE ?>/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="<?= APP_BASE ?>/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="<?= APP_BASE ?>/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="<?= APP_BASE ?>/apple-touch-icon.png">       
</head>
<body class="auth-page">

<div class="auth-wrap">
    <div class="auth-box">
        <div class="auth-logo">LORE<span>.</span></div>
        <div class="auth-subtitle">Start building your AI memory</div>

        <?php if ($error): ?>
            <div class="auth-error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <!-- Step 1: credentials -->
        <div id="step-credentials">
            <div class="auth-field">
                <label>Username</label>
                <input type="text" id="username" autocomplete="username" maxlength="64" autofocus>
            </div>
            <div class="auth-field">
                <label>Password</label>
                <input type="password" id="password" autocomplete="new-password">
            </div>
            <div class="auth-field">
                <label>Email <span class="optional">(optional — for account reset only)</span></label>
                <input type="email" id="email" autocomplete="email">
            </div>
            <button class="btn primary full" id="btn-next">Continue →</button>
            <div class="auth-link">Already have an account? <a href="<?= APP_BASE ?>/login">Sign in</a></div>
        </div>

        <!-- Step 2: emergency kit -->
        <div id="step-kit" style="display:none">
            <div class="kit-header">
                <div class="kit-icon">⚠</div>
                <div class="kit-title">Save your Emergency Kit</div>
                <div class="kit-desc">
                    Your data is encrypted with a key derived from your password.
                    If you forget your password, this recovery phrase is the <strong>only way</strong>
                    to access your data. We cannot recover it for you.
                </div>
            </div>
            <div class="kit-phrase" id="kit-phrase">Generating…</div>
            <div class="kit-actions">
                <button class="btn" id="btn-download-kit">↓ Download Emergency Kit</button>
                <button class="btn" id="btn-copy-phrase">Copy phrase</button>
            </div>
            <label class="kit-confirm">
                <input type="checkbox" id="kit-confirmed">
                I have saved my Emergency Kit in a safe place
            </label>
            <button class="btn primary full" id="btn-register" disabled>Create account</button>
        </div>

        <!-- Hidden form submitted after kit confirmation -->
        <form id="register-form" method="POST" style="display:none">
            <input type="hidden" name="username" id="f-username">
            <input type="hidden" name="password" id="f-password">
            <input type="hidden" name="email" id="f-email">
            <input type="hidden" name="pbkdf2_salt" id="f-salt">
            <input type="hidden" name="encrypted_master_key" id="f-emk">
            <input type="hidden" name="recovery_encrypted_master_key" id="f-remk">
        </form>
    </div>
</div>

<script src="<?= APP_BASE ?>/js/crypto.js"></script>
<script src="<?= APP_BASE ?>/js/theme.js"></script>
<script>
// ── Registration flow ─────────────────────────────────────────────────────────

let registrationPackage = null;

document.getElementById('btn-next').addEventListener('click', async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const email    = document.getElementById('email').value.trim();

    if (username.length < 3) return alert('Username must be at least 3 characters.');
    if (password.length < 8) return alert('Password must be at least 8 characters.');

    const btn = document.getElementById('btn-next');
    btn.textContent = 'Generating keys…';
    btn.disabled = true;

    try {
        registrationPackage = await Crypto.buildRegistrationPackage(password);

        // Store for form submission
        document.getElementById('f-username').value = username;
        document.getElementById('f-password').value = password;
        document.getElementById('f-email').value    = email;
        document.getElementById('f-salt').value     = registrationPackage.salt;
        document.getElementById('f-emk').value      = registrationPackage.encryptedMasterKey;
        document.getElementById('f-remk').value     = registrationPackage.recoveryEncryptedMaster;

        // Show recovery phrase
        document.getElementById('kit-phrase').textContent = registrationPackage.recoveryPhrase;

        document.getElementById('step-credentials').style.display = 'none';
        document.getElementById('step-kit').style.display = 'block';
    } catch (e) {
        alert('Key generation failed: ' + e.message);
        btn.textContent = 'Continue →';
        btn.disabled = false;
    }
});

// Enable register button only after checkbox
document.getElementById('kit-confirmed').addEventListener('change', function () {
    document.getElementById('btn-register').disabled = !this.checked;
});

// Download emergency kit as text file
document.getElementById('btn-download-kit').addEventListener('click', () => {
    const username = document.getElementById('f-username').value;
    const phrase   = registrationPackage.recoveryPhrase;
    const date     = new Date().toISOString().split('T')[0];

    const content = [
        'LORE — EMERGENCY KIT',
        '====================',
        '',
        'Keep this file in a safe place. Do not share it with anyone.',
        '',
        `Account:  ${username}`,
        `Created:  ${date}`,
        '',
        'RECOVERY PHRASE',
        '---------------',
        phrase,
        '',
        'How to use:',
        '  1. Go to your Lore installation → Forgot password',
        '  2. Enter your username and this recovery phrase',
        '  3. Set a new password — your data will be preserved',
        '',
        'WARNING: If you lose both your password and this file,',
        'your data cannot be recovered by anyone.',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `lore-emergency-kit-${username}-${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});

// Copy phrase to clipboard
document.getElementById('btn-copy-phrase').addEventListener('click', async () => {
    await navigator.clipboard.writeText(registrationPackage.recoveryPhrase);
    document.getElementById('btn-copy-phrase').textContent = 'Copied!';
    setTimeout(() => { document.getElementById('btn-copy-phrase').textContent = 'Copy phrase'; }, 2000);
});

// Submit registration form
document.getElementById('btn-register').addEventListener('click', () => {
    document.getElementById('register-form').submit();
});
</script>
</body>
</html>
