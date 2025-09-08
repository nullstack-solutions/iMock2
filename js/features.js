// ===== FEATURES.JS - Бизнес-функции =====
// Все основные функции приложения: mappings, requests, scenarios, recording, import/export, settings

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ (используем window для межмодульного доступа) ---
// Переменные определены в core.js

// Хранилище оригинальных данных (не изменяется при фильтрации)
window.originalMappings = []; // Полный список маппингов с сервера
window.allMappings = []; // Текущий отображаемый список (может быть отфильтрован)
window.originalRequests = []; // Полный список запросов с сервера
window.allRequests = []; // Текущий отображаемый список запросов (может быть отфильтрован)

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
    
    // Save connection settings to localStorage for persistence
    const currentSettings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
    const updatedSettings = {
        ...currentSettings,
        host,
        port
    };
    localStorage.setItem('wiremock-settings', JSON.stringify(updatedSettings));
    
    console.log('💾 Connection settings saved:', { host, port });
    
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
            const fallback = await apiFetch(ENDPOINTS.MAPPINGS);
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
                try { window.applyHealthUI(isHealthyNow, isHealthyNow ? responseTime : null); } catch (e) { console.warn('applyHealthUI failed:', e); }
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
                const fallback = await apiFetch(ENDPOINTS.MAPPINGS);
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



// Функция остановки uptime и сброса статуса подключения
window.stopUptime = () => {
    if (window.uptimeInterval) {
        clearInterval(window.uptimeInterval);
        window.uptimeInterval = null;
    }
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }
    window.startTime = null;
    
    const uptimeElement = document.getElementById(SELECTORS.UI.UPTIME);
    if (uptimeElement) {
        uptimeElement.textContent = '0s';
    }
    
    // Сбрасываем статус подключения в UI
    const statusDot = document.getElementById(SELECTORS.CONNECTION.STATUS_DOT);
    const statusText = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
    const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
    const setupDiv = document.getElementById(SELECTORS.CONNECTION.SETUP);
    const addButton = document.getElementById(SELECTORS.BUTTONS.ADD_MAPPING);
    const statsElement = document.getElementById(SELECTORS.UI.STATS);
    const filtersElement = document.getElementById(SELECTORS.UI.SEARCH_FILTERS);
    
    if (statusDot) statusDot.className = 'status-dot disconnected';
    if (statusText) statusText.textContent = 'Disconnected';
    if (healthIndicator) {
        healthIndicator.style.display = 'none';
        healthIndicator.innerHTML = '';
    }
    if (setupDiv) setupDiv.style.display = 'block'; // Показываем поля подключения
    if (addButton) addButton.disabled = true; // Блокируем кнопку добавления
    // Не скрываем statsElement и filtersElement, чтобы сохранить данные
    
    console.log('⏹️ Uptime and health monitoring stopped, connection status reset');
};

// Функция обновления uptime
function updateUptime() {
    if (!window.startTime) return;
    
    const uptimeElement = document.getElementById(SELECTORS.UI.UPTIME);
    if (!uptimeElement) return;
    
    const uptime = Date.now() - window.startTime;
    const seconds = Math.floor(uptime / 1000) % 60;
    const minutes = Math.floor(uptime / (1000 * 60)) % 60;
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    
    uptimeElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

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

// Глобальные функции для использования в HTML
window.toggleFullContent = Utils.toggleFullContent;
window.toggleDetails = Utils.toggleDetails;

// --- УНИВЕРСАЛЬНЫЕ UI КОМПОНЕНТЫ (сократить ~100 строк дублирования) ---

const UIComponents = {
    // Базовый компонент карточки - заменяет renderMappingCard и renderRequestCard
    createCard: (type, data, actions = []) => {
        const { id, method, url, status, name, time, extras = {} } = data;
        return `
            <div class="${type}-card" data-id="${Utils.escapeHtml(id)}">
                <div class="${type}-header" onclick="UIComponents.toggleDetails('${id}', '${type}')">
                    <div class="${type}-info">
                        <div class="${type}-top-line">
                            <span class="method-badge ${method.toLowerCase()}">
                                <span class="collapse-arrow" id="arrow-${id}">▶</span> ${method}
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
                                    onclick="${action.handler}('${id}')" 
                                    title="${action.title}">${action.icon}</button>
                        `).join('')}
                    </div>
                </div>
                <div class="${type}-preview" id="preview-${id}" style="display: none;">
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
                element.innerHTML = `<pre style="max-height: 300px; overflow-y: auto; background: var(--bg-tertiary); padding: 1rem; border-radius: var(--radius-sm); margin-top: 0.5rem;">${JSON.stringify(parsedData, null, 2)}</pre>`;
                element.style.display = 'block';
                button.textContent = 'Hide Full Content';
            } catch (e) {
                element.innerHTML = `<div class="preview-value warning">Error parsing JSON: ${e.message}</div>`;
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

// Make toggleFullContent globally accessible for HTML onclick handlers
window.toggleFullContent = UIComponents.toggleFullContent;

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
                    data = cached.data;
                    dataSource = 'cache';
                } else {
                    data = await apiFetch(ENDPOINTS.MAPPINGS);
                    dataSource = 'direct';
                    // regenerate cache asynchronously
                    try { console.log('🧩 [CACHE] Async regenerate after cache miss'); regenerateImockCache(); } catch {}
                }
            } else {
                data = await apiFetch(ENDPOINTS.MAPPINGS);
                dataSource = 'direct';
            }
            // If we fetched a full admin list, strip service cache mapping from UI
            let incoming = data.mappings || [];
            // Hide any items marked as pending-deleted to avoid stale cache flicker
            try {
                if (window.pendingDeletedIds && window.pendingDeletedIds.size > 0) {
                    const before = incoming.length;
                    incoming = incoming.filter(m => !window.pendingDeletedIds.has(m.id || m.uuid));
                    if (before !== incoming.length) console.log('🧩 [CACHE] filtered pending-deleted from render:', before - incoming.length);
                }
            } catch {}
            window.originalMappings = Array.isArray(incoming) ? incoming.filter(m => !isImockCacheMapping(m)) : [];
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

