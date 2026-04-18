# Lore

Self-hosted archive for your AI conversations. Import exports from Claude and ChatGPT, search them instantly, and keep everything private on your own server.

All data is encrypted in the browser before it reaches the server. Your encryption key never leaves your device.

---

## Requirements

- PHP 8.1+
- MySQL 5.7+ or MariaDB 10.4+
- Apache with `mod_rewrite` enabled (or Nginx — see below)
- Any shared hosting with PHP + MySQL support

---

## Installation

### 1. Create the database

```bash
mysql -u root -p -e "CREATE DATABASE lore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p lore < schema.sql
```

### 2. Configure the application

Copy `config.php` and fill in your values:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'lore');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');

// Generate a random secret:
// php -r "echo base64_encode(random_bytes(32));"
define('SERVER_SECRET', 'your_generated_secret');
```

### 3. Upload files

Upload all files to your web hosting. The project root should be your document root (e.g. `public_html/`).

### 4. Open in browser

Navigate to your domain. You will be redirected to the registration page.

---

## Security model

Lore uses client-side encryption inspired by Bitwarden.

| What the server stores | What the server never sees |
|---|---|
| Encrypted conversations (AES-GCM blobs) | Your master encryption key |
| Argon2ID password hash | Your plaintext conversations |
| PBKDF2 salt | Your password |
| Encrypted master key (wrapped) | Your recovery phrase |

**Key derivation:**
1. You enter your password
2. Browser derives an encryption key using PBKDF2 (310,000 iterations, SHA-256)
3. That key decrypts your master key (stored encrypted on the server)
4. Master key decrypts your conversations locally

**Emergency Kit:**
Generated at registration. Contains a recovery phrase that can decrypt your master key independently of your password. Store it somewhere safe — if you lose both your password and the kit, your data cannot be recovered by anyone.

---

## Importing conversations

**Claude:**
1. Go to claude.ai → Settings → Privacy → Export data
2. Wait for the email with your ZIP file
3. In Lore, click **Import** and drop the ZIP

**ChatGPT:**
1. Go to chatgpt.com → Settings → Data controls → Export data
2. Wait for the email with your ZIP file
3. In Lore, click **Import** and drop the ZIP

The ZIP is processed entirely in your browser. It is never uploaded to the server.

---

## OPcache

OPcache is configured automatically via `.htaccess` if your hosting uses `mod_php`.

If your hosting uses PHP-FPM (common on modern shared hosting and VPS), enable OPcache in your `php.ini` instead:

```ini
opcache.enable=1
opcache.memory_consumption=64
opcache.interned_strings_buffer=8
opcache.max_accelerated_files=1000
opcache.revalidate_freq=60
```

On cPanel hosting, you can usually enable OPcache under **Software → Select PHP Version → Extensions**.

---

## Nginx configuration

If you use Nginx instead of Apache, add this to your server block:

```nginx
location /php/ {
    deny all;
}

location / {
    try_files $uri $uri/ /index.php?$query_string;
}

location ~ \.php$ {
    fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    fastcgi_index index.php;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
}
```

---

## License

MIT — do whatever you want with it.
