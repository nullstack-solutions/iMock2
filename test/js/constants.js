'use strict';

// ===== CONSTANTS.JS - Shared constants =====
// Global constants for selectors, icons, and endpoints

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
