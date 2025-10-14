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
        METHOD: 'filter-method',
        URL: 'filter-url',
        STATUS: 'filter-status'
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
            if (typeof window.requestAnimationFrame !== 'function') {
                handler();
                return null;
            }
            const id = window.requestAnimationFrame(handler);
            rafIds.add(id);
            return id;
        },
        cancelAnimationFrame(id) {
            if (id !== undefined && id !== null && typeof window.cancelAnimationFrame === 'function') {
                window.cancelAnimationFrame(id);
                rafIds.delete(id);
            }
        },
        clearAll() {
            intervalIds.forEach(identifier => window.clearInterval(identifier));
            intervalIds.clear();
            rafIds.forEach(identifier => {
                if (typeof window.cancelAnimationFrame === 'function') {
                    window.cancelAnimationFrame(identifier);
                }
            });
            rafIds.clear();
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
                    onItemChanged(keyString, item, signature, previousSignature);
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
    REQUESTS_RESET: '/requests/reset', // Deprecated legacy endpoint
    REQUESTS_COUNT: '/requests/count', // Requires POST
    REQUESTS_REMOVE: '/requests/remove',
    REQUESTS_FIND: '/requests/find', // Requires POST
    REQUESTS_UNMATCHED: '/requests/unmatched',
    REQUESTS_UNMATCHED_NEAR_MISSES: '/requests/unmatched/near-misses',

    // Near misses endpoints (corrected)
    NEAR_MISSES_REQUEST: '/near-misses/request', // Requires POST
    NEAR_MISSES_PATTERN: '/near-misses/request-pattern', // Requires POST

    // Recording endpoints (corrected)
    RECORDINGS_START: '/recordings/start', // Requires POST
    RECORDINGS_STOP: '/recordings/stop', // Requires POST
    RECORDINGS_STATUS: '/recordings/status', // Uses GET
    RECORDINGS_SNAPSHOT: '/recordings/snapshot', // Requires POST

    // Scenario endpoints
    SCENARIOS: '/scenarios',
    SCENARIOS_RESET: '/scenarios/reset',

    // System endpoints
    SETTINGS: '/settings',
    SHUTDOWN: '/shutdown'
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

    if (normalized.autoConnect === undefined) {
        normalized.autoConnect = true;
    } else {
        normalized.autoConnect = normalized.autoConnect !== false;
    }

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

window.getWiremockSettings = window.readWiremockSettings;

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

// Normalize the WireMock base URL (respect the scheme and port provided by the user)
// Example inputs and outputs:
//  - host: "mock.example.com", port: "8080" => "http://mock.example.com:8080/__admin"
//  - host: "https://mock.example.com", port: "" => "https://mock.example.com:443/__admin"
//  - host: "https://mock.example.com:8443", port: "" => "https://mock.example.com:8443/__admin"
//  - host: "http://mock.example.com", port: "8000" => "http://mock.example.com:8000/__admin"
window.normalizeWiremockBaseUrl = (hostInput, portInput) => {
    let rawHost = (hostInput || '').trim();
    let port = (portInput || '').trim();
    let scheme = 'http';
    let hostname = '';

    if (!rawHost) rawHost = 'localhost';

    try {
        // If the protocol is missing, temporarily prepend http for proper parsing
        const url = new URL(rawHost.includes('://') ? rawHost : `http://${rawHost}`);
        scheme = url.protocol.replace(':', '') || 'http';
        hostname = url.hostname;
        // If a port is not provided separately, attempt to reuse the port from the URL
        if (!port && url.port) {
            port = url.port;
        }
    } catch (e) {
        // Fallback to parsing host:port directly
        const m = rawHost.match(/^([^:/]+)(?::(\d+))?$/);
        if (m) {
            hostname = m[1];
            if (!port && m[2]) port = m[2];
        } else {
            hostname = rawHost; // use as-is
        }
    }

    if (!hostname) hostname = 'localhost';
    if (!port) {
        // Default to 443 for HTTPS and 8080 otherwise (to preserve existing UI behavior)
        port = scheme === 'https' ? '443' : '8080';
    }

    return `${scheme}://${hostname}:${port}/__admin`;
};

// --- API CLIENT WITH TIMEOUT SUPPORT ---
window.apiFetch = async (endpoint, options = {}) => {
    const controller = new AbortController();

    // Read timeout from settings, fallback to centralized default
    const timeoutSettings = (typeof window.readWiremockSettings === 'function') ? window.readWiremockSettings() : {};
    const defaultTimeout = window.DEFAULT_SETTINGS?.requestTimeout ? parseInt(window.DEFAULT_SETTINGS.requestTimeout) : 69000;
    const currentTimeout = timeoutSettings.requestTimeout ? parseInt(timeoutSettings.requestTimeout) : defaultTimeout;
    console.log(`⏱️ [API] Using request timeout: ${currentTimeout}ms (from settings: ${timeoutSettings.requestTimeout || `default ${defaultTimeout}`})`);
    const timeoutId = setTimeout(() => controller.abort(), currentTimeout);

    // Always use the latest wiremockBaseUrl from window object
    const fullUrl = `${window.wiremockBaseUrl}${endpoint}`;
    const method = options.method || 'GET';

    const customHeaderSettings = ensureCustomHeaderObject(timeoutSettings.customHeaders || window.customHeaders);

    const headers = {
        'Content-Type': 'application/json',
        ...customHeaderSettings,
        ...options.headers
    };
    
    // Log every API request for debugging
    console.log(`🔗 WireMock API Request:`, {
        method,
        url: fullUrl,
        baseUrl: window.wiremockBaseUrl,
        endpoint,
        headers: headers,
        options: options.body ? { ...options, body: JSON.parse(options.body || '{}') } : options,
        timestamp: new Date().toISOString()
    });
    
    try {
        const response = await fetch(fullUrl, {
            ...options,
            signal: controller.signal,
            headers: headers
        });
        
        clearTimeout(timeoutId);
        
        // Log response for debugging
        console.log(`📥 WireMock API Response:`, {
            method,
            url: fullUrl,
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            timestamp: new Date().toISOString()
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ WireMock API Error:`, {
                method,
                url: fullUrl,
                status: response.status,
                error: errorText,
                timestamp: new Date().toISOString()
            });
            throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        let responseData;
        if (contentType && contentType.includes('application/json')) {
            responseData = await response.json();
        } else {
            responseData = await response.text();
        }
        
        // Log successful response data (truncated for large responses)
        const dataPreview = typeof responseData === 'object' ? 
            JSON.stringify(responseData).substring(0, 500) + (JSON.stringify(responseData).length > 500 ? '...' : '') :
            responseData.toString().substring(0, 500) + (responseData.toString().length > 500 ? '...' : '');
        
        console.log(`✅ WireMock API Success:`, {
            method,
            url: fullUrl,
            dataPreview,
            timestamp: new Date().toISOString()
        });
        
        // Track last OK time only for health-related endpoints
        try {
            if (endpoint === (window.ENDPOINTS && window.ENDPOINTS.HEALTH) || endpoint === (window.ENDPOINTS && window.ENDPOINTS.MAPPINGS)) {
                window.lastWiremockSuccess = Date.now();
                if (typeof window.updateLastSuccessUI === 'function') {
                    window.updateLastSuccessUI();
                }
            }
        } catch (_) {}
        
        return responseData;
    } catch (error) {
        clearTimeout(timeoutId);
        
        // Log all errors for debugging
        console.error(`💥 WireMock API Exception:`, {
            method,
            url: fullUrl,
            error: error.message,
            errorName: error.name,
            timestamp: new Date().toISOString()
        });
        
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${currentTimeout}ms`);
        }
        throw error;
    }
};

// --- CORE UI HELPERS ---

// NOTE: Uptime functions (updateUptime, stopUptime) have been moved to features.js
// to provide a single source of truth for uptime logic and avoid conflicts.

// Page navigation helpers
window.showPage = (pageId, element) => {
    document.querySelectorAll('.main-content > div[id$="-page"]').forEach(p => p.classList.add('hidden'));

    const targetPage = document.getElementById(SELECTORS.PAGES[pageId.toUpperCase()]);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    } else {
        console.warn(`Page not found: ${pageId}`);
        return;
    }

    document.querySelectorAll('.sidebar .nav-item').forEach(i => i.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    }

    // Removed forced refresh on tab switch - data will only refresh:
    // 1. On initial connection (connectToWireMock)
    // 2. By manual refresh buttons
    // 3. Via auto-refresh interval (if enabled)
    // This prevents unnecessary API calls when switching tabs
};

