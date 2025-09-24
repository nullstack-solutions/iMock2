'use strict';

// ===== FEATURES.JS - Бизнес-функции =====
// Все основные функции приложения: mappings, requests, scenarios, recording, import/export, settings
// Updated: 2025-09-22 - Added missing HTML compatibility functions

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ (используем window для межмодульного доступа) ---
// Переменные определены в core.js

// Хранилище оригинальных данных (не изменяется при фильтрации)
window.originalMappings = []; // Полный список маппингов с сервера
window.allMappings = []; // Текущий отображаемый список (может быть отфильтрован)
window.originalRequests = []; // Полный список запросов с сервера
window.allRequests = []; // Текущий отображаемый список запросов (может быть отфильтрован)

// Reliable deletion tracking system
window.pendingDeletedIds = new Set(); // Track items pending deletion to prevent cache flicker
window.deletionTimeouts = new Map(); // Track cleanup timeouts for safety

// Ensure only one heavy /mappings request is in-flight at a time
let mappingsFetchPromise = null;

async function fetchMappingsFromServer({ force = false } = {}) {
    if (!force && mappingsFetchPromise) {
        return mappingsFetchPromise;
    }

    if (force && mappingsFetchPromise) {
        try {
            await mappingsFetchPromise;
        } catch (error) {
            console.warn('fetchMappingsFromServer: previous request failed, starting a new one', error);
        }
    }

    const requestPromise = (async () => {
        try {
            return await apiFetch(ENDPOINTS.MAPPINGS);
        } finally {
            if (mappingsFetchPromise === requestPromise) {
                mappingsFetchPromise = null;
            }
        }
    })();

    mappingsFetchPromise = requestPromise;
    return requestPromise;
}

// === УЛУЧШЕННЫЙ МЕХАНИЗМ КЕШИРОВАНИЯ ===

// Оптимизированная система отслеживания изменений
window.cacheManager = {
    // Основной кеш данных
    cache: new Map(),

    // Очередь optimistic updates с TTL (теперь массив для коалесинга)
    optimisticQueue: [],

    // Настройки TTL для optimistic updates (30 секунд по умолчанию)
    optimisticTTL: 30000,

    // Счетчик версий для отслеживания изменений
    version: 0,

    // Флаг синхронизации
    isSyncing: false,

    // Инициализация
    init() {
        // Периодическая очистка устаревших optimistic updates
        setInterval(() => this.cleanupStaleOptimisticUpdates(), 5000);

        // Периодическая синхронизация с сервером
        setInterval(() => this.syncWithServer(), 60000);
    },

    // Добавление optimistic update (упрощенная версия)
    addOptimisticUpdate(m, op) {
        const id = m?.id || m?.uuid;
        if (!id) return;

        // Простая логика - сервер всегда источник правды
        this.optimisticQueue.push({ id, op, payload: m, ts: Date.now() });
        console.log(`🎯 [CACHE] Added optimistic update: ${id}, operation: ${op}`);
    },

    // Удаление optimistic update после подтверждения от сервера
    confirmOptimisticUpdate(id) {
        const i = this.optimisticQueue.findIndex(x => x.id === id);
        if (i >= 0) {
            console.log(`✅ [CACHE] Confirmed optimistic update: ${id}`);
            this.optimisticQueue.splice(i, 1);
        }
    },

    // Удаление устаревших optimistic updates
    cleanupStaleOptimisticUpdates() {
        const now = Date.now();
        const initialLength = this.optimisticQueue.length;
        this.optimisticQueue = this.optimisticQueue.filter(item => {
            if (now - item.ts > this.optimisticTTL) {
                console.log(`🧹 [CACHE] Removing stale optimistic update: ${item.id}`);
                return false;
            }
            return true;
        });

        const removedCount = initialLength - this.optimisticQueue.length;
        if (removedCount > 0) {
            console.log(`🧹 [CACHE] Cleaned ${removedCount} stale optimistic updates`);
            // Запускаем обновление UI если были удалены устаревшие updates
            this.rebuildCache();
        }
    },

    // Удаление конкретного optimistic update
    removeOptimisticUpdate(id) {
        const i = this.optimisticQueue.findIndex(x => x.id === id);
        if (i >= 0) {
            console.log(`🗑️ [CACHE] Removing optimistic update: ${id}`);
            this.optimisticQueue.splice(i, 1);
        }
    },

    // Полная перестройка кеша
    async rebuildCache() {
        if (this.isSyncing) {
            console.log('⏳ [CACHE] Already syncing, skipping rebuild');
            return;
        }

        this.isSyncing = true;
        console.log('🔄 [CACHE] Starting cache rebuild');

        try {
            // Получаем свежие данные с сервера
            const response = await fetchMappingsFromServer({ force: true });
            const serverMappings = response.mappings || [];

            // Очищаем старый кеш
            this.cache.clear();

            // Заполняем кеш данными с сервера
            serverMappings.forEach(mapping => {
                const id = mapping.id || mapping.uuid;
                if (id && !isImockCacheMapping(mapping)) {
                    this.cache.set(id, mapping);
                }
            });

            // Применяем optimistic updates поверх серверных данных
            for (const item of this.optimisticQueue) {
                if (item.op === 'delete') {
                    this.cache.delete(item.id);
                } else {
                    this.cache.set(item.id, item.payload);
                }
            }

            // Обновляем глобальные массивы
            window.originalMappings = Array.from(this.cache.values());
            window.allMappings = [...window.originalMappings];

            console.log(`✅ [CACHE] Rebuild complete: ${this.cache.size} mappings`);

            // Обновляем UI
            if (typeof window.fetchAndRenderMappings === 'function') {
                window.fetchAndRenderMappings(window.allMappings);
            }

        } catch (error) {
            console.error('❌ [CACHE] Rebuild failed:', error);
        } finally {
            this.isSyncing = false;
        }
    },

    // Синхронизация с сервером
    async syncWithServer() {
        if (this.optimisticQueue.length === 0) {
            console.log('✨ [CACHE] No optimistic updates to sync');
            return;
        }

        console.log(`🔄 [CACHE] Syncing ${this.optimisticQueue.length} optimistic updates`);
        await this.rebuildCache();
    },

    // Получение маппинга из кеша
    getMapping(id) {
        return this.cache.get(id);
    },

    // Проверка наличия маппинга
    hasMapping(id) {
        return this.cache.has(id);
    },

    // Очистка всего кеша
    clear() {
        this.cache.clear();
        this.optimisticQueue.length = 0;
        this.version = 0;
        console.log('🧹 [CACHE] Cache cleared');
    }
};

// Инициализация менеджера кеша
window.cacheManager.init();

// --- ОСНОВНЫЕ ФУНКЦИИ ПРИЛОЖЕНИЯ ---

// Улучшенная функция подключения к WireMock серверу с правильной логикой uptime
window.connectToWireMock = async () => {
    // Try main page elements first, then fallback to settings page elements
    const hostInput = document.getElementById('wiremock-host') || document.getElementById(SELECTORS.CONNECTION.HOST);
    const portInput = document.getElementById('wiremock-port') || document.getElementById(SELECTORS.CONNECTION.PORT);
    
    if (!hostInput || !portInput) {
        console.error('Connection input elements not found');
        NotificationManager.error('Ошибка: не найдены поля подключения');
        return;
    }
    
    const host = hostInput.value.trim() || 'localhost';
    const port = portInput.value.trim() || '8080';
    
    // DON'T save connection settings here - they should already be saved from Settings page
    // Only use these values for the current connection attempt
    console.log('🔗 Connecting with:', { host, port });
    
    // Обновляем базовый URL (с корректной нормализацией схемы/порта)
    if (typeof window.normalizeWiremockBaseUrl === 'function') {
        window.wiremockBaseUrl = window.normalizeWiremockBaseUrl(host, port);
    } else {
        // Фолбэк на старое поведение (на случай, если порядок загрузки скриптов изменен)
        const hasScheme = /^(https?:)\/\//i.test(host);
        const scheme = hasScheme ? host.split(':')[0] : 'http';
        const cleanHost = hasScheme ? host.replace(/^(https?:)\/\//i, '') : host;
        const finalPort = (port && String(port).trim()) || (scheme === 'https' ? '443' : '8080');
        window.wiremockBaseUrl = `${scheme}://${cleanHost}:${finalPort}/__admin`;
    }
    
    try {
        let renderSource = 'unknown';
        // Первый health check - здесь начинается uptime
        await checkHealthAndStartUptime();
        
        // Обновляем UI после успешного подключения
        const statusDot = document.getElementById(SELECTORS.CONNECTION.STATUS_DOT);
        const statusText = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
        const setupDiv = document.getElementById(SELECTORS.CONNECTION.SETUP);
        const addButton = document.getElementById(SELECTORS.BUTTONS.ADD_MAPPING);
        
        if (statusDot) statusDot.className = 'status-dot connected';
        if (statusText) { if (!window.lastWiremockSuccess) { window.lastWiremockSuccess = Date.now(); } if (typeof window.updateLastSuccessUI === 'function') { window.updateLastSuccessUI(); } }
        if (setupDiv) setupDiv.style.display = 'none';
        if (addButton) addButton.disabled = false;
        
        // Показываем статистику и фильтры
        const statsElement = document.getElementById(SELECTORS.UI.STATS);
        const filtersElement = document.getElementById(SELECTORS.UI.SEARCH_FILTERS);
        if (statsElement) statsElement.style.display = 'flex';
        if (filtersElement) filtersElement.style.display = 'block';
        
        // Запускаем периодический health check
        startHealthMonitoring();
        
        // Загружаем данные параллельно с учетом Cache Service
        const useCache = (JSON.parse(localStorage.getItem('wiremock-settings') || '{}').cacheEnabled) === true
            || !!document.getElementById('cache-enabled')?.checked;
        await Promise.all([
            fetchAndRenderMappings(null, { useCache }),
            fetchAndRenderRequests()
        ]);
        
        NotificationManager.success('Подключение к WireMock установлено!');
        
    } catch (error) {
        console.error('Connection error:', error);
        NotificationManager.error(`Ошибка подключения: ${error.message}`);
        
        // Останавливаем uptime при ошибке
        stopUptime();
        
        // Сбрасываем состояние подключения
        const statusDot = document.getElementById(SELECTORS.CONNECTION.STATUS_DOT);
        const statusText = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
        if (statusDot) statusDot.className = 'status-dot disconnected';
        if (statusText) statusText.textContent = 'Disconnected';
    }
};

// Health monitoring и uptime система
let healthCheckInterval = null;

// Функция первого health check и запуска uptime
window.checkHealthAndStartUptime = async () => {
    try {
        // Измеряем время отклика
        const startTime = performance.now();
        let responseTime = 0;
        let isHealthy = false;

        // Пытаемся сначала обратиться к /health (WireMock 3.x), затем делаем фолбэк к /mappings (совместимо с 2.x)
        try {
            const response = await apiFetch(ENDPOINTS.HEALTH);
            responseTime = Math.round(performance.now() - startTime);
            isHealthy = typeof response === 'object' && (
                (typeof response.status === 'string' && ['up','healthy','ok'].includes(response.status.toLowerCase())) ||
                response.healthy === true
            );
            console.log('[HEALTH] initial check:', { rawStatus: response?.status, healthyFlag: response?.healthy, isHealthy });
        } catch (primaryError) {
            // Фолбэк: проверяем доступность основных API через /mappings
            const fallback = await fetchMappingsFromServer();
            responseTime = Math.round(performance.now() - startTime);
            // Если ответ JSON-объект (ожидаемо у WireMock), считаем здоровым
            isHealthy = typeof fallback === 'object';
        }

        if (isHealthy) {
            // Запускаем uptime только при успешном health check
            window.startTime = Date.now();
            if (window.uptimeInterval) clearInterval(window.uptimeInterval);
            window.uptimeInterval = setInterval(updateUptime, 1000);
            // Unified health UI update (fallback below keeps old DOM path)
            if (typeof window.applyHealthUI === 'function') {
                try { window.applyHealthUI(true, responseTime); } catch (e) { console.warn('applyHealthUI failed:', e); }
            }
            
            // Обновляем health indicator с временем отклика
            // Unified health UI (fallback DOM update remains below)
            if (typeof window.applyHealthUI === 'function') {
                try { window.applyHealthUI(isHealthy, isHealthy ? responseTime : null); } catch (e) { console.warn('applyHealthUI failed:', e); }
            }
            const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
            if (healthIndicator) {
                healthIndicator.style.display = 'inline';
                healthIndicator.innerHTML = `<span>Response Time: </span><span class="healthy">${responseTime}ms</span>`;
            }
            
            console.log(`✅ WireMock health check passed (${responseTime}ms), uptime started`);
        } else {
            throw new Error('WireMock is not healthy');
        }
    } catch (error) {
        console.error('Health check failed:', error);
        throw error;
    }
};

// Функция периодического мониторинга health
window.startHealthMonitoring = () => {
    // Очищаем предыдущий интервал если есть
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
    }
    
    // Проверяем health каждые 30 секунд
    healthCheckInterval = setInterval(async () => {
        try {
            const startTime = performance.now();
            let responseTime = 0;
            let isHealthyNow = false;

            try {
                const healthResponse = await apiFetch(ENDPOINTS.HEALTH);
                responseTime = Math.round(performance.now() - startTime);
                isHealthyNow = typeof healthResponse === 'object' && (
                    (typeof healthResponse.status === 'string' && ['up','healthy','ok'].includes(healthResponse.status.toLowerCase())) ||
                    healthResponse.healthy === true
                );
                console.log('[HEALTH] periodic check:', { rawStatus: healthResponse?.status, healthyFlag: healthResponse?.healthy, isHealthyNow });
            } catch (primaryError) {
                // Фолбэк на /mappings
                const fallback = await fetchMappingsFromServer();
                responseTime = Math.round(performance.now() - startTime);
                isHealthyNow = typeof fallback === 'object';
            }

            const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
            if (healthIndicator) {
                if (isHealthyNow) {
                    healthIndicator.innerHTML = `<span>Response Time: </span><span class="healthy">${responseTime}ms</span>`;
                } else {
                    healthIndicator.innerHTML = `<span>Response Time: </span><span class="unhealthy">Unhealthy</span>`;
                    // Останавливаем uptime при первом неудачном health check
                    stopUptime();
                    clearInterval(healthCheckInterval);
                    NotificationManager.warning('WireMock health check failed, uptime stopped');
                }
            }
        } catch (error) {
            console.error('Health monitoring failed:', error);
            // Останавливаем uptime при ошибке health check
            const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
            if (typeof window.applyHealthUI === 'function') {
                try { window.applyHealthUI(null, null); } catch {}
            } else if (healthIndicator) {
                healthIndicator.innerHTML = `<span>Response Time: </span><span class="error">Error</span>`;
            }
            stopUptime();
            clearInterval(healthCheckInterval);
            NotificationManager.error('Health monitoring failed, uptime stopped');
        }
    }, 30000); // 30 секунд
};

