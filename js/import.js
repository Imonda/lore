/**
 * import.js — Client-side ZIP processing
 *
 * Flow:
 *   1. User selects ZIP file (stays in browser, never uploaded)
 *   2. JSZip extracts files in memory
 *   3. Parser detects source (Claude / ChatGPT) and extracts conversations
 *   4. Each conversation title + messages encrypted with master key
 *   5. Encrypted chunks sent to API — server stores blobs, never sees plaintext
 *   6. IndexedDB cache updated with decrypted data for instant search
 */

const Importer = (() => {

    // ── Master key access ─────────────────────────────────────────────────────

    async function getMasterKey() {
        const b64 = sessionStorage.getItem('lore_mk');
        if (!b64) throw new Error('Not authenticated — master key missing');
        const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    // ── ZIP extraction ────────────────────────────────────────────────────────

    async function extractZip(file) {
        if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded');
        const zip = await JSZip.loadAsync(file);
        return zip;
    }

    // ── Source detection ──────────────────────────────────────────────────────

    async function detectSource(zip) {
        const names = Object.keys(zip.files).map(n => n.toLowerCase());

        // Gemini Takeout — check first (has My Activity.html, not conversations.json)
        if (names.some(n => n.includes('my activity.html') || n.includes('my_activity.html') || n.includes('myactivity.html'))) return 'gemini';

        // Lore encrypted export
        if (names.some(n => n.endsWith('lore-export.enc'))) return 'lore-encrypted';

        // Lore plaintext export — peek at format field
        const loreFile = zip.file('lore-export.json')
            || zip.file(Object.keys(zip.files).find(n => n.endsWith('lore-export.json')) || '');
        if (loreFile) {
            const raw  = await loreFile.async('string');
            const data = JSON.parse(raw);
            if (data.format === 'lore-plaintext') return 'lore-plaintext';
        }

        // Check for claude-named file
        if (names.some(n => n.includes('conversations.json') && n.includes('claude'))) return 'claude';
        if (names.some(n => n.endsWith('.json') && n.includes('claude'))) return 'claude';

        // conversations.json exists — peek inside to tell Claude from ChatGPT
        const convFile = zip.file('conversations.json')
            || zip.file(Object.keys(zip.files).find(n => n.endsWith('conversations.json')) || '');

        if (convFile) {
            const raw  = await convFile.async('string');
            const data = JSON.parse(raw);
            const first = Array.isArray(data) ? data[0] : null;
            if (!first) return 'unknown';

            // Claude exports have uuid + chat_messages fields
            if (first.uuid !== undefined || first.chat_messages !== undefined) return 'claude';

            // ChatGPT exports have create_time (unix timestamp) + mapping fields
            if (first.create_time !== undefined || first.mapping !== undefined) return 'chatgpt';
        }

        // ChatGPT HTML export (chat.html or chatgpt.html with embedded jsonData)
        if (names.some(n => (n === 'chat.html' || n === 'chatgpt.html' || n.endsWith('/chat.html') || n.endsWith('/chatgpt.html')))) return 'chatgpt-html';

        return 'unknown';
    }

    // ── Gemini parser ─────────────────────────────────────────────────────────

    async function parseGemini(zip) {
        const htmlName = Object.keys(zip.files).find(n => {
            const l = n.toLowerCase();
            return l.includes('my activity.html') || l.includes('my_activity.html') || l.includes('myactivity.html');
        });
        if (!htmlName) throw new Error('My Activity.html not found in Gemini export');
        const raw = await zip.file(htmlName).async('string');
        return parseGeminiRaw(raw);
    }

    async function parseGeminiRaw(raw) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(raw, 'text/html');

        const conversations = [];
        const blocks = doc.querySelectorAll('.outer-cell');
        console.log('[Lore] Gemini blocks found:', blocks.length);

        let blockIndex = 0;
        let skipped = 0;
        for (const block of blocks) {
            const header = block.querySelector('.header-cell p');
            if (!header || !header.textContent.includes('Gemini Apps')) { skipped++; continue; }

            const contentCell = block.querySelector('.content-cell');
            if (!contentCell) { skipped++; continue; }

            // First child node = "Prompted\u00a0<user text>"
            const firstNode = contentCell.childNodes[0];
            if (!firstNode) { skipped++; continue; }
            const firstLine = (firstNode.textContent || '').trim();

            if (!/^Prompted[\s\u00a0]/.test(firstLine)) { skipped++; continue; }

            const userText = firstLine.replace(/^Prompted[\s\u00a0]+/, '').trim();
            if (!userText) { skipped++; continue; }

            // Date: second text node (after first <br>)
            let isoDate = null;
            for (let i = 0; i < contentCell.childNodes.length; i++) {
                const node = contentCell.childNodes[i];
                if (node.nodeName === 'BR') {
                    const next = contentCell.childNodes[i + 1];
                    if (next && next.nodeType === Node.TEXT_NODE) {
                        const dateStr = next.textContent.trim().replace(/\s+[A-Z]{2,4}$/, '');
                        const parsed = new Date(dateStr);
                        if (!isNaN(parsed)) isoDate = parsed.toISOString();
                    }
                    break;
                }
            }
            if (!isoDate) isoDate = '1970-01-01T00:00:00.000Z';

            // Response: collect nodes after the date line (skip: prompt text, br, date text, br)
            // Structure: [TextNode(Prompted...), BR, TextNode(date), BR, ...response...]
            let responseNodes = [];
            let brCount = 0;
            let pastHeader = false;
            for (const node of contentCell.childNodes) {
                if (pastHeader) {
                    responseNodes.push(node);
                } else {
                    if (node.nodeName === 'BR') {
                        brCount++;
                        if (brCount >= 2) pastHeader = true;
                    }
                }
            }
            // Build a temporary container from response nodes
            const responseContainer = document.createElement('div');
            responseNodes.forEach(n => responseContainer.appendChild(n.cloneNode(true)));
            const responseText = geminiHtmlToText(responseContainer);

            const title = userText.length > 60 ? userText.slice(0, 60).trim() + '\u2026' : userText;
            // ext_id: blockIndex guarantees uniqueness within a single export file
            // isoDate + userText hash provides stability across re-imports of the same file
            const hashInput = isoDate + '|' + userText.slice(0, 100);
            const hashB64 = btoa(unescape(encodeURIComponent(hashInput))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
            const extId = 'gemini_' + String(blockIndex).padStart(4, '0') + '_' + hashB64;
            blockIndex++;

            const msgs = [];
            msgs.push({ role: 'user',      content: JSON.stringify([{ type: 'text', text: userText }]),     created_at: isoDate });
            if (responseText.trim()) {
                msgs.push({ role: 'assistant', content: JSON.stringify([{ type: 'text', text: responseText }]), created_at: isoDate });
            }

            conversations.push({
                source:     'gemini',
                ext_id:     extId,
                title:      title,
                created_at: isoDate,
                updated_at: isoDate,
                messages:   msgs,
            });
        }

        console.log('[Lore] Gemini conversations parsed:', conversations.length, '| skipped blocks:', skipped);
        if (!conversations.length) throw new Error('No Gemini conversations found');
        return conversations;
    }

    function geminiHtmlToText(el) {
        let text = '';
        for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeName === 'BR') {
                text += '\n';
            } else if (node.nodeName === 'PRE') {
                text += '\n```\n' + node.textContent.trim() + '\n```\n';
            } else if (['H1','H2','H3','H4'].includes(node.nodeName)) {
                text += '\n\n' + node.textContent.trim() + '\n';
            } else if (node.nodeName === 'P') {
                text += '\n' + geminiHtmlToText(node) + '\n';
            } else if (node.nodeName === 'LI') {
                const liText = node.textContent.trim().replace(/^[.\s]+$/, '');
                if (liText) text += '\n• ' + liText;
            } else if (node.nodeName === 'UL' || node.nodeName === 'OL') {
                const items = node.querySelectorAll('li');
                let idx = 0;
                items.forEach(li => {
                    const liText = li.textContent.trim().replace(/^[.\s]+$/, '');
                    if (!liText) return;
                    const prefix = node.nodeName === 'OL' ? (++idx) + '. ' : '• ';
                    text += '\n' + prefix + liText;
                });
                if (idx > 0 || node.nodeName === 'UL') text += '\n';
            } else if (node.nodeName === 'HR') {
                text += '\n---\n';
            } else if (node.nodeName === 'TABLE') {
                node.querySelectorAll('tr').forEach(row => {
                    const cells = [...row.querySelectorAll('th,td')].map(c => c.textContent.trim());
                    text += '\n' + cells.join(' | ');
                });
                text += '\n';
            } else {
                text += geminiHtmlToText(node);
            }
        }
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

        // ── Lore plaintext parser ─────────────────────────────────────────────────

    async function parseLorePlaintext(zip) {
        const jsonFile = zip.file('lore-export.json')
            || zip.file(Object.keys(zip.files).find(n => n.endsWith('lore-export.json')) || '');
        if (!jsonFile) throw new Error('lore-export.json not found');

        const raw  = await jsonFile.async('string');
        const data = JSON.parse(raw);

        if (!Array.isArray(data.conversations)) throw new Error('Invalid Lore export format');
        return data.conversations;
    }

    // ── Lore encrypted parser ─────────────────────────────────────────────────

    async function parseLoreEncrypted(zip, password) {
        const encFile = zip.file('lore-export.enc')
            || zip.file(Object.keys(zip.files).find(n => n.endsWith('lore-export.enc')) || '');
        if (!encFile) throw new Error('lore-export.enc not found');

        const raw = await encFile.async('uint8array');

        // Unpack: [salt (32)] + [iv (12)] + [ciphertext]
        const salt       = raw.slice(0, 32);
        const iv         = raw.slice(32, 44);
        const ciphertext = raw.slice(44);

        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        let plaintext;
        try {
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
            plaintext = new TextDecoder().decode(decrypted);
        } catch {
            throw new Error('Decryption failed — wrong password?');
        }

        const data = JSON.parse(plaintext);
        if (!Array.isArray(data.conversations)) throw new Error('Invalid Lore encrypted export format');
        return data.conversations;
    }

    // ── Claude parser ─────────────────────────────────────────────────────────

    async function parseClaude(zip) {
        // Claude export: conversations.json at root or in subfolder
        let jsonFile = zip.file('conversations.json');
        if (!jsonFile) {
            // Try to find it in subdirectory
            const found = Object.keys(zip.files).find(n => n.endsWith('conversations.json'));
            if (found) jsonFile = zip.file(found);
        }
        if (!jsonFile) throw new Error('conversations.json not found in Claude export');

        const raw  = await jsonFile.async('string');
        const data = JSON.parse(raw);

        return data.map(conv => ({
            source:     'claude',
            ext_id:     conv.uuid || conv.id,
            title:      conv.name || conv.title || 'Untitled',
            created_at: conv.created_at,
            updated_at: conv.updated_at,
            messages:   parseClaudeMessages(conv),
        })).filter(c => c.messages.length > 0);
    }

    function parseClaudeMessages(conv) {
        const messages = [];
        const chat_messages = conv.chat_messages || conv.messages || [];

        for (const msg of chat_messages) {
            const role = msg.sender === 'human' ? 'user' : 'assistant';
            let blocks = [];

            if (Array.isArray(msg.content)) {
                // Structured content takes priority over flat msg.text
                for (const block of msg.content) {
                    if (block.type === 'text' && block.text?.trim()) {
                        blocks.push({ type: 'text', text: block.text });
                    } else if (block.type === 'tool_use') {
                        blocks.push(parseToolUse(block));
                    } else if (block.type === 'tool_result') {
                        blocks.push(parseToolResult(block));
                    } else if (block.type === 'thinking' && block.thinking?.trim()) {
                        blocks.push({ type: 'thinking', text: block.thinking });
                    }
                    // token_budget and unknown types — skip
                }
            } else if (typeof msg.content === 'string') {
                if (msg.content.trim()) blocks.push({ type: 'text', text: msg.content });
            } else if (typeof msg.text === 'string') {
                // Legacy flat format fallback
                if (msg.text.trim()) blocks.push({ type: 'text', text: msg.text });
            }

            if (!blocks.length) continue;

            // content stored as JSON string for encryption compatibility
            messages.push({
                role,
                content:    JSON.stringify(blocks),
                created_at: msg.created_at,
            });
        }
        return messages;
    }

    function parseToolUse(block) {
        const name  = block.name || 'tool';
        const input = block.input || {};

        // Code-producing tools — extract language + code
        if (name === 'create_file' || name === 'file_create') {
            const lang = detectLang(input.path || '');
            const code = input.file_text || input.content || '';
            return { type: 'code', lang, code, label: input.path || name };
        }
        if (name === 'str_replace') {
            return { type: 'code', lang: detectLang(input.path || ''), code: input.new_str || '', label: `str_replace: ${input.path || ''}` };
        }
        if (name === 'bash_tool') {
            return { type: 'code', lang: 'bash', code: input.command || '', label: input.description || 'bash' };
        }
        if (name === 'view') {
            return { type: 'tool_label', label: `view: ${input.path || ''}` };
        }
        if (name === 'present_files') {
            const paths = (input.filepaths || []).join(', ');
            return { type: 'tool_label', label: `present_files: ${paths}` };
        }
        if (name === 'web_search') {
            return { type: 'tool_label', label: `web_search: ${input.query || ''}` };
        }
        if (name === 'web_fetch') {
            return { type: 'tool_label', label: `web_fetch: ${input.url || ''}` };
        }

        // Generic fallback
        return { type: 'tool_label', label: `${name}` };
    }

    function parseToolResult(block) {
        let output = '';
        if (typeof block.content === 'string') {
            output = block.content;
        } else if (Array.isArray(block.content)) {
            output = block.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('\n');
        }
        return { type: 'tool_result', text: output.trim() };
    }

    function detectLang(path) {
        const ext = (path.split('.').pop() || '').toLowerCase();
        const map = {
            js: 'javascript', ts: 'typescript', php: 'php', py: 'python',
            html: 'html', css: 'css', json: 'json', sql: 'sql',
            sh: 'bash', md: 'markdown', jsx: 'javascript', tsx: 'typescript',
        };
        return map[ext] || 'plaintext';
    }

    // ── ChatGPT HTML parser (chat.html with embedded jsonData) ────────────────

    async function parseChatGPTHtml(zip) {
        const htmlName = Object.keys(zip.files).find(n => n === 'chat.html' || n.endsWith('/chat.html') || n === 'chatgpt.html' || n.endsWith('/chatgpt.html'));
        if (!htmlName) throw new Error('chat.html not found in ChatGPT export');
        const raw = await zip.file(htmlName).async('string');
        return parseChatGPTHtmlRaw(raw);
    }

    async function parseChatGPTHtmlRaw(raw) {
        // jsonData is assigned on one line: var jsonData = [{...}, {...}];
        // Walk characters counting bracket depth to find exact array bounds
        const varIdx = raw.indexOf('var jsonData = [');
        if (varIdx === -1) throw new Error('jsonData not found in chat.html');

        const arrStart = raw.indexOf('[', varIdx);
        if (arrStart === -1) throw new Error('jsonData not found in chat.html');

        let depth = 0;
        let arrEnd = -1;
        let inString = false;
        let escape = false;
        for (let i = arrStart; i < raw.length; i++) {
            const ch = raw[i];
            if (escape) { escape = false; continue; }
            if (ch === '\\' && inString) { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '[' || ch === '{') depth++;
            else if (ch === ']' || ch === '}') {
                depth--;
                if (depth === 0) { arrEnd = i + 1; break; }
            }
        }
        if (arrEnd === -1) throw new Error('jsonData array not closed in chat.html');

        let data;
        try {
            data = JSON.parse(raw.slice(arrStart, arrEnd));
        } catch (e) {
            throw new Error('Failed to parse jsonData from chat.html: ' + e.message);
        }

        if (!Array.isArray(data)) throw new Error('jsonData is not an array');

        return data.map(conv => ({
            source:     'chatgpt',
            ext_id:     conv.id,
            title:      conv.title || 'Untitled',
            created_at: conv.create_time ? new Date(conv.create_time * 1000).toISOString() : new Date().toISOString(),
            updated_at: conv.update_time ? new Date(conv.update_time * 1000).toISOString() : new Date().toISOString(),
            messages:   parseChatGPTMessages(conv),
        })).filter(c => c.messages.length > 0);
    }

    // ── ChatGPT parser ────────────────────────────────────────────────────────

    async function parseChatGPT(zip) {
        let jsonFile = zip.file('conversations.json');
        if (!jsonFile) throw new Error('conversations.json not found in ChatGPT export');

        const raw  = await jsonFile.async('string');
        const data = JSON.parse(raw);

        return data.map(conv => ({
            source:     'chatgpt',
            ext_id:     conv.id,
            title:      conv.title || 'Untitled',
            created_at: new Date(conv.create_time * 1000).toISOString(),
            updated_at: new Date(conv.update_time * 1000).toISOString(),
            messages:   parseChatGPTMessages(conv),
        })).filter(c => c.messages.length > 0);
    }

    function parseChatGPTMessages(conv) {
        const messages = [];
        const mapping  = conv.mapping || {};

        // ChatGPT export uses a tree structure — flatten in order
        const nodes = Object.values(mapping).sort((a, b) => {
            const ta = a.message?.create_time || 0;
            const tb = b.message?.create_time || 0;
            return ta - tb;
        });

        for (const node of nodes) {
            const msg = node.message;
            if (!msg || !msg.content) continue;

            const role = msg.author?.role;
            if (!['user', 'assistant'].includes(role)) continue;

            let text = '';
            if (Array.isArray(msg.content.parts)) {
                // parts can be strings or objects (newer format)
                text = msg.content.parts.map(p => {
                    if (typeof p === 'string') return p;
                    if (p && typeof p === 'object') {
                        if (typeof p.text === 'string') return p.text;
                        if (p.content_type === 'image_asset_pointer') return '[image]';
                        if (p.content_type === 'audio_asset_pointer') return '[audio]';
                        if (p.content_type === 'tether_quote' && p.text) return p.text;
                    }
                    return '';
                }).join('\n').trim();
            } else if (typeof msg.content.text === 'string') {
                text = msg.content.text.trim();
            }

            if (!text.trim()) continue;

            messages.push({
                role,
                content:    text,
                created_at: msg.create_time
                    ? new Date(msg.create_time * 1000).toISOString()
                    : null,
            });
        }
        return messages;
    }

    // ── Encrypt & upload ──────────────────────────────────────────────────────

    async function encryptAndUpload(conversations, masterKey, onProgress) {
        const total   = conversations.length;
        let uploaded  = 0;
        let skipped   = 0;
        let failed    = 0;

        for (const conv of conversations) {
            try {
                const encTitle = await Crypto.encryptData(masterKey, conv.title);

                const encMessages = await Promise.all(
                    conv.messages.map(async msg => ({
                        role:       msg.role,
                        content:    await Crypto.encryptData(masterKey, msg.content),
                        created_at: msg.created_at,
                    }))
                );

                const res = await fetch((document.getElementById('app-config')?.dataset.base ?? '') + '/php/api.php', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({
                        action:     'import_conversation',
                        source:     conv.source,
                        ext_id:     conv.ext_id,
                        title:      encTitle,
                        created_at: conv.created_at,
                        updated_at: conv.updated_at,
                        messages:   encMessages,
                    }),
                });

                const json = await res.json();
                if (!json.ok && !json.duplicate) {
                    console.warn('[Lore] API rejected:', conv.ext_id, json);
                }
                if (json.ok && !json.duplicate) {
                    // Store decrypted version in IndexedDB cache
                    try {
                        await DB.saveConversation({
                            id:         json.id,
                            source:     conv.source,
                            ext_id:     conv.ext_id,
                            title:      conv.title,
                            created_at: conv.created_at,
                            updated_at: conv.updated_at,
                            msg_count:  conv.messages.length,
                            messages:   conv.messages,
                        });
                    } catch (dbErr) {
                        console.error('[Lore] DB.saveConversation failed:', conv.ext_id, dbErr);
                    }
                    uploaded++;
                } else if (json.duplicate) {
                    skipped++;
                } else {
                    failed++;
                }
            } catch (e) {
                console.error('Failed to import conversation:', conv.ext_id, e);
                failed++;
            }

            onProgress(uploaded / total, uploaded, total, skipped, failed);
        }

        return { uploaded, skipped, failed };
    }

    // ── Main entry point ──────────────────────────────────────────────────────

    async function processZip(file, onProgress, password) {
        const masterKey = await getMasterKey();

        // Direct HTML file — detect Gemini vs ChatGPT by content
        if (file.name.endsWith('.html')) {
            const raw = await file.text();
            const isGemini = raw.includes('outer-cell') || raw.includes('Gemini Apps');
            const conversations = isGemini
                ? await parseGeminiRaw(raw)
                : await parseChatGPTHtmlRaw(raw);
            if (!conversations.length) throw new Error('No conversations found in this export');
            return encryptAndUpload(conversations, masterKey, onProgress);
        }

        const zip       = await extractZip(file);
        const source    = await detectSource(zip);

        let conversations;
        if (source === 'lore-plaintext') {
            conversations = await parseLorePlaintext(zip);
        } else if (source === 'lore-encrypted') {
            if (!password) throw new Error('NEEDS_PASSWORD');
            conversations = await parseLoreEncrypted(zip, password);
        } else if (source === 'claude') {
            conversations = await parseClaude(zip);
        } else if (source === 'chatgpt') {
            conversations = await parseChatGPT(zip);
        } else if (source === 'chatgpt-html') {
            conversations = await parseChatGPTHtml(zip);
        } else if (source === 'gemini') {
            conversations = await parseGemini(zip);
        } else {
            // Try both parsers
            try {
                conversations = await parseClaude(zip);
            } catch {
                conversations = await parseChatGPT(zip);
            }
        }

        if (!conversations.length) throw new Error('No conversations found in this export');

        return encryptAndUpload(conversations, masterKey, onProgress);
    }

    return { processZip };
})();