// Sidebar collapse helpers
const SIDEBAR_COLLAPSED_CLASS = 'sidebar-collapsed';
const SIDEBAR_STATE_STORAGE_KEY = 'imock-sidebar-state';

const updateSidebarToggleButton = (isCollapsed) => {
    const toggleButton = document.querySelector('.sidebar-toggle');
    if (!toggleButton) {
        return;
    }

    const label = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
    toggleButton.setAttribute('aria-expanded', String(!isCollapsed));
    toggleButton.setAttribute('aria-label', label);
    toggleButton.setAttribute('title', label);

    const iconUse = toggleButton.querySelector('use');
    if (iconUse) {
        iconUse.setAttribute('href', isCollapsed ? '#icon-sidebar-expand' : '#icon-sidebar-collapse');
    }
};

const applySidebarState = (shouldCollapse, { persist = true } = {}) => {
    const bodyElement = document.body;
    if (!bodyElement) {
        return;
    }

    bodyElement.classList.toggle(SIDEBAR_COLLAPSED_CLASS, shouldCollapse);
    updateSidebarToggleButton(shouldCollapse);

    if (!persist) {
        return;
    }

    try {
        localStorage.setItem(SIDEBAR_STATE_STORAGE_KEY, shouldCollapse ? 'collapsed' : 'expanded');
    } catch (error) {
        console.warn('Unable to persist sidebar state:', error);
    }
};

