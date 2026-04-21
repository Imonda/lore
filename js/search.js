/**
 * search.js — Local full-text search over decrypted IndexedDB cache
 * No server requests during search — instant results.
 * Index is built in background after login, fetching messages from server
 * and extracting plain text from all block types (Claude JSON, plain text, etc.)
 */

const Search = (() => {

    // ── Tokenizer ─────────────────────────────────────────────────────────────

    function tokenize(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1);
    }

    // ── Strip HTML tags from a string ────────────────────────────────────────

    function stripHtml(str) {
        return str.replace(/<[^>]*>/g, ' ');
    }

    // ── Extract plain text from a message content string ──────────────────────
    // content can be:
    //   - a JSON array of blocks (Claude): [{type:'text',text:'...'}, ...]
    //   - a plain string possibly containing HTML (Gemini, ChatGPT, Le Chat)

    function extractText(content) {
        if (!content) return '';
        try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
                return parsed.map(block => {
                    if (block.type === 'text')        return stripHtml(block.text || '');
                    if (block.type === 'thinking')     return stripHtml(block.text || '');
                    if (block.type === 'tool_result')  return stripHtml(block.text || '');
                    if (block.type === 'tool_use')     return block.label || '';
                    if (block.type === 'code')         return block.code || '';
                    return '';
                }).join(' ');
            }
        } catch (_) {
            // not JSON — treat as plain text (strip HTML just in case)
        }
        return stripHtml(content);
    }

    // ── Score a conversation against a query ──────────────────────────────────

    function scoreConversation(conv, tokens) {
        let score = 0;
        const titleTokens = tokenize(conv.title);

        for (const token of tokens) {
            // Title match — higher weight (prefix match: "sess" hits "session", not mid-word)
            if (titleTokens.some(t => t === token || t.startsWith(token))) score += 10;

            // Message content match — prefix match: "sess" hits "session" but not mid-word like "tor" in "decorator"
            if (conv._searchText) {
                const wordRe = new RegExp('(?:^|\\s)' + escapeRegex(token) + '\\w*(?:\\s|$)');
                if (wordRe.test(conv._searchText)) score += 1;
            }
        }
        return score;
    }

    // ── Fetch and decrypt messages for a conversation from server ─────────────

    async function fetchMessages(convId, masterKey) {
        const base = document.getElementById('app-config')?.dataset.base ?? '';
        const res  = await fetch(base + '/php/api.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action: 'get_messages', conversation_id: convId }),
        });
        const data = await res.json();
        if (!data.ok) return [];

        return Promise.all(data.messages.map(async msg => ({
            ...msg,
            content: await Crypto.decryptData(masterKey, msg.content),
        })));
    }

    // ── Build search index (called once after boot, runs in background) ────────
    // masterKey is required to decrypt messages that haven't been opened yet.
    // We first try IndexedDB (already cached), then fall back to server fetch.
    // Processed in small batches to avoid blocking the main thread.

    async function buildIndex(conversations, masterKey) {
        const BATCH = 10;

        for (let i = 0; i < conversations.length; i += BATCH) {
            const batch = conversations.slice(i, i + BATCH);

            await Promise.all(batch.map(async conv => {
                // Initialize to empty so searches during indexing don't error
                if (!conv._searchText) conv._searchText = '';

                // Try IndexedDB first
                let messages = await DB.getMessages(conv.id);

                // If empty (not yet opened) — fetch from server and cache
                if (!messages.length && masterKey) {
                    messages = await fetchMessages(conv.id, masterKey);
                    if (messages.length) {
                        await DB.saveConversation({ ...conv, messages });
                    }
                }

                conv._searchText = messages
                    .map(m => extractText(m.content))
                    .join(' ')
                    .toLowerCase()
                    .replace(/[^\w\s]/g, ' ');
            }));

            // Yield to browser between batches
            await new Promise(r => setTimeout(r, 0));
        }

        return conversations;
    }

    // ── Main search function ──────────────────────────────────────────────────

    function search(conversations, query, sourceFilter = 'all') {
        // Filter by source
        let results = sourceFilter === 'all'
            ? conversations
            : conversations.filter(c => c.source === sourceFilter);

        if (!query.trim()) return results;

        const tokens = tokenize(query);
        if (!tokens.length) return results;

        return results
            .map(conv => ({ conv, score: scoreConversation(conv, tokens) }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .map(({ conv }) => conv);
    }

    // ── Highlight matching terms in text ──────────────────────────────────────

    function highlight(text, query) {
        if (!query.trim()) return escapeHtml(text);
        const tokens  = tokenize(query);
        if (!tokens.length) return escapeHtml(text);

        const pattern = tokens.map(t => escapeRegex(t)).join('|');
        const regex   = new RegExp(`(${pattern})`, 'gi');
        return escapeHtml(text).replace(regex, '<mark class="highlight">$1</mark>');
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    return { search, buildIndex, highlight, escapeHtml };
})();
