'use strict';

/**
 * Centralized logger with levels and category-based formatting
 * @namespace Logger
 */
const Logger = (function() {
    // Log levels
    const LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        SILENT: 4
    };

    // Current level (from localStorage or default)
    let currentLevel = LEVELS.WARN;

    // Category prefixes (covers all known Logger categories)
    const PREFIXES = {
        API: '🔗',
        CACHE: '🧩',
        DEMO: '🧪',
        EDITOR: '📝',
        EVENTS: '📢',
        FEATURES: '🧠',
        FILTERS: '🔍',
        HEALTH: '💓',
        MANAGERS: '🧭',
        METADATA: '📅',
        OPS: '🛠️',
        OPTIMISTIC: '🎯',
        PAGINATION: '↔️',
        QUERY: '❓',
        RECORDING: '⏺️',
        REQUESTS: '📡',
        SCENARIOS: '🎬',
        STATE: '🌐',
        STORE: '🗂️',
        SYNC: '🔄',
        TEMPLATES: '🧾',
        UI: '🖥️',
        DEFAULT: '📋'
    };

    /**
     * Initialize log level from localStorage
     */
    function init() {
        try {
            const stored = localStorage.getItem('imock-log-level');
            if (stored && LEVELS[stored.toUpperCase()] !== undefined) {
                currentLevel = LEVELS[stored.toUpperCase()];
            }
        } catch (e) { /* ignore */ }
    }

    /**
     * Format the log message
     */
    function format(category, ...args) {
        const prefix = PREFIXES[category] || PREFIXES.DEFAULT;
        const timestamp = new Date().toISOString().substring(11, 23);
        return [`[${timestamp}] ${prefix} [${category}]`, ...args];
    }

    /**
     * Update log level
     */
    function setLevel(level) {
        const upperLevel = (level || '').toUpperCase();
        if (LEVELS[upperLevel] !== undefined) {
            currentLevel = LEVELS[upperLevel];
            try {
                localStorage.setItem('imock-log-level', upperLevel);
            } catch (e) { /* ignore */ }
        }
    }

    /**
     * Public logging API
     */
    const api = {
        LEVELS,
        setLevel,
        
        debug: (category, ...args) => {
            if (currentLevel <= LEVELS.DEBUG) {
                console.log(...format(category, ...args));
            }
        },
        
        info: (category, ...args) => {
            if (currentLevel <= LEVELS.INFO) {
                console.info(...format(category, ...args));
            }
        },
        
        warn: (category, ...args) => {
            if (currentLevel <= LEVELS.WARN) {
                console.warn(...format(category, ...args));
            }
        },
        
        error: (category, ...args) => {
            if (currentLevel <= LEVELS.ERROR) {
                console.error(...format(category, ...args));
            }
        },

        // Shortcuts for frequently used categories
        api: (...args) => api.debug('API', ...args),
        cache: (...args) => api.debug('CACHE', ...args),
        ui: (...args) => api.debug('UI', ...args)
    };

    init();
    return api;
})();

window.Logger = Logger;