window.toggleSidebar = () => {
    const isCollapsed = document.body?.classList.contains(SIDEBAR_COLLAPSED_CLASS);
    applySidebarState(!isCollapsed);
};

window.initializeSidebarPreference = () => {
    let storedState = null;

    try {
        storedState = localStorage.getItem(SIDEBAR_STATE_STORAGE_KEY);
    } catch (error) {
        console.warn('Unable to read sidebar state from storage:', error);
    }

    const shouldCollapse = storedState === 'collapsed';
    applySidebarState(shouldCollapse, { persist: false });
};

// Modal helpers
const resolveModalElement = (modalId) => {
    if (!modalId) {
        console.warn('Modal ID is required to resolve modal element');
        return null;
    }

    const candidates = modalId.endsWith('-modal')
        ? [modalId, modalId.replace(/-modal$/, '')]
        : [`${modalId}-modal`, modalId];

    const [primaryId] = candidates;

    for (let index = 0; index < candidates.length; index += 1) {
        const candidateId = candidates[index];
        if (!candidateId) continue;

        const element = document.getElementById(candidateId);
        if (element) {
            if (index > 0) {
                console.warn(`Modal element not found: ${primaryId}. Falling back to ${candidateId}`);
            }
            return element;
        }
    }

    console.warn(`Modal element not found for id: ${modalId}`);
    return null;
};

const resetMappingFormDefaults = () => {
    const formElement = document.getElementById(SELECTORS.MODAL.FORM);
    const idElement = document.getElementById(SELECTORS.MODAL.ID);
    const titleElement = document.getElementById(SELECTORS.MODAL.TITLE);

    if (formElement) formElement.reset();
    if (idElement) idElement.value = '';
    if (titleElement) titleElement.textContent = 'Add New Mapping';
};

window.showModal = (modalId) => {
    const modal = resolveModalElement(modalId);
    if (!modal) {
        return;
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
    }
};

window.openAddMappingModal = () => {
    resetMappingFormDefaults();
    window.showModal('add-mapping-modal');
};

window.hideModal = (modal) => {
    const modalElement = typeof modal === 'string' ? resolveModalElement(modal) : modal;
    if (!modalElement) {
        return;
    }

    modalElement.classList.add('hidden');
    modalElement.style.display = 'none';

    const form = modalElement.querySelector('form');
    if (form) {
        form.reset();
    }

    if (
        modalElement.id === 'edit-mapping-modal' &&
        typeof UIComponents !== 'undefined' &&
        typeof UIComponents.clearCardState === 'function'
    ) {
        UIComponents.clearCardState('mapping', 'is-editing');
    }
};

// Tab management
window.showTab = (tabName, button) => {
    // Hide every tab
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Remove the active state from all buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show the requested tab and activate its button
    document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    button.classList.add('active');
};

// Legacy wrapper kept for compatibility
window.showMessage = (text, type = 'info') => {
    if (window.NotificationManager) {
        NotificationManager.show(text, type);
    }
};

// --- THEME FUNCTIONS ---
const applyThemeToDom = (theme) => {
    const body = document.body;
    if (!body) {
        return;
    }

    body.setAttribute('data-theme', theme);

    const iconTargets = [
        document.getElementById('theme-icon'),
        document.getElementById('editor-theme-icon')
    ].filter(Boolean);

    if (iconTargets.length) {
        const target = theme === 'dark' ? '#icon-sun' : '#icon-moon';
        iconTargets.forEach((icon) => {
            icon.setAttribute('href', target);
            icon.setAttribute('xlink:href', target);
        });
    }
};

