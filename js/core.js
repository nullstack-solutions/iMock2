'use strict';

(function(global) {
    const window = global;

    // --- GLOBAL CONSTANTS ---
    window.SELECTORS = {
        PAGES: {
            MAPPINGS: 'mappings-page',
            REQUESTS: 'requests-page',
            SCENARIOS: 'scenarios-page',
            'IMPORT-EXPORT': 'import-export-page',
            RECORDING: 'recording-page',
            SETTINGS: 'settings-page'
        },
        REQUEST_FILTERS: {
            METHOD: 'req-filter-method',
            STATUS: 'req-filter-status',
            URL: 'req-filter-url',
            DATE_FROM: 'req-filter-from',
            DATE_TO: 'req-filter-to',
            QUICK: 'req-filter-quick'
        },
        MAPPING_FILTERS: { QUERY: 'filter-query' },
        LISTS: { MAPPINGS: 'mappings-list', REQUESTS: 'requests-list', SCENARIOS: 'scenarios-list' },
        EMPTY: { MAPPINGS: 'mappings-empty', REQUESTS: 'requests-empty' },
        UI: {
            STATS: 'stats',
            SEARCH_FILTERS: 'search-filters',
            UPTIME: 'uptime',
            DATA_SOURCE_INDICATOR: 'data-source-indicator',
            REQUESTS_SOURCE_INDICATOR: 'requests-source-indicator'
        },
        LOADING: { MAPPINGS: 'mappings-loading', REQUESTS: 'requests-loading' },
        COUNTERS: { MAPPINGS: 'mappings-count', REQUESTS: 'requests-count' },
        CONNECTION: {
            SETUP: 'connection-setup',
            HOST: 'wiremock-host',
            PORT: 'wiremock-port',
            CONNECT_BTN: 'connect-btn',
            STATUS_DOT: 'status-dot',
            STATUS_TEXT: 'status-text',
            UPTIME: 'uptime'
        },
        MODAL: { FORM: 'mapping-form', ID: 'mapping-id', TITLE: 'modal-title' },
        BUTTONS: { ADD_MAPPING: 'add-mapping-btn', START_RECORDING: 'start-recording-btn' },
        HEALTH: { INDICATOR: 'health-indicator' }
    };

    window.ENDPOINTS = {
        HEALTH: '/health',
        MAPPINGS: '/mappings',
        MAPPINGS_RESET: '/mappings/reset',
        MAPPINGS_SAVE: '/mappings/save',
        MAPPINGS_IMPORT: '/mappings/import',
        MAPPINGS_FIND_BY_METADATA: '/mappings/find-by-metadata',
        MAPPINGS_REMOVE_BY_METADATA: '/mappings/remove-by-metadata',
        MAPPINGS_UNMATCHED: '/mappings/unmatched',
        REQUESTS: '/requests',
        REQUESTS_COUNT: '/requests/count',
        REQUESTS_REMOVE: '/requests/remove',
        REQUESTS_FIND: '/requests/find',
        REQUESTS_UNMATCHED: '/requests/unmatched',
        REQUESTS_UNMATCHED_NEAR_MISSES: '/requests/unmatched/near-misses',
        RECORDINGS_START: '/recordings/start',
        RECORDINGS_STOP: '/recordings/stop',
        RECORDINGS_STATUS: '/recordings/status',
        RECORDINGS_SNAPSHOT: '/recordings/snapshot',
        SCENARIOS: '/scenarios',
        SCENARIOS_RESET: '/scenarios/reset'
    };

    // --- UTILS ---
    window.Utils = {
        escapeHtml(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = String(str);
            return div.innerHTML;
        },
        
        getStatusClass(status) {
            const s = Number(status);
            if (s >= 200 && s < 300) return 'status-success';
            if (s >= 400 && s < 500) return 'status-warning';
            if (s >= 500) return 'status-danger';
            return 'status-info';
        },

        formatJson(val, fallback = 'Invalid JSON', maxLength = 0) {
            try {
                const str = JSON.stringify(val, null, 2);
                return (maxLength > 0 && str.length > maxLength) ? str.slice(0, maxLength) + '...' : str;
            } catch (e) { return fallback; }
        },

        parseRequestTime(loggedDate) {
            if (!loggedDate) return 'N/A';
            try { return new Date(loggedDate).toLocaleTimeString(); }
            catch (e) { return 'N/A'; }
        },

        formatDateTime(date) {
            const pad = (n) => String(n).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        },

        toggleElement(el, show) {
            if (el) el.classList.toggle('hidden', !show);
        },

        showElement(el) { this.toggleElement(el, true); },
        hideElement(el) { this.toggleElement(el, false); },

        safeCall(fn, ...args) {
            try { return typeof fn === 'function' ? fn(...args) : null; }
            catch (e) { console.warn('Safe call failed', e); return null; }
        }
    };

    // --- LIFECYCLE MANAGER ---
    (function initLifecycle() {
        const intervals = new Set();
        const rafs = new Set();
        const listeners = [];

        window.LifecycleManager = {
            setInterval(fn, delay) {
                const id = window.setInterval(fn, delay);
                intervals.add(id);
                return id;
            },
            clearInterval(id) {
                window.clearInterval(id);
                intervals.delete(id);
            },
            requestAnimationFrame(fn) {
                const id = window.requestAnimationFrame(fn);
                rafs.add(id);
                return id;
            },
            cancelAnimationFrame(id) {
                window.cancelAnimationFrame(id);
                rafs.delete(id);
            },
            addEventListener(target, type, handler, options) {
                if (!target) return;
                target.addEventListener(type, handler, options);
                listeners.push({ target, type, handler, options });
            },
            clearAll() {
                intervals.forEach(id => window.clearInterval(id));
                rafs.forEach(id => window.cancelAnimationFrame(id));
                listeners.forEach(({ target, type, handler, options }) => {
                    target.removeEventListener(type, handler, options);
                });
                intervals.clear(); rafs.clear(); listeners.length = 0;
            }
        };
        window.addEventListener('beforeunload', () => window.LifecycleManager.clearAll());
    })();

    // --- DEBOUNCE ---
    window.debounce = function(fn, wait = 150) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), wait);
        };
    };

    // --- RENDER LIST ---
    window.renderList = function(container, items, options = {}) {
        if (!container || !Array.isArray(items)) return;
        const { renderItem, getKey, getSignature } = options;
        if (typeof renderItem !== 'function') return;

        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const key = getKey ? getKey(item) : (item.id || item.uuid);
            const signature = getSignature ? getSignature(item) : String(key);
            
            const markup = renderItem(item);
            const temp = document.createElement('template');
            temp.innerHTML = markup.trim();
            const node = temp.content.firstElementChild;
            
            if (node) {
                node.dataset.id = key;
                node.dataset.signature = signature;
                fragment.appendChild(node);
            }
        });

        window.requestAnimationFrame(() => {
            container.innerHTML = '';
            container.appendChild(fragment);
        });
    };

    // --- ICONS ---
    window.Icons = {
        render(name, opts = {}) {
            const cls = `icon icon-${name} ${opts.className || ''}`.trim();
            return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
        }
    };

    // --- SETTINGS HELPERS ---
    window.readWiremockSettings = () => {
        try {
            const saved = localStorage.getItem('wiremock-settings');
            return saved ? JSON.parse(saved) : {};
        } catch (e) { return {}; }
    };

    window.normalizeWiremockBaseUrl = (host, port) => {
        let h = (host || 'localhost').trim();
        let p = (port || '').trim();
        if (!h.includes('://')) h = 'http://' + h;
        try {
            const url = new URL(h);
            const finalPort = p || url.port || (url.protocol === 'https:' ? '443' : '8080');
            return `${url.protocol}//${url.hostname}:${finalPort}/__admin`;
        } catch (e) { return `http://localhost:8080/__admin`; }
    };

    // --- API CLIENT ---
    window.apiFetch = async (endpoint, options = {}) => {
        const settings = window.readWiremockSettings();
        const timeout = Number(settings.requestTimeout) || 60000;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        const url = `${window.wiremockBaseUrl}${endpoint}`;
        const headers = { 'Content-Type': 'application/json', ...(settings.customHeaders || {}), ...options.headers };

        try {
            const res = await fetch(url, { ...options, headers, signal: controller.signal });
            clearTimeout(id);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
            
            const isJson = res.headers.get('content-type')?.includes('application/json');
            return isJson ? await res.json() : await res.text();
        } catch (err) {
            clearTimeout(id);
            if (err.name === 'AbortError') throw new Error(`Timeout after ${timeout}ms`);
            throw err;
        }
    };

    // --- UI HELPERS ---
    window.showPage = (pageId, btn) => {
        document.querySelectorAll('.main-content > div[id$="-page"]').forEach(p => p.classList.add('hidden'));
        const target = document.getElementById(SELECTORS.PAGES[pageId.toUpperCase()]);
        if (target) target.classList.remove('hidden');

        document.querySelectorAll('.sidebar .nav-item').forEach(i => i.classList.remove('active'));
        if (btn) btn.classList.add('active');

        if (window.history?.replaceState) {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', pageId);
            window.history.replaceState({}, '', url);
        }
    };

    window.showModal = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('hidden');
        el.style.display = 'flex';
        const input = el.querySelector('input, select, textarea');
        if (input) setTimeout(() => input.focus(), 50);
    };

    window.hideModal = (modal) => {
        const el = typeof modal === 'string' ? document.getElementById(modal) : modal;
        if (!el) return;
        el.classList.add('hidden');
        el.style.display = 'none';
        el.querySelector('form')?.reset();
    };

    window.initializeTheme = () => {
        const theme = localStorage.getItem('theme') || 'dark';
        document.body.setAttribute('data-theme', theme);
        const icon = document.getElementById('theme-icon');
        if (icon) icon.setAttribute('href', theme === 'dark' ? '#icon-sun' : '#icon-moon');
    };

    // Initializations
    window.initializeTheme();
    console.log('✅ Core.js loaded');

})(typeof window !== 'undefined' ? window : globalThis);