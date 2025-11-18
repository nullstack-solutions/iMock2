'use strict';

// ===== CORE.JS - Base infrastructure =====
// Constants, API client, and shared UI helpers

// --- GLOBAL CONSTANTS FOR SELECTORS AND ENDPOINTS ---
window.SELECTORS = {
    // Pages
    PAGES: {
        MAPPINGS: 'mappings-page',
        REQUESTS: 'requests-page',
        SCENARIOS: 'scenarios-page',
        'IMPORT-EXPORT': 'import-export-page',
        RECORDING: 'recording-page',
        SETTINGS: 'settings-page'
    },

    // Request log filters
    REQUEST_FILTERS: {
        METHOD: 'req-filter-method',
        STATUS: 'req-filter-status',
        URL: 'req-filter-url',
        DATE_FROM: 'req-filter-from',
        DATE_TO: 'req-filter-to',
        QUICK: 'req-filter-quick'
    },

    // Mapping filters
    MAPPING_FILTERS: {
        QUERY: 'filter-query'
    },

    // Data lists
    LISTS: {
        MAPPINGS: 'mappings-list',
        REQUESTS: 'requests-list',
        SCENARIOS: 'scenarios-list'
    },

    // Empty states
    EMPTY: {
        MAPPINGS: 'mappings-empty',
        REQUESTS: 'requests-empty'
    },

    // UI elements
    UI: {
        STATS: 'stats',
        SEARCH_FILTERS: 'search-filters',
        UPTIME: 'uptime',
        DATA_SOURCE_INDICATOR: 'data-source-indicator',
        REQUESTS_SOURCE_INDICATOR: 'requests-source-indicator'
    },

    // Loading states
    LOADING: {
        MAPPINGS: 'mappings-loading',
        REQUESTS: 'requests-loading'
    },

    // Counters
    COUNTERS: {
        MAPPINGS: 'mappings-count',
        REQUESTS: 'requests-count'
    },

    // Connection
    CONNECTION: {
        SETUP: 'connection-setup',
        HOST: 'wiremock-host',
        PORT: 'wiremock-port',
        CONNECT_BTN: 'connect-btn',
        STATUS_DOT: 'status-dot',
        STATUS_TEXT: 'status-text',
        UPTIME: 'uptime'
    },

    // Modal
    MODAL: {
        FORM: 'mapping-form',
        ID: 'mapping-id',
        TITLE: 'modal-title'
    },

    // Form fields (kept for test compatibility)
    FORM_FIELDS: {
        METHOD: 'mapping-method',
        URL: 'mapping-url',
        STATUS: 'mapping-status',
        HEADERS: 'mapping-headers',
        BODY: 'mapping-body',
        PRIORITY: 'mapping-priority',
        NAME: 'mapping-name'
    },

    // Buttons
    BUTTONS: {
        ADD_MAPPING: 'add-mapping-btn',
        START_RECORDING: 'start-recording-btn'
    },

    // Recording
    RECORDING: {
        URL: 'recording-url',
        CAPTURE_HEADERS: 'capture-headers',
        CAPTURE_BODY: 'capture-body',
        URL_FILTER: 'url-filter',
        INDICATOR: 'recording-indicator',
        TARGET: 'recording-target',
        COUNT: 'recording-count',
        STOP_BTN: 'stop-recording-btn'
    },

    // Settings
    SETTINGS: {
        HOST: 'settings-host',
        PORT: 'settings-port',
        TIMEOUT: 'settings-timeout',
        AUTO_REFRESH: 'auto-refresh',
        THEME: 'theme-select',
        CUSTOM_HEADERS: 'custom-headers',
        CACHE_ENABLED: 'cache-enabled'
    },

    // Import/Export
    IMPORT: {
        FILE: 'import-file',
        DISPLAY: 'file-display',
        ACTIONS: 'import-actions',
        RESULT: 'import-result',
        MODE: 'import-mode'
    },

    EXPORT: {
        FORMAT: 'export-format',
        RESULT: 'export-result'
    },

    // Statistics
    STATS: {
        TOTAL_MAPPINGS: 'total-mappings',
        TOTAL_REQUESTS: 'total-requests'
    },

    // Health
    HEALTH: {
        INDICATOR: 'health-indicator'
    },

};

// --- SCHEDULING & RENDER HELPERS ---
(function initialiseLifecycleManager() {
    const intervalIds = new Set();
    const rafIds = new Set();
    const eventListeners = new Map(); // Map<target, Set<{type, handler, options}>>

    const manager = {
        setInterval(handler, delay) {
            const id = window.setInterval(handler, delay);
            intervalIds.add(id);
            return id;
        },
        clearInterval(id) {
            if (id !== undefined && id !== null) {
                window.clearInterval(id);
                intervalIds.delete(id);
            }
        },
        requestAnimationFrame(handler) {
            const id = window.requestAnimationFrame(handler);
            rafIds.add(id);
            return id;
        },
        cancelAnimationFrame(id) {
            if (id !== undefined && id !== null) {
                window.cancelAnimationFrame(id);
                rafIds.delete(id);
            }
        },
        addEventListener(target, type, handler, options) {
            if (!target || !type || !handler) return;

            target.addEventListener(type, handler, options);

            if (!eventListeners.has(target)) {
                eventListeners.set(target, new Set());
            }
            eventListeners.get(target).add({ type, handler, options });
        },
        removeEventListener(target, type, handler, options) {
            if (!target || !type || !handler) return;

            target.removeEventListener(type, handler, options);

            const listeners = eventListeners.get(target);
            if (listeners) {
                for (const listener of listeners) {
                    if (listener.type === type && listener.handler === handler &&
                        JSON.stringify(listener.options) === JSON.stringify(options)) {
                        listeners.delete(listener);
                        break;
                    }
                }
                if (listeners.size === 0) {
                    eventListeners.delete(target);
                }
            }
        },
        clearAll() {
            intervalIds.forEach(identifier => window.clearInterval(identifier));
            intervalIds.clear();
            rafIds.forEach(identifier => window.cancelAnimationFrame(identifier));
            rafIds.clear();

            // Clean up all event listeners
            eventListeners.forEach((listeners, target) => {
                listeners.forEach(({ type, handler, options }) => {
                    target.removeEventListener(type, handler, options);
                });
            });
            eventListeners.clear();
        }
    };

    window.LifecycleManager = manager;
    window.addEventListener('beforeunload', () => manager.clearAll());
})();

window.debounce = function debounce(fn, wait = 150, options = {}) {
    let timeoutId;
    let lastArgs;
    let lastThis;
    let result;
    const { leading = false, trailing = true } = options;

    const invoke = () => {
        timeoutId = undefined;
        if (trailing && lastArgs) {
            result = fn.apply(lastThis, lastArgs);
            lastArgs = lastThis = undefined;
        }
    };

    return Object.assign(function debounced(...args) {
        lastArgs = args;
        lastThis = this;

        if (timeoutId === undefined) {
            if (leading) {
                result = fn.apply(lastThis, lastArgs);
                lastArgs = lastThis = undefined;
            }
            timeoutId = window.setTimeout(invoke, wait);
        } else {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(invoke, wait);
        }

        return result;
    }, {
        cancel() {
            if (timeoutId !== undefined) {
                window.clearTimeout(timeoutId);
            }
            timeoutId = undefined;
            lastArgs = lastThis = undefined;
        },
        flush() {
            if (timeoutId !== undefined) {
                window.clearTimeout(timeoutId);
                invoke();
            }
            return result;
        }
    });
};

(function initialiseRenderList() {
    const pendingFrames = new WeakMap();

    function toElement(markup) {
        if (typeof markup !== 'string' || !markup.trim()) {
            return null;
        }
        const template = document.createElement('template');
        template.innerHTML = markup.trim();
        return template.content.firstElementChild;
    }

    window.renderList = function renderList(container, items, options = {}) {
        if (!(container instanceof Element) || !Array.isArray(items)) {
            return;
        }
        const { renderItem, getKey, getSignature, onItemChanged, onItemRemoved } = options;
        if (typeof renderItem !== 'function') {
            return;
        }

        const existingNodes = new Map();
        Array.from(container.children).forEach(node => {
            if (node instanceof HTMLElement && node.dataset && node.dataset.id) {
                existingNodes.set(node.dataset.id, node);
            }
        });

        const fragment = document.createDocumentFragment();

        items.forEach(item => {
            const key = typeof getKey === 'function' ? getKey(item) : (item && (item.id || item.uuid));
            if (!key) {
                return;
            }
            const keyString = String(key);
            const signature = typeof getSignature === 'function' ? getSignature(item) : keyString;
            const existing = existingNodes.get(keyString);

            if (existing && existing.dataset.renderSignature === signature) {
                existing.dataset.renderSignature = signature;
                fragment.appendChild(existing);
                existingNodes.delete(keyString);
                return;
            }

            const previousSignature = existing ? existing.dataset.renderSignature || null : null;
            if (existing && typeof onItemChanged === 'function' && previousSignature !== signature) {
                try {
                    onItemChanged(keyString, item, signature);
                } catch (callbackError) {
                    console.warn('renderList onItemChanged failed:', callbackError);
                }
            }

            const markup = renderItem(item);
            const node = toElement(markup);
            if (!node) {
                existingNodes.delete(keyString);
                return;
            }
            node.dataset.id = keyString;
            node.dataset.renderSignature = signature;
            fragment.appendChild(node);
            existingNodes.delete(keyString);
        });

        existingNodes.forEach((node, key) => {
            node.remove();
            if (typeof onItemRemoved === 'function') {
                try {
                    onItemRemoved(String(key), node);
                } catch (callbackError) {
                    console.warn('renderList onItemRemoved failed:', callbackError);
                }
            }
        });

        const scheduleRender = () => {
            container.replaceChildren(fragment);
        };

        if (window.LifecycleManager && typeof window.LifecycleManager.requestAnimationFrame === 'function') {
            const pending = pendingFrames.get(container);
            if (pending) {
                window.LifecycleManager.cancelAnimationFrame(pending);
            }
            const handle = window.LifecycleManager.requestAnimationFrame(() => {
                scheduleRender();
                pendingFrames.delete(container);
            });
            if (handle !== null) {
                pendingFrames.set(container, handle);
            }
        } else if (typeof window.requestAnimationFrame === 'function') {
            const handle = window.requestAnimationFrame(scheduleRender);
            pendingFrames.set(container, handle);
        } else {
            scheduleRender();
        }
    };
})();

