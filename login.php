<?php
require_once __DIR__ . '/php/auth.php';
session_start_secure();

if (current_user()) {
    header('Location: ' . APP_BASE . '/');
    exit;
}

$error      = '';
$registered = isset($_GET['registered']);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';

    if (!$username || !$password) {
        $error = 'Please fill in all fields.';
    } else {
        $result = login_user($username, $password);
        if ($result['ok']) {
            // Return encryption data to browser so it can derive the master key
            // These are stored in sessionStorage and cleared on logout
            $login_payload = json_encode([
                'ok'                  => true,
                'pbkdf2_salt'         => $result['pbkdf2_salt'],
                'encrypted_master_key' => $result['encrypted_master_key'],
            ]);
        } else {
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
    <title>Sign in - Lore</title>
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
        <div class="auth-subtitle">Your private AI archive</div>

        <?php if ($registered): ?>
            <div class="auth-success">Account created. Sign in to continue.</div>
        <?php endif; ?>

        <?php if ($error): ?>
            <div class="auth-error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <form method="POST" id="login-form">
            <div class="auth-field">
                <label>Username</label>
                <input type="text" name="username" autocomplete="username" autofocus
                       value="<?= htmlspecialchars($_POST['username'] ?? '') ?>">
            </div>
            <div class="auth-field">
                <label>Password</label>
                <input type="password" name="password" autocomplete="current-password">
            </div>
            <button type="submit" class="btn primary full" id="btn-login">Sign in</button>
        </form>

        <div class="auth-link">
            <a href="<?= APP_BASE ?>/recover">Forgot password?</a>
            &nbsp;·&nbsp;
            <a href="<?= APP_BASE ?>/register">Create account</a>
        </div>
    </div>
</div>

<?php if (!empty($login_payload)): ?>
<div id="login-payload"
     data-payload="<?= htmlspecialchars($login_payload, ENT_QUOTES) ?>"
     data-base="<?= APP_BASE ?>"
     style="display:none"></div>
<?php endif; ?>
<script src="<?= APP_BASE ?>/js/crypto.js"></script>
<script src="<?= APP_BASE ?>/js/login-boot.js"></script>
<script src="<?= APP_BASE ?>/js/theme.js"></script>
</body>
</html>
