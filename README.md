# Lore — your private AI memory

Lore is a private memory for your AI conversations.

Import your AI conversations (ChatGPT, Claude, Gemini, Le Chat), search everything instantly, and never lose context again.

Your data stays fully private — encrypted in your browser before it ever reaches the server.

---

## Why Lore?

AI conversations disappear.

You have ideas, insights, decisions — and then they're gone.  
Search is limited, memory resets, and context is lost.

Lore fixes that.

It turns your conversations into a searchable, private archive that becomes more valuable over time.
Something you can come back to weeks or months later — and still have full context.

---

## What can you use it for?

- Keep long-term memory of your AI conversations  
- Build a personal knowledge base from ChatGPT / Claude / Gemini / Le Chat  
- Search past ideas, answers, and insights instantly  
- Track how your thinking evolves over time  
- Keep everything private and under your control  

---

## Key features

- Import conversations from ChatGPT, Claude, Gemini, and Le Chat (Mistral)  
- Search everything instantly (runs locally in your browser)
- Client-side encryption (your data is encrypted before upload)  
- Self-hosted — your data stays on your server  
- Export your archive anytime (plaintext or encrypted)  
- Activity stats and archive overview  

---

## Privacy first

Lore uses client-side encryption inspired by Bitwarden.

- Your conversations are encrypted in the browser (AES-GCM)  
- Your encryption key never leaves your device  
- The server never sees your plaintext data  
- Even backups can be encrypted with your own password  

If you lose your password and recovery kit, your data is unrecoverable — by design.

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

// Base path — '' for root install, '/subdir' for subdirectory install (no trailing slash)
define('APP_BASE', '');

// Brute-force protection
define('LOGIN_MAX_ATTEMPTS',    5);    // failed attempts before lockout
define('LOGIN_WINDOW_SECONDS',  900);  // sliding window (15 min)
define('LOGIN_LOCKOUT_SECONDS', 900);  // lockout duration (15 min)
define('LOGIN_DELAY_BASE',      1);    // progressive delay base in seconds
```

### 3. Set the base path

If you install Lore in a subdirectory (e.g. `yourdomain.com/app/`), update two places:

**`config.php`:**
```php
// Root install — yourdomain.com/
define('APP_BASE', '');

// Subdirectory install — yourdomain.com/app/
define('APP_BASE', '/app');
```

**`.htaccess`:**
```apache
# Root install
RewriteBase /

# Subdirectory install
RewriteBase /app/
```

### 4. Upload files

Upload all files to your web hosting. The project root should be your document root (e.g. `public_html/`), or a subdirectory of it if you set `APP_BASE` above.

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

**Brute-force protection:**
Failed login attempts are tracked per IP address and username. After 5 failed attempts within 15 minutes, the account is locked out for 15 minutes. A progressive delay (1s → 2s → 4s...) is applied starting from the 3rd failed attempt to slow down automated attacks. Thresholds are configurable in `config.php`.

---

## Importing conversations

**Claude:**
1. Go to claude.ai → Settings → Privacy → Export data
2. Wait for the email with your ZIP file
3. In Lore, click **Import** and drop the ZIP

**ChatGPT:**
1. Go to chatgpt.com → Settings → Data controls → Export data
2. Wait for the email with your ZIP file
3. In Lore, click **Import** and drop the ZIP — or extract the ZIP and drop just the `chat.html` file directly

**Gemini:**
1. Go to myaccount.google.com → Data & privacy → Download your data (Google Takeout)
2. Select only **Gemini Apps** and export
3. Wait for the email with your ZIP file
4. In Lore, click **Import** and drop the ZIP — or extract the ZIP and drop just the `My Activity.html` file directly

**Le Chat (Mistral):**
1. Go to admin.mistral.ai/account/export
2. Click **Export** to download your ZIP file
3. In Lore, click **Import**, select the **Le Chat** tab, and drop the ZIP

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
- **Sources** — breakdown by AI (Claude, ChatGPT, Gemini, Le Chat) with percentage bars
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
# Block direct access to PHP includes and config
location = /config.php { deny all; }
location /php/         { deny all; }

# Clean URLs
location / {
    try_files $uri $uri/ /index.php?$query_string;
}

# PHP
location ~ \.php$ {
    fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
    fastcgi_index index.php;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;

    # PHP responses — never cache
    add_header Cache-Control "no-store, no-cache, must-revalidate";
    add_header Pragma "no-cache";
}

# Static assets — cache for 1 year
location ~* \.(css|js|woff2?|ttf|eot|ico|svg|png|jpg|jpeg|gif|webp)$ {
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# Security headers
add_header X-Content-Type-Options "nosniff";
add_header X-Frame-Options "SAMEORIGIN";
add_header Referrer-Policy "same-origin";
```

For a subdirectory install (e.g. `yourdomain.com/app/`), replace the `location /` block with:

```nginx
location /app/ {
    try_files $uri $uri/ /app/index.php?$query_string;
}
```

---

## License

MIT — do whatever you want with it.
