'use strict';

/**
 * Core Constants Module
 * Contains all application constants including selectors, endpoints, and default settings
 */

// --- DOM SELECTORS ---
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

    // Editor
    EDITOR: {
        FORM_CONTAINER: 'form-editor-container',
        JSON_CONTAINER: 'json-editor-container',
        JSON_EDITOR: 'json-editor',
        ADD_FORM: 'mapping-form',
        EDIT_FORM: 'edit-mapping-form',
        UPDATE_BTN: 'update-mapping-btn',
        MAPPING_ID: 'mapping-id',
        EDIT_MAPPING_ID: 'edit-mapping-id',
        VALIDATION_RESULT: 'json-validation-result',
        DIRTY_INDICATOR: 'editor-dirty-indicator',
        OPEN_JSON_STUDIO_BTN: 'open-json-studio-btn',
        EDITOR_MODAL: 'edit-mapping-modal'
    },

    // Template Gallery
    TEMPLATES: {
        GALLERY: 'template-gallery-modal',
        SHELL: 'template-gallery-shell',
        TARGET: 'template-target',
        NAME_MODAL: 'template-name-modal',
        NAME_INPUT: 'template-name-input',
        SAVE_BTN: 'save-template-btn',
        EDITOR_SAVE_BTN: 'editor-save-template',
        METHOD: 'method',
        URL_PATTERN: 'url-pattern',
        EDITOR_METHOD: 'editor-method',
        EDITOR_URL: 'editor-url',
        RESPONSE_STATUS: 'response-status',
        RESPONSE_BODY: 'response-body'
    },

    // Filter Controls (additional missing ones)
    FILTER_CONTROLS: {
        METHOD: 'filter-method',
        URL: 'filter-url',
        STATUS: 'filter-status',
        REQ_METHOD: 'req-filter-method',
        REQ_STATUS: 'req-filter-status',
        REQ_QUERY: 'req-filter-query',
        REQ_FROM: 'req-filter-from',
        REQ_TO: 'req-filter-to',
        REQ_QUICK: 'req-filter-quick',
        ACTIVE_FILTERS: 'active-filters',
        ACTIVE_FILTERS_LIST: 'active-filters-list',
        REQ_ACTIVE_FILTERS: 'req-active-filters',
        FILTER_PRESETS_LIST: 'filter-presets-list',
        FILTER_PILLS_CONTAINER: 'filter-pills-container',
        FILTER_PILLS: 'filter-pills'
    },

    // Pagination
    PAGINATION: {
        MAPPINGS: 'mappings-pagination'
    },

    // Onboarding
    ONBOARDING: {
        OVERLAY: 'onboarding-overlay',
        FORM: 'onboarding-form',
        HOST: 'onboarding-host',
        PORT: 'onboarding-port',
        HEADERS: 'onboarding-headers',
        AUTO_CONNECT: 'onboarding-auto-connect'
    },

    // Settings (additional missing ones)
    SETTINGS_EXTENDED: {
        DEFAULT_HOST: 'default-host',
        DEFAULT_PORT: 'default-port',
        REQUEST_TIMEOUT: 'request-timeout',
        CACHE_ENABLED: 'cache-enabled',
        AUTO_REFRESH_ENABLED: 'auto-refresh-enabled',
        REFRESH_INTERVAL: 'refresh-interval',
        CACHE_REBUILD_DELAY: 'cache-rebuild-delay',
        CACHE_VALIDATION_DELAY: 'cache-validation-delay',
        OPTIMISTIC_CACHE_AGE_LIMIT: 'optimistic-cache-age-limit',
        CACHE_COUNT_DIFF_THRESHOLD: 'cache-count-diff-threshold',
        BACKGROUND_FETCH_DELAY: 'background-fetch-delay',
        AUTO_CONNECT_ENABLED: 'auto-connect-enabled',
        CUSTOM_HEADERS: 'custom-headers'
    },

    // UI Components
    UI_COMPONENTS: {
        TOAST_CONTAINER: 'toast-container',
        SIDEBAR_TOGGLE: '.sidebar-toggle',
        THEME_ICON: 'theme-icon',
        EDITOR_THEME_ICON: 'editor-theme-icon',
        STATS_SPACER: 'stats-spacer',
        RECORDER_LINK: 'recorder-link',
        SWAGGER_UI_LINK: 'swagger-ui-link',
        SWAGGER_UI_LINK_HINT: 'swagger-ui-link-hint'
    },

    // Scenarios
    SCENARIOS: {
        SELECT: 'scenario-select',
        STATE: 'scenario-state',
        STATE_OPTIONS: 'scenario-state-options',
        UPDATE_BTN: 'scenario-update-btn',
        LOADING: 'scenarios-loading',
        EMPTY: 'scenarios-empty',
        COUNT: 'scenarios-count'
    },

    // Request Tabs
    REQUEST_TABS: {
        ALL: 'requests-tab-all',
        MATCHED: 'requests-tab-matched',
        UNMATCHED: 'requests-tab-unmatched'
    },

    // Recording
    RECORDING_EXTENDED: {
        LIST: 'recordings-list'
    },

    // Dynamic IDs (for elements with dynamic IDs)
    DYNAMIC: {
        PREVIEW_PREFIX: 'preview-',
        ARROW_PREFIX: 'arrow-'
    },

    // Additional UI Elements
    ADDITIONAL: {
        UPTIME: 'uptime',
        THEME_SELECT: 'theme-select',
        MAPPING_NAME: 'mapping-name'
    }
};

