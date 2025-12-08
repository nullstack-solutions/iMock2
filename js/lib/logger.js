'use strict';

/**
 * Централизованный логгер с уровнями и форматированием
 * @namespace Logger
 */
const Logger = (function() {
    // Уровни логирования
    const LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        SILENT: 4
    };

    // Текущий уровень (из localStorage или default)
    let currentLevel = LEVELS.WARN;
    
    // Префиксы для категорий
    const PREFIXES = {
        API: '🔗',
        CACHE: '🧩',
        EDITOR: '📝',
        HEALTH: '💓',
        METADATA: '📅',
        OPTIMISTIC: '🎯',
        UI: '🖥️',
        DEFAULT: '📋'
    };

    /**
     * Инициализация из localStorage
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
     * Форматирование сообщения
     */
    function format(category, ...args) {
        const prefix = PREFIXES[category] || PREFIXES.DEFAULT;
        const timestamp = new Date().toISOString().substr(11, 12);
        return [`[${timestamp}] ${prefix} [${category}]`, ...args];
    }

    /**
     * Установка уровня логирования
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
     * Публичные методы логирования
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

        // Сокращённые версии для частых категорий
        api: (...args) => api.debug('API', ...args),
        cache: (...args) => api.debug('CACHE', ...args),
        ui: (...args) => api.debug('UI', ...args)
    };

    init();
    return api;
})();

window.Logger = Logger;
