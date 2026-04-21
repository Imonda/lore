<?php
require_once __DIR__ . '/php/auth.php';
session_start_secure();
require_auth();
$username = current_user()['username'];
?>
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lore - Your private AI archive</title>
    <link rel="stylesheet" href="<?= APP_BASE ?>/css/dark.css">
    <link rel="stylesheet" href="<?= APP_BASE ?>/css/light.css">
    <link rel="stylesheet" href="<?= APP_BASE ?>/css/style.css">
    <script src="<?= APP_BASE ?>/js/theme.js"></script>
    <link rel="icon" type="image/x-icon" href="<?= APP_BASE ?>/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="<?= APP_BASE ?>/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="<?= APP_BASE ?>/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="<?= APP_BASE ?>/apple-touch-icon.png">    
</head>
<body>

<!-- Status overlay (shown during boot/decryption) -->
<div id="status-overlay" style="display:none; position:fixed; inset:0; background:var(--bg); z-index:200; align-items:center; justify-content:center; flex-direction:column; gap:16px;">
    <div style="font-family:var(--mono); font-size:13px; font-weight:700; letter-spacing:0.15em; color:var(--accent); text-transform:uppercase;">LORE.</div>
    <div id="status-msg" style="font-family:var(--mono); font-size:11px; color:var(--text3); letter-spacing:0.1em; text-transform:uppercase;">Loading…</div>
</div>

<!-- Header -->
<header>
    <div class="logo">LORE<span>.</span></div>

    <div class="search-wrap">
        <span class="search-icon">⌕</span>
        <input type="text" id="search-input" placeholder="Search conversations…" autocomplete="off">
        <button class="search-clear" id="btn-search-clear" title="Clear search" style="display:none;">✕</button>
    </div>

    <div class="header-actions">
        <span class="stats" id="stats"></span>
        <button class="btn primary" id="btn-import">↑ Import</button>
        <button class="theme-toggle" id="btn-theme">◐ Light</button>
        <button class="btn" id="btn-settings" title="Settings">⚙ Settings</button>
        <button class="btn" id="btn-logout" title="Sign out <?= htmlspecialchars($username) ?>">Sign out</button>
    </div>
</header>

<!-- Filter bar -->
<div class="filter-bar">
    <button class="filter-btn active" data-filter="all">
        <span class="filter-icon">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="3" width="14" height="2" fill="currentColor"/><rect x="1" y="7" width="10" height="2" fill="currentColor"/><rect x="1" y="11" width="6" height="2" fill="currentColor"/></svg>
        </span>
        <span class="filter-label">All</span>
    </button>
    <button class="filter-btn claude" data-filter="claude">
        <span class="filter-icon">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5C4.41 1.5 1.5 4.41 1.5 8c0 1.74.665 3.32 1.75 4.51L2 14.5l2.07-1.2A6.47 6.47 0 0 0 8 14.5c3.59 0 6.5-2.91 6.5-6.5S11.59 1.5 8 1.5Z" fill="currentColor"/></svg>
        </span>
        <span class="filter-label">Claude</span>
    </button>
    <button class="filter-btn chatgpt" data-filter="chatgpt">
        <span class="filter-icon">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 6.5a3 3 0 0 0-1.76-2.74A3 3 0 0 0 6.26 2.5a3 3 0 0 0-3.76 3.76A3 3 0 0 0 2.5 9a3 3 0 0 0 1.76 2.74 3 3 0 0 0 5.48 1.26A3 3 0 0 0 13.5 9a3 3 0 0 0 0-2.5Z" fill="currentColor"/></svg>
        </span>
        <span class="filter-label">ChatGPT</span>
    </button>
    <button class="filter-btn gemini" data-filter="gemini">
        <span class="filter-icon">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2C8 2 9.5 6 14 8C9.5 10 8 14 8 14C8 14 6.5 10 2 8C6.5 6 8 2 8 2Z" fill="currentColor"/></svg>
        </span>
        <span class="filter-label">Gemini</span>
    </button>
    <button class="filter-btn lechat" data-filter="lechat">
        <span class="filter-icon">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H9l-3 3v-3H3.5A1.5 1.5 0 0 1 2 9.5v-6Z" fill="currentColor"/></svg>
        </span>
        <span class="filter-label">Le Chat</span>
    </button>
