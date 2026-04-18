/**
 * crypto.js — Client-side encryption using Web Crypto API
 *
 * Flow:
 *   Registration:  password → PBKDF2 → passwordKey → encrypt(masterKey)
 *                  recoveryPhrase → SHA-256 → recoveryKey → encrypt(masterKey)
 *
 *   Login:         password + salt → PBKDF2 → passwordKey → decrypt(masterKey)
 *
 *   Data:          masterKey → encrypt/decrypt conversations & messages
 */

const Crypto = (() => {
    const ALG    = 'AES-GCM';
    const BITS   = 256;
    const ITER   = 310_000; // PBKDF2 iterations (OWASP 2023 recommendation)
    const HASH   = 'SHA-256';
    const PHRASE_WORDS = 24;

    // ── Encoding helpers ─────────────────────────────────────────────────────

    function bufToB64(buf) {
        return btoa(String.fromCharCode(...new Uint8Array(buf)));
    }

    function b64ToBuf(b64) {
        return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    }

    function bufToHex(buf) {
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function randomBytes(n) {
        return crypto.getRandomValues(new Uint8Array(n));
    }

    // ── Core AES-GCM ─────────────────────────────────────────────────────────

    async function encrypt(cryptoKey, plaintext) {
        const iv   = randomBytes(12);
        const data = new TextEncoder().encode(plaintext);
        const ct   = await crypto.subtle.encrypt({ name: ALG, iv }, cryptoKey, data);
        // Format: base64(iv + ciphertext)
        const combined = new Uint8Array(12 + ct.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ct), 12);
        return bufToB64(combined);
    }

    async function decrypt(cryptoKey, b64) {
        const combined = b64ToBuf(b64);
        const iv = combined.slice(0, 12);
        const ct = combined.slice(12);
        const pt = await crypto.subtle.decrypt({ name: ALG, iv }, cryptoKey, ct);
        return new TextDecoder().decode(pt);
    }

    // ── PBKDF2 key derivation ─────────────────────────────────────────────────

    async function deriveKeyFromPassword(password, salt) {
        const raw = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: b64ToBuf(salt), iterations: ITER, hash: HASH },
            raw,
            { name: ALG, length: BITS },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function deriveKeyFromPhrase(phrase) {
        const raw = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(phrase.trim().toLowerCase()), 'PBKDF2', false, ['deriveKey']
        );
        const salt = new TextEncoder().encode('lore-recovery-v1');
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: ITER, hash: HASH },
            raw,
            { name: ALG, length: BITS },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // ── Master key ───────────────────────────────────────────────────────────

    async function generateMasterKey() {
        return crypto.subtle.generateKey({ name: ALG, length: BITS }, true, ['encrypt', 'decrypt']);
    }

    async function exportMasterKey(masterKey) {
        const raw = await crypto.subtle.exportKey('raw', masterKey);
        return bufToB64(raw);
    }

    async function importMasterKey(b64) {
        const raw = b64ToBuf(b64);
        return crypto.subtle.importKey('raw', raw, { name: ALG, length: BITS }, true, ['encrypt', 'decrypt']);
    }

    // ── Recovery phrase ──────────────────────────────────────────────────────

    async function generateRecoveryPhrase() {
        // Simple wordlist-free approach: 24 hex groups of 4 chars = 96 hex chars = 384 bits
        const bytes = randomBytes(PHRASE_WORDS * 2);
        const words = [];
        for (let i = 0; i < PHRASE_WORDS; i++) {
            const n = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
            words.push(n.toString(16).padStart(4, '0'));
        }
        return words.join('-');
    }

    // ── Registration package ─────────────────────────────────────────────────

    async function buildRegistrationPackage(password) {
        const salt      = bufToB64(randomBytes(32));
        const masterKey = await generateMasterKey();
        const masterRaw = await exportMasterKey(masterKey);

        // Wrap master key with password-derived key
        const passwordKey             = await deriveKeyFromPassword(password, salt);
        const encryptedMasterKey      = await encrypt(passwordKey, masterRaw);

        // Wrap master key with recovery-phrase-derived key
        const recoveryPhrase          = await generateRecoveryPhrase();
        const recoveryKey             = await deriveKeyFromPhrase(recoveryPhrase);
        const recoveryEncryptedMaster = await encrypt(recoveryKey, masterRaw);

        return {
            salt,
            encryptedMasterKey,
            recoveryEncryptedMaster,
            recoveryPhrase,
            masterKey, // kept in memory, never sent to server
        };
    }

    // ── Login: unwrap master key ─────────────────────────────────────────────

    async function unwrapMasterKey(password, salt, encryptedMasterKey) {
        const passwordKey = await deriveKeyFromPassword(password, salt);
        const masterRaw   = await decrypt(passwordKey, encryptedMasterKey);
        return importMasterKey(masterRaw);
    }

    // ── Recovery: unwrap master key with phrase ───────────────────────────────

    async function unwrapMasterKeyWithPhrase(phrase, recoveryEncryptedMaster) {
        const recoveryKey = await deriveKeyFromPhrase(phrase);
        const masterRaw   = await decrypt(recoveryKey, recoveryEncryptedMaster);
        return importMasterKey(masterRaw);
    }

    // ── Re-wrap master key with new password (after recovery) ────────────────

    async function rewrapMasterKey(masterKey, newPassword) {
        const salt        = bufToB64(randomBytes(32));
        const masterRaw   = await exportMasterKey(masterKey);
        const passwordKey = await deriveKeyFromPassword(newPassword, salt);
        const encryptedMasterKey = await encrypt(passwordKey, masterRaw);
        return { salt, encryptedMasterKey };
    }

    // ── Data encryption/decryption ────────────────────────────────────────────

    async function encryptData(masterKey, plaintext) {
        return encrypt(masterKey, plaintext);
    }

    async function decryptData(masterKey, ciphertext) {
        return decrypt(masterKey, ciphertext);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    return {
        buildRegistrationPackage,
        unwrapMasterKey,
        unwrapMasterKeyWithPhrase,
        rewrapMasterKey,
        encryptData,
        decryptData,
    };
})();