// ===== UPTIME FUNCTIONS =====

window.updateUptime = function() {
    if (!window.startTime) return;
    const uptimeSeconds = Math.floor((Date.now() - window.startTime) / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    const uptimeElement = document.getElementById('uptime');
    if (uptimeElement) {
        if (hours > 0) {
            uptimeElement.textContent = `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            uptimeElement.textContent = `${minutes}m ${seconds}s`;
        } else {
            uptimeElement.textContent = `${seconds}s`;
        }
    }
};

window.stopUptime = function() {
    if (window.uptimeInterval) {
        clearInterval(window.uptimeInterval);
        window.uptimeInterval = null;
    }
    window.startTime = null;
    const uptimeElement = document.getElementById('uptime');
    if (uptimeElement) {
        uptimeElement.textContent = '0s';
    }
};


// --- КОМПАКТНЫЕ УТИЛИТЫ (сокращено с ~80 до 20 строк) ---

const Utils = {
    escapeHtml: (unsafe) => typeof unsafe !== 'string' ? String(unsafe) : 
        unsafe.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]),
    
    formatJson: (obj, fallback = 'Invalid JSON', maxLength = 1000) => {
        try { 
            const jsonString = JSON.stringify(obj, null, 2);
            if (jsonString.length > maxLength) {
                return jsonString.substring(0, maxLength) + '\n... (truncated - ' + (jsonString.length - maxLength) + ' more characters)';
            }
            return jsonString;
        } 
        catch { return fallback; }
    },
    
    parseRequestTime: (date) => {
        if (!date) return new Date().toLocaleString('ru-RU');
        try {
            const d = new Date(typeof date === 'number' ? (date > 1e12 ? date : date * 1000) : date);
            return isNaN(d.getTime()) ? `Invalid: ${date}` : d.toLocaleString('ru-RU');
        } catch { return `Invalid: ${date}`; }
    },
    
    getStatusClass: (status) => {
        const code = parseInt(status) || 0;
        if (code >= 200 && code < 300) return 'success';
        if (code >= 300 && code < 400) return 'redirect';
        if (code >= 400 && code < 500) return 'client-error';
        if (code >= 500) return 'server-error';
        return 'unknown';
    }
};

// Обратная совместимость для существующего кода
const escapeHtml = Utils.escapeHtml;
const formatJson = Utils.formatJson;
const parseRequestTime = Utils.parseRequestTime;
const getStatusClass = Utils.getStatusClass;

// --- УНИВЕРСАЛЬНЫЕ UI КОМПОНЕНТЫ (сократить ~100 строк дублирования) ---

const UIComponents = {
    // Базовый компонент карточки - заменяет renderMappingCard и renderRequestCard
    createCard: (type, data, actions = []) => {
        const { id, method, url, status, name, time, extras = {} } = data;
        return `
            <div class="${type}-card" data-id="${Utils.escapeHtml(id)}">
                <div class="${type}-header" onclick="window.toggleDetails('${Utils.escapeHtml(id)}', '${type}')">
                    <div class="${type}-info">
                        <div class="${type}-top-line">
                            <span class="method-badge ${method.toLowerCase()}">
                                <span class="collapse-arrow" id="arrow-${Utils.escapeHtml(id)}">▶</span> ${method}
                            </span>
                            ${name ? `<span class="${type}-name">${Utils.escapeHtml(name)}</span>` : ''}
                            ${time ? `<span class="${type}-time">${time}</span>` : ''}
                        </div>
                        <div class="${type}-url-line">
                            <span class="status-badge ${Utils.getStatusClass(status)}">${status}</span>
                            <span class="${type}-url">${Utils.escapeHtml(url)}</span>
                            ${extras.badges || ''}
                        </div>
                    </div>
                    <div class="${type}-actions" onclick="event.stopPropagation()">
                        ${actions.map(action => `
                            <button class="btn btn-sm btn-${action.class}"
                                    onclick="${action.handler}('${Utils.escapeHtml(id)}')"
                                    title="${Utils.escapeHtml(action.title)}">${action.icon}</button>
                        `).join('')}
                    </div>
                </div>
                <div class="${type}-preview" id="preview-${Utils.escapeHtml(id)}" style="display: none;">
                    ${extras.preview || ''}
                </div>
            </div>`;
    },
    
    createPreviewSection: (title, items) => `
        <div class="preview-section">
            <h4>${title}</h4>
            ${Object.entries(items).map(([key, value]) => {
                if (!value) return '';
                
                if (typeof value === 'object') {
                    const jsonString = JSON.stringify(value);
                    // For large objects, show a summary and lazy load full content
                    if (jsonString.length > 500) {
                        const preview = Utils.formatJson(value, 'Invalid JSON', 200);
                        const fullId = `full-${Math.random().toString(36).substr(2, 9)}`;
                        return `<div class="preview-value">
                            <strong>${key}:</strong>
                            <pre>${preview}</pre>
                            <button class="btn btn-secondary btn-small" onclick="toggleFullContent('${fullId}')" data-json="${Utils.escapeHtml(JSON.stringify(value))}" style="margin-top: 0.5rem; font-size: 0.8rem;">
                                Show Full Content
                            </button>
                            <div id="${fullId}" style="display: none;"></div>
                        </div>`;
                    } else {
                        return `<div class="preview-value"><strong>${key}:</strong><pre>${Utils.formatJson(value)}</pre></div>`;
                    }
                } else {
                    // Check if the string value is JSON and format it accordingly
                    if (typeof value === 'string' && value.trim().startsWith('{') && value.trim().endsWith('}')) {
                        try {
                            const parsedJson = JSON.parse(value);
                            const jsonString = JSON.stringify(parsedJson);
                            // For large JSON strings, show a summary and lazy load full content
                            if (jsonString.length > 500) {
                                const preview = Utils.formatJson(parsedJson, 'Invalid JSON', 200);
                                const fullId = `full-${Math.random().toString(36).substr(2, 9)}`;
                                return `<div class="preview-value">
                                    <strong>${key}:</strong>
                                    <pre>${preview}</pre>
                                    <button class="btn btn-secondary btn-small" onclick="toggleFullContent('${fullId}')" data-json="${Utils.escapeHtml(JSON.stringify(parsedJson))}" style="margin-top: 0.5rem; font-size: 0.8rem;">
                                        Show Full Content
                                    </button>
                                    <div id="${fullId}" style="display: none;"></div>
                                </div>`;
                            } else {
                                return `<div class="preview-value"><strong>${key}:</strong><pre>${Utils.formatJson(parsedJson)}</pre></div>`;
                            }
                        } catch (e) {
                            // If JSON parsing fails, treat as regular string but still use pre for better formatting
                            return `<div class="preview-value"><strong>${key}:</strong><pre>${Utils.escapeHtml(value)}</pre></div>`;
                        }
                    } else {
                        return `<div class="preview-value"><strong>${key}:</strong> ${value}</div>`;
                    }
                }
            }).join('')}
        </div>`,
    
    toggleDetails: (id, type) => {
        const preview = document.getElementById(`preview-${id}`);
        const arrow = document.getElementById(`arrow-${id}`);
        if (preview && arrow) {
            const isHidden = preview.style.display === 'none';
            preview.style.display = isHidden ? 'block' : 'none';
            arrow.textContent = isHidden ? '▼' : '▶';
        }
    },
    
    toggleFullContent: (elementId) => {
        const element = document.getElementById(elementId);
        const button = element.previousElementSibling;
        
        if (element.style.display === 'none') {
            // Show full content
            try {
                const jsonData = button.getAttribute('data-json');
                const parsedData = JSON.parse(jsonData);
                element.innerHTML = `<pre style="max-height: 300px; overflow-y: auto; background: var(--bg-tertiary); padding: 1rem; border-radius: var(--radius-sm); margin-top: 0.5rem;">${Utils.escapeHtml(JSON.stringify(parsedData, null, 2))}</pre>`;
                element.style.display = 'block';
                button.textContent = 'Hide Full Content';
            } catch (e) {
                element.innerHTML = `<div class="preview-value warning">Error parsing JSON: ${Utils.escapeHtml(e.message)}</div>`;
                element.style.display = 'block';
                button.textContent = 'Hide';
            }
        } else {
            // Hide full content
            element.style.display = 'none';
            button.textContent = 'Show Full Content';
        }
    }
};

// Make UIComponents functions globally accessible for HTML onclick handlers
window.toggleFullContent = UIComponents.toggleFullContent;
window.toggleDetails = UIComponents.toggleDetails;

// --- ЗАГРУЗКА И ОТОБРАЖЕНИЕ ДАННЫХ ---

// Компактная функция загрузки маппингов (временно возвращена старая версия до создания DataManager)
window.fetchAndRenderMappings = async (mappingsToRender = null, options = {}) => {
    const container = document.getElementById(SELECTORS.LISTS.MAPPINGS);
    const emptyState = document.getElementById(SELECTORS.EMPTY.MAPPINGS);
    const loadingState = document.getElementById(SELECTORS.LOADING.MAPPINGS);

    if (!container || !emptyState || !loadingState) {
        console.error('Required DOM elements not found for mappings rendering');
        return;
    }

    let renderSource = 'unknown';

    try {
        if (mappingsToRender === null) {
            loadingState.classList.remove('hidden');
            container.style.display = 'none';
            emptyState.classList.add('hidden');
            
            let data;
            let dataSource = 'direct';
            if (options && options.useCache) {
                const cached = await loadImockCacheBestOf3();
                if (cached && cached.data && Array.isArray(cached.data.mappings)) {
                    // Cache hit - use cached data for quick UI, but always fetch fresh data for complete info
                    console.log('🧩 [CACHE] Cache hit - using cached data for quick start, fetching fresh data');
                    dataSource = 'cache';

                    // Start async fresh fetch for complete data (only if no optimistic updates in progress)
                    (async () => {
                        try {
                            // Wait a bit for any optimistic updates to complete
                            await new Promise(resolve => setTimeout(resolve, 200));

                            const freshData = await fetchMappingsFromServer({ force: true });
                            if (freshData && freshData.mappings) {
                                const serverMappings = freshData.mappings.filter(x => !isImockCacheMapping(x));

                                // Create a map of current optimistic mappings for preservation
                                const currentIds = new Set(window.allMappings.map(m => m.id || m.uuid));
                                const serverIds = new Set(serverMappings.map(m => m.id || m.uuid));

                                // Merge strategy: combine server data with optimistic state
                                // 1. Start with all server mappings (authoritative source)
                                // 2. Update existing ones with full server data
                                // 3. Keep optimistic creations that aren't on server yet
                                // 4. Remove optimistic deletions

                                const mergedMappings = [];

                                // Add all server mappings first (they have full data)
                                serverMappings.forEach(serverMapping => {
                                    const serverId = serverMapping.id || serverMapping.uuid;

                                    // Check if this server mapping was optimistically deleted
                                    const optimisticItem = window.cacheManager.optimisticQueue.find(x => x.id === serverId);
                                    const isOptimisticallyDeleted = optimisticItem && optimisticItem.op === 'delete';

                                    if (!isOptimisticallyDeleted) {
                                        mergedMappings.push(serverMapping);
                                    }
                                });

                                // Add optimistic creations (mappings that exist locally but not on server)
                                window.allMappings.forEach(currentMapping => {
                                    const currentId = currentMapping.id || currentMapping.uuid;

                                    // If this mapping doesn't exist on server, it's an optimistic creation
                                    const existsOnServer = serverIds.has(currentId);
                                    if (!existsOnServer) {
                                        mergedMappings.push(currentMapping);
                                    }
                                });

                                // Update with merged data
                                window.allMappings = mergedMappings;
                                window.originalMappings = [...mergedMappings];
                                syncCacheWithMappings(window.originalMappings);

                                // Re-render UI with merged complete data
                                fetchAndRenderMappings(window.allMappings);
                            }
                        } catch (e) {
                            console.warn('🧩 [CACHE] Failed to load fresh data:', e);
                        }
                    })();

                    // Use cached slim data for immediate UI (will be replaced by fresh data)
                    data = cached.data;
                } else {
                    data = await fetchMappingsFromServer({ force: true });
                    dataSource = 'direct';
                    // regenerate cache asynchronously
                    try { console.log('🧩 [CACHE] Async regenerate after cache miss'); regenerateImockCache(); } catch {}
                }
            } else {
                data = await fetchMappingsFromServer({ force: true });
                dataSource = 'direct';
            }
            // If we fetched a full admin list, strip service cache mapping from UI
            let incoming = data.mappings || [];

            // Server data is now authoritative - optimistic updates are handled through UI updates only
            if (window.cacheManager.optimisticQueue.length > 0) {
                console.log('🎯 [OPTIMISTIC] Applying optimistic updates to incoming data:', window.cacheManager.optimisticQueue.length, 'updates');

                incoming = incoming.map(serverMapping => {
                    const optimisticItem = window.cacheManager.optimisticQueue.find(x => x.id === (serverMapping.id || serverMapping.uuid));
                    if (optimisticItem) {
                        if (optimisticItem.op === 'delete') {
                            console.log('🎯 [OPTIMISTIC] Removing deleted mapping from results:', serverMapping.id);
                            return null; // Mark for removal
                        }
                        // Use optimistic version
                        console.log('🎯 [OPTIMISTIC] Using optimistic version for:', serverMapping.id);
                        return optimisticItem.payload;
                    }
                    return serverMapping;
                }).filter(m => m !== null); // Remove deleted mappings

                // Add any new optimistic mappings that weren't on server
                window.cacheManager.optimisticQueue.forEach(item => {
                    if (item.op !== 'delete' && !incoming.some(m => (m.id || m.uuid) === item.id)) {
                        console.log('🎯 [OPTIMISTIC] Adding new optimistic mapping:', item.id);
                        incoming.unshift(item.payload);
                    }
                });
            }

            // Hide any items marked as pending-deleted to avoid stale cache flicker
            try {
                if (window.pendingDeletedIds && window.pendingDeletedIds.size > 0) {
                    const before = incoming.length;
                    incoming = incoming.filter(m => !window.pendingDeletedIds.has(m.id || m.uuid));
                    if (before !== incoming.length) console.log('🧩 [CACHE] filtered pending-deleted from render:', before - incoming.length);
                }
            } catch {}
            window.originalMappings = Array.isArray(incoming) ? incoming.filter(m => !isImockCacheMapping(m)) : [];
            syncCacheWithMappings(window.originalMappings);
            window.allMappings = [...window.originalMappings];
            // Update data source indicator in UI
            updateDataSourceIndicator(dataSource);
            renderSource = dataSource;
        } else {
            window.allMappings = mappingsToRender;
            renderSource = 'custom';
        }
        
        loadingState.classList.add('hidden');
        
        if (window.allMappings.length === 0) {
            emptyState.classList.remove('hidden');
            container.style.display = 'none';
            updateMappingsCounter();
            return;
        }
        
        emptyState.classList.add('hidden');
        container.style.display = 'block';
        
        // Invalidate cache before re-rendering to ensure fresh DOM references
        window.invalidateElementCache(SELECTORS.LISTS.MAPPINGS);

        // Сортировка маппингов
        const sortedMappings = [...window.allMappings].sort((a, b) => {
            const priorityA = a.priority || 1;
            const priorityB = b.priority || 1;
            if (priorityA !== priorityB) return priorityA - priorityB;
            
            const methodOrder = { 'GET': 1, 'POST': 2, 'PUT': 3, 'PATCH': 4, 'DELETE': 5 };
            const methodA = methodOrder[a.request?.method] || 999;
            const methodB = methodOrder[b.request?.method] || 999;
            if (methodA !== methodB) return methodA - methodB;
            
            const urlA = a.request?.url || a.request?.urlPattern || a.request?.urlPath || '';
            const urlB = b.request?.url || b.request?.urlPattern || b.request?.urlPath || '';
            return urlA.localeCompare(urlB);
        });
        console.log(`📦 Mappings render from: ${renderSource} — ${sortedMappings.length} items`);
        container.innerHTML = sortedMappings.map(mapping => renderMappingCard(mapping)).join('');
        updateMappingsCounter();
        // Reapply mapping filters if any are active, preserving user's view
        try {
            const hasFilters = (document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value || '')
                || (document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value || '')
                || (document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value || '');
            if (hasFilters && typeof FilterManager !== 'undefined' && FilterManager.applyMappingFilters) {
                FilterManager.applyMappingFilters();
                console.log('[FILTERS] Mapping filters re-applied after refresh');
                try { NotificationManager && NotificationManager.show('Filters applied', NotificationManager.TYPES.INFO, 1200); } catch {}
            }
        } catch {}
        
    } catch (error) {
        console.error('Error in fetchAndRenderMappings:', error);
        NotificationManager.error(`Ошибка загрузки маппингов: ${error.message}`);
        loadingState.classList.add('hidden');
        emptyState.classList.remove('hidden');
        container.style.display = 'none';
    }
};

// Function to get a specific mapping by ID
window.getMappingById = async (mappingId) => {
    try {
        if (!mappingId) {
            throw new Error('Mapping ID is required');
        }

        console.log(`📥 [getMappingById] Fetching mapping with ID: ${mappingId}`);
        console.log(`📥 [getMappingById] Current wiremockBaseUrl:`, window.wiremockBaseUrl);
        console.log(`📥 [getMappingById] window.allMappings available:`, Array.isArray(window.allMappings));
        console.log(`📥 [getMappingById] Cache size:`, window.allMappings?.length || 0);

        // Try to get from cache first
        const cachedMapping = window.allMappings?.find(m => m.id === mappingId);
        if (cachedMapping) {
            console.log(`📦 [getMappingById] Found mapping in cache: ${mappingId}`, cachedMapping);
            return cachedMapping;
        } else {
            console.log(`📦 [getMappingById] Mapping not found in cache, will fetch from API`);
        }

        // Fetch from WireMock API
        console.log(`📡 [getMappingById] Making API call to: /mappings/${mappingId}`);
        const response = await apiFetch(`/mappings/${mappingId}`);
        console.log(`📡 [getMappingById] Raw API response:`, response);

        // Handle both wrapped and unwrapped responses
        const mapping = response && typeof response === 'object' && response.mapping
            ? response.mapping
            : response;

        console.log(`📡 [getMappingById] Processed mapping:`, mapping);

        if (!mapping || typeof mapping !== 'object') {
            console.log(`❌ [getMappingById] API returned invalid data for mapping ${mappingId}`);
            throw new Error(`Mapping with ID ${mappingId} not found or invalid response`);
        }

        console.log(`✅ [getMappingById] Successfully fetched mapping: ${mappingId}`, mapping);
        return mapping;

    } catch (error) {
        console.error(`❌ [getMappingById] Error fetching mapping ${mappingId}:`, error);
        console.error(`❌ [getMappingById] Error details:`, {
            message: error.message,
            status: error.status,
            statusText: error.statusText,
            url: `${window.wiremockBaseUrl}/mappings/${mappingId}`
        });
        throw error;
    }
};

// Обновленная функция applyOptimisticMappingUpdate
window.applyOptimisticMappingUpdate = (mappingLike) => {
    try {
        if (!mappingLike) {
            console.warn('🎯 [OPTIMISTIC] No mapping data provided');
            return;
        }

        const mapping = mappingLike.mapping || mappingLike;
        const mappingId = mapping?.id || mapping?.uuid;
        if (!mapping || !mappingId) {
            console.warn('🎯 [OPTIMISTIC] Invalid mapping data - missing id:', mapping);
            return;
        }

        // Проверяем, не является ли это служебным маппингом кеша
        if (isImockCacheMapping(mapping)) {
            console.log('🎯 [OPTIMISTIC] Skipping cache mapping update');
            return;
        }

        const cacheAvailable = window.cacheManager && window.cacheManager.cache instanceof Map;
        const optimisticOperation = cacheAvailable && window.cacheManager.cache.has(mappingId) ? 'update' : 'create';


        // Use updateOptimisticCache if available, otherwise fallback to legacy/manual logic
        if (typeof updateOptimisticCache === 'function') {
            updateOptimisticCache(mapping, optimisticOperation, { queueMode: 'add' });
        } else {
            // Fallback to legacy direct mutation if the new helper is unavailable
            if (cacheAvailable) {
                if (typeof window.cacheManager?.addOptimisticUpdate === 'function') {
                    try {
                        window.cacheManager.addOptimisticUpdate(mapping, optimisticOperation);
                    } catch (queueError) {
                        console.warn('🎯 [OPTIMISTIC] Failed to enqueue optimistic update:', queueError);
                    }
                }
                seedCacheFromGlobals(window.cacheManager.cache);
                const incoming = cloneMappingForCache(mapping);
                if (!incoming) {
                    console.warn('🎯 [OPTIMISTIC] Failed to clone mapping for cache:', mappingId);
                } else {
                    if (!incoming.id && mappingId) {
                        incoming.id = mappingId;
                    }
                    if (!incoming.uuid && (mapping.uuid || mappingId)) {
                        incoming.uuid = mapping.uuid || mappingId;
                    }

                    if (window.cacheManager.cache.has(mappingId)) {
                        const merged = mergeMappingData(window.cacheManager.cache.get(mappingId), incoming);
                        window.cacheManager.cache.set(mappingId, merged);
                    } else {
                        window.cacheManager.cache.set(mappingId, incoming);
                    }
                }
            }

            window.cacheLastUpdate = Date.now();
            refreshMappingsFromCache();
        }

        console.log('🎯 [OPTIMISTIC] Applied update for mapping:', mappingId);

    } catch (e) {
        console.warn('🎯 [OPTIMISTIC] Update failed:', e);
    }
};

// Refresh mappings in background and then re-render without jank
window.backgroundRefreshMappings = async (useCache = false) => {
    try {
        let data;
        let source = 'direct';
        if (useCache) {
            const cached = await loadImockCacheBestOf3();
            if (cached && cached.data && Array.isArray(cached.data.mappings)) {
                data = cached.data;
                source = 'cache';
            } else {
                data = await fetchMappingsFromServer({ force: true });
                source = 'direct';
            }
        } else {
            data = await fetchMappingsFromServer({ force: true });
            source = 'direct';
        }
        const incoming = data.mappings || [];
        window.originalMappings = Array.isArray(incoming) ? incoming.filter(m => !isImockCacheMapping(m)) : [];
        syncCacheWithMappings(window.originalMappings);
        window.allMappings = [...window.originalMappings];
        updateDataSourceIndicator(source);
        // re-render without loading state
        fetchAndRenderMappings(window.allMappings);
    } catch (e) {
        console.warn('Background refresh failed:', e);
    }
};

// Компактная функция рендеринга маппинга через UIComponents (сокращено с ~67 до 15 строк)
window.renderMappingCard = function(mapping) {
    if (!mapping || !mapping.id) {
        console.warn('Invalid mapping data:', mapping);
        return '';
    }
    
    const actions = [
        { class: 'secondary', handler: 'editMapping', title: 'Edit in Editor', icon: '📝' },
        { class: 'primary', handler: 'openEditModal', title: 'Редактировать', icon: '✏️' },
        { class: 'danger', handler: 'deleteMapping', title: 'Удалить', icon: '🗑️' }
    ];
    
    const data = {
        id: mapping.id,
        method: mapping.request?.method || 'GET',
        url: mapping.request?.urlPath || mapping.request?.urlPathPattern || mapping.request?.urlPattern || mapping.request?.url || 'N/A',
        status: mapping.response?.status || 200,
        name: mapping.name || mapping.metadata?.name || `Mapping ${mapping.id.substring(0, 8)}`,
        extras: {
            preview: UIComponents.createPreviewSection('📥 Request', {
                'Method': mapping.request?.method || 'GET',
                'URL': mapping.request?.url || mapping.request?.urlPattern || mapping.request?.urlPath || mapping.request?.urlPathPattern,
                'Headers': mapping.request?.headers,
                'Body': mapping.request?.bodyPatterns || mapping.request?.body,
                'Query Parameters': mapping.request?.queryParameters
            }) + UIComponents.createPreviewSection('📤 Response', {
                'Status': mapping.response?.status,
                'Headers': mapping.response?.headers,
                'Body': mapping.response?.jsonBody || mapping.response?.body,
                'Delay': mapping.response?.fixedDelayMilliseconds ? `${mapping.response.fixedDelayMilliseconds}ms` : null
            }) + UIComponents.createPreviewSection('Overview', {
                'ID': mapping.id || mapping.uuid,
                'Name': mapping.name || mapping.metadata?.name,
                'Priority': mapping.priority,
                'Persistent': mapping.persistent,
                'Scenario': mapping.scenarioName,
                'Required State': mapping.requiredScenarioState,
                'New State': mapping.newScenarioState,
            'Created': (window.showMetaTimestamps !== false && mapping.metadata?.created) ? new Date(mapping.metadata.created).toLocaleString() : null,
            'Edited': (window.showMetaTimestamps !== false && mapping.metadata?.edited) ? new Date(mapping.metadata.edited).toLocaleString() : null,
            'Source': mapping.metadata?.source ? `Edited from ${mapping.metadata.source}` : null,
            })
            ,
            badges: [
                (mapping.id || mapping.uuid) ? `<span class="badge badge-secondary" title="Mapping ID">${Utils.escapeHtml(((mapping.id || mapping.uuid).length > 12 ? (mapping.id || mapping.uuid).slice(0,8) + '…' + (mapping.id || mapping.uuid).slice(-4) : (mapping.id || mapping.uuid)))}</span>` : '',
                (typeof mapping.priority === 'number') ? `<span class="badge badge-secondary" title="Priority">P${mapping.priority}</span>` : '',
                (mapping.scenarioName) ? `<span class="badge badge-secondary" title="Scenario">${Utils.escapeHtml(mapping.scenarioName)}</span>` : '',
                (window.showMetaTimestamps !== false && mapping.metadata?.created) ? `<span class="badge badge-secondary" title="Created">C: ${new Date(mapping.metadata.created).toLocaleString()}</span>` : '',
                (window.showMetaTimestamps !== false && mapping.metadata?.edited) ? `<span class="badge badge-secondary" title="Edited">E: ${new Date(mapping.metadata.edited).toLocaleString()}</span>` : '',
                (mapping.metadata?.source) ? `<span class="badge badge-info" title="Last edited from">${mapping.metadata.source.toUpperCase()}</span>` : ''
            ].filter(Boolean).join(' ')
        }
    };
    
    return UIComponents.createCard('mapping', data, actions);
}

// Обновляем счетчик маппингов
window.updateMappingsCounter = function() {
    const counter = document.getElementById(SELECTORS.COUNTERS.MAPPINGS);
    if (counter) {
        counter.textContent = window.allMappings.length;
    }
}

// Обновление UI-индикатора источника данных (cache/remote/direct)
function updateDataSourceIndicator(source) {
    const el = document.getElementById('data-source-indicator');
    if (!el) return;
    let text = 'Source: direct';
    let cls = 'badge badge-secondary';
    switch (source) {
        case 'cache':
            text = 'Source: cache';
            cls = 'badge badge-success';
            break;
        case 'cache_rebuilding':
            text = 'Source: cache (rebuilding…)';
            cls = 'badge badge-success';
            break;
        case 'remote':
            text = 'Source: remote';
            cls = 'badge badge-warning';
            break;
        case 'remote_error':
            text = 'Source: remote (error/CORS)';
            cls = 'badge badge-danger';
            break;
        default:
            text = 'Source: direct';
            cls = 'badge badge-secondary';
    }
    el.textContent = text;
    el.className = cls;
}

// Requests data source indicator (symmetry with mappings)
function updateRequestsSourceIndicator(source) {
    const el = document.getElementById('requests-source-indicator');
    if (!el) return;
    let text = 'Requests: direct';
    let cls = 'badge badge-secondary';
    switch (source) {
        case 'custom':
            text = 'Requests: custom';
            cls = 'badge badge-secondary';
            break;
        case 'remote':
            text = 'Requests: remote';
            cls = 'badge badge-warning';
            break;
        case 'remote_error':
            text = 'Requests: remote (error/CORS)';
            cls = 'badge badge-danger';
            break;
        default:
            text = 'Requests: direct';
            cls = 'badge badge-secondary';
    }
    el.textContent = text;
    el.className = cls;
}

// Компактные функции переключения деталей через UIComponents
window.toggleMappingDetails = (mappingId) => UIComponents.toggleDetails(mappingId, 'mapping');
window.toggleRequestDetails = (requestId) => UIComponents.toggleDetails(requestId, 'request');

// Компактная функция загрузки запросов (временно возвращена старая версия до создания DataManager)
window.fetchAndRenderRequests = async (requestsToRender = null) => {
    const container = document.getElementById(SELECTORS.LISTS.REQUESTS);
    const emptyState = document.getElementById(SELECTORS.EMPTY.REQUESTS);
    const loadingState = document.getElementById(SELECTORS.LOADING.REQUESTS);
    
    if (!container || !emptyState || !loadingState) {
        console.error('Required DOM elements not found for requests rendering');
        return;
    }
    
    try {
        let reqSource = 'direct';
        if (requestsToRender === null) {
            loadingState.classList.remove('hidden');
            container.style.display = 'none';
            emptyState.classList.add('hidden');
            
            const data = await apiFetch(ENDPOINTS.REQUESTS);
            window.originalRequests = data.requests || [];
            window.allRequests = [...window.originalRequests];
        } else {
            window.allRequests = requestsToRender;
            reqSource = 'custom';
        }
        
        loadingState.classList.add('hidden');
        
        if (window.allRequests.length === 0) {
            emptyState.classList.remove('hidden');
            container.style.display = 'none';
            updateRequestsCounter();
            return;
        }
        
        emptyState.classList.add('hidden');
        container.style.display = 'block';

        // Invalidate cache before re-rendering to ensure fresh DOM references
        window.invalidateElementCache(SELECTORS.LISTS.REQUESTS);

        container.innerHTML = window.allRequests.map(request => renderRequestCard(request)).join('');
        updateRequestsCounter();
        // Source indicator + log, mirroring mappings
        if (typeof updateRequestsSourceIndicator === 'function') updateRequestsSourceIndicator(reqSource);
        console.log(`📦 Requests render from: ${reqSource} — ${window.allRequests.length} items`);
        
    } catch (error) {
        console.error('Error in fetchAndRenderRequests:', error);
        NotificationManager.error(`Ошибка загрузки запросов: ${error.message}`);
        loadingState.classList.add('hidden');
        emptyState.classList.remove('hidden');
        container.style.display = 'none';
    }
};

// Компактная функция рендеринга запроса через UIComponents (сокращено с ~62 до 18 строк)
window.renderRequestCard = function(request) {
    if (!request) {
        console.warn('Invalid request data:', request);
        return '';
    }
    
    const matched = request.wasMatched !== false;
    const clientIp = request.request?.clientIp || 'Unknown';
    
    const data = {
        id: request.id || '',
        method: request.request?.method || 'GET',
        url: request.request?.url || request.request?.urlPath || 'N/A',
        status: request.responseDefinition?.status || (matched ? 200 : 404),
        time: `${Utils.parseRequestTime(request.request.loggedDate)} <span class="request-ip">IP: ${Utils.escapeHtml(clientIp)}</span>`,
        extras: {
            badges: `
                ${matched ? '<span class="badge badge-success">✓ Matched</span>' : 
                          '<span class="badge badge-danger">❌ Unmatched</span>'}
            `,
            preview: UIComponents.createPreviewSection('📥 Request', {
                'Method': request.request?.method,
                'URL': request.request?.url || request.request?.urlPath,
                'Client IP': clientIp,
                'Headers': request.request?.headers,
                'Body': request.request?.body
            }) + UIComponents.createPreviewSection('📤 Response', {
                'Status': request.responseDefinition?.status,
                'Matched': matched ? 'Yes' : 'No',
                'Headers': request.responseDefinition?.headers,
                'Body': request.responseDefinition?.jsonBody || request.responseDefinition?.body
            })
        }
    };
    
    return UIComponents.createCard('request', data, []);
}

// Обновляем счетчик запросов
function updateRequestsCounter() {
    const counter = document.getElementById(SELECTORS.COUNTERS.REQUESTS);
    if (counter) {
        counter.textContent = window.allRequests.length;
    }
}

// --- ОБРАБОТЧИКИ ДЕЙСТВИЙ (удалена дублированная connectToWireMock) ---

window.openEditModal = async (id) => {
    // Безопасная проверка наличия маппингов
    if (!window.allMappings || !Array.isArray(window.allMappings)) {
        NotificationManager.show('Маппинги не загружены', NotificationManager.TYPES.ERROR);
        return;
    }
    
    const mapping = window.allMappings.find(m => m.id === id);
    if (!mapping) {
        NotificationManager.show('Маппинг не найден', NotificationManager.TYPES.ERROR);
        return;
    }
    
    // Показываем модальное окно сначала
    if (typeof window.showModal === 'function') {
        window.showModal('edit-mapping-modal');
    } else {
        console.warn('showModal function not found');
        return;
    }
    
    console.log('🔴 [OPEN MODAL DEBUG] openEditModal called for mapping ID:', id);
    console.log('🔴 [OPEN MODAL DEBUG] Found mapping (cached):', mapping);
    
    // Сначала заполняем форму кэшированной версией, чтобы UI отобразился сразу
    if (typeof window.populateEditMappingForm === 'function') {
        window.populateEditMappingForm(mapping);
    } else {
        console.error('populateEditMappingForm function not found!');
        return;
    }
    
    // Затем пытаемся получить самую свежую версию маппинга по UUID
    try {
        const latest = await apiFetch(`/mappings/${id}`);
        const latestMapping = latest?.mapping || latest; // поддержка разных форматов ответа
        if (latestMapping && latestMapping.id) {
            console.log('🔵 [OPEN MODAL DEBUG] Loaded latest mapping from server:', latestMapping);
            window.populateEditMappingForm(latestMapping);
            // Обновим ссылку в allMappings, чтобы список и дальнейшие операции были консистентны
            const idx = window.allMappings.findIndex(m => m.id === id);
            if (idx !== -1) window.allMappings[idx] = latestMapping;
        } else {
            console.warn('Latest mapping response has unexpected shape, keeping cached version.', latest);
        }
    } catch (e) {
        console.warn('Failed to load latest mapping, using cached version.', e);
    }
    
    // Обновляем заголовок модального окна
    const modalTitleElement = document.getElementById(SELECTORS.MODAL.TITLE);
    if (modalTitleElement) modalTitleElement.textContent = 'Edit Mapping';
    
    console.log('🔴 [OPEN MODAL DEBUG] openEditModal completed for mapping ID:', id);
};

// REMOVED: updateMapping function moved to editor.js

window.deleteMapping = async (id) => {
    if (!confirm('Удалить этот маппинг?')) return;

    try {
        // API call FIRST
        await apiFetch(`/mappings/${id}`, { method: 'DELETE' });

        NotificationManager.success('Маппинг удален!');

        // Update cache and UI with server confirmation
        updateOptimisticCache({ id }, 'delete');

    } catch (e) {
        // Если ошибка 404, маппинг уже удален
        if (e.message.includes('404')) {
            console.log('🗑️ [DELETE] Mapping already deleted from server (404), updating cache locally');
            updateOptimisticCache({ id }, 'delete');
            NotificationManager.success('Маппинг уже был удален');
        } else {
            NotificationManager.error(`Ошибка удаления: ${e.message}`);
        }
    }
};

window.clearRequests = async () => {
    if (!confirm('Очистить все запросы?')) return;
    
    try {
        await apiFetch('/requests', { method: 'DELETE' });
        NotificationManager.success('Запросы очищены!');
        await fetchAndRenderRequests();
    } catch (e) {
        NotificationManager.error(`Ошибка очистки: ${e.message}`);
    }
};

// --- УДАЛЕНО: дублированная функция applyFilters (используется FilterManager) ---

// --- УНИВЕРСАЛЬНЫЙ МЕНЕДЖЕР ФИЛЬТРАЦИИ (устранить дублирование ~90 строк) ---


// Компактные функции фильтрации через FilterManager
window.applyFilters = () => FilterManager.applyMappingFilters();
window.clearMappingFilters = () => {
    document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD).value = '';
    document.getElementById(SELECTORS.MAPPING_FILTERS.URL).value = '';
    document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS).value = '';
    FilterManager.applyMappingFilters();
};
window.applyRequestFilters = () => FilterManager.applyRequestFilters();

// Quick filter function for preset time ranges
window.applyQuickFilter = () => {
    const quickFilterEl = document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK);
    if (!quickFilterEl) return;
    
    const value = quickFilterEl.value;
    if (!value) {
        // Clear time range if no quick filter selected
        const dateFromEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
        const dateToEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
        if (dateFromEl) dateFromEl.value = '';
        if (dateToEl) dateToEl.value = '';
        FilterManager.applyRequestFilters();
        return;
    }
    
    const now = new Date();
    const fromTime = new Date(now);
    
    // Parse the quick filter value (e.g., "5m", "1h", "3d")
    const match = value.match(/^(\d+)([mhd])$/);
    if (!match) return;
    
    const amount = parseInt(match[1]);
    const unit = match[2];
    
    // Calculate the "from" time based on the unit
    switch (unit) {
        case 'm': // minutes
            fromTime.setMinutes(fromTime.getMinutes() - amount);
            break;
        case 'h': // hours
            fromTime.setHours(fromTime.getHours() - amount);
            break;
        case 'd': // days
            fromTime.setDate(fromTime.getDate() - amount);
            break;
        default:
            return;
    }
    
    // Format dates for datetime-local input (YYYY-MM-DDTHH:MM)
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    // Set the time range inputs
    const dateFromEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    
    if (dateFromEl) dateFromEl.value = formatDateTime(fromTime);
    if (dateToEl) dateToEl.value = formatDateTime(now);
    
    // Apply the filters
    FilterManager.applyRequestFilters();
};

// Clear quick filter selection (used when custom time range is set)
window.clearQuickFilter = () => {
    const quickEl = document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK);
    if (quickEl) quickEl.value = '';
};
window.clearRequestFilters = () => {
    // Clear existing filters with safe access
    const methodEl = document.getElementById(SELECTORS.REQUEST_FILTERS.METHOD);
    const urlEl = document.getElementById(SELECTORS.REQUEST_FILTERS.URL);
    const statusEl = document.getElementById(SELECTORS.REQUEST_FILTERS.STATUS);
    const dateFromEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    const quickEl = document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK);
    
    if (methodEl) methodEl.value = '';
    if (urlEl) urlEl.value = '';
    if (statusEl) statusEl.value = '';
    if (dateFromEl) dateFromEl.value = '';
    if (dateToEl) dateToEl.value = '';
    if (quickEl) quickEl.value = ''; // Reset quick filter selection
    
    FilterManager.applyRequestFilters();
};

// --- ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ УПРАВЛЕНИЯ ---

// Устаревшие функции-обертки (оставлены для совместимости с HTML)
window.clearFilters = () => {
    window.clearMappingFilters();
};

window.refreshRequests = async () => {
    await fetchAndRenderRequests();
    // Применяем фильтры автоматически после обновления
    const hasActiveFilters = document.getElementById(SELECTORS.REQUEST_FILTERS.METHOD)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.URL)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.STATUS)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO)?.value;
    
    if (hasActiveFilters) {
        FilterManager.applyRequestFilters();
        console.log('[FILTERS] Request filters re-applied after refresh');
        try { NotificationManager && NotificationManager.show('Filters applied', NotificationManager.TYPES.INFO, 1200); } catch {}
    }
};

// Функция быстрого применения временного фильтра (исправлено для Request Log)
window.applyQuickTimeFilter = () => {
    // Устанавливаем фильтр на последние 24 часа
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Исправлено: используем правильные селекторы для Request Log
    const dateFromInput = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToInput = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    
    // Format dates for datetime-local input (YYYY-MM-DDTHH:MM)
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    if (dateFromInput) {
        dateFromInput.value = formatDateTime(yesterday);
    }
    if (dateToInput) {
        dateToInput.value = formatDateTime(now);
    }
    
    // Применяем фильтры
    FilterManager.applyRequestFilters();
};

// --- ОЧИСТКА РЕСУРСОВ ---

// Очистка незакрытых таймаутов при навигации
window.cleanupPendingDeletions = () => {
    for (const [id, timeout] of window.deletionTimeouts) {
        clearTimeout(timeout);
    }
    window.deletionTimeouts.clear();
    window.pendingDeletedIds.clear();
};

// Вызывать при закрытии страницы
window.addEventListener('beforeunload', window.cleanupPendingDeletions);

// --- ПРЕВЬЮ ---

window.togglePreview = (mappingId) => {
    const preview = document.getElementById(`preview-${mappingId}`);
    if (preview.style.display === 'none') {
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
};

window.toggleRequestPreview = (requestId) => {
    const preview = document.getElementById(`request-preview-${requestId}`);
    if (preview.style.display === 'none') {
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
};

// --- СЦЕНАРИИ ---

window.loadScenarios = async () => {
    try {
        const data = await apiFetch(ENDPOINTS.SCENARIOS);
        allScenarios = data.scenarios || [];
        renderScenarios();
    } catch (e) {
        console.error('Load scenarios error:', e);
    }
};

window.refreshScenarios = async () => {
    await TabManager.refresh('scenarios');
};

window.resetAllScenarios = async () => {
    if (!confirm('Сбросить все сценарии в начальное состояние?')) return;
    
    try {
        await apiFetch('/scenarios/reset', { method: 'POST' });
        NotificationManager.success('Все сценарии сброшены!');
        await loadScenarios();
    } catch (e) {
        NotificationManager.error(`Ошибка сброса сценариев: ${e.message}`);
    }
};

window.setScenarioState = async (scenarioName, newState) => {
    try {
        await apiFetch('/scenarios/set-state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scenarioName: scenarioName,
                newState: newState
            })
        });
        
        NotificationManager.success(`Сценарий "${scenarioName}" переведен в состояние "${newState}"`);
        await loadScenarios();
    } catch (e) {
        console.error('Change scenario state error:', e);
        NotificationManager.error(`Ошибка изменения состояния сценария: ${e.message}`);
    }
};

window.renderScenarios = () => {
    const container = document.getElementById(SELECTORS.LISTS.SCENARIOS);
    
    if (allScenarios.length === 0) {
        container.innerHTML = '<div class="loading-message">Сценарии не найдены</div>';
        return;
    }
    
    container.innerHTML = allScenarios.map(scenario => `
        <div class="scenario-item">
            <div class="scenario-header">
                <div class="scenario-name">${scenario.name}</div>
                <div class="scenario-state">${scenario.state || 'Started'}</div>
            </div>
            <div class="scenario-info">
                <div class="scenario-description">${scenario.description || 'No description'}</div>
            </div>
            <div class="scenario-actions">
                ${(scenario.possibleStates || []).map(state => 
                    state !== scenario.state ? 
                    `<button class="btn btn-sm btn-secondary" onclick="setScenarioState('${scenario.name}', '${state}')">
                        → ${state}
                    </button>` : ''
                ).join('')}
                <button class="btn btn-sm btn-danger" onclick="setScenarioState('${scenario.name}', 'Started')">
                    🔄 Reset
                </button>
            </div>
        </div>
    `).join('');
};

// --- ИСПРАВЛЕННЫЕ ФУНКЦИИ ДЛЯ WIREMOCK 3.9.1+ API ---

// Исправленная функция подсчета запросов (требует POST с JSON)
window.getRequestCount = async (criteria = {}) => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_COUNT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(criteria)
        });
        return response.count || 0;
    } catch (error) {
        console.error('Request count error:', error);
        NotificationManager.error(`Ошибка подсчета запросов: ${error.message}`);
        return 0;
    }
};

// Новая функция поиска запросов
window.findRequests = async (criteria) => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_FIND, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(criteria)
        });
        return response.requests || [];
    } catch (error) {
        console.error('Find requests error:', error);
        NotificationManager.error(`Ошибка поиска запросов: ${error.message}`);
        return [];
    }
};

// Получение несопоставленных запросов
window.getUnmatchedRequests = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_UNMATCHED);
        return response.requests || [];
    } catch (error) {
        console.error('Unmatched requests error:', error);
        return [];
    }
};

// --- ИСПРАВЛЕННЫЕ ФУНКЦИИ ЗАПИСИ ---

// Начать запись
window.startRecording = async (config = {}) => {
    try {
        const defaultConfig = {
            targetBaseUrl: 'https://example.com',
            filters: {
                urlPathPatterns: ['.*'],
                method: 'ANY',
                headers: {}
            },
            captureHeaders: {},
            requestBodyPattern: {},
            persist: true,
            repeatsAsScenarios: false,
            transformers: ['response-template'],
            transformerParameters: {}
        };
        
        const recordingConfig = { ...defaultConfig, ...config };
        
        await apiFetch(ENDPOINTS.RECORDINGS_START, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recordingConfig)
        });
        
        NotificationManager.success('Запись начата!');
        window.isRecording = true;
        
        // Обновляем UI
        const indicator = document.getElementById(SELECTORS.RECORDING.INDICATOR);
        if (indicator) indicator.style.display = 'block';
        
    } catch (error) {
        console.error('Start recording error:', error);
        NotificationManager.error(`Ошибка начала записи: ${error.message}`);
    }
};

// Остановить запись
window.stopRecording = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_STOP, {
            method: 'POST'
        });
        
        window.isRecording = false;
        window.recordedCount = 0;
        
        // Обновляем UI
        const indicator = document.getElementById(SELECTORS.RECORDING.INDICATOR);
        if (indicator) indicator.style.display = 'none';
        
        const count = response.mappings ? response.mappings.length : 0;
        NotificationManager.success(`Запись остановлена! Записано ${count} маппингов`);
        
        // Обновляем список маппингов
        await fetchAndRenderMappings();
        
        return response.mappings || [];
    } catch (error) {
        console.error('Stop recording error:', error);
        NotificationManager.error(`Ошибка остановки записи: ${error.message}`);
        return [];
    }
};

// Получить статус записи
window.getRecordingStatus = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_STATUS);
        return response.status || 'Unknown';
    } catch (error) {
        console.error('Recording status error:', error);
        return 'Unknown';
    }
};

// Создать снимок записи
window.takeRecordingSnapshot = async (config = {}) => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_SNAPSHOT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const count = response.mappings ? response.mappings.length : 0;
        NotificationManager.success(`Снимок создан! Записано ${count} маппингов`);
        
        return response.mappings || [];
    } catch (error) {
        console.error('Recording snapshot error:', error);
        NotificationManager.error(`Ошибка создания снимка: ${error.message}`);
        return [];
    }
};

// --- ФУНКЦИИ NEAR MISSES ---

// Поиск близких совпадений для запроса
window.findNearMissesForRequest = async (request) => {
    try {
        const response = await apiFetch(ENDPOINTS.NEAR_MISSES_REQUEST, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for request error:', error);
        return [];
    }
};

// Поиск близких совпадений для паттерна
window.findNearMissesForPattern = async (pattern) => {
    try {
        const response = await apiFetch(ENDPOINTS.NEAR_MISSES_PATTERN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pattern)
        });
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for pattern error:', error);
        return [];
    }
};

// Получить близкие совпадения для несопоставленных запросов
window.getNearMissesForUnmatched = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_UNMATCHED_NEAR_MISSES);
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for unmatched error:', error);
        return [];
    }
};

// --- НОВЫЕ ФУНКЦИИ ДЛЯ WIREMOCK 3.13.x ---

// Получить неиспользуемые маппинги
window.getUnmatchedMappings = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.MAPPINGS_UNMATCHED);
        return response.mappings || [];
    } catch (error) {
        console.error('Unmatched mappings error:', error);
        return [];
    }
};

// Удалить неиспользуемые маппинги
window.removeUnmatchedMappings = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.MAPPINGS_UNMATCHED, {
            method: 'DELETE'
        });
        
        const count = response.mappings ? response.mappings.length : 0;
        NotificationManager.success(`Удалено ${count} неиспользуемых маппингов`);
        
        // Обновляем список маппингов
        await fetchAndRenderMappings();
        
        return response.mappings || [];
    } catch (error) {
        console.error('Remove unmatched mappings error:', error);
        NotificationManager.error(`Ошибка удаления неиспользуемых маппингов: ${error.message}`);
        return [];
    }
};

// Поиск маппингов по метаданным
window.findMappingsByMetadata = async (metadata) => {
    try {
        const response = await apiFetch(ENDPOINTS.MAPPINGS_FIND_BY_METADATA, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata)
        });
        return response.mappings || [];
    } catch (error) {
        console.error('Find mappings by metadata error:', error);
        return [];
    }
};

// Обновленная функция для обработки результатов редактирования
window.handleEditSuccess = async (mapping) => {
    const id = mapping.id || mapping.uuid;

    // Добавляем optimistic update
    window.cacheManager.addOptimisticUpdate(mapping, 'update');

    // Обновляем UI сразу
    window.applyOptimisticMappingUpdate(mapping);

    // Через небольшую задержку подтверждаем update
    setTimeout(() => {
        window.cacheManager.confirmOptimisticUpdate(id);
    }, 1000);
};

// Функция принудительной синхронизации (для кнопки Force Refresh)
window.forceRefreshCache = async () => {
    try {
        // Очищаем все optimistic updates
        window.cacheManager.optimisticQueue.length = 0;

        // Полная перестройка кеша
        await window.cacheManager.rebuildCache();

        NotificationManager.success('Кеш полностью обновлен!');
    } catch (error) {
        NotificationManager.error(`Ошибка обновления кеша: ${error.message}`);
    }
};

console.log('✅ Features.js loaded - Business functions for mappings, requests, scenarios + WireMock 3.9.1+ API fixes');

// Update connection status text with last successful request time
window.updateLastSuccessUI = () => {
    try {
        const el = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
        if (!el) return;
        const ts = window.lastWiremockSuccess || Date.now();
        const time = new Date(ts).toLocaleTimeString();
        el.textContent = `Last OK: ${time}`;
        console.log('[HEALTH] last success UI updated:', { ts, time });
    } catch (e) {
        // noop
    }
};

// Centralized health UI updater (single source of truth)
window.applyHealthUI = (isHealthy, responseTime) => {
    try {
        window.healthState = window.healthState || { isHealthy: null, lastCheckAt: null, lastOkAt: null, lastLatencyMs: null };
        window.healthState.lastCheckAt = Date.now();
        if (isHealthy === true) {
            window.healthState.isHealthy = true;
            window.healthState.lastOkAt = Date.now();
            window.healthState.lastLatencyMs = typeof responseTime === 'number' ? responseTime : null;
        } else if (isHealthy === false) {
            window.healthState.isHealthy = false;
            window.healthState.lastLatencyMs = null;
        } // null => error/unknown

        const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
        if (healthIndicator) {
            healthIndicator.style.display = 'inline';
            if (isHealthy === true) {
                const ms = typeof responseTime === 'number' ? `${responseTime}ms` : 'OK';
                healthIndicator.innerHTML = `<span>Response Time: </span><span class="healthy">${ms}</span>`;
            } else if (isHealthy === false) {
                healthIndicator.innerHTML = `<span>Response Time: </span><span class="unhealthy">Unhealthy</span>`;
            } else {
                healthIndicator.innerHTML = `<span>Response Time: </span><span class="error">Error</span>`;
            }
        }

        // Keep status text in sync (Last OK)
        if (isHealthy === true) {
            window.lastWiremockSuccess = Date.now();
            if (typeof window.updateLastSuccessUI === 'function') window.updateLastSuccessUI();
        }
    } catch (e) {
        console.warn('applyHealthUI failed:', e);
    }
};

// Central toggle for showing metadata timestamps on mapping cards
try {
    const savedToggle = localStorage.getItem('imock-show-meta-timestamps');
    if (savedToggle !== null) {
        window.showMetaTimestamps = savedToggle === '1';
    }
} catch {}
window.toggleMetaTimestamps = () => {
    try {
        window.showMetaTimestamps = window.showMetaTimestamps === false ? true : false;
        localStorage.setItem('imock-show-meta-timestamps', window.showMetaTimestamps ? '1' : '0');
        // Re-render current list without refetch
        if (Array.isArray(window.allMappings)) {
            fetchAndRenderMappings(window.allMappings);
        }
    } catch (e) { console.warn('toggleMetaTimestamps failed:', e); }
};

// --- iMock cache mapping helpers (best-of-3 discovery) ---
const IMOCK_CACHE_ID = '00000000-0000-0000-0000-00000000cace';
const IMOCK_CACHE_URL = '/__imock/cache';

function isImockCacheMapping(m) {
    try {
        const byId = (m?.id || m?.uuid) === IMOCK_CACHE_ID;
        const byMeta = m?.metadata?.imock?.type === 'cache';
        const byName = (m?.name || '').toLowerCase() === 'imock cache';
        const byUrl = (m?.request?.url || m?.request?.urlPath) === IMOCK_CACHE_URL;
        return !!(byId || byMeta || byName || byUrl);
    } catch { return false; }
}

function pickUrl(req) {
    return req?.urlPath || req?.urlPathPattern || req?.urlPattern || req?.url || 'N/A';
}

function slimMapping(m) {
    return {
        id: m.id || m.uuid,
        name: m.name || m.metadata?.name,
        priority: m.priority,
        persistent: m.persistent,
        scenarioName: m.scenarioName,
        requiredScenarioState: m.requiredScenarioState,
        newScenarioState: m.newScenarioState,
        request: {
            method: m.request?.method,
            url: pickUrl(m.request),
            // No headers/query params in cache - only essential matching data
        },
        // No response data, minimal metadata - essential for UI display
        metadata: {
            created: m.metadata?.created,
            edited: m.metadata?.edited,
            source: m.metadata?.source,
            // Essential metadata fields for timestamps and source tracking
        },
    };
}

function buildSlimList(arr) {
    const items = (arr || []).filter(x => !isImockCacheMapping(x)).map(slimMapping);
    return { mappings: items };
}

function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(16);
}

async function getCacheByFixedId() {
    try {
        console.log('🧩 [CACHE] Trying fixed ID lookup...');
        const m = await apiFetch(`/mappings/${IMOCK_CACHE_ID}`);
        if (m && isImockCacheMapping(m)) return m;
        console.log('🧩 [CACHE] Fixed ID miss');
    } catch {}
    return null;
}

async function getCacheByMetadata() {
    try {
        // WireMock 3 expects JSONPath on metadata
        const tryBodies = [
            { matchesJsonPath: "$[?(@.metadata.imock.type == 'cache')]" },
            { matchesJsonPath: { expression: "$[?(@.metadata.imock.type == 'cache')]" } },
        ];
        console.log('🧩 [CACHE] Trying metadata lookup (JSONPath)...');
        for (const body of tryBodies) {
            try {
                const res = await apiFetch(ENDPOINTS.MAPPINGS_FIND_BY_METADATA, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const list = res?.mappings || res?.items || [];
                const found = list.find(isImockCacheMapping);
                if (found) { console.log('🧩 [CACHE] Metadata hit'); return found; }
            } catch (e) {
                // try next body shape
            }
        }
        console.log('🧩 [CACHE] Metadata miss');
    } catch {}
    return null;
}

async function upsertImockCacheMapping(slim) {
    console.log('🧩 [CACHE] Upsert cache mapping start');
    const meta = {
        imock: {
            type: 'cache',
            version: 1,
            timestamp: Date.now(),
            count: (slim?.mappings || []).length,
            hash: simpleHash(JSON.stringify(slim || {})),
        },
    };
    const stub = {
        id: IMOCK_CACHE_ID,
        name: 'iMock Cache',
        priority: 1,
        persistent: false,
        request: { method: 'GET', url: IMOCK_CACHE_URL },
        response: {
            status: 200,
            jsonBody: slim,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
        },
        metadata: meta,
    };
    try {
        // Try update first; if 404, create
        console.log('🧩 [CACHE] PUT /mappings/{id}');
        const response = await apiFetch(`/mappings/${IMOCK_CACHE_ID}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stub),
        });
        console.log('🧩 [CACHE] Upsert done (PUT)');
        return response;
    } catch (e) {
        console.log('🧩 [CACHE] PUT failed, POST /mappings');
        const response = await apiFetch('/mappings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stub),
        });
        console.log('🧩 [CACHE] Upsert done (POST)');
        return response;
    }
}