</div>

<!-- Layout -->
<div class="layout">

    <!-- Sidebar -->
    <aside class="sidebar">
        <div class="conv-list" id="conv-list"></div>

        <!-- Sidebar summary (bottom of sidebar) -->
        <div class="sidebar-summary" id="sidebar-summary" style="display:none;">
            <span class="sidebar-summary-text" id="sidebar-summary-text"></span>
        </div>
    </aside>

    <!-- Main -->
    <main class="main">

        <!-- Dashboard (default view) -->
        <div id="dashboard" class="dashboard" style="display:none;">
            <div class="dashboard-inner">

                <!-- Header row -->
                <div class="dashboard-heading">
                    <div class="dashboard-title">Archive overview</div>
                    <div class="dashboard-subtitle" id="dash-subtitle"></div>
                </div>

                <!-- Stat cards -->
                <div class="dash-cards" id="dash-cards">
                    <div class="dash-card">
                        <div class="dash-card-value" id="dash-conv-count">—</div>
                        <div class="dash-card-label">Conversations</div>
                    </div>
                    <div class="dash-card">
                        <div class="dash-card-value" id="dash-msg-count">—</div>
                        <div class="dash-card-label">Messages</div>
                    </div>
                    <div class="dash-card">
                        <div class="dash-card-value" id="dash-days-count">—</div>
                        <div class="dash-card-label">Active days</div>
                    </div>
                    <div class="dash-card">
                        <div class="dash-card-value" id="dash-avg-msg">—</div>
                        <div class="dash-card-label">Avg. msgs / conv</div>
                    </div>
                </div>

                <!-- Source breakdown -->
                <div class="dash-section">
                    <div class="dash-section-label">Sources</div>
                    <div class="dash-sources" id="dash-sources"></div>
                </div>

                <!-- Heatmap -->
                <div class="dash-section">
                    <div class="dash-section-label">Activity — last 12 months</div>
                    <div class="dash-heatmap-wrap">
                        <div class="dash-heatmap" id="dash-heatmap"></div>
                        <div class="dash-heatmap-legend">
                            <span class="dash-legend-label">Less</span>
                            <span class="dash-legend-cell" data-level="0"></span>
                            <span class="dash-legend-cell" data-level="1"></span>
                            <span class="dash-legend-cell" data-level="2"></span>
                            <span class="dash-legend-cell" data-level="3"></span>
                            <span class="dash-legend-cell" data-level="4"></span>
                            <span class="dash-legend-label">More</span>
                        </div>
                    </div>
                </div>

                <!-- Recent conversations -->
                <div class="dash-section">
                    <div class="dash-section-label">Recently added</div>
                    <div class="dash-recent" id="dash-recent"></div>
                </div>

            </div>
        </div>

        <!-- No conversation selected (shown when archive empty) -->
        <div id="no-selection" class="no-selection" style="display:none;">
            Select a conversation
        </div>

        <!-- Conversation view -->
        <div id="conv-view" style="display:none; flex-direction:column; flex:1; overflow:hidden;">
            <div class="conv-header">
                <div class="conv-header-info">
                    <button class="btn btn-back" id="btn-back" style="display:none; margin-bottom:6px;">← Back</button>
                    <div class="conv-header-title" id="conv-title"></div>
                    <div class="conv-header-meta" id="conv-meta"></div>
                </div>
                <div class="conv-header-actions">
                    <button class="btn" id="btn-copy-all">Copy all</button>
                </div>
            </div>

            <div class="messages" id="messages-wrap"></div>

            <div class="context-panel">
                <span class="context-label">Context</span>
                <span class="context-preview" id="context-preview"></span>
            </div>
        </div>

    </main>
