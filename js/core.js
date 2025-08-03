// ===== CORE.JS - Базовая инфраструктура =====
// Константы, API клиент, базовые UI функции

// --- ГЛОБАЛЬНЫЕ КОНСТАНТЫ ДЛЯ СЕЛЕКТОРОВ И ENDPOINTS ---
window.SELECTORS = {
    // Страницы
    PAGES: {
        MAPPINGS: 'mappings-page',
        REQUESTS: 'requests-page',
        SCENARIOS: 'scenarios-page',
        'IMPORT-EXPORT': 'import-export-page',
        RECORDING: 'recording-page',
        SETTINGS: 'settings-page'
    },
    
    // Фильтры Request Log
    REQUEST_FILTERS: {
        METHOD: 'req-filter-method',
        STATUS: 'req-filter-status',
        URL: 'req-filter-url',
        DATE_FROM: 'req-filter-from',
        DATE_TO: 'req-filter-to',
        QUICK: 'req-filter-quick',
        SINCE: 'req-filter-since'
    },
    
    // Фильтры Mappings
    MAPPING_FILTERS: {
        METHOD: 'filter-method',
        URL: 'filter-url',
        STATUS: 'filter-status'
    },
    
    // Списки данных
    LISTS: {
        MAPPINGS: 'mappings-list',
        REQUESTS: 'requests-list',
        SCENARIOS: 'scenarios-list'
    },
    
    // Пустые состояния
    EMPTY: {
        MAPPINGS: 'mappings-empty',
        REQUESTS: 'requests-empty'
    },
    
    // UI элементы
    UI: {
        STATS: 'stats',
        SEARCH_FILTERS: 'search-filters',
        UPTIME: 'uptime'
    },
    
    // Загрузочные состояния
    LOADING: {
        MAPPINGS: 'mappings-loading',
        REQUESTS: 'requests-loading'
    },
    
    // Счетчики
    COUNTERS: {
        MAPPINGS: 'mappings-count',
        REQUESTS: 'requests-count'
    },
    
    // Подключение
    CONNECTION: {
        SETUP: 'connection-setup',
        HOST: 'wiremock-host',
        PORT: 'wiremock-port',
        CONNECT_BTN: 'connect-btn',
        STATUS_DOT: 'status-dot',
        STATUS_TEXT: 'status-text',
        UPTIME: 'uptime'
    },
    
    // Модальное окно
    MODAL: {
        FORM: 'mapping-form',
        ID: 'mapping-id',
        TITLE: 'modal-title'
    },
    
    // Поля формы (для совместимости с тестами)
    FORM_FIELDS: {
        METHOD: 'mapping-method',
        URL: 'mapping-url',
        STATUS: 'mapping-status',
        HEADERS: 'mapping-headers',
        BODY: 'mapping-body',
        PRIORITY: 'mapping-priority',
        NAME: 'mapping-name'
    },
    
    // Кнопки
    BUTTONS: {
        ADD_MAPPING: 'add-mapping-btn',
        START_RECORDING: 'start-recording-btn'
    },
    
    // Запись
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
    
    // Настройки
    SETTINGS: {
        HOST: 'settings-host',
        PORT: 'settings-port',
        TIMEOUT: 'settings-timeout',
        AUTO_REFRESH: 'auto-refresh',
        THEME: 'theme-select',
        AUTH_HEADER: 'auth-header'
    },
    
    // Импорт/Экспорт
    IMPORT: {
        FILE: 'import-file',
        DISPLAY: 'file-display',
        ACTIONS: 'import-actions',
        RESULT: 'import-result'
    },
    
    EXPORT: {
        FORMAT: 'export-format'
    },
    
    // Статистика
    STATS: {
        TOTAL_MAPPINGS: 'total-mappings',
        TOTAL_REQUESTS: 'total-requests'
    },
    
    // Здоровье
    HEALTH: {
        INDICATOR: 'health-indicator'
    },
    

};

window.ENDPOINTS = {
    // Базовые endpoints
    HEALTH: '/health',
    MAPPINGS: '/mappings',
    MAPPINGS_RESET: '/mappings/reset',
    MAPPINGS_SAVE: '/mappings/save',
    MAPPINGS_IMPORT: '/mappings/import',
    MAPPINGS_FIND_BY_METADATA: '/mappings/find-by-metadata',
    MAPPINGS_REMOVE_BY_METADATA: '/mappings/remove-by-metadata',
    MAPPINGS_UNMATCHED: '/mappings/unmatched', // Новый в 3.13.x
    
    // Requests endpoints
    REQUESTS: '/requests',
    REQUESTS_RESET: '/requests/reset', // DEPRECATED
    REQUESTS_COUNT: '/requests/count', // POST метод!
    REQUESTS_REMOVE: '/requests/remove',
    REQUESTS_FIND: '/requests/find', // POST метод
    REQUESTS_UNMATCHED: '/requests/unmatched',
    REQUESTS_UNMATCHED_NEAR_MISSES: '/requests/unmatched/near-misses',
    
    // Near Misses endpoints (исправлено)
    NEAR_MISSES_REQUEST: '/near-misses/request', // POST метод
    NEAR_MISSES_PATTERN: '/near-misses/request-pattern', // POST метод
    
    // Recordings endpoints (исправлено)
    RECORDINGS_START: '/recordings/start', // POST метод
    RECORDINGS_STOP: '/recordings/stop', // POST метод
    RECORDINGS_STATUS: '/recordings/status', // GET метод
    RECORDINGS_SNAPSHOT: '/recordings/snapshot', // POST метод
    
    // Scenarios endpoints
    SCENARIOS: '/scenarios',
    SCENARIOS_RESET: '/scenarios/reset',
    SCENARIOS_SET_STATE: '/scenarios/set-state',
    
    // System endpoints
    SETTINGS: '/settings',
    SHUTDOWN: '/shutdown'
};