async function regenerateImockCache(existingData = null) {
    console.log('🧩 [CACHE] Regenerate cache start');
    const t0 = performance.now();

    // Get fresh data from server - server is now the source of truth
    let all = existingData;
    if (!all) {
        all = await fetchMappingsFromServer({ force: true });
    }

    const mappings = all?.mappings || [];

    console.log('🧩 [CACHE] Using fresh server data for cache regeneration');

    const slim = buildSlimList(mappings);
    let finalPayload = slim;
    try {
        const response = await upsertImockCacheMapping(slim);
        const serverPayload = extractCacheJsonBody(response);
        if (serverPayload) {
            finalPayload = serverPayload;
        }
    } catch (e) {
        console.warn('🧩 [CACHE] Upsert cache failed:', e);
    }
    const dt = Math.round(performance.now() - t0);
    console.log(`🧩 [CACHE] Regenerate cache done (${(finalPayload?.mappings||[]).length} items) in ${dt}ms`);
    return finalPayload;
}

async function loadImockCacheBestOf3() {
    // Preferred order: fixed ID, then find-by-metadata (JSONPath), else none
    console.log('🧩 [CACHE] loadImockCacheBestOf3 start');
    const b = await getCacheByFixedId();
    if (b && b.response?.jsonBody) { console.log('🧩 [CACHE] Using cache: fixed id'); return { source: 'cache', data: b.response.jsonBody }; }
    const c = await getCacheByMetadata();
    if (c && c.response?.jsonBody) { console.log('🧩 [CACHE] Using cache: metadata'); return { source: 'cache', data: c.response.jsonBody }; }
    console.log('🧩 [CACHE] No cache found');
    return null;
}

// Resolve conflicts by querying the server for the authoritative version of a specific mapping
async function resolveConflictWithServer(mappingId) {
    try {
        console.log('🔍 [CONFLICT] Resolving conflict for', mappingId, 'with server query');

        // Query the specific mapping from server
        const serverResponse = await apiFetch(`/mappings/${mappingId}`);
        const serverMapping = serverResponse?.mapping || serverResponse;

        if (!serverMapping) {
            console.warn('🔍 [CONFLICT] Server returned no mapping for', mappingId);
            return null; // No authoritative data available
        }

        console.log('🔍 [CONFLICT] Server returned authoritative data for', mappingId);
        return serverMapping;

    } catch (error) {
        console.warn('🔍 [CONFLICT] Server query failed for', mappingId, error);
        return null; // Fall back to no resolution
    }
}

function cloneMappingForCache(mapping) {
    if (!mapping) return null;

    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(mapping);
        }
    } catch (error) {
        console.warn('structuredClone failed for mapping cache clone:', error);
    }

    try {
        return JSON.parse(JSON.stringify(mapping));
    } catch (error) {
        console.warn('JSON clone failed for mapping cache clone:', error);
    }

    return { ...mapping };
}

function mergeMappingData(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;

    return {
        ...existing,
        ...incoming,
        request: { ...existing.request, ...incoming.request },
        response: { ...existing.response, ...incoming.response },
        metadata: { ...existing.metadata, ...incoming.metadata }
    };
}
function seedCacheFromGlobals(cache) {
    try {
        if (!(cache instanceof Map)) {
            return;
        }

        const sources = [
            Array.isArray(window.originalMappings) ? window.originalMappings : null,
            Array.isArray(window.allMappings) ? window.allMappings : null,
        ];

        let seededFrom;
        for (const source of sources) {
            if (!source || source.length === 0) {
                continue;
            }

            let inserted = 0;
            for (const mapping of source) {
                if (!mapping || isImockCacheMapping(mapping)) {
                    continue;
                }

                const existingId = mapping.id || mapping.uuid;
                if (!existingId || cache.has(existingId)) {
                    continue;
                }

                const cloned = cloneMappingForCache(mapping) || { ...mapping };
                if (!cloned.id) {
                    cloned.id = existingId;
                }
                if (!cloned.uuid && (mapping.uuid || existingId)) {
                    cloned.uuid = mapping.uuid || existingId;
                }

                cache.set(existingId, cloned);
                inserted++;
            }

            if (inserted > 0) {
                seededFrom = source === window.originalMappings ? 'originalMappings' : 'allMappings';
                console.log(`🧩 [CACHE] Seeded ${inserted} mappings into cache from ${seededFrom}`);
                break;
            }
        }

        if (!seededFrom && cache.size === 0) {
            console.log('🧩 [CACHE] Nothing available to seed cache from globals');
        }
    } catch (error) {
        console.warn('seedCacheFromGlobals failed:', error);
    }
}

function syncCacheWithMappings(mappings) {
    try {
        const manager = window.cacheManager;
        if (!manager || !(manager.cache instanceof Map) || !Array.isArray(mappings)) {
            return;
        }

        const cache = manager.cache;
        const seenIds = new Set();

        mappings.forEach(mapping => {
            if (!mapping || isImockCacheMapping(mapping)) {
                return;
            }

            const id = mapping.id || mapping.uuid;
            if (!id) {
                return;
            }

            seenIds.add(id);

            const cloned = cloneMappingForCache(mapping) || { ...mapping };
            if (cache.has(id)) {
                cache.set(id, mergeMappingData(cache.get(id), cloned));
            } else {
                cache.set(id, cloned);
            }
        });

        const optimisticQueue = Array.isArray(manager.optimisticQueue) ? manager.optimisticQueue : [];
        const optimisticIds = new Set();
        for (const item of optimisticQueue) {
            if (!item || item.op === 'delete') {
                continue;
            }
            if (item.id) {
                optimisticIds.add(item.id);
            }
        }

        Array.from(cache.keys()).forEach(existingId => {
            if (!seenIds.has(existingId) && !optimisticIds.has(existingId)) {
                cache.delete(existingId);
            }
        });

        window.cacheLastUpdate = Date.now();
    } catch (error) {
        console.warn('syncCacheWithMappings failed:', error);
    }
}

function buildCacheSnapshot() {
    const manager = window.cacheManager;
    if (!manager || !(manager.cache instanceof Map)) {
        return [];
    }

    try {
        const snapshot = [];
        for (const mapping of manager.cache.values()) {
            if (!mapping || isImockCacheMapping(mapping)) {
                continue;
            }

            // Cache entries are stored as clones, but clone again defensively before
            // exposing them to global arrays to prevent accidental mutation leaks.
            const cloned = cloneMappingForCache(mapping) || { ...mapping };
            snapshot.push(cloned);
        }
        return snapshot;
    } catch (error) {
        console.warn('buildCacheSnapshot failed:', error);
        return [];
    }
}

function extractCacheJsonBody(payload) {
    try {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        if (payload.response?.jsonBody) {
            return payload.response.jsonBody;
        }

        if (payload.mapping?.response?.jsonBody) {
            return payload.mapping.response.jsonBody;
        }

        if (payload.jsonBody?.mappings || Array.isArray(payload.mappings)) {
            const mappings = Array.isArray(payload.jsonBody?.mappings)
                ? payload.jsonBody.mappings
                : Array.isArray(payload.mappings)
                    ? payload.mappings
                    : [];
            return { mappings: mappings.map(item => ({ ...item })) };
        }
    } catch (error) {
        console.warn('extractCacheJsonBody failed:', error);
    }
    return null;
}