</div>

<!-- Settings panel -->
<div class="settings-overlay" id="settings-overlay"></div>
<div class="settings-panel" id="settings-panel">
    <div class="settings-header">
        <div class="settings-title">Settings</div>
        <button class="settings-close" id="btn-settings-close">✕</button>
    </div>
    <div class="settings-section" id="settings-mobile-section">
        <div class="settings-section-label">App</div>
        <button class="settings-item" id="btn-settings-import">
            <span class="settings-item-icon">↑</span>
            <div class="settings-item-info">
                <div class="settings-item-name">Import conversations</div>
                <div class="settings-item-desc">Add from Claude, ChatGPT or Lore backup.</div>
            </div>
        </button>
        <button class="settings-item" id="btn-settings-theme">
            <span class="settings-item-icon">◐</span>
            <div class="settings-item-info">
                <div class="settings-item-name" id="settings-theme-label">Switch to Light mode</div>
                <div class="settings-item-desc">Toggle dark / light appearance.</div>
            </div>
        </button>
        <button class="settings-item" id="btn-settings-stats">
            <span class="settings-item-icon">◎</span>
            <div class="settings-item-info">
                <div class="settings-item-name">Archive stats</div>
                <div class="settings-item-desc">Conversations, messages, activity heatmap.</div>
            </div>
        </button>
        <button class="settings-item" id="btn-settings-signout">
            <span class="settings-item-icon">→</span>
            <div class="settings-item-info">
                <div class="settings-item-name">Sign out</div>
                <div class="settings-item-desc">End your session and clear the key.</div>
            </div>
        </button>
    </div>
    <div class="settings-section">
        <div class="settings-section-label">Data</div>
        <button class="settings-item" id="btn-export">
            <span class="settings-item-icon">↓</span>
            <div class="settings-item-info">
                <div class="settings-item-name">Export conversations</div>
                <div class="settings-item-desc">Download your archive as a ZIP file.</div>
            </div>
        </button>
        <button class="settings-item" id="btn-export-report">
            <span class="settings-item-icon">◎</span>
            <div class="settings-item-info">
                <div class="settings-item-name">Export stats report</div>
                <div class="settings-item-desc">Download a JSON summary of your archive. No conversation content included.</div>
            </div>
        </button>
    </div>
    <div class="settings-section">
        <div class="settings-section-label">Cache</div>
        <button class="settings-item" id="btn-clear-cache">
            <span class="settings-item-icon">⌫</span>
            <div class="settings-item-info">
                <div class="settings-item-name">Clear local cache</div>
                <div class="settings-item-desc">Rebuilds IndexedDB on next load. Server data is safe.</div>
            </div>
        </button>
    </div>
</div>

<!-- Export modal -->
<div class="modal-overlay" id="export-modal">
    <div class="modal">
        <div class="modal-title">Export conversations</div>

        <div class="import-instructions">
            Your data is decrypted in the browser and packed locally into a ZIP.
            Nothing is sent to the server during export.
        </div>

        <div class="export-options">
            <button class="export-option" id="export-opt-plain">
                <div class="export-option-title">↓ Plaintext ZIP</div>
                <div class="export-option-desc">Readable JSON. Easy to open anywhere.<br>Keep it in a safe place.</div>
            </button>
            <button class="export-option" id="export-opt-enc">
                <div class="export-option-title">⚿ Encrypted ZIP</div>
                <div class="export-option-desc">Protected with a password you choose.<br>Re-importable into Lore.</div>
            </button>
        </div>

        <!-- Password field (encrypted only) -->
        <div id="export-password-wrap" style="display:none;">
            <div class="export-password-label">Export password</div>
            <input type="password" id="export-password" class="export-password-input" placeholder="Choose a strong password…" autocomplete="new-password">
            <div class="export-password-hint">You will need this password to import the file back into Lore.</div>
        </div>

        <div class="progress-bar" id="export-progress-bar">
            <div class="progress-fill" id="export-progress-fill"></div>
        </div>
        <div class="progress-text" id="export-progress-text"></div>

        <div class="modal-actions">
            <button class="btn" id="btn-export-cancel">Cancel</button>
            <button class="btn primary" id="btn-export-go" style="display:none;">↓ Download</button>
        </div>
    </div>
