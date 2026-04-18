<?php
require_once __DIR__ . '/php/auth.php';
session_start_secure();
logout_user();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Signing out - Lore</title>
</head>
<body>
<script>
// Clear all client-side sensitive data before redirecting
sessionStorage.removeItem('lore_mk');

const req = indexedDB.deleteDatabase('lore');
req.onsuccess = () => { window.location.href = '/login'; };
req.onerror   = () => { window.location.href = '/login'; };
req.onblocked = () => { window.location.href = '/login'; };
</script>
</body>
</html>