// --- API ENDPOINTS ---
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

// --- DEFAULT CONFIGURATION ---
window.DEFAULTS = {
    // Connection settings
    DEFAULT_HOST: 'localhost',
    DEFAULT_PORT: '8080',
    DEFAULT_SCHEME: 'http',
    
    // Request settings
    REQUEST_TIMEOUT: 69000, // 69 seconds
    
    // Cache settings
    CACHE_ENABLED: true,
    CACHE_REBUILD_DELAY: 1000, // 1 second
    CACHE_VALIDATION_DELAY: 2000, // 2 seconds
    OPTIMISTIC_CACHE_AGE_LIMIT: 30000, // 30 seconds
    CACHE_COUNT_DIFF_THRESHOLD: 5,
    BACKGROUND_FETCH_DELAY: 500, // 0.5 seconds
    
    // Auto-refresh settings
    AUTO_REFRESH_ENABLED: true,
    REFRESH_INTERVAL: 30000, // 30 seconds
    
    // UI settings
    DEFAULT_THEME: 'dark',
    SIDEBAR_COLLAPSED: false,
    
    // Performance settings
    DEBOUNCE_DELAY: 150, // milliseconds
    ANIMATION_FRAME_DURATION: 16, // ~60fps
    
    // Feature flags
    AUTO_CONNECT_ENABLED: false,
    DEBUG_MODE: false,
    
    // Custom headers
    CUSTOM_HEADERS: {}
};

// --- STANDARD EVENTS ---
window.EVENTS = {
    // Mapping events
    MAPPINGS_LOADED: 'mappings:loaded',
    MAPPING_CREATED: 'mapping:created',
    MAPPING_UPDATED: 'mapping:updated',
    MAPPING_DELETED: 'mapping:deleted',
    MAPPINGS_CLEARED: 'mappings:cleared',
    
    // Request events
    REQUESTS_LOADED: 'requests:loaded',
    REQUEST_MATCHED: 'request:matched',
    REQUEST_UNMATCHED: 'request:unmatched',
    REQUESTS_CLEARED: 'requests:cleared',
    
    // Scenario events
    SCENARIOS_LOADED: 'scenarios:loaded',
    SCENARIO_CHANGED: 'scenario:changed',
    SCENARIO_STATE_UPDATED: 'scenario:state:updated',
    
    // Recording events
    RECORDING_STARTED: 'recording:started',
    RECORDING_STOPPED: 'recording:stopped',
    RECORDING_SNAPSHOT: 'recording:snapshot',
    
    // Connection events
    CONNECTED: 'connection:established',
    DISCONNECTED: 'connection:lost',
    CONNECTION_ERROR: 'connection:error',
    
    // UI events
    PAGE_CHANGED: 'ui:page:changed',
    MODAL_OPENED: 'ui:modal:opened',
    MODAL_CLOSED: 'ui:modal:closed',
    THEME_CHANGED: 'ui:theme:changed',
    
    // Cache events
    CACHE_INVALIDATED: 'cache:invalidated',
    CACHE_REBUILT: 'cache:rebuilt',
    CACHE_VALIDATED: 'cache:validated',
    
    // System events
    ERROR_OCCURRED: 'system:error',
    WARNING_ISSUED: 'system:warning',
    INFO_MESSAGE: 'system:info'
};

Logger.debug('CONSTANTS', 'Constants module loaded');