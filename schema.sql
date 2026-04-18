-- Lore — database schema
-- Run once before first use: mysql -u root -p loreapp < schema.sql

-- CREATE DATABASE IF NOT EXISTS loreappdb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE loreappdb;

CREATE TABLE IF NOT EXISTS users (
    id                              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username                        VARCHAR(64) NOT NULL UNIQUE,
    password_hash                   VARCHAR(255) NOT NULL,
    email                           VARCHAR(255) DEFAULT NULL UNIQUE,

    -- PBKDF2 salt used by the browser to derive the encryption key from password
    pbkdf2_salt                     VARCHAR(64) NOT NULL,

    -- Master key encrypted with password-derived key (AES-GCM, base64)
    encrypted_master_key            TEXT NOT NULL,

    -- Master key encrypted with recovery key — allows password reset without data loss
    recovery_encrypted_master_key   TEXT NOT NULL,

    created_at                      DATETIME NOT NULL,
    last_login_at                   DATETIME DEFAULT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversations (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    source      ENUM('claude','chatgpt','gemini') NOT NULL,
    ext_id      VARCHAR(255) NOT NULL,         -- original UUID from export
    title       TEXT NOT NULL,                 -- encrypted title (AES-GCM base64)
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL,
    msg_count   SMALLINT UNSIGNED DEFAULT 0,
    UNIQUE KEY uniq_user_source_ext (user_id, source, ext_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT UNSIGNED NOT NULL,
    role            ENUM('user','assistant','system') NOT NULL,
    content         MEDIUMTEXT NOT NULL,        -- encrypted content (AES-GCM base64)
    created_at      DATETIME NOT NULL,
    INDEX idx_conv (conversation_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_attempts (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip           VARCHAR(45)     NOT NULL,   -- supports IPv6
    username     VARCHAR(255)    NOT NULL,
    attempted_at INT UNSIGNED    NOT NULL,   -- UNIX timestamp
    PRIMARY KEY (id),
    INDEX idx_ip           (ip),
    INDEX idx_username     (username),
    INDEX idx_attempted_at (attempted_at)    -- used for DELETE pruning
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