// Optimistically update the list after fast CRUD without hiding the grid
window.applyOptimisticMappingUpdate = (mappingLike) => {
    try {
        if (!mappingLike) return;
        const m = mappingLike.mapping || mappingLike; // support WireMock response wrapper
        if (!m || !m.id) return;
        if (!Array.isArray(window.allMappings)) window.allMappings = [];
        // drop service cache mapping if ever present
        if (isImockCacheMapping(m)) return; // never render the service mapping
        const idx = window.allMappings.findIndex(x => (x.id || x.uuid) === (m.id || m.uuid));
        if (idx >= 0) {
            window.allMappings[idx] = m;
        } else {
            window.allMappings.unshift(m);
        }
        // render quickly without toggling loading placeholders
        fetchAndRenderMappings(window.allMappings);
    } catch (e) {
        console.warn('Optimistic update failed:', e);
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
                data = await apiFetch(ENDPOINTS.MAPPINGS);
                source = 'direct';
            }
        } else {
            data = await apiFetch(ENDPOINTS.MAPPINGS);
            source = 'direct';
        }
        const incoming = data.mappings || [];
        window.originalMappings = Array.isArray(incoming) ? incoming.filter(m => !isImockCacheMapping(m)) : [];
        window.allMappings = [...window.originalMappings];
        updateDataSourceIndicator(source);
        // re-render without loading state
        fetchAndRenderMappings(window.allMappings);
    } catch (e) {
        console.warn('Background refresh failed:', e);
    }
};

// Компактная функция рендеринга маппинга через UIComponents (сокращено с ~67 до 15 строк)
function renderMappingCard(mapping) {
    if (!mapping || !mapping.id) {
        console.warn('Invalid mapping data:', mapping);
        return '';
    }
    
    const actions = [
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
            })
            ,
            badges: [
                (mapping.id || mapping.uuid) ? `<span class="badge badge-secondary" title="Mapping ID">${Utils.escapeHtml(((mapping.id || mapping.uuid).length > 12 ? (mapping.id || mapping.uuid).slice(0,8) + '…' + (mapping.id || mapping.uuid).slice(-4) : (mapping.id || mapping.uuid)))}</span>` : '',
                (typeof mapping.priority === 'number') ? `<span class="badge badge-secondary" title="Priority">P${mapping.priority}</span>` : '',
                (mapping.scenarioName) ? `<span class="badge badge-secondary" title="Scenario">${Utils.escapeHtml(mapping.scenarioName)}</span>` : '',
                (window.showMetaTimestamps !== false && mapping.metadata?.created) ? `<span class="badge badge-secondary" title="Created">C: ${new Date(mapping.metadata.created).toLocaleString()}</span>` : '',
                (window.showMetaTimestamps !== false && mapping.metadata?.edited) ? `<span class="badge badge-secondary" title="Edited">E: ${new Date(mapping.metadata.edited).toLocaleString()}</span>` : ''
            ].filter(Boolean).join(' ')
        }
    };
    
    return UIComponents.createCard('mapping', data, actions);
}

