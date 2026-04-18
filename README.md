# Lore - Your private AI archive

Self-hosted archive for your AI conversations. Import exports from Claude, ChatGPT, and Gemini, search them instantly, and keep everything private on your own server.

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
| PBKDF2 password hash | Your plaintext conversations |
| PBKDF2 salt | Your password |
| Encrypted master key (wrapped) | Your recovery phrase |

**Key derivation:**
1. You enter your password
2. Browser derives an encryption key using PBKDF2 (310,000 iterations, SHA-256)
3. That key decrypts your master key (stored encrypted on the server)
4. Master key decrypts your conversations locally

**Emergency Kit:**
Generated at registration. Contains a recovery phrase that can decrypt your master key independently of your password. Store it somewhere safe — if you lose both your password and the kit, your data cannot be recovered by anyone.

**Account recovery:**
If you forget your password, go to `/recover` and upload your Emergency Kit file. Your master key will be re-wrapped with a new password. Your data is preserved.

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

**Gemini:**
1. Go to myaccount.google.com → Data & privacy → Download your data (Google Takeout)
2. Select only **Gemini Apps** and export
3. Wait for the email with your ZIP file
4. In Lore, click **Import** and drop the ZIP

**Lore backup:**
1. Export your archive from Settings → Export
2. In Lore (same or different instance), click **Import** and drop the ZIP
3. If the export was encrypted, you will be prompted for the export password

The ZIP is processed entirely in your browser. It is never uploaded to the server.

---

## Exporting conversations

Go to **Settings → Export conversations** to download all your conversations as a ZIP file.

Two modes are available:

- **Plaintext** — human-readable JSON, no password required. Use for backups you want to read directly or migrate elsewhere.
- **Encrypted** — AES-256-GCM, protected by a password you choose. The server never sees the password or the plaintext. Use for long-term backups or moving data between Lore instances.

### Stats report

**Settings → Export stats report** downloads a lightweight JSON summary of your archive — conversation count, message count, active days, per-source breakdown, and activity data. No conversation content is included. Useful for analytics or migrating metadata without exposing your archive.

---

## Archive overview

The main screen shows a dashboard of your archive:

- **Conversations** — total number of imported conversations
- **Messages** — total number of messages across all conversations
- **Active days** — number of days on which at least one conversation took place
- **Avg msg / conv** — average number of messages per conversation
- **Sources** — breakdown by AI (Claude, ChatGPT, Gemini) with percentage bars
- **Activity heatmap** — last 12 months of activity, one cell per day
- **Recently added** — latest imported conversations with source, date, and message count

---

## Search

Search runs entirely in your browser — nothing is sent to the server.

When you log in, your conversations are decrypted and cached locally in IndexedDB. Search queries run against this local cache and return results instantly. When you log out, the cache is wiped and the encryption key is removed from memory.

---

## Interface

Lore supports **dark mode** (default) and **light mode**. The toggle is in the Settings panel (⚙ icon in the header).

On mobile, the sidebar and conversation view switch to full-screen panels with slide animation.

### Settings panel

The ⚙ Settings panel (top right) contains:

- **Export conversations** — download your archive as a ZIP file
- **Export stats report** — download a JSON summary of your archive (no conversation content)
- **Clear local cache** — rebuilds IndexedDB on next load; server data is not affected

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