const persistThemePreference = (preference) => {
    localStorage.setItem('theme', preference);
    try {
        const current = (typeof window.readWiremockSettings === 'function') ? window.readWiremockSettings() : {};
        localStorage.setItem('wiremock-settings', JSON.stringify({ ...current, theme: preference }));
    } catch (_) {}
};

window.toggleTheme = () => {
    const body = document.body;
    if (!body) {
        return;
    }

    const currentTheme = body.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    applyThemeToDom(newTheme);
    persistThemePreference(newTheme);

    showMessage(`Switched to ${newTheme} theme`, 'success');
};

window.changeTheme = () => {
    const themeSelect = document.getElementById('theme-select');
    if (!themeSelect) {
        return;
    }

    const selectedTheme = themeSelect.value;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const themeToApply = selectedTheme === 'auto' ? (prefersDark ? 'dark' : 'light') : selectedTheme;

    applyThemeToDom(themeToApply);
    persistThemePreference(selectedTheme);

    showMessage(`Theme changed to ${selectedTheme}`, 'success');
};

// Initialize theme on load
window.initializeTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const themeToApply = savedTheme === 'auto' ? (prefersDark ? 'dark' : 'light') : savedTheme;

    applyThemeToDom(themeToApply);

    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.value = savedTheme;
    }
};

// Initialize theme only after DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTheme);
} else {
    initializeTheme();
}

// --- MODAL EVENTS ---

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        hideModal(e.target);
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const visibleModal = document.querySelector('.modal:not(.hidden)');
        if (visibleModal) {
            hideModal(visibleModal);
        }
    }
});

// Debug function to inspect custom headers
window.debugCustomHeaders = () => {
    const settings = (typeof window.readWiremockSettings === 'function') ? window.readWiremockSettings() : {};
    console.log('🔍 Custom Headers Debug:', {
        'window.customHeaders': window.customHeaders,
        'settings.customHeaders': settings.customHeaders,
        'settings.customHeadersRaw': settings.customHeadersRaw
    });
};

// --- DOM ELEMENT CACHE FOR PERFORMANCE OPTIMIZATION ---
window.elementCache = new Map();

window.getElement = (id) => {
    if (!window.elementCache.has(id)) {
        const element = document.getElementById(id);
        if (element) {
            window.elementCache.set(id, element);
        }
        return element;
    }
    return window.elementCache.get(id);
};

window.clearElementCache = () => {
    window.elementCache.clear();
};

window.invalidateElementCache = (id) => {
    if (id) {
        window.elementCache.delete(id);
    } else {
        // If no id provided, clear entire cache
        window.elementCache.clear();
    }
};

// Enhanced getElement with automatic cache invalidation on DOM changes
window.getElement = (id, invalidateCache = false) => {
    if (invalidateCache) {
        window.invalidateElementCache(id);
    }

    if (!window.elementCache.has(id)) {
        const element = document.getElementById(id);
        if (element) {
            window.elementCache.set(id, element);
        }
        return element;
    }
    return window.elementCache.get(id);
};

// --- ENHANCED ERROR MESSAGE UTILITY ---
window.getUserFriendlyErrorMessage = (error, operation = 'operation') => {
    const errorMessage = error.message || error.toString();

    // Network/connection errors
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        return `Connection failed. Please check if WireMock server is running and accessible.`;
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        return `Request timed out. The server may be overloaded or unresponsive.`;
    }

    // HTTP status errors
    if (errorMessage.includes('HTTP 404')) {
        return `Resource not found. The requested item may have been deleted.`;
    }

    if (errorMessage.includes('HTTP 403')) {
        return `Access denied. Please check your authentication settings.`;
    }

    if (errorMessage.includes('HTTP 500')) {
        return `Server error. Please try again later or check server logs.`;
    }

    if (errorMessage.includes('HTTP 400')) {
        return `Invalid request. Please check your input data.`;
    }

    // JSON parsing errors
    if (errorMessage.includes('JSON') || errorMessage.includes('Unexpected token')) {
        return `Data parsing error. The server returned invalid data.`;
    }

    // CORS errors
    if (errorMessage.includes('CORS') || errorMessage.includes('Access-Control')) {
        return `Cross-origin request blocked. Please check server CORS settings.`;
    }

    // Generic fallback with specific operation context
    return `Failed to ${operation}: ${errorMessage}`;
};

console.log('✅ Core.js loaded - Constants, API client, basic UI functions');