// Обновляем счетчик маппингов
function updateMappingsCounter() {
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
function renderRequestCard(request) {
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
        await apiFetch(`/mappings/${id}`, { method: 'DELETE' });
        // Mark as pending-deleted locally to prevent reappearing from stale cache
        try {
            if (!window.pendingDeletedIds) window.pendingDeletedIds = new Set();
            window.pendingDeletedIds.add(id);
            console.log('🧩 [CACHE] pending deletion marked:', id);
        } catch {}
        NotificationManager.success('Маппинг удален!');
        // Optimistic UI: remove locally and re-render fast
        try {
            if (Array.isArray(window.allMappings)) {
                window.allMappings = window.allMappings.filter(m => (m.id || m.uuid) !== id);
                fetchAndRenderMappings(window.allMappings);
            }
        } catch {}
        // Rebuild cache first, then background refresh
        try {
            const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
            const useCache = !!settings.cacheEnabled;
            if (typeof window.refreshImockCache === 'function') {
                try { await window.refreshImockCache(); } catch (e) { console.warn('refreshImockCache after delete failed:', e); }
            }
            if (typeof window.backgroundRefreshMappings === 'function') {
                window.backgroundRefreshMappings(useCache);
            }
            try { window.pendingDeletedIds && window.pendingDeletedIds.delete(id); } catch {}
        } catch (e) { console.warn('post-delete refresh failed:', e); }
    } catch (e) {
        NotificationManager.error(`Ошибка удаления: ${e.message}`);
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
                           document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO)?.value ||
                           document.getElementById(SELECTORS.REQUEST_FILTERS.TIME_FROM)?.value ||
                           document.getElementById(SELECTORS.REQUEST_FILTERS.TIME_TO)?.value;
    
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
    const dateFromInput = document.getElementById('req-filter-date-from');
    const timeFromInput = document.getElementById('req-filter-time-from');
    const dateToInput = document.getElementById('req-filter-date-to');
    const timeToInput = document.getElementById('req-filter-time-to');
    
    if (dateFromInput) {
        dateFromInput.value = yesterday.toISOString().split('T')[0];
    }
    if (timeFromInput) {
        timeFromInput.value = yesterday.toTimeString().split(' ')[0].substring(0, 5);
    }
    if (dateToInput) {
        dateToInput.value = now.toISOString().split('T')[0];
    }
    if (timeToInput) {
        timeToInput.value = now.toTimeString().split(' ')[0].substring(0, 5);
    }
    
    // Применяем фильтры
    FilterManager.applyRequestFilters();
};

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
        const byMeta = m?.metadata?.imock?.type === 'cache';
        const byName = (m?.name || '').toLowerCase() === 'imock cache';
        const byUrl = (m?.request?.url || m?.request?.urlPath) === IMOCK_CACHE_URL;
        return !!(byMeta || byName || byUrl);
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
        request: {
            method: m.request?.method,
            url: pickUrl(m.request),
            headers: m.request?.headers,
            queryParameters: m.request?.queryParameters,
        },
        response: {
            status: m.response?.status,
            headers: m.response?.headers,
        },
        metadata: m.metadata,
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
        await apiFetch(`/mappings/${IMOCK_CACHE_ID}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stub),
        });
        console.log('🧩 [CACHE] Upsert done (PUT)');
    } catch (e) {
        console.log('🧩 [CACHE] PUT failed, POST /mappings');
        await apiFetch('/mappings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stub),
        });
        console.log('🧩 [CACHE] Upsert done (POST)');
    }
}

async function regenerateImockCache() {
    console.log('🧩 [CACHE] Regenerate cache start');
    const t0 = performance.now();
    const all = await apiFetch(ENDPOINTS.MAPPINGS);
    const slim = buildSlimList(all?.mappings || []);
    try { await upsertImockCacheMapping(slim); } catch (e) { console.warn('🧩 [CACHE] Upsert cache failed:', e); }
    const dt = Math.round(performance.now() - t0);
    console.log(`🧩 [CACHE] Regenerate cache done (${(slim?.mappings||[]).length} items) in ${dt}ms`);
    return slim;
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

// Expose cache refresh for other modules (editor.js)
window.refreshImockCache = async () => {
    try {
        window.cacheRebuilding = true;
        try {
            const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
            if (settings.cacheEnabled) updateDataSourceIndicator('cache_rebuilding');
        } catch {}
        await regenerateImockCache();
    } catch (e) {
        console.warn('refreshImockCache failed:', e);
    } finally {
        window.cacheRebuilding = false;
        try {
            const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
            if (settings.cacheEnabled) updateDataSourceIndicator('cache');
        } catch {}
    }
};

