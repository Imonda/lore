<?php
// Database
define('DB_HOST', 'localhost');
define('DB_NAME', 'lore');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');
define('DB_PORT', 3306);

// App
define('APP_NAME', 'Lore');
define('SESSION_LIFETIME', 60 * 60 * 24 * 7); // 7 days

// Base path — set to '/' if installed in root, or '/app' if installed in a subdirectory.
// No trailing slash.
define('APP_BASE', '');

// Brute-force protection
define('LOGIN_MAX_ATTEMPTS',     5);    // max failed attempts before lockout
define('LOGIN_WINDOW_SECONDS',   900);  // 15 min — sliding window for counting attempts
define('LOGIN_LOCKOUT_SECONDS',  900);  // 15 min — lockout duration after exceeding limit
define('LOGIN_DELAY_BASE',       1);    // seconds — base delay, doubles each attempt above threshold


