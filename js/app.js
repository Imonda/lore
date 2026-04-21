/**
 * app.js — Main UI controller
 * Handles conversation list, message view, import modal, search,
 * dashboard, heatmap, sidebar summary, and stats report export.
 */

// ── State ─────────────────────────────────────────────────────────────────────

const App = {
    conversations:  [],
    activeId:       null,
    sourceFilter:   'all',
    searchQuery:    '',
    masterKey:      null,
    searchTimer:    null,
    indexed:        false,
};

// ── Master key ────────────────────────────────────────────────────────────────

const APP_BASE = document.getElementById('app-config')?.dataset.base ?? '';

async function getMasterKey() {
    if (App.masterKey) return App.masterKey;
    const b64 = sessionStorage.getItem('lore_mk');
    if (!b64) { window.location.href = APP_BASE + '/logout'; return null; }
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    App.masterKey = await crypto.subtle.importKey(
        'raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    return App.masterKey;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
    const mk = await getMasterKey();
    if (!mk) return;

    showStatus('Loading conversations…');

    await DB.init();
    let convs = await DB.getAllConversations();

    if (!convs.length) {
        showStatus('Decrypting your archive…');
        convs = await DB.seedFromServer(mk);
    }

    App.conversations = convs.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    hideStatus();
    renderList();
    renderDashboard();
    renderSidebarSummary();

    setTimeout(async () => {
        await Search.buildIndex(App.conversations);
        App.indexed = true;
    }, 0);
}

// ── Render conversation list ──────────────────────────────────────────────────

function renderList() {
    const results = Search.search(App.conversations, App.searchQuery, App.sourceFilter);
    const list    = document.getElementById('conv-list');
    const stats   = document.getElementById('stats');

    stats.textContent = `${App.conversations.length} conversations`;

    if (!results.length) {
        list.innerHTML = `<div class="no-results">${App.searchQuery ? 'No results.' : 'No conversations yet.'}</div>`;
        return;
    }

    if (App.searchQuery) {
        list.innerHTML = `<div class="search-results-header">${results.length} result${results.length !== 1 ? 's' : ''}</div>`;
    } else {
        list.innerHTML = '';
    }

    for (const conv of results) {
        const item = document.createElement('div');
        item.className = 'conv-item' + (conv.id === App.activeId ? ' active' : '');
        item.dataset.id = conv.id;

        const date = new Date(conv.updated_at).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
        });

        item.innerHTML = `
            <div class="conv-source ${conv.source}">${conv.source}</div>
            <div class="conv-title">${Search.highlight(conv.title, App.searchQuery)}</div>
            <div class="conv-meta">${date} · ${conv.msg_count} msg${conv.msg_count !== 1 ? 's' : ''}</div>
        `;

        item.addEventListener('click', () => {
            if (conv.id === App.activeId) {
                showDashboard();
            } else {
                openConversation(conv.id);
            }
        });
        list.appendChild(item);
    }
}

// ── Sidebar summary ───────────────────────────────────────────────────────────

