/**
 * search.js — Local full-text search over decrypted IndexedDB cache
 * No server requests — instant results.
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

    // ── Score a conversation against a query ──────────────────────────────────

    function scoreConversation(conv, tokens) {
        let score = 0;
        const titleTokens = tokenize(conv.title);

        for (const token of tokens) {
            // Title match — higher weight
            if (titleTokens.some(t => t.includes(token))) score += 10;

            // Message content match
            if (conv._searchText && conv._searchText.includes(token)) score += 1;
        }
        return score;
    }

    // ── Build search index (called once after IndexedDB seed) ─────────────────

    async function buildIndex(conversations) {
        for (const conv of conversations) {
            const messages = await DB.getMessages(conv.id);
            conv._searchText = messages
                .map(m => m.content)
                .join(' ')
                .toLowerCase()
                .replace(/[^\w\s]/g, ' ');
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