function cloneSlimMappingsList(source) {
    if (!Array.isArray(source)) {
        return [];
    }
    return source.map(item => ({ ...item }));
}

function buildUpdatedCachePayload(existingPayload, mapping, operation) {
    try {
        const normalizedOp = (operation || 'update').toLowerCase();
        const mappingId = mapping?.id || mapping?.uuid;
        const incoming = normalizedOp === 'delete' ? null : mapping;

        if (!mappingId) {
            return existingPayload ? { mappings: cloneSlimMappingsList(existingPayload.mappings) } : { mappings: [] };
        }

        const base = existingPayload && Array.isArray(existingPayload.mappings)
            ? cloneSlimMappingsList(existingPayload.mappings)
            : [];

        const index = base.findIndex(item => (item?.id || item?.uuid) === mappingId);

        if (normalizedOp === 'delete') {
            if (index !== -1) {
                base.splice(index, 1);
            }
            return { mappings: base };
        }

        if (!incoming) {
            return { mappings: base };
        }

        const slim = slimMapping(incoming);

        if (index !== -1) {
            base[index] = { ...base[index], ...slim };
        } else {
            base.push(slim);
        }

        return { mappings: base };
    } catch (error) {
        console.warn('buildUpdatedCachePayload failed:', error);
        return null;
    }
}

async function fetchExistingCacheMapping() {
    try {
        let cacheMapping = await getCacheByFixedId();
        if (cacheMapping) {
            return cacheMapping;
        }
        cacheMapping = await getCacheByMetadata();
        if (cacheMapping) {
            return cacheMapping;
        }
    } catch (error) {
        console.warn('fetchExistingCacheMapping failed:', error);
    }
    return null;
}

async function syncCacheMappingWithServer(mapping, operation) {
    try {
        const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
        if (settings.cacheEnabled !== true) {
            console.log('🧩 [CACHE] Remote cache sync skipped - cache disabled');
            return;
        }

        const existingMapping = await fetchExistingCacheMapping();
        if (!existingMapping || !existingMapping.response) {
            console.log('🧩 [CACHE] Remote cache sync skipped - cache mapping missing');
            return;
        }

        const currentPayload = extractCacheJsonBody(existingMapping) || { mappings: [] };
        const updatedPayload = buildUpdatedCachePayload(currentPayload, mapping, operation);
        if (!updatedPayload) {
            console.log('🧩 [CACHE] Remote cache sync skipped - unable to build payload');
            return;
        }

        const response = await upsertImockCacheMapping(updatedPayload);
        const finalPayload = extractCacheJsonBody(response) || updatedPayload;
        window.imockCacheSnapshot = finalPayload;
        window.cacheLastUpdate = Date.now();
        console.log('🧩 [CACHE] Remote cache mapping updated via optimistic sync');
    } catch (error) {
        console.warn('🧩 [CACHE] syncCacheMappingWithServer failed:', error);
    }
}

let cacheSyncQueue = Promise.resolve();
function enqueueCacheSync(mapping, operation) {
    try {
        cacheSyncQueue = cacheSyncQueue
            .catch(() => { })
            .then(() => syncCacheMappingWithServer(mapping, operation));
    } catch (error) {
        console.warn('🧩 [CACHE] enqueueCacheSync failed:', error);
    }
}

function refreshMappingsFromCache({ maintainFilters = true } = {}) {
    try {

        // Use full cache snapshot logic for consistency
        const sanitized = buildCacheSnapshot();

        window.originalMappings = sanitized.slice();
        window.allMappings = sanitized.slice();

        const methodFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value || '';
        const urlFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value || '';
        const statusFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value || '';
        const hasFilters = maintainFilters && Boolean(methodFilter || urlFilter || statusFilter);

        if (hasFilters && typeof FilterManager !== 'undefined' && typeof FilterManager.applyMappingFilters === 'function') {
            FilterManager.applyMappingFilters();
        } else if (typeof fetchAndRenderMappings === 'function') {
            fetchAndRenderMappings(window.allMappings.slice());
        }

        if (typeof updateDataSourceIndicator === 'function') {
            updateDataSourceIndicator('cache');
        }
    } catch (error) {
        console.warn('refreshMappingsFromCache failed:', error);
    }
}