</div>

<!-- Import modal -->
<div class="modal-overlay" id="import-modal">
    <div class="modal">
        <div class="modal-title">Import conversations</div>

        <!-- Source tabs -->
        <div class="import-tabs" id="import-tabs">
            <button class="import-tab claude active" data-source="claude">
                <span class="import-tab-icon">
                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5C4.41 1.5 1.5 4.41 1.5 8c0 1.74.665 3.32 1.75 4.51L2 14.5l2.07-1.2A6.47 6.47 0 0 0 8 14.5c3.59 0 6.5-2.91 6.5-6.5S11.59 1.5 8 1.5Z" fill="currentColor"/></svg>
                </span>
                Claude
            </button>
            <button class="import-tab chatgpt" data-source="chatgpt">
                <span class="import-tab-icon">
                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 6.5a3 3 0 0 0-1.76-2.74A3 3 0 0 0 6.26 2.5a3 3 0 0 0-3.76 3.76A3 3 0 0 0 2.5 9a3 3 0 0 0 1.76 2.74 3 3 0 0 0 5.48 1.26A3 3 0 0 0 13.5 9a3 3 0 0 0 0-2.5Z" fill="currentColor"/></svg>
                </span>
                ChatGPT
            </button>
            <button class="import-tab lore" data-source="lore">
                <span class="import-tab-icon">
                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="1" width="9" height="12" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M5 14h7a1 1 0 0 0 1-1V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5 5h5M5 7.5h5M5 10h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                </span>
                Lore backup
            </button>
            <button class="import-tab gemini" data-source="gemini">
                <span class="import-tab-icon">
                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2C8 2 9.5 6 14 8C9.5 10 8 14 8 14C8 14 6.5 10 2 8C6.5 6 8 2 8 2Z" fill="currentColor"/></svg>
                </span>
                Gemini
            </button>
            <button class="import-tab lechat" data-source="lechat">
                <span class="import-tab-icon">
                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H9l-3 3v-3H3.5A1.5 1.5 0 0 1 2 9.5v-6Z" fill="currentColor"/></svg>
                </span>
                Le Chat
            </button>
        </div>

        <!-- Per-source instructions -->
        <div class="import-tab-content active" data-source="claude">
            <div class="import-instructions">
                In Claude: go to <strong>Settings → Privacy → Export data</strong>. You'll receive a ZIP by email — drop it below.
            </div>
        </div>
        <div class="import-tab-content" data-source="chatgpt">
            <div class="import-instructions">
                In ChatGPT: go to <strong>Settings → Data controls → Export data</strong>. You'll receive a ZIP by email — drop it below.
            </div>
        </div>
        <div class="import-tab-content" data-source="lore">
            <div class="import-instructions">
                Drop a <strong>Lore backup</strong> exported from this app (plaintext or encrypted). Your data stays local — the file never leaves your device.
            </div>
        </div>
        <div class="import-tab-content" data-source="gemini">
            <div class="import-instructions">
                In Google: go to <strong>myaccount.google.com → Data &amp; Privacy → Download your data</strong>, select <strong>My Activity</strong>, click <strong>All activity data included</strong>, uncheck everything except <strong>Gemini Apps</strong>, then export. Drop the ZIP or extract and drop just the <strong>My Activity.html</strong> file directly.
            </div>
        </div>
        <div class="import-tab-content" data-source="lechat">
            <div class="import-instructions">
                In Le Chat: go to <strong>admin.mistral.ai/account/export</strong> and click <strong>Export</strong>. You'll receive a ZIP — drop it below.
            </div>
        </div>

        <div class="progress-bar" id="progress-bar">
            <div class="progress-fill" id="progress-fill"></div>
        </div>
        <div class="progress-text" id="progress-text"></div>

        <div class="modal-drop" id="modal-drop">
            <div class="modal-drop-label">Drop ZIP here</div>
            <div class="modal-drop-sub">or click to browse</div>
        </div>

        <!-- Password prompt (shown only for encrypted Lore exports) -->
        <div id="import-password-wrap" style="display:none;">
            <div class="export-password-label">Export password</div>
            <input type="password" id="import-password" class="export-password-input" placeholder="Enter the password used during export…" autocomplete="current-password">
            <div class="export-password-hint">This file is a Lore encrypted export. Enter the password you chose when exporting.</div>
            <div class="modal-actions">
                <button class="btn" id="btn-import-password-cancel">Cancel</button>
                <button class="btn primary" id="btn-import-password-confirm">Decrypt &amp; Import</button>
            </div>
        </div>

        <div class="modal-actions">
            <button class="btn" id="btn-modal-close">Cancel</button>
        </div>

        <input type="file" id="file-input" accept=".zip">
    </div>
</div>

<!-- Clear cache confirm modal -->
<div class="modal-overlay" id="clear-cache-modal">
    <div class="modal">
        <div class="modal-title">Clear local cache</div>
        <div class="import-instructions">
            This will delete the local IndexedDB cache. Your encrypted data on the server is safe.
            The cache will be rebuilt on next load.
        </div>
        <div class="modal-actions">
            <button class="btn" id="btn-clear-cache-cancel">Cancel</button>
            <button class="btn primary" id="btn-clear-cache-confirm">Clear cache</button>
        </div>
    </div>
</div>

<!-- Stats modal (mobile) -->
<div class="modal-overlay" id="stats-modal">
    <div class="modal">
        <div class="modal-title">Archive stats</div>

        <div class="dash-cards" id="modal-dash-cards" style="margin-bottom:24px;">
            <div class="dash-card">
                <div class="dash-card-value" id="modal-dash-conv-count">—</div>
                <div class="dash-card-label">Conversations</div>
            </div>
            <div class="dash-card">
                <div class="dash-card-value" id="modal-dash-msg-count">—</div>
                <div class="dash-card-label">Messages</div>
            </div>
            <div class="dash-card">
                <div class="dash-card-value" id="modal-dash-days-count">—</div>
                <div class="dash-card-label">Active days</div>
            </div>
            <div class="dash-card">
                <div class="dash-card-value" id="modal-dash-avg-msg">—</div>
                <div class="dash-card-label">Avg msgs/conv</div>
            </div>
        </div>

        <div class="dash-section" style="margin-bottom:24px;">
            <div class="dash-section-label">Sources</div>
            <div class="dash-sources" id="modal-dash-sources" style="margin-top:12px;"></div>
        </div>

        <div class="dash-section" style="margin-bottom:24px;">
            <div class="dash-section-label">Activity — last 12 months</div>
            <div class="dash-heatmap-wrap" style="margin-top:12px;">
                <div class="dash-heatmap" id="modal-dash-heatmap"></div>
                <div class="dash-heatmap-legend" style="margin-top:8px;">
                    <span class="dash-legend-label">Less</span>
                    <span class="dash-legend-cell" data-level="0"></span>
                    <span class="dash-legend-cell" data-level="1"></span>
                    <span class="dash-legend-cell" data-level="2"></span>
                    <span class="dash-legend-cell" data-level="3"></span>
                    <span class="dash-legend-cell" data-level="4"></span>
                    <span class="dash-legend-label">More</span>
                </div>
            </div>
        </div>

        <div class="modal-actions">
            <button class="btn" id="btn-stats-modal-close">Close</button>
        </div>
    </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<!-- Scripts -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<div id="app-config" data-base="<?= APP_BASE ?>" style="display:none"></div>