window.Icons = {
    render(name, options = {}) {
        if (!name) {
            return '';
        }
        const classes = ['icon', `icon-${name}`];
        if (options.className) {
            classes.push(options.className);
        }
        const classAttr = classes.join(' ');
        return `<svg class="${classAttr}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
    }
};

window.ENDPOINTS = {
    // Core endpoints
    HEALTH: '/health',
    MAPPINGS: '/mappings',
    MAPPINGS_RESET: '/mappings/reset',
    MAPPINGS_SAVE: '/mappings/save',
    MAPPINGS_IMPORT: '/mappings/import',
    MAPPINGS_FIND_BY_METADATA: '/mappings/find-by-metadata',
    MAPPINGS_REMOVE_BY_METADATA: '/mappings/remove-by-metadata',
    MAPPINGS_UNMATCHED: '/mappings/unmatched', // Added in 3.13.x

    // Request endpoints
    REQUESTS: '/requests', // DELETE to clear request journal
    REQUESTS_COUNT: '/requests/count', // Requires POST
    REQUESTS_REMOVE: '/requests/remove',
    REQUESTS_FIND: '/requests/find', // Requires POST
    REQUESTS_UNMATCHED: '/requests/unmatched',
    REQUESTS_UNMATCHED_NEAR_MISSES: '/requests/unmatched/near-misses',

    // Recording endpoints (corrected)
    RECORDINGS_START: '/recordings/start', // Requires POST
    RECORDINGS_STOP: '/recordings/stop', // Requires POST
    RECORDINGS_STATUS: '/recordings/status', // Uses GET
    RECORDINGS_SNAPSHOT: '/recordings/snapshot', // Requires POST

    // Scenario endpoints
    SCENARIOS: '/scenarios',
    SCENARIOS_RESET: '/scenarios/reset'
};

const ensureCustomHeaderObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.keys(value).reduce((acc, key) => {
        const normalizedKey = String(key).trim();
        if (!normalizedKey) {
            return acc;
        }
        acc[normalizedKey] = value[key];
        return acc;
    }, {});
};

const migrateLegacySettings = (rawSettings) => {
    if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
        return {};
    }

    const normalized = { ...rawSettings };
    const customHeaders = ensureCustomHeaderObject(normalized.customHeaders);

    if (typeof normalized.authHeader === 'string' && normalized.authHeader.trim()) {
        const authValue = normalized.authHeader.trim();
        if (!Object.prototype.hasOwnProperty.call(customHeaders, 'Authorization')) {
            customHeaders.Authorization = authValue;
        }
        delete normalized.authHeader;
        if (!normalized.customHeadersRaw || typeof normalized.customHeadersRaw !== 'string' || !normalized.customHeadersRaw.trim()) {
            try {
                normalized.customHeadersRaw = JSON.stringify(customHeaders, null, 2);
            } catch (error) {
                console.warn('Failed to serialize migrated custom headers:', error);
                normalized.customHeadersRaw = '';
            }
        }
    }

    normalized.customHeaders = customHeaders;

    if (typeof normalized.customHeadersRaw !== 'string') {
        normalized.customHeadersRaw = '';
    }

    normalized.autoConnect = normalized.autoConnect !== false;
    return normalized;
};

window.normalizeWiremockSettings = (settings) => migrateLegacySettings(settings);

window.readWiremockSettings = () => {
    try {
        const raw = localStorage.getItem('wiremock-settings');
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        return migrateLegacySettings(parsed);
    } catch (error) {
        console.warn('Failed to read stored settings, returning empty object:', error);
        return {};
    }
};

// Helper to build the documented scenario state endpoint
window.buildScenarioStateEndpoint = (scenarioName) => {
    const rawName = typeof scenarioName === 'string' ? scenarioName : '';
    if (!rawName.trim()) {
        return '';
    }

    return `${ENDPOINTS.SCENARIOS}/${encodeURIComponent(rawName)}/state`;
};

// --- GLOBAL STATE ---
let wiremockBaseUrl = '';
// Use centralized default if available, fallback to hardcoded value
let requestTimeout = window.DEFAULT_SETTINGS?.requestTimeout ? parseInt(window.DEFAULT_SETTINGS.requestTimeout) : 69000;
window.customHeaders = ensureCustomHeaderObject(window.DEFAULT_SETTINGS?.customHeaders || {});
window.startTime = null; // Make globally accessible for uptime tracking
window.uptimeInterval = null; // Make globally accessible for uptime tracking
let autoRefreshInterval = null;

// Global feature-level state
window.allMappings = [];
window.allRequests = [];
window.allScenarios = [];
window.isRecording = false;
window.recordedCount = 0;

window.normalizeWiremockBaseUrl = (hostInput, portInput) => {
    let rawHost = (hostInput || '').trim() || 'localhost';
    let port = (portInput || '').trim();
    let scheme = 'http', hostname = '';
    try {
        const url = new URL(rawHost.includes('://') ? rawHost : `http://${rawHost}`);
        scheme = url.protocol.replace(':', '') || 'http';
        hostname = url.hostname;
        port ||= url.port;
    } catch (e) {
        const m = rawHost.match(/^([^:/]+)(?::(\d+))?$/);
        hostname = m ? m[1] : rawHost;
        port ||= m?.[2];
    }
    return `${scheme}://${hostname || 'localhost'}:${port || (scheme === 'https' ? '443' : '8080')}/__admin`;
};

