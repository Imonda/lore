/**
 * theme.js — Dark / light mode toggle
 * Persists preference in localStorage.
 */

(function () {
    const STORAGE_KEY = 'lore_theme';
    const root        = document.documentElement;

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        const btn = document.getElementById('btn-theme');
        if (btn) btn.textContent = theme === 'dark' ? '◐ Light' : '◑ Dark';
    }

    // Apply saved theme immediately (before paint to avoid flash)
    const saved = localStorage.getItem(STORAGE_KEY) || 'dark';
    applyTheme(saved);

    // Wire up toggle button when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('btn-theme');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const current = root.getAttribute('data-theme');
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });
    });
})();