<script src="<?= APP_BASE ?>/js/crypto.js"></script>
<script src="<?= APP_BASE ?>/js/db.js"></script>
<script src="<?= APP_BASE ?>/js/search.js"></script>
<script src="<?= APP_BASE ?>/js/import.js"></script>
<script src="<?= APP_BASE ?>/js/app.js"></script>
<script src="<?= APP_BASE ?>/js/export.js"></script>
<script>
// ── Encrypted Lore import — password prompt ───────────────
let _pendingEncryptedFile = null;

document.getElementById('btn-import-password-cancel').addEventListener('click', () => {
    document.getElementById('import-password-wrap').style.display = 'none';
    document.getElementById('modal-drop').style.display = 'block';
    document.getElementById('import-password').value = '';
    _pendingEncryptedFile = null;
});

document.getElementById('btn-import-password-confirm').addEventListener('click', async () => {
    const pw = document.getElementById('import-password').value;
    if (!pw) { showToast('Please enter the export password'); return; }
    if (!_pendingEncryptedFile) return;

    document.getElementById('import-password-wrap').style.display = 'none';
    document.getElementById('progress-bar').classList.add('show');
    document.getElementById('progress-text').classList.add('show');

    try {
        const result = await Importer.processZip(_pendingEncryptedFile, (pct, done, total, skipped) => {
            document.getElementById('progress-fill').style.width = (pct * 100) + '%';
            document.getElementById('progress-text').textContent =
                `Processing ${done} / ${total}… (${skipped} duplicates skipped)`;
        }, pw);

        _pendingEncryptedFile = null;
        closeImportModal();
        showToast(`Imported ${result.uploaded} conversations`);

        App.conversations = (await DB.getAllConversations())
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        renderList();
        renderDashboard();
        App.indexed = false;
        setTimeout(async () => { await Search.buildIndex(App.conversations); App.indexed = true; }, 0);

    } catch (e) {
        showToast('Import failed: ' + e.message);
        console.error(e);
        resetImportModal();
        _pendingEncryptedFile = null;
    }
});

// ── Mobile nav ────────────────────────────────────────────
const isMobile = () => window.innerWidth <= 768;

function showConvMobile() {
    if (!isMobile()) return;
    document.querySelector('.sidebar').classList.add('mobile-hidden');
    document.querySelector('.main').classList.add('mobile-visible');
}

function showListMobile() {
    if (!isMobile()) return;
    document.querySelector('.sidebar').classList.remove('mobile-hidden');
    document.querySelector('.main').classList.remove('mobile-visible');
}

document.getElementById('btn-back').addEventListener('click', showDashboard);

// Show/hide desktop-only items in Settings based on viewport
function updateSettingsMobileSection() {
    const section = document.getElementById('settings-mobile-section');
    section.style.display = isMobile() ? 'block' : 'none';
}

window.addEventListener('resize', updateSettingsMobileSection);
updateSettingsMobileSection();

// Settings → Import
document.getElementById('btn-settings-import').addEventListener('click', () => {
    closeSettings();
    openImportModal();
});

// Settings → Theme
document.getElementById('btn-settings-theme').addEventListener('click', () => {
    document.getElementById('btn-theme').click();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.getElementById('settings-theme-label').textContent =
        isDark ? 'Switch to Light mode' : 'Switch to Dark mode';
});

// Settings → Sign out
document.getElementById('btn-settings-signout').addEventListener('click', () => {
    window.location.href = '<?= APP_BASE ?>/logout';
});

// ── Settings panel ────────────────────────────────────────
const settingsPanel   = document.getElementById('settings-panel');
const settingsOverlay = document.getElementById('settings-overlay');

function openSettings() {
    settingsPanel.classList.add('open');
    settingsOverlay.classList.add('show');
}

function closeSettings() {
    settingsPanel.classList.remove('open');
    settingsOverlay.classList.remove('show');
}