// --- ГЛОБАЛЬНОЕ СОСТОЯНИЕ ---
let wiremockBaseUrl = '';
let requestTimeout = 5000;
let authHeader = ''; // Authorization header for all API requests
window.authHeader = authHeader; // Make globally accessible
window.startTime = null; // Make globally accessible for uptime tracking
window.uptimeInterval = null; // Make globally accessible for uptime tracking
let autoRefreshInterval = null;

// Глобальные переменные для features
window.allMappings = [];
window.allRequests = [];
window.allScenarios = [];
window.isRecording = false;
window.recordedCount = 0;

// --- API-КЛИЕНТ С ТАЙМАУТОМ ---
window.apiFetch = async (endpoint, options = {}) => {
    const controller = new AbortController();
    const currentTimeout = window.requestTimeout || 5000; // fallback to 5 seconds
    const timeoutId = setTimeout(() => controller.abort(), currentTimeout);
    
    // Always use the latest wiremockBaseUrl from window object
    const fullUrl = `${window.wiremockBaseUrl}${endpoint}`;
    const method = options.method || 'GET';
    
    // Prepare headers with auth header if available
    const headers = {
        'Content-Type': 'application/json',
        ...(window.authHeader && { 'Authorization': window.authHeader }),
        ...options.headers
    };
    
    // Log every API request for debugging
    console.log(`🔗 WireMock API Request:`, {
        method,
        url: fullUrl,
        baseUrl: window.wiremockBaseUrl,
        endpoint,
        headers: headers,
        authHeaderValue: window.authHeader,
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

// --- БАЗОВЫЕ UI ФУНКЦИИ ---

// NOTE: Uptime functions (updateUptime, stopUptime) have been moved to features.js
// to provide a single source of truth for uptime logic and avoid conflicts.

// Навигация по страницам
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

// Модальные окна
window.showModal = (modalId) => {
    // Безопасная очистка формы
    const formElement = document.getElementById(SELECTORS.MODAL.FORM);
    const idElement = document.getElementById(SELECTORS.MODAL.ID);
    const titleElement = document.getElementById(SELECTORS.MODAL.TITLE);
    
    if (formElement) formElement.reset();
    if (idElement) idElement.value = '';
    if (titleElement) titleElement.textContent = 'Add New Mapping';
    
    // Безопасное отображение модального окна
    const modalElement = document.getElementById(`${modalId}-modal`);
    if (modalElement) {
        modalElement.style.display = 'flex';
    } else {
        console.warn(`Modal element not found: ${modalId}-modal`);
        // Попробуем найти элемент без суффикса -modal
        const alternativeModal = document.getElementById(modalId);
        if (alternativeModal) {
            alternativeModal.style.display = 'flex';
        } else {
            console.warn(`Alternative modal element not found: ${modalId}`);
        }
    }
};

// Управление вкладками
window.showTab = (tabName, button) => {
    // Скрываем все табы
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Убираем активность с кнопок
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Показываем нужный таб и активируем кнопку
    document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    button.classList.add('active');
};

// Устаревшая функция для совместимости
window.showMessage = (text, type = 'info') => {
    if (window.NotificationManager) {
        NotificationManager.show(text, type);
    }
};

// --- THEME FUNCTIONS ---
window.toggleTheme = () => {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    body.setAttribute('data-theme', newTheme);
    
    // Update theme icon
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        themeIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    }
    
    // Save theme preference
    localStorage.setItem('theme', newTheme);
    
    showMessage(`Switched to ${newTheme} theme`, 'success');
};

window.changeTheme = () => {
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        const selectedTheme = themeSelect.value;
        const body = document.body;
        
        if (selectedTheme === 'auto') {
            // Use system preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const theme = prefersDark ? 'dark' : 'light';
            body.setAttribute('data-theme', theme);
        } else {
            body.setAttribute('data-theme', selectedTheme);
        }
        
        // Update theme icon
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            const currentTheme = body.getAttribute('data-theme');
            themeIcon.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
        }
        
        // Save theme preference
        localStorage.setItem('theme', selectedTheme);
        
        showMessage(`Theme changed to ${selectedTheme}`, 'success');
    }
};

// Initialize theme on load
window.initializeTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const body = document.body;
    
    if (savedTheme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = prefersDark ? 'dark' : 'light';
        body.setAttribute('data-theme', theme);
    } else {
        body.setAttribute('data-theme', savedTheme);
    }
    
    // Update theme icon
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        const currentTheme = body.getAttribute('data-theme');
        themeIcon.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
    }
    
    // Update theme select if it exists
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.value = savedTheme;
    }
};

// --- MODAL FUNCTIONS ---
window.showModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        
        // Focus first input in modal
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    } else {
        console.warn(`Modal with ID '${modalId}' not found`);
    }
};

window.hideModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        
        // Reset form if it exists
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
        }
    } else {
        console.warn(`Modal with ID '${modalId}' not found`);
    }
};

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.add('hidden');
        e.target.style.display = 'none';
        
        // Reset form if it exists
        const form = e.target.querySelector('form');
        if (form) {
            form.reset();
        }
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const visibleModal = document.querySelector('.modal:not(.hidden)');
        if (visibleModal) {
            visibleModal.classList.add('hidden');
            visibleModal.style.display = 'none';
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

console.log('✅ Core.js loaded - Constants, API client, basic UI functions');
