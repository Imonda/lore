/**
 * export.js — Client-side export to ZIP
 *
 * Flow (plaintext):
 *   1. Fetch all conversations + messages from API (encrypted blobs)
 *   2. Decrypt in browser with master key
 *   3. Pack into lore-export.zip (JSON format) — never touches server
 *
 * Flow (encrypted):
 *   1-2. Same as above
 *   3. Re-encrypt ZIP contents with a user-supplied password (PBKDF2 → AES-GCM)
 *   4. Pack encrypted blob into lore-export-encrypted.zip
 *   Note: This is a Lore-specific format, importable back via Import.
 */

const Exporter = (() => {

    // ── Master key access ─────────────────────────────────────────────────────

    async function getMasterKey() {
        const b64 = sessionStorage.getItem('lore_mk');
        if (!b64) throw new Error('Not authenticated — master key missing');
        const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    // ── Fetch & decrypt all data ──────────────────────────────────────────────

    async function fetchAllDecrypted(masterKey, onProgress) {
        const base = document.getElementById('app-config')?.dataset.base ?? '';
        // 1. Get conversation list (encrypted titles)
        const res = await fetch(base + '/php/api.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action: 'get_conversations' }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error('Failed to fetch conversations');

        const conversations = data.conversations;
        const total = conversations.length;
        const result = [];

        for (let i = 0; i < conversations.length; i++) {
            const conv = conversations[i];

            // Decrypt title
            const title = await Crypto.decryptData(masterKey, conv.title);

            // Fetch messages
            const msgRes = await fetch(base + '/php/api.php', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ action: 'get_messages', conversation_id: conv.id }),
            });
            const msgData = await msgRes.json();
            if (!msgData.ok) continue;

            // Decrypt messages
            const messages = await Promise.all(msgData.messages.map(async msg => ({
                role:       msg.role,
                content:    await Crypto.decryptData(masterKey, msg.content),
                created_at: msg.created_at,
            })));

            result.push({
                id:         conv.id,
                source:     conv.source,
                ext_id:     conv.ext_id,
                title,
                created_at: conv.created_at,
                updated_at: conv.updated_at,
                messages,
            });

            onProgress(i + 1, total);
        }

        return result;
    }

    // ── Derive key from password (for encrypted export) ───────────────────────

    async function deriveKeyFromPassword(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // ── Encrypt payload with password ─────────────────────────────────────────

    async function encryptPayload(jsonString, password) {
        const salt = crypto.getRandomValues(new Uint8Array(32));
        const iv   = crypto.getRandomValues(new Uint8Array(12));
        const key  = await deriveKeyFromPassword(password, salt);
        const enc  = new TextEncoder();

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            enc.encode(jsonString)
        );

        // Pack: [salt (32)] + [iv (12)] + [ciphertext]
        const result = new Uint8Array(32 + 12 + ciphertext.byteLength);
        result.set(salt, 0);
        result.set(iv, 32);
        result.set(new Uint8Array(ciphertext), 44);
        return result;
    }

    // ── Build ZIP and trigger download ────────────────────────────────────────

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // ── Plaintext export ──────────────────────────────────────────────────────

    async function exportPlaintext(onProgress) {
        const masterKey     = await getMasterKey();
        const conversations = await fetchAllDecrypted(masterKey, onProgress);

        const payload = JSON.stringify({
            version:    1,
            format:     'lore-plaintext',
            exported_at: new Date().toISOString(),
            conversations,
        }, null, 2);

        const zip = new JSZip();
        zip.file('lore-export.json', payload);

        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        triggerDownload(blob, `lore-export-${datestamp()}.zip`);

        return conversations.length;
    }

    // ── Encrypted export ──────────────────────────────────────────────────────

    async function exportEncrypted(password, onProgress) {
        const masterKey     = await getMasterKey();
        const conversations = await fetchAllDecrypted(masterKey, onProgress);

        const payload = JSON.stringify({
            version:     1,
            format:      'lore-encrypted',
            exported_at: new Date().toISOString(),
            conversations,
        });

        const encrypted = await encryptPayload(payload, password);

        const zip = new JSZip();
        zip.file('lore-export.enc', encrypted);
        zip.file('README.txt', [
            'Lore Encrypted Export',
            '======================',
            'This archive contains your conversations encrypted with AES-256-GCM.',
            'Import it back into Lore using the Import function and your export password.',
            '',
            'Format: lore-encrypted v1',
            'Encryption: AES-256-GCM, key derived via PBKDF2-SHA256 (310 000 iterations)',
            `Exported: ${new Date().toISOString()}`,
        ].join('\n'));

        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        triggerDownload(blob, `lore-export-encrypted-${datestamp()}.zip`);

        return conversations.length;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function datestamp() {
        return new Date().toISOString().slice(0, 10);
    }

    return { exportPlaintext, exportEncrypted };
})();