document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('btn-settings-close').addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);

// ── Export modal ──────────────────────────────────────────
let exportMode = null; // 'plain' | 'enc'

const exportModal        = document.getElementById('export-modal');
const exportPasswordWrap = document.getElementById('export-password-wrap');
const exportPasswordEl   = document.getElementById('export-password');
const btnExportGo        = document.getElementById('btn-export-go');
const exportProgressBar  = document.getElementById('export-progress-bar');
const exportProgressFill = document.getElementById('export-progress-fill');
const exportProgressText = document.getElementById('export-progress-text');

function openExportModal() {
    exportMode = null;
    exportPasswordWrap.style.display = 'none';
    exportPasswordEl.value = '';
    btnExportGo.style.display = 'none';
    exportProgressBar.classList.remove('show');
    exportProgressText.classList.remove('show');
    exportProgressText.textContent = '';
    exportProgressFill.style.width = '0%';
    document.querySelectorAll('.export-option').forEach(o => o.classList.remove('active'));
    exportModal.classList.add('show');
}

function closeExportModal() {
    exportModal.classList.remove('show');
}

document.getElementById('btn-export').addEventListener('click', () => {
    closeSettings();
    openExportModal();
});

document.getElementById('btn-export-cancel').addEventListener('click', closeExportModal);

document.getElementById('export-opt-plain').addEventListener('click', () => {
    exportMode = 'plain';
    exportPasswordWrap.style.display = 'none';
    btnExportGo.style.display = 'inline-block';
    document.querySelectorAll('.export-option').forEach(o => o.classList.remove('active'));
    document.getElementById('export-opt-plain').classList.add('active');
});

document.getElementById('export-opt-enc').addEventListener('click', () => {
    exportMode = 'enc';
    exportPasswordWrap.style.display = 'block';
    btnExportGo.style.display = 'inline-block';
    document.querySelectorAll('.export-option').forEach(o => o.classList.remove('active'));
    document.getElementById('export-opt-enc').classList.add('active');
    exportPasswordEl.focus();
});

btnExportGo.addEventListener('click', async () => {
    if (!exportMode) return;

    if (exportMode === 'enc') {
        const pw = exportPasswordEl.value.trim();
        if (!pw || pw.length < 6) {
            showToast('Password must be at least 6 characters');
            exportPasswordEl.focus();
            return;
        }
    }

    btnExportGo.disabled = true;
    document.getElementById('btn-export-cancel').disabled = true;
    exportProgressBar.classList.add('show');
    exportProgressText.classList.add('show');

    const onProgress = (done, total) => {
        exportProgressFill.style.width = (done / total * 100) + '%';
        exportProgressText.textContent = `Decrypting ${done} / ${total}…`;
    };

    try {
        let count;
        if (exportMode === 'plain') {
            count = await Exporter.exportPlaintext(onProgress);
        } else {
            count = await Exporter.exportEncrypted(exportPasswordEl.value, onProgress);
        }
        closeExportModal();
        showToast(`Exported ${count} conversations`);
    } catch (e) {
        showToast('Export failed: ' + e.message);
        console.error(e);
    } finally {
        btnExportGo.disabled = false;
        document.getElementById('btn-export-cancel').disabled = false;
    }
});

// ── Export stats report ───────────────────────────────────
document.getElementById('btn-export-report').addEventListener('click', () => {
    closeSettings();
    exportStatsReport();
});

// Clear cache (inside settings panel)
document.getElementById('btn-clear-cache').addEventListener('click', () => {
    document.getElementById('clear-cache-modal').classList.add('show');
    closeSettings();
});
document.getElementById('btn-clear-cache-cancel').addEventListener('click', () => {
    document.getElementById('clear-cache-modal').classList.remove('show');
});
document.getElementById('btn-clear-cache-confirm').addEventListener('click', async () => {
    await DB.clear();
    location.reload();
});
</script>

</body>
</html>
