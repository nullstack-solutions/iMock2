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
    
    // Обновляем базовый URL
    window.wiremockBaseUrl = `http://${host}:${port}/__admin`;
    
    try {
        // Первый health check - здесь начинается uptime
        await checkHealthAndStartUptime();
        
        // Обновляем UI после успешного подключения
        const statusDot = document.getElementById(SELECTORS.CONNECTION.STATUS_DOT);
        const statusText = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
        const setupDiv = document.getElementById(SELECTORS.CONNECTION.SETUP);
        const addButton = document.getElementById(SELECTORS.BUTTONS.ADD_MAPPING);
        
        if (statusDot) statusDot.className = 'status-dot connected';
        if (statusText) statusText.textContent = 'Connected';
        if (setupDiv) setupDiv.style.display = 'none';
        if (addButton) addButton.disabled = false;
        
        // Показываем статистику и фильтры
        const statsElement = document.getElementById(SELECTORS.UI.STATS);
        const filtersElement = document.getElementById(SELECTORS.UI.SEARCH_FILTERS);
        if (statsElement) statsElement.style.display = 'flex';
        if (filtersElement) filtersElement.style.display = 'block';
        
        // Запускаем периодический health check
        startHealthMonitoring();
        
        // Загружаем данные параллельно
        await Promise.all([
            fetchAndRenderMappings(),
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
        const response = await apiFetch(ENDPOINTS.HEALTH);
        const responseTime = Math.round(performance.now() - startTime);
        
        const isHealthy = response.status === 'UP' || response.healthy !== false;
        
        if (isHealthy) {
            // Запускаем uptime только при успешном health check
            window.startTime = Date.now();
            if (window.uptimeInterval) clearInterval(window.uptimeInterval);
            window.uptimeInterval = setInterval(updateUptime, 1000);
            
            // Обновляем health indicator с временем отклика
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
            // Измеряем время отклика
            const startTime = performance.now();
            const healthResponse = await apiFetch(ENDPOINTS.HEALTH);
            const responseTime = Math.round(performance.now() - startTime);
            
            const isHealthyNow = healthResponse.status === 'UP' || healthResponse.healthy !== false;
            
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
            if (healthIndicator) {
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
window.fetchAndRenderMappings = async (mappingsToRender = null) => {
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
            
            const data = await apiFetch(ENDPOINTS.MAPPINGS);
            window.originalMappings = data.mappings || [];
            window.allMappings = [...window.originalMappings];
        } else {
            window.allMappings = mappingsToRender;
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
        
        container.innerHTML = sortedMappings.map(mapping => renderMappingCard(mapping)).join('');
        updateMappingsCounter();
        
    } catch (error) {
        console.error('Error in fetchAndRenderMappings:', error);
        NotificationManager.error(`Ошибка загрузки маппингов: ${error.message}`);
        loadingState.classList.add('hidden');
        emptyState.classList.remove('hidden');
        container.style.display = 'none';
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
        url: mapping.request?.urlPath || mapping.request?.urlPattern || mapping.request?.url || 'N/A',
        status: mapping.response?.status || 200,
        name: mapping.name || mapping.metadata?.name || `Mapping ${mapping.id.substring(0, 8)}`,
        extras: {
            preview: UIComponents.createPreviewSection('📥 Request', {
                'Method': mapping.request?.method || 'GET',
                'URL': mapping.request?.url || mapping.request?.urlPattern || mapping.request?.urlPath,
                'Headers': mapping.request?.headers,
                'Body': mapping.request?.bodyPatterns || mapping.request?.body,
                'Query Parameters': mapping.request?.queryParameters
            }) + UIComponents.createPreviewSection('📤 Response', {
                'Status': mapping.response?.status,
                'Headers': mapping.response?.headers,
                'Body': mapping.response?.jsonBody || mapping.response?.body,
                'Delay': mapping.response?.fixedDelayMilliseconds ? `${mapping.response.fixedDelayMilliseconds}ms` : null
            })
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
        if (requestsToRender === null) {
            loadingState.classList.remove('hidden');
            container.style.display = 'none';
            emptyState.classList.add('hidden');
            
            const data = await apiFetch(ENDPOINTS.REQUESTS);
            window.originalRequests = data.requests || [];
            window.allRequests = [...window.originalRequests];
        } else {
            window.allRequests = requestsToRender;
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
    console.log('🔴 [OPEN MODAL DEBUG] Found mapping:', mapping);
    
    // Используем новую функцию populateEditMappingForm для правильного заполнения редактора
    if (typeof window.populateEditMappingForm === 'function') {
        window.populateEditMappingForm(mapping);
    } else {
        console.error('populateEditMappingForm function not found!');
        return;
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
        NotificationManager.success('Маппинг удален!');
        await fetchAndRenderMappings();
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
            targetBaseUrl: 'http://example.com',
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
