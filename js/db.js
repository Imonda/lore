/**
 * db.js — IndexedDB cache for decrypted conversations
 *
 * Stores plaintext data locally for instant search.
 * Cleared completely on logout — nothing persists between sessions.
 */

const DB = (() => {
    const DB_NAME    = 'lore';
    const DB_VERSION = 1;
    const STORE_CONV = 'conversations';
    const STORE_MSG  = 'messages';

    let _db = null;

    // ── Open database ─────────────────────────────────────────────────────────

    function init() {
        return new Promise((resolve, reject) => {
            if (_db) return resolve(_db);

            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = e => {
                const db = e.target.result;

                if (!db.objectStoreNames.contains(STORE_CONV)) {
                    const convStore = db.createObjectStore(STORE_CONV, { keyPath: 'id' });
                    convStore.createIndex('source',     'source',     { unique: false });
                    convStore.createIndex('updated_at', 'updated_at', { unique: false });
                }

                if (!db.objectStoreNames.contains(STORE_MSG)) {
                    const msgStore = db.createObjectStore(STORE_MSG, { keyPath: 'id', autoIncrement: true });
                    msgStore.createIndex('conversation_id', 'conversation_id', { unique: false });
                }
            };

            req.onsuccess = e => { _db = e.target.result; resolve(_db); };
            req.onerror   = e => reject(e.target.error);
        });
    }

    // ── Generic helpers ───────────────────────────────────────────────────────

    function tx(storeName, mode = 'readonly') {
        return _db.transaction(storeName, mode).objectStore(storeName);
    }

    function promisify(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = e => resolve(e.target.result);
            req.onerror   = e => reject(e.target.error);
        });
    }

    // ── Conversations ─────────────────────────────────────────────────────────

    async function saveConversation(conv) {
        await init();
        const store = tx(STORE_CONV, 'readwrite');

        // Save conversation metadata (without messages array)
        const { messages, ...meta } = conv;
        await promisify(store.put(meta));

        // Save messages separately
        if (messages && messages.length) {
            const msgStore = tx(STORE_MSG, 'readwrite');
            // Remove existing messages for this conversation first
            const idx    = msgStore.index('conversation_id');
            const cursor = idx.openCursor(IDBKeyRange.only(conv.id));
            await new Promise(resolve => {
                cursor.onsuccess = e => {
                    const c = e.target.result;
                    if (c) { c.delete(); c.continue(); } else { resolve(); }
                };
                cursor.onerror = resolve;
            });

            const msgStore2 = tx(STORE_MSG, 'readwrite');
            for (const msg of messages) {
                await promisify(msgStore2.add({ ...msg, conversation_id: conv.id }));
            }
        }
    }

    async function getAllConversations() {
        await init();
        return promisify(tx(STORE_CONV).getAll());
    }

    async function getMessages(conversationId) {
        await init();
        const store = tx(STORE_MSG);
        const idx   = store.index('conversation_id');
        const msgs  = await promisify(idx.getAll(IDBKeyRange.only(conversationId)));
        return msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    async function deleteConversation(id) {
        await init();
        await promisify(tx(STORE_CONV, 'readwrite').delete(id));
        // Messages cascade via conversation_id index cleanup on next load
    }

    async function clear() {
        await init();
        await promisify(tx(STORE_CONV, 'readwrite').clear());
        await promisify(tx(STORE_MSG,  'readwrite').clear());
    }

    // ── Seed from server (on login) ───────────────────────────────────────────

    async function seedFromServer(masterKey) {
        const base = document.getElementById('app-config')?.dataset.base ?? '';
        const res  = await fetch(base + '/php/api.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action: 'get_conversations' }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error('Failed to load conversations from server');

        await clear();

        for (const conv of data.conversations) {
            const title = await Crypto.decryptData(masterKey, conv.title);
            await saveConversation({ ...conv, title, messages: [] });
        }

        return getAllConversations();
    }

    return {
        init,
        saveConversation,
        getAllConversations,
        getMessages,
        deleteConversation,
        clear,
        seedFromServer,
    };
})();
