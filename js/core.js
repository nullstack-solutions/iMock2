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
        TARGET_URL: 'record-target-url',
        MODE: 'record-mode',
        URL_PATTERN: 'record-url-pattern',
        METHOD: 'record-http-method',
        CAPTURE_HEADERS: 'record-capture-headers',
        OUTPUT_FORMAT: 'record-output-format',
        ALLOW_NON_PROXIED: 'record-allow-non-proxied',
        PERSIST: 'record-persist',
        REPEATS: 'record-repeats-as-scenarios',
        INDICATOR: 'recording-indicator',
        STATUS_TEXT: 'recording-status-text',
        TARGET: 'recording-target',
        COUNT: 'recording-count',
        LIST: 'recordings-list'
    },

    // Settings
    SETTINGS: {
        HOST: 'settings-host',
        PORT: 'settings-port',
        TIMEOUT: 'settings-timeout',
        AUTO_REFRESH: 'auto-refresh',
        THEME: 'theme-select',
        AUTH_HEADER: 'auth-header',
        CACHE_ENABLED: 'cache-enabled'
    },

    // Import/Export
    IMPORT: {
        FILE: 'import-file',
        DISPLAY: 'file-display',
        ACTIONS: 'import-actions',
        RESULT: 'import-result'
    },

    EXPORT: {
        FORMAT: 'export-format'
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
    REQUESTS: '/requests',
    REQUESTS_RESET: '/requests/reset', // Deprecated
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
    SCENARIOS_SET_STATE: '/scenarios/set-state',

    // System endpoints
    SETTINGS: '/settings',
    SHUTDOWN: '/shutdown'
};

// --- GLOBAL STATE ---
let wiremockBaseUrl = '';
let requestTimeout = 5000;
let authHeader = ''; // Authorization header for all API requests
window.authHeader = authHeader; // Make globally accessible
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

    // Read timeout from settings instead of window variable
    const timeoutSettings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
    const currentTimeout = timeoutSettings.requestTimeout ? parseInt(timeoutSettings.requestTimeout) : 5000;
    console.log(`⏱️ [API] Using request timeout: ${currentTimeout}ms (from settings: ${timeoutSettings.requestTimeout || 'default 5000'})`);
    const timeoutId = setTimeout(() => controller.abort(), currentTimeout);

    // Always use the latest wiremockBaseUrl from window object
    const fullUrl = `${window.wiremockBaseUrl}${endpoint}`;
    const method = options.method || 'GET';

    // Prepare headers with auth header if available
    // Retrieve the authHeader from settings on every request
    const authSettings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
    const currentAuthHeader = authSettings.authHeader || window.authHeader || '';

    const headers = {
        'Content-Type': 'application/json',
        ...(currentAuthHeader && { 'Authorization': currentAuthHeader }),
        ...options.headers
    };
    
    // Log every API request for debugging
    console.log(`🔗 WireMock API Request:`, {
        method,
        url: fullUrl,
        baseUrl: window.wiremockBaseUrl,
        endpoint,
        headers: headers,
        authHeaderValue: currentAuthHeader,
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

    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
};

const persistThemePreference = (preference) => {
    localStorage.setItem('theme', preference);
    try {
        const current = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
        localStorage.setItem('wiremock-settings', JSON.stringify({ ...current, theme: preference }));
    } catch (_) {}
};

window.toggleTheme = () => {
    const body = document.body;
    if (!body) {
        return;
    }

    const currentTheme = body.getAttribute('data-theme') || 'light';
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
    const savedTheme = localStorage.getItem('theme') || 'light';
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

// Debug function to check auth header
window.debugAuthHeader = () => {
    console.log('🔍 Auth Header Debug:', {
        'window.authHeader': window.authHeader,
        'typeof': typeof window.authHeader,
        'length': window.authHeader?.length,
        'localStorage': JSON.parse(localStorage.getItem('wiremock-settings') || '{}').authHeader
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