function updateOptimisticCache(mapping, operation, options = {}) {
    try {
        const mappingId = mapping?.id || mapping?.uuid;
        if (!mappingId) {
            console.warn('updateOptimisticCache called without valid id:', mapping);
            return;
        }

        if (!window.cacheManager || !(window.cacheManager.cache instanceof Map)) {
            console.warn('updateOptimisticCache skipped - cacheManager unavailable');
            return;
        }

        const cache = window.cacheManager.cache;
        seedCacheFromGlobals(cache);
        const normalizedOperation = (operation || 'update').toLowerCase();
        const queueMode = typeof options.queueMode === 'string' ? options.queueMode : 'confirm';
        const shouldAddToQueue = queueMode === 'add';
        const shouldConfirmQueue = queueMode === 'confirm';

        if (shouldAddToQueue && typeof window.cacheManager.addOptimisticUpdate === 'function') {
            try {
                window.cacheManager.addOptimisticUpdate(mapping, normalizedOperation);
            } catch (queueError) {
                console.warn('updateOptimisticCache: failed to enqueue optimistic update', queueError);
            }
        }

        if (normalizedOperation === 'delete') {
            cache.delete(mappingId);
            if (window.pendingDeletedIds instanceof Set) {
                window.pendingDeletedIds.add(mappingId);
            }
            if (window.deletionTimeouts instanceof Map) {
                const existing = window.deletionTimeouts.get(mappingId);
                if (existing) {
                    clearTimeout(existing);
                }
                const timeout = setTimeout(() => {
                    try {
                        if (window.pendingDeletedIds instanceof Set) {
                            window.pendingDeletedIds.delete(mappingId);
                        }
                    } finally {
                        if (window.deletionTimeouts instanceof Map) {
                            window.deletionTimeouts.delete(mappingId);
                        }
                    }
                }, 15000);
                window.deletionTimeouts.set(mappingId, timeout);
            }
            if (shouldConfirmQueue && typeof window.cacheManager.removeOptimisticUpdate === 'function') {
                window.cacheManager.removeOptimisticUpdate(mappingId);
            }
        } else {
            const incoming = cloneMappingForCache(mapping);
            if (!incoming) {
                console.warn('updateOptimisticCache: unable to clone mapping for cache:', mappingId);
                return;
            }

            if (!incoming.id && mappingId) {
                incoming.id = mappingId;
            }
            if (!incoming.uuid && (mapping.uuid || mappingId)) {
                incoming.uuid = mapping.uuid || mappingId;
            }

            if (cache.has(mappingId)) {
                const merged = mergeMappingData(cache.get(mappingId), incoming);
                cache.set(mappingId, merged);
            } else {
                cache.set(mappingId, incoming);
            }

            if (shouldConfirmQueue && typeof window.cacheManager.confirmOptimisticUpdate === 'function') {
                window.cacheManager.confirmOptimisticUpdate(mappingId);
            }
        }

        window.cacheLastUpdate = Date.now();
        if (typeof window.cacheManager?.version === 'number') {
            window.cacheManager.version += 1;
        }
        refreshMappingsFromCache();
        enqueueCacheSync(mapping, normalizedOperation);
    } catch (error) {
        console.warn('updateOptimisticCache failed:', error);
    }
}

// простой дебаунс ребилда кеша, использует существующий refreshImockCache
let _cacheRebuildTimer;
function scheduleCacheRebuild() {
  try {
    const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
    if (settings.cacheEnabled !== true) {
      return;
    }
    const delay = Number(settings.cacheRebuildDelay) || 1000;
    clearTimeout(_cacheRebuildTimer);
    _cacheRebuildTimer = setTimeout(async () => {
      try {
        const existing = await fetchExistingCacheMapping();
        if (existing && extractCacheJsonBody(existing)) {
          console.log('🧩 [CACHE] Skipping scheduled rebuild - cache mapping already exists');
          return;
        }
        if (typeof window.refreshImockCache === 'function') {
          await window.refreshImockCache();
        }
      } catch (timerError) {
        console.warn('🧩 [CACHE] Scheduled rebuild attempt failed:', timerError);
      }
    }, delay);
  } catch (error) {
    console.warn('🧩 [CACHE] scheduleCacheRebuild failed:', error);
  }
}

// Защита от бесконечного цикла optimistic update in progress
let optimisticInProgress = false;
let optimisticDelayRetries = 0;

// Cache validation timer (check every minute, validate every 5 minutes)
setInterval(() => {
    const timeSinceLastUpdate = Date.now() - (window.cacheLastUpdate || 0);
    const optimisticOps = window.cacheOptimisticOperations || 0;

    // Validate if cache is older than 5 minutes OR has too many optimistic operations
    if (timeSinceLastUpdate > 5 * 60 * 1000 || optimisticOps > 20) {
        console.log('🧩 [CACHE] Validation triggered - time:', Math.round(timeSinceLastUpdate/1000), 's, ops:', optimisticOps);
        validateAndRefreshCache();
    }
}, 60 * 1000); // Check every minute

async function validateAndRefreshCache() {
    try {
        console.log('🧩 [CACHE] Starting cache validation...');

        const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
        if (settings.cacheEnabled !== true) {
            console.log('🧩 [CACHE] Validation skipped - cache disabled');
            return;
        }

        const existing = await fetchExistingCacheMapping();
        if (existing && extractCacheJsonBody(existing)) {
            console.log('🧩 [CACHE] Validation skipped - cache mapping already present');
            return;
        }

        // Cache mapping missing - rebuild from server data
        const freshData = await fetchMappingsFromServer({ force: true });
        if (!freshData?.mappings) {
            console.warn('🧩 [CACHE] Failed to get fresh data for validation');
            return;
        }

        const payload = await regenerateImockCache(freshData);
        window.imockCacheSnapshot = payload;

        // Reset optimistic counters
        window.cacheOptimisticOperations = 0;
        window.cacheLastUpdate = Date.now();

        console.log('🧩 [CACHE] Validation rebuilt cache because mapping was missing');

    } catch (e) {
        console.warn('🧩 [CACHE] Validation failed:', e);
        // Don't reset counters on failure - try again later
    }
}

// Expose cache refresh for other modules (editor.js)
window.refreshImockCache = async () => {
    if (optimisticInProgress) {
        if (optimisticDelayRetries++ > 10) {
            console.warn('[CACHE] forced refresh after optimistic delay cap');
        } else {
            console.log('🔄 [CACHE] Optimistic update in progress, delaying cache refresh...');
            return new Promise(resolve => {
                setTimeout(async () => {
                    console.log('🔄 [CACHE] Retrying cache refresh after optimistic update delay');
                    await window.refreshImockCache();
                    resolve();
                }, 1000);
            });
        }
    }
    optimisticDelayRetries = 0;
    optimisticInProgress = true;
    try {
        window.cacheRebuilding = true;
        console.log('🔄 [CACHE] Set cache rebuilding flag');

        try {
            const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
            if (settings.cacheEnabled) {
                updateDataSourceIndicator('cache_rebuilding');
                console.log('🔄 [CACHE] Updated UI indicator to rebuilding');
            }
        } catch (settingsError) {
            console.warn('🔄 [CACHE] Failed to update UI indicator:', settingsError);
        }

        console.log('🔄 [CACHE] Starting regeneration...');
        const payload = await regenerateImockCache();
        window.imockCacheSnapshot = payload;
        console.log('🔄 [CACHE] Regeneration completed');

        // Clear optimistic update queue after successful cache rebuild
        console.log('🔄 [CACHE] Clearing optimistic update queue after rebuild');
        window.cacheManager.optimisticQueue.length = 0;

        // Auto-refresh UI after cache update
        try {
            if (typeof window.fetchAndRenderMappings === 'function' && window.allMappings) {
                console.log('🔄 [CACHE] Auto-refreshing UI after cache rebuild');
                window.fetchAndRenderMappings(window.allMappings);
                console.log('🔄 [CACHE] UI refresh completed');
            } else {
                console.warn('🔄 [CACHE] UI refresh functions not available');
            }
        } catch (uiError) {
            console.warn('🔄 [CACHE] UI refresh after cache rebuild failed:', uiError);
        }
    } catch (e) {
        console.warn('🔄 [CACHE] refreshImockCache failed:', e);
    } finally {
        window.cacheRebuilding = false;
        console.log('🔄 [CACHE] Cleared cache rebuilding flag');
        window.cacheLastUpdate = Date.now();
        window.cacheOptimisticOperations = 0;
        optimisticInProgress = false;
        optimisticDelayRetries = 0;
        try {
            const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
            if (settings.cacheEnabled) {
                updateDataSourceIndicator('cache');
                console.log('🔄 [CACHE] Updated UI indicator to cache');
            }
        } catch (settingsError) {
            console.warn('🔄 [CACHE] Failed to reset UI indicator:', settingsError);
        }
    }
};

// === MISSING FUNCTIONS FOR HTML COMPATIBILITY ===

// Simple health check function for button compatibility
window.checkHealth = async () => {
    try {
        // Check if user has entered connection details in the form
        const hostInput = document.getElementById('wiremock-host');
        const portInput = document.getElementById('wiremock-port');

        if (hostInput && portInput && (hostInput.value.trim() || portInput.value.trim())) {
            // User has entered connection details - update URL before health check
            const host = hostInput.value.trim() || 'localhost';
            const port = portInput.value.trim() || '8080';

            if (typeof window.normalizeWiremockBaseUrl === 'function') {
                window.wiremockBaseUrl = window.normalizeWiremockBaseUrl(host, port);
            } else {
                window.wiremockBaseUrl = `http://${host}:${port}/__admin`;
            }
            console.log('🔧 [checkHealth] Updated WireMock URL from form:', window.wiremockBaseUrl);
        }

        await checkHealthAndStartUptime();
        NotificationManager.success('Health check passed!');
    } catch (error) {
        NotificationManager.error(`Health check failed: ${error.message}`);
    }
};

// Refresh mappings function for button compatibility
window.refreshMappings = async () => {
    try {
        const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
        const useCache = !!settings.cacheEnabled;
        await fetchAndRenderMappings(null, { useCache });
        NotificationManager.success('Mappings refreshed!');
    } catch (error) {
        NotificationManager.error(`Failed to refresh mappings: ${error.message}`);
    }
};

// Force refresh cache function for button compatibility
window.forceRefreshCache = async () => {
    try {
        const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
        if (!settings.cacheEnabled) {
            NotificationManager.warning('Cache is not enabled. Enable it in Settings first.');
            return;
        }

        if (typeof window.refreshImockCache === 'function') {
            await window.refreshImockCache();
            await fetchAndRenderMappings(null, { useCache: true });
            NotificationManager.success('Cache rebuilt and mappings refreshed!');
        } else {
            NotificationManager.error('Cache service not available');
        }
    } catch (error) {
        NotificationManager.error(`Failed to rebuild cache: ${error.message}`);
    }
};

// Missing HTML onclick functions
window.loadMockData = () => {
    NotificationManager.info('Demo mode not implemented yet');
};

window.updateScenarioState = async () => {
    const scenarioSelect = document.getElementById('scenario-select');
    const scenarioState = document.getElementById('scenario-state');

    if (!scenarioSelect?.value || !scenarioState?.value) {
        NotificationManager.warning('Please select scenario and enter state');
        return;
    }

    // Call the correct function (not self-recursive)
    await window.setScenarioState(scenarioSelect.value, scenarioState.value);
};

window.updateFileDisplay = () => {
    const fileInput = document.getElementById('import-file');
    const fileDisplay = document.getElementById('file-display');

    if (fileInput?.files?.length > 0) {
        fileDisplay.innerHTML = `<strong>${fileInput.files[0].name}</strong>`;
        document.getElementById('import-actions').style.display = 'block';
    }
};