// --- API CLIENT WITH TIMEOUT SUPPORT ---
window.apiFetch = async (endpoint, options = {}) => {
    const controller = new AbortController();
    const timeoutSettings = Utils.safeCall(window.readWiremockSettings) || {};
    const currentTimeout = timeoutSettings.requestTimeout ? parseInt(timeoutSettings.requestTimeout) : (window.DEFAULT_SETTINGS?.requestTimeout ? parseInt(window.DEFAULT_SETTINGS.requestTimeout) : 69000);
    const timeoutId = setTimeout(() => controller.abort(), currentTimeout);
    const fullUrl = `${window.wiremockBaseUrl}${endpoint}`;
    const method = options.method || 'GET';
    const headers = { 'Content-Type': 'application/json', ...ensureCustomHeaderObject(timeoutSettings.customHeaders || window.customHeaders), ...options.headers };

    // Reduce logging verbosity for periodic endpoints to prevent memory leaks
    const isPeriodicEndpoint = endpoint === window.ENDPOINTS?.HEALTH || endpoint === window.ENDPOINTS?.MAPPINGS;
    const verboseLogging = !isPeriodicEndpoint;

    // Minimal logging for periodic health checks to reduce memory usage
    if (verboseLogging) {
        console.log(`🔗 [API] ${method} ${endpoint}`);
    }

    try {
        const response = await fetch(fullUrl, { ...options, signal: controller.signal, headers });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const errorText = await response.text();
            if (verboseLogging) {
                console.error(`❌ [API] ${method} ${endpoint} - HTTP ${response.status}: ${errorText || response.statusText}`);
            }
            throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
        const responseData = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();

        // Only log success for non-periodic endpoints
        if (verboseLogging) {
            console.log(`✅ [API] ${method} ${endpoint} - OK`);
        }

        try {
            if (endpoint === window.ENDPOINTS?.HEALTH || endpoint === window.ENDPOINTS?.MAPPINGS) {
                window.lastWiremockSuccess = Date.now();
                Utils.safeCall(window.updateLastSuccessUI);
            }
        } catch (_) {}
        return responseData;
    } catch (error) {
        clearTimeout(timeoutId);
        // Minimal error logging to reduce memory usage
        if (verboseLogging) {
            console.error(`💥 [API] ${method} ${endpoint} - ${error.name}: ${error.message}`);
        }
        if (error.name === 'AbortError') throw new Error(`Request timeout after ${currentTimeout}ms`);
        throw error;
    }
};

// --- CORE UI HELPERS ---

window.showPage = (pageId, element) => {
    console.log(`🔄 [showPage] Switching to tab: ${pageId}`);

    document.querySelectorAll('.main-content > div[id$="-page"]').forEach(p => p.classList.add('hidden'));
    const targetPage = document.getElementById(SELECTORS.PAGES[pageId.toUpperCase()]);
    if (!targetPage) { console.warn(`Page not found: ${pageId}`); return; }
    targetPage.classList.remove('hidden');
    document.querySelectorAll('.sidebar .nav-item').forEach(i => i.classList.remove('active'));
    if (element) element.classList.add('active');

    // Update URL with active tab
    if (window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        const oldTab = url.searchParams.get('tab');
        url.searchParams.set('tab', pageId);
        const newUrl = url.toString();
        console.log(`🔗 [showPage] Updating URL: ${oldTab} → ${pageId}`);
        console.log(`🔗 [showPage] New URL: ${newUrl}`);
        window.history.replaceState({}, '', newUrl);
    } else {
        console.warn('⚠️ [showPage] history.replaceState not available');
    }
};

// Sidebar collapse helpers
const SIDEBAR_COLLAPSED_CLASS = 'sidebar-collapsed';
const SIDEBAR_STATE_STORAGE_KEY = 'imock-sidebar-state';

const applySidebarState = (shouldCollapse, { persist = true } = {}) => {
    if (!document.body) return;
    document.body.classList.toggle(SIDEBAR_COLLAPSED_CLASS, shouldCollapse);
    const toggleButton = document.querySelector('.sidebar-toggle');
    if (toggleButton) {
        const label = shouldCollapse ? 'Expand sidebar' : 'Collapse sidebar';
        toggleButton.setAttribute('aria-expanded', String(!shouldCollapse));
        toggleButton.setAttribute('aria-label', label);
        toggleButton.setAttribute('title', label);
        toggleButton.querySelector('use')?.setAttribute('href', shouldCollapse ? '#icon-sidebar-expand' : '#icon-sidebar-collapse');
    }
    if (persist) try { localStorage.setItem(SIDEBAR_STATE_STORAGE_KEY, shouldCollapse ? 'collapsed' : 'expanded'); } catch (e) { console.warn('Unable to persist sidebar state:', e); }
};

window.toggleSidebar = () => {
    const isCollapsed = document.body?.classList.contains(SIDEBAR_COLLAPSED_CLASS);
    applySidebarState(!isCollapsed);
};

window.initializeSidebarPreference = () => {
    let storedState = null;
    try { storedState = localStorage.getItem(SIDEBAR_STATE_STORAGE_KEY); } catch (e) { console.warn('Unable to read sidebar state from storage:', e); }
    applySidebarState(storedState === 'collapsed', { persist: false });
};

