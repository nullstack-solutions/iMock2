'use strict';

(function(global) {
    const window = global;

    window.SELECTORS = {
        PAGES: {
            MAPPINGS: 'mappings-page', REQUESTS: 'requests-page', SCENARIOS: 'scenarios-page',
            'IMPORT-EXPORT': 'import-export-page', RECORDING: 'recording-page', SETTINGS: 'settings-page'
        },
        REQUEST_FILTERS: {
            METHOD: 'req-filter-method', STATUS: 'req-filter-status', URL: 'req-filter-url',
            DATE_FROM: 'req-filter-from', DATE_TO: 'req-filter-to', QUICK: 'req-filter-quick'
        },
        MAPPING_FILTERS: { QUERY: 'filter-query' },
        LISTS: { MAPPINGS: 'mappings-list', REQUESTS: 'requests-list', SCENARIOS: 'scenarios-list' },
        EMPTY: { MAPPINGS: 'mappings-empty', REQUESTS: 'requests-empty' },
        UI: { STATS: 'stats', SEARCH_FILTERS: 'search-filters', UPTIME: 'uptime' },
        LOADING: { MAPPINGS: 'mappings-loading', REQUESTS: 'requests-loading' },
        COUNTERS: { MAPPINGS: 'mappings-count', REQUESTS: 'requests-count' },
        CONNECTION: { SETUP: 'connection-setup', STATUS_DOT: 'status-dot', STATUS_TEXT: 'status-text' },
        HEALTH: { INDICATOR: 'health-indicator' }
    };

    window.ENDPOINTS = {
        HEALTH: '/health', MAPPINGS: '/mappings', REQUESTS: '/requests',
        SCENARIOS: '/scenarios', SCENARIOS_RESET: '/scenarios/reset',
        MAPPINGS_IMPORT: '/mappings/import'
    };

    window.Utils = {
        escapeHtml(str) {
            const el = document.createElement('div');
            el.textContent = String(str || '');
            return el.innerHTML;
        },
        getStatusClass(s) {
            if (s >= 200 && s < 300) return 'status-success';
            if (s >= 400 && s < 500) return 'status-warning';
            return s >= 500 ? 'status-danger' : 'status-info';
        },
        parseRequestTime(d) { return d ? new Date(d).toLocaleTimeString() : 'N/A'; },
        formatDateTime(d) {
            const date = new Date(d);
            const pad = (n) => String(n).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }
    };

    window.LifecycleManager = {
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (id) => window.clearInterval(id),
        requestAnimationFrame: (fn) => (window.requestAnimationFrame || (f => f()))(fn)
    };

    window.debounce = (fn, ms = 150) => {
        let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
    };

    window.renderList = function(container, items, options = {}) {
        if (!container || !Array.isArray(items)) return;
        const { renderItem } = options;
        if (typeof renderItem !== 'function') return;

        let html = '';
        items.forEach(item => {
            const markup = renderItem(item);
            if (markup) html += markup;
        });

        window.LifecycleManager.requestAnimationFrame(() => {
            container.innerHTML = html;
        });
    };

    window.Icons = {
        render: (name, opts = {}) => `<svg class="icon icon-${name} ${opts.className || ''}"><use href="#icon-${name}"></use></svg>`
    };

    window.apiFetch = async (url, opts = {}) => {
        const fullUrl = `${window.wiremockBaseUrl}${url}`;
        const res = await fetch(fullUrl, {
            ...opts,
            headers: { 'Content-Type': 'application/json', ...opts.headers }
        });
        
        if (res.ok) {
            window.lastWiremockSuccess = Date.now();
            if (window.updateLastSuccessUI) window.updateLastSuccessUI();
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.headers.get('content-type')?.includes('application/json') ? res.json() : res.text();
    };

    window.showPage = (id, btn) => {
        document.querySelectorAll('.main-content > div').forEach(p => p.classList.add('hidden'));
        const target = document.getElementById(SELECTORS.PAGES[id.toUpperCase()]);
        if (target) target.classList.remove('hidden');
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        if (btn) btn.classList.add('active');
    };

    window.showModal = (id) => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('hidden'); el.style.display = 'flex'; }
    };

    window.hideModal = (id) => {
        const el = typeof id === 'string' ? document.getElementById(id) : id;
        if (el) { el.classList.add('hidden'); el.style.display = 'none'; }
    };

    window.normalizeWiremockBaseUrl = (h, p) => `http://${h || 'localhost'}:${p || '8080'}/__admin`;

    console.log('✅ Core.js loaded');
})(typeof window !== 'undefined' ? window : globalThis);