function renderSidebarSummary() {
    const convs = App.conversations;
    const el    = document.getElementById('sidebar-summary');
    const text  = document.getElementById('sidebar-summary-text');

    if (!convs.length) { el.style.display = 'none'; return; }

    const totalMsg = convs.reduce((s, c) => s + (parseInt(c.msg_count) || 0), 0);

    // Dominant source
    const counts = {};
    for (const c of convs) counts[c.source] = (counts[c.source] || 0) + 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const pct = Math.round(dominant[1] / convs.length * 100);

    text.textContent = `${convs.length} conv · ${totalMsg.toLocaleString()} msg · ${dominant[0]} ${pct}%`;
    el.style.display = 'block';
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function renderDashboard() {
    const convs = App.conversations;

    // Show dashboard only when no conversation is active
    if (App.activeId) return;

    const dash = document.getElementById('dashboard');
    const noSel = document.getElementById('no-selection');

    if (!convs.length) {
        dash.style.display = 'none';
        noSel.style.display = 'flex';
        return;
    }

    noSel.style.display = 'none';
    dash.style.display  = 'flex';

    // ── Stat cards ──
    const totalMsg  = convs.reduce((s, c) => s + (parseInt(c.msg_count) || 0), 0);
    const avgMsg    = convs.length ? Math.round(totalMsg / convs.length) : 0;

    // Count unique active days
    const daySet = new Set(convs.map(c => c.updated_at.slice(0, 10)));
    const activeDays = daySet.size;

    // Earliest date for subtitle
    const oldest = convs[convs.length - 1];
    const since  = oldest ? new Date(oldest.updated_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';

    document.getElementById('dash-subtitle').textContent   = since ? `Since ${since}` : '';
    document.getElementById('dash-conv-count').textContent = convs.length.toLocaleString();
    document.getElementById('dash-msg-count').textContent  = totalMsg.toLocaleString();
    document.getElementById('dash-days-count').textContent = activeDays.toLocaleString();
    document.getElementById('dash-avg-msg').textContent    = avgMsg.toLocaleString();

    // ── Sources breakdown ──
    const counts  = {};
    for (const c of convs) counts[c.source] = (counts[c.source] || 0) + 1;
    const sourceOrder = ['claude', 'chatgpt', 'gemini'];
    const sourcesEl   = document.getElementById('dash-sources');
    sourcesEl.innerHTML = '';

    for (const src of sourceOrder) {
        if (!counts[src]) continue;
        const pct  = Math.round(counts[src] / convs.length * 100);
        const row  = document.createElement('div');
        row.className = 'dash-source-row';
        row.innerHTML = `
            <div class="dash-source-name ${src}">${src}</div>
            <div class="dash-source-bar-wrap">
                <div class="dash-source-bar ${src}" style="width:${pct}%"></div>
            </div>
            <div class="dash-source-count">${counts[src].toLocaleString()} <span class="dash-source-pct">${pct}%</span></div>
        `;
        sourcesEl.appendChild(row);
    }

    // ── Heatmap ──
    renderHeatmap(convs);

    // ── Recent conversations ──
    const recentEl = document.getElementById('dash-recent');
    recentEl.innerHTML = '';
    const recent = convs.slice(0, 8);
    for (const conv of recent) {
        const date = new Date(conv.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const item = document.createElement('div');
        item.className = 'dash-recent-item';
        item.innerHTML = `
            <div class="dash-recent-source ${conv.source}">${conv.source}</div>
            <div class="dash-recent-title">${escapeHtml(conv.title)}</div>
            <div class="dash-recent-meta">${date} · ${conv.msg_count} msgs</div>
        `;
        item.addEventListener('click', () => openConversation(conv.id));
        recentEl.appendChild(item);
    }
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

function renderHeatmap(convs) {
    renderHeatmapInto(convs, document.getElementById('dash-heatmap'));
}

function renderHeatmapInto(convs, heatmapEl) {
    heatmapEl.innerHTML = '';

    // Count conversations per day
    const dayCounts = {};
    for (const c of convs) {
        const day = c.updated_at.slice(0, 10);
        dayCounts[day] = (dayCounts[day] || 0) + 1;
    }

    const maxCount = Math.max(...Object.values(dayCounts), 1);

    // Build 53 weeks × 7 days grid ending today
    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDay = today.getDay(); // 0=Sun

    // End on last Saturday (or today if Saturday)
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - todayDay));

    // Start 52 weeks back from end
    const start = new Date(end);
    start.setDate(start.getDate() - 52 * 7 + 1);

    // Build week columns
    let col      = null;
    let colDate  = new Date(start);

    while (colDate <= end) {
        const dow = colDate.getDay();

        if (dow === 0 || col === null) {
            col = document.createElement('div');
            col.className = 'heatmap-col';
            heatmapEl.appendChild(col);
        }

        const dayStr = colDate.toISOString().slice(0, 10);
        const count  = dayCounts[dayStr] || 0;
        const isFuture = colDate > today;

        let level = 0;
        if (!isFuture && count > 0) {
            const ratio = count / maxCount;
            if (ratio < 0.25)      level = 1;
            else if (ratio < 0.5)  level = 2;
            else if (ratio < 0.75) level = 3;
            else                   level = 4;
        }

        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.dataset.level = isFuture ? 'future' : level;
        cell.title = isFuture ? '' : (count ? `${dayStr}: ${count} conversation${count !== 1 ? 's' : ''}` : dayStr);

        col.appendChild(cell);
        colDate.setDate(colDate.getDate() + 1);
    }
}

// ── Stats report export ───────────────────────────────────────────────────────

function exportStatsReport() {
    const convs = App.conversations;
    if (!convs.length) { showToast('No conversations to report'); return; }

    const totalMsg  = convs.reduce((s, c) => s + (parseInt(c.msg_count) || 0), 0);
    const counts    = {};
    for (const c of convs) counts[c.source] = (counts[c.source] || 0) + 1;

    const daySet = new Set(convs.map(c => c.updated_at.slice(0, 10)));
    const dayCounts = {};
    for (const c of convs) {
        const day = c.updated_at.slice(0, 10);
        dayCounts[day] = (dayCounts[day] || 0) + 1;
    }

    const topByMessages = [...convs]
        .sort((a, b) => (parseInt(b.msg_count) || 0) - (parseInt(a.msg_count) || 0))
        .slice(0, 10)
        .map(c => ({ title: c.title, source: c.source, msg_count: parseInt(c.msg_count) || 0, updated_at: c.updated_at }));

    const report = {
        generated_at: new Date().toISOString(),
        summary: {
            total_conversations: convs.length,
            total_messages:      totalMsg,
            active_days:         daySet.size,
            avg_messages_per_conv: convs.length ? Math.round(totalMsg / convs.length) : 0,
            date_range: {
                from: convs[convs.length - 1]?.updated_at?.slice(0, 10) || null,
                to:   convs[0]?.updated_at?.slice(0, 10) || null,
            },
        },
        sources: counts,
        activity_by_day: dayCounts,
        top_conversations_by_length: topByMessages,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `lore-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Report downloaded');
}

// ── Stats modal (mobile) ──────────────────────────────────────────────────────

function openStatsModal() {
    const convs = App.conversations;
    if (!convs.length) { showToast('No conversations yet'); return; }

    // Cards
    const totalMsg  = convs.reduce((s, c) => s + (parseInt(c.msg_count) || 0), 0);
    const daySet    = new Set(convs.map(c => c.updated_at.slice(0, 10)));
    const avgMsg    = Math.round(totalMsg / convs.length);

    document.getElementById('modal-dash-conv-count').textContent = convs.length.toLocaleString();
    document.getElementById('modal-dash-msg-count').textContent  = totalMsg.toLocaleString();
    document.getElementById('modal-dash-days-count').textContent = daySet.size.toLocaleString();
    document.getElementById('modal-dash-avg-msg').textContent    = avgMsg.toLocaleString();

    // Sources
    const counts    = {};
    for (const c of convs) counts[c.source] = (counts[c.source] || 0) + 1;
    const sourcesEl = document.getElementById('modal-dash-sources');
    sourcesEl.innerHTML = '';
    for (const src of ['claude', 'chatgpt', 'gemini']) {
        if (!counts[src]) continue;
        const pct = Math.round(counts[src] / convs.length * 100);
        const row = document.createElement('div');
        row.className = 'dash-source-row';
        row.innerHTML = `
            <div class="dash-source-name ${src}">${src}</div>
            <div class="dash-source-bar-wrap">
                <div class="dash-source-bar ${src}" style="width:${pct}%"></div>
            </div>
            <div class="dash-source-count">${counts[src].toLocaleString()} <span class="dash-source-pct">${pct}%</span></div>
        `;
        sourcesEl.appendChild(row);
    }

    // Heatmap — reuse renderHeatmap logic but targeting modal element
    renderHeatmapInto(convs, document.getElementById('modal-dash-heatmap'));

    document.getElementById('stats-modal').classList.add('show');
}



async function openConversation(id) {
    App.activeId = id;
    renderList();

    const conv = App.conversations.find(c => c.id === id);
    if (!conv) return;

    // Hide dashboard, show conversation
    document.getElementById('dashboard').style.display  = 'none';
    document.getElementById('no-selection').style.display = 'none';
    document.getElementById('conv-view').style.display  = 'flex';

    if (typeof showConvMobile === 'function') showConvMobile();

    const date = new Date(conv.updated_at).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric'
    });

    document.getElementById('conv-title').textContent     = conv.title;
    document.getElementById('conv-meta').textContent      = `${conv.source} · ${date} · ${conv.msg_count} messages`;
    document.getElementById('messages-wrap').innerHTML    = '<div class="loading-msgs">Loading…</div>';

    let messages = await DB.getMessages(id);

    if (!messages.length) {
        const mk  = await getMasterKey();
        const res = await fetch(APP_BASE + '/php/api.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action: 'get_messages', conversation_id: id }),
        });
        const data = await res.json();
        if (data.ok) {
            messages = await Promise.all(data.messages.map(async msg => ({
                ...msg,
                content: await Crypto.decryptData(mk, msg.content),
            })));
            await DB.saveConversation({ ...conv, messages });
        }
    }

    renderMessages(messages, conv);
}

// ── Show dashboard (called on "Back" or deselect) ─────────────────────────────

function showDashboard() {
    App.activeId = null;
    document.getElementById('conv-view').style.display    = 'none';
    document.getElementById('no-selection').style.display = 'none';
    renderDashboard();
    renderList();
    // On mobile: slide back to sidebar
    if (typeof showListMobile === 'function') showListMobile();
}

// ── Render messages ───────────────────────────────────────────────────────────

function renderMessages(messages, conv) {
    const wrap = document.getElementById('messages-wrap');

    if (!messages.length) {
        wrap.innerHTML = '<div class="no-results">No messages found.</div>';
        return;
    }

    wrap.innerHTML = '';

    for (const msg of messages) {
        const div = document.createElement('div');
        div.className = 'message';

        const role = document.createElement('div');
        role.className = 'message-role ' + msg.role;
        role.textContent = msg.role === 'user' ? 'You' : conv.source;

        const body = document.createElement('div');
        body.className = 'message-body';

        let blocks = null;
        try {
            const parsed = JSON.parse(msg.content);
            if (Array.isArray(parsed)) blocks = parsed;
        } catch (e) {}

        if (blocks) {
            body.appendChild(renderBlocks(blocks, msg.content));
        } else {
            const hint = document.createElement('span');
            hint.className   = 'copy-hint';
            hint.textContent = 'click to copy';
            body.innerHTML = Search.highlight(msg.content, App.searchQuery);
            body.appendChild(hint);
            body.addEventListener('click', () => copyToClipboard(msg.content, body));
        }

        div.appendChild(role);
        div.appendChild(body);
        wrap.appendChild(div);
    }

    const first = messages.find(m => m.role === 'user');
    if (first) {
        let preview = first.content;
        try {
            const parsed = JSON.parse(first.content);
            if (Array.isArray(parsed)) {
                const textBlock = parsed.find(b => b.type === 'text');
                preview = textBlock ? textBlock.text : first.content;
            }
        } catch (e) {}
        document.getElementById('context-preview').textContent = preview.slice(0, 120) + '…';
    }
}


// ── Simple markdown renderer ──────────────────────────────────────────────────

function renderMarkdown(text, searchQuery) {
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
        return `<code class="md-inline-code">${code.trim()}</code>`;
    });

    html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

    html = html.replace(/^\*\*([^*]+)\*\*[:\s]*$/gm, '<strong class="block-bold">$1</strong>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    html = html.replace(/^### (.+)$/gm, '<span class="md-h3">$1</span>');
    html = html.replace(/^## (.+)$/gm, '<span class="md-h2">$1</span>');
    html = html.replace(/^# (.+)$/gm, '<span class="md-h1">$1</span>');

    html = html.replace(/^---+$/gm, '<hr class="md-hr">');

    if (searchQuery) {
        html = Search.highlight(html, searchQuery);
    }

    return html;
}

// ── Block renderer ────────────────────────────────────────────────────────────

function renderBlocks(blocks, rawContent) {
    const wrap = document.createDocumentFragment();

    for (const block of blocks) {
        if (block.type === 'text') {
            const p = document.createElement('div');
            p.className = 'msg-text';
            p.innerHTML = renderMarkdown(block.text, App.searchQuery);
            const hint = document.createElement('span');
            hint.className   = 'copy-hint';
            hint.textContent = 'click to copy';
            p.appendChild(hint);
            p.addEventListener('click', () => copyToClipboard(block.text, p));
            wrap.appendChild(p);

        } else if (block.type === 'code') {
            wrap.appendChild(renderCodeBlock(block));

        } else if (block.type === 'tool_label') {
            const el = document.createElement('div');
            el.className = 'msg-tool-label';
            el.textContent = block.label;
            wrap.appendChild(el);

        } else if (block.type === 'tool_result') {
            if (!block.text) continue;
            wrap.appendChild(renderCollapsible('Output', block.text, 'msg-tool-result'));

        } else if (block.type === 'thinking') {
            wrap.appendChild(renderCollapsible('Thinking…', block.text, 'msg-thinking'));
        }
    }

    return wrap;
}

function renderCodeBlock(block) {
    const wrap = document.createElement('div');
    wrap.className = 'msg-code-wrap';

    const header = document.createElement('div');
    header.className = 'msg-code-header';

    const lang = document.createElement('span');
    lang.className   = 'msg-code-lang';
    lang.textContent = block.lang || 'code';

    const label = document.createElement('span');
    label.className   = 'msg-code-label';
    label.textContent = block.label || '';

    const copyBtn = document.createElement('button');
    copyBtn.className   = 'msg-code-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(block.code);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy', 1500);
    });

    header.appendChild(lang);
    header.appendChild(label);
    header.appendChild(copyBtn);

    const pre  = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = block.code.replace(/\n{3,}/g, "\n\n");
    pre.appendChild(code);

    wrap.appendChild(header);
    wrap.appendChild(pre);
    return wrap;
}

function renderCollapsible(title, text, className) {
    const wrap = document.createElement('div');
    wrap.className = className + ' collapsible';

    const toggle = document.createElement('div');
    toggle.className   = className + '-toggle';
    toggle.textContent = '▶ ' + title;

    const body = document.createElement('pre');
    body.className = className + '-body';
    body.textContent = text;
    body.style.display = 'none';

    toggle.addEventListener('click', () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        toggle.textContent = (open ? '▶ ' : '▼ ') + title;
    });

    wrap.appendChild(toggle);
    wrap.appendChild(body);
    return wrap;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Copy helpers ──────────────────────────────────────────────────────────────

async function copyToClipboard(text, el) {
    await navigator.clipboard.writeText(text);
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1500);
}

async function copyAllMessages() {
    if (!App.activeId) return;
    const messages = await DB.getMessages(App.activeId);
    const text     = messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
    await navigator.clipboard.writeText(text);
    showToast('Conversation copied');
}

// ── Import modal ──────────────────────────────────────────────────────────────

function openImportModal() {
    document.getElementById('import-modal').classList.add('show');
}

function closeImportModal() {
    document.getElementById('import-modal').classList.remove('show');
    resetImportModal();
}

function resetImportModal() {
    document.getElementById('progress-bar').classList.remove('show');
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('progress-text').classList.remove('show');
    document.getElementById('progress-text').textContent = '';
    document.getElementById('modal-drop').classList.remove('drag-over');
    document.getElementById('modal-drop').style.display = 'block';
    document.getElementById('import-password-wrap').style.display = 'none';
    document.getElementById('import-password').value = '';
}

async function handleImportFile(file) {
    if (!file || (!file.name.endsWith('.zip') && !file.name.endsWith('.html'))) {
        showToast('Please select a .zip or .html file');
        return;
    }

    document.getElementById('progress-bar').classList.add('show');
    document.getElementById('progress-text').classList.add('show');

    try {
        const result = await Importer.processZip(file, (pct, done, total, skipped) => {
            document.getElementById('progress-fill').style.width = (pct * 100) + '%';
            document.getElementById('progress-text').textContent =
                `Processing ${done} / ${total}… (${skipped} duplicates skipped)`;
        });

        closeImportModal();
        showToast(`Imported ${result.uploaded} conversations`);

        App.conversations = (await DB.getAllConversations())
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        renderList();
        renderDashboard();
        renderSidebarSummary();

        App.indexed = false;
        setTimeout(async () => {
            await Search.buildIndex(App.conversations);
            App.indexed = true;
        }, 0);

    } catch (e) {
        if (e.message === 'NEEDS_PASSWORD') {
            document.getElementById('progress-bar').classList.remove('show');
            document.getElementById('progress-text').classList.remove('show');
            document.getElementById('modal-drop').style.display = 'none';
            document.getElementById('import-password-wrap').style.display = 'block';
            document.getElementById('import-password').value = '';
            document.getElementById('import-password').focus();
            _pendingEncryptedFile = file;
            return;
        }
        showToast('Import failed: ' + e.message);
        console.error(e);
        resetImportModal();
    }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Status overlay ────────────────────────────────────────────────────────────

function showStatus(msg) {
    document.getElementById('status-msg').textContent = msg;
    document.getElementById('status-overlay').style.display = 'flex';
}

function hideStatus() {
    document.getElementById('status-overlay').style.display = 'none';
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // Search
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('btn-search-clear');

    searchInput.addEventListener('input', e => {
        App.searchQuery = e.target.value;
        searchClear.style.display = App.searchQuery ? 'block' : 'none';
        clearTimeout(App.searchTimer);
        App.searchTimer = setTimeout(() => {
            renderList();
            if (App.activeId) openConversation(App.activeId);
        }, 200);
    });

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        App.searchQuery = '';
        searchClear.style.display = 'none';
        searchInput.focus();
        renderList();
    });

    // Source filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            App.sourceFilter = btn.dataset.filter;
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderList();
        });
    });

    // Import modal source tabs
    document.querySelectorAll('.import-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.import-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector(`.import-tab-content[data-source="${tab.dataset.source}"]`).classList.add('active');

            // ChatGPT supports both ZIP and HTML
            const acceptsHtml = tab.dataset.source === 'chatgpt' || tab.dataset.source === 'gemini';
            document.getElementById('file-input').accept = acceptsHtml ? '.zip,.html' : '.zip';
            document.querySelector('.modal-drop-label').textContent = acceptsHtml ? 'Drop ZIP or HTML here' : 'Drop ZIP here';
        });
    });

    // Import modal
    document.getElementById('btn-import').addEventListener('click', openImportModal);
    document.getElementById('btn-modal-close').addEventListener('click', closeImportModal);

    // Modal drag & drop
    const modalDrop = document.getElementById('modal-drop');
    modalDrop.addEventListener('click', () => document.getElementById('file-input').click());
    modalDrop.addEventListener('dragover', e => { e.preventDefault(); modalDrop.classList.add('drag-over'); });
    modalDrop.addEventListener('dragleave', () => modalDrop.classList.remove('drag-over'));
    modalDrop.addEventListener('drop', e => {
        e.preventDefault();
        modalDrop.classList.remove('drag-over');
        handleImportFile(e.dataTransfer.files[0]);
    });

    document.getElementById('file-input').addEventListener('change', e => {
        handleImportFile(e.target.files[0]);
        e.target.value = '';
    });

    // Global drag & drop
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file?.name.endsWith('.zip') || file?.name.endsWith('.html')) {
            openImportModal();
            setTimeout(() => handleImportFile(file), 100);
        }
    });

    // Settings → Stats (mobile)
    document.getElementById('btn-settings-stats').addEventListener('click', () => {
        closeSettings();
        openStatsModal();
    });
    document.getElementById('btn-stats-modal-close').addEventListener('click', () => {
        document.getElementById('stats-modal').classList.remove('show');
    });

    // Copy all button
    document.getElementById('btn-copy-all').addEventListener('click', copyAllMessages);

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
        window.location.href = APP_BASE + '/logout';
    });

    boot();
});