const resolveModalElement = (modalId) => {
    if (!modalId) { console.warn('Modal ID is required to resolve modal element'); return null; }
    const element = document.getElementById(modalId);
    if (!element) console.warn(`Modal element not found for id: ${modalId}`);
    return element;
};

window.showModal = (modalId) => {
    const modal = resolveModalElement(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput) LifecycleManager.requestAnimationFrame(() => firstInput.focus());
};

window.openAddMappingModal = () => {
    const formElement = document.getElementById(SELECTORS.MODAL.FORM);
    const idElement = document.getElementById(SELECTORS.MODAL.ID);
    const titleElement = document.getElementById(SELECTORS.MODAL.TITLE);
    if (formElement) formElement.reset();
    if (idElement) idElement.value = '';
    if (titleElement) titleElement.textContent = 'Add New Mapping';
    window.showModal('add-mapping-modal');
};

window.hideModal = (modal) => {
    const modalElement = typeof modal === 'string' ? resolveModalElement(modal) : modal;
    if (!modalElement) return;
    modalElement.classList.add('hidden');
    modalElement.style.display = 'none';
    modalElement.querySelector('form')?.reset();
    if (modalElement.id === 'edit-mapping-modal') {
        if (typeof UIComponents?.clearCardState === 'function') {
            UIComponents.clearCardState('mapping', 'is-editing');
        }
        // Clear Monaco Editor content to prevent showing previous mapping
        if (window.editor && typeof window.editor.setValue === 'function') {
            try {
                window.editor.setValue('');
            } catch (e) {
                console.warn('Failed to clear editor:', e);
            }
        }
    }
};

window.showTab = (tabName, button) => {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    button.classList.add('active');

    // Update URL with active tab
    if (window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tabName);
        window.history.replaceState({}, '', url.toString());
    }
};

const applyThemeToDom = (theme) => {
    if (!document.body) return;
    document.body.setAttribute('data-theme', theme);
    const iconTargets = [document.getElementById('theme-icon'), document.getElementById('editor-theme-icon')].filter(Boolean);
    if (iconTargets.length) {
        const target = theme === 'dark' ? '#icon-sun' : '#icon-moon';
        iconTargets.forEach(icon => { icon.setAttribute('href', target); icon.setAttribute('xlink:href', target); });
    }
};

const persistThemePreference = (preference) => {
    localStorage.setItem('theme', preference);
    try { localStorage.setItem('wiremock-settings', JSON.stringify({ ...Utils.safeCall(window.readWiremockSettings) || {}, theme: preference })); } catch (_) {}
};

window.toggleTheme = () => {
    if (!document.body) return;
    const newTheme = (document.body.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
    applyThemeToDom(newTheme);
    persistThemePreference(newTheme);
    if (window.NotificationManager) NotificationManager.show(`Switched to ${newTheme} theme`, 'success');
};

window.changeTheme = () => {
    const themeSelect = document.getElementById('theme-select');
    if (!themeSelect) return;
    const selectedTheme = themeSelect.value;
    const themeToApply = selectedTheme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : selectedTheme;
    applyThemeToDom(themeToApply);
    persistThemePreference(selectedTheme);
    if (window.NotificationManager) NotificationManager.show(`Theme changed to ${selectedTheme}`, 'success');
};

window.initializeTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const themeToApply = savedTheme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : savedTheme;
    applyThemeToDom(themeToApply);
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = savedTheme;
};

// Initialize theme only after DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTheme);
} else {
    initializeTheme();
}

// --- MODAL EVENTS ---

// Close modal when clicking outside
LifecycleManager.addEventListener(document, 'click', (e) => {
    if (e.target.classList.contains('modal')) {
        hideModal(e.target);
    }
});

// Close modal with Escape key
LifecycleManager.addEventListener(document, 'keydown', (e) => {
    if (e.key === 'Escape') {
        const visibleModal = document.querySelector('.modal:not(.hidden)');
        if (visibleModal) {
            hideModal(visibleModal);
        }
    }
});

// --- DOM ELEMENT CACHE (minimal) ---
window.elementCache = new Map();
window.invalidateElementCache = (id) => id ? window.elementCache.delete(id) : window.elementCache.clear();

console.log('✅ Core.js loaded - Constants, API client, basic UI functions');
