// ===== MAIN.JS - Инициализация и связывание модулей =====
// Точка входа приложения, инициализация всех систем

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 WireMock UI - Starting initialization...');
    
    // --- ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ИЗ ОРИГИНАЛЬНОГО SCRIPTS.JS ---
    
    // Функции записи запросов
    window.updateRecordingUI = () => {
        const indicator = document.getElementById(SELECTORS.RECORDING.INDICATOR);
        const target = document.getElementById(SELECTORS.RECORDING.TARGET);
        const count = document.getElementById(SELECTORS.RECORDING.COUNT);
        const startBtn = document.getElementById(SELECTORS.BUTTONS.START_RECORDING);
        const stopBtn = document.getElementById(SELECTORS.RECORDING.STOP_BTN);
        
        if (isRecording) {
            if (indicator) {
                indicator.textContent = '🔴 Recording';
                indicator.style.color = '#e74c3c';
            }
            if (target) {
                const urlInput = document.getElementById(SELECTORS.RECORDING.URL);
                target.textContent = urlInput ? urlInput.value : '-';
            }
            if (startBtn) startBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
        } else {
            if (indicator) {
                indicator.textContent = '⚫ Not Recording';
                indicator.style.color = '#666';
            }
            if (target) target.textContent = '-';
            if (startBtn) startBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
        }
        
        if (count) count.textContent = recordedCount;
    };
    
    window.startRecording = async () => {
        const targetUrlElement = document.getElementById(SELECTORS.RECORDING.URL) || document.getElementById('record-target-url');
        const targetUrl = targetUrlElement?.value?.trim();
        if (!targetUrl) {
            NotificationManager.error('Укажите URL для записи');
            return;
        }
        const captureHeadersElement = document.getElementById(SELECTORS.RECORDING.CAPTURE_HEADERS);
        const captureBodyElement = document.getElementById(SELECTORS.RECORDING.CAPTURE_BODY);
        const urlFilterElement = document.getElementById(SELECTORS.RECORDING.URL_FILTER);
        
        const captureHeaders = captureHeadersElement?.value === 'true' || false;
        const captureBody = captureBodyElement?.value === 'true' || false;
        const urlFilter = urlFilterElement?.value?.trim() || '.*';
        
        try {
            const recordingConfig = {
                targetBaseUrl: targetUrl,
                captureHeaders: captureHeaders,
                requestBodyPattern: captureBody,
                filters: {
                    urlPattern: urlFilter
                }
            };
            
            await apiFetch('/recordings/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(recordingConfig)
            });
            
            isRecording = true;
            recordedCount = 0;
            updateRecordingUI();
            NotificationManager.success('Запись запросов запущена!');
        } catch (e) {
            NotificationManager.error(`Ошибка запуска записи: ${e.message}`);
        }
    };
    
    window.stopRecording = async () => {
        try {
            const result = await apiFetch('/recordings/stop', { method: 'POST' });
            
            isRecording = false;
            updateRecordingUI();
            
            const mappingsCreated = result.mappings?.length || 0;
            NotificationManager.success(`Запись остановлена! Создано ${mappingsCreated} маппингов.`);
            await fetchAndRenderMappings();
            await fetchAndRenderRequests();
        } catch (e) {
            console.error('Stop recording error:', e);
            NotificationManager.error(`Ошибка остановки записи: ${e.message}`);
        }
    };
    
    // Clear recordings function
    window.clearRecordings = async () => {
        try {
            if (confirm('Очистить все записи? Это действие нельзя отменить.')) {
                // Clear recordings list UI
                const recordingsList = document.getElementById('recordings-list');
                if (recordingsList) {
                    recordingsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); margin: var(--space-4);">Нет записей</p>';
                }
                
                NotificationManager.success('Записи очищены');
            }
        } catch (e) {
            console.error('Clear recordings error:', e);
            NotificationManager.error(`Ошибка очистки записей: ${e.message}`);
        }
    };
    
    // Быстрый фильтр времени (глобальная функция для HTML)
    window.applyQuickTimeFilter = () => {
        // Вызываем метод из FilterManager
        if (typeof FilterManager !== 'undefined' && FilterManager.applyQuickTimeFilter) {
            FilterManager.applyQuickTimeFilter();
        } else {
            console.warn('FilterManager not initialized or applyQuickTimeFilter method not found');
        }
    };
    
    // Health Check
    window.checkHealth = async () => {
        try {
            const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
            if (healthIndicator) {
                healthIndicator.textContent = 'Checking...';
                healthIndicator.className = 'health-indicator checking';
            }
            
            const response = await apiFetch(ENDPOINTS.HEALTH);
            const isHealthy = response.status === 'UP' || response.healthy !== false;
            
            if (healthIndicator) {
                healthIndicator.textContent = isHealthy ? 'Healthy' : 'Unhealthy';
                healthIndicator.className = `health-indicator ${isHealthy ? 'healthy' : 'unhealthy'}`;
            }
            
            const message = `WireMock status: ${isHealthy ? 'Healthy' : 'Unhealthy'}`;
            if (isHealthy) {
                NotificationManager.success(message);
            } else {
                NotificationManager.error(message);
            }
        } catch (e) {
            const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
            if (healthIndicator) {
                healthIndicator.textContent = 'Error';
                healthIndicator.className = 'health-indicator error';
            }
            NotificationManager.error(`Health check failed: ${e.message}`);
        }
    };
    
    // Demo Mode
    window.loadMockData = async () => {
        if (!confirm('Загрузить демо-данные? Это добавит несколько примеров маппингов.')) return;
        
        const demoMappings = [
            {
                name: 'Get Users Demo',
                request: { method: 'GET', urlPath: '/api/users' },
                response: {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    jsonBody: [{ id: 1, name: 'John Doe', email: 'john@example.com' }]
                }
            },
            {
                name: 'Create User Demo',
                request: { method: 'POST', urlPath: '/api/users' },
                response: {
                    status: 201,
                    headers: { 'Content-Type': 'application/json' },
                    jsonBody: { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
                }
            }
        ];
        
        try {
            for (const mapping of demoMappings) {
                await apiFetch('/mappings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mapping)
                });
            }
            NotificationManager.success('Демо-данные загружены!');
            await fetchAndRenderMappings();
        } catch (e) {
            NotificationManager.error(`Ошибка загрузки демо-данных: ${e.message}`);
        }
    };
    
    // Обработчик формы редактирования маппинга
    // REMOVED: Edit mapping form listener moved to editor.js
    
    // Import/Export функции
    window.exportMappings = async () => {
        try {
            const format = document.getElementById(SELECTORS.EXPORT.FORMAT).value;
            const mappings = await apiFetch('/mappings');
            
            let content, filename, mimeType;
            
            if (format === 'yaml') {
                content = `mappings:\n${mappings.mappings.map(m => 
                    `  - name: ${m.name || 'Unnamed'}\n    request:\n      method: ${m.request.method}\n      url: ${m.request.urlPath || m.request.url}`
                ).join('\n')}`;
                filename = 'wiremock-mappings.yaml';
                mimeType = 'text/yaml';
            } else {
                content = JSON.stringify(mappings, null, 2);
                filename = 'wiremock-mappings.json';
                mimeType = 'application/json';
            }
            
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            
            NotificationManager.success(`Экспорт завершен: ${filename}`);
        } catch (e) {
            NotificationManager.error(`Ошибка экспорта: ${e.message}`);
        }
    };
    
    window.exportRequests = async () => {
        try {
            const requests = await apiFetch('/requests');
            const content = JSON.stringify(requests, null, 2);
            const filename = 'wiremock-requests.json';
            
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            
            NotificationManager.success(`Экспорт завершен: ${filename}`);
        } catch (e) {
            NotificationManager.error(`Ошибка экспорта: ${e.message}`);
        }
    };
    
    window.importMappings = async () => {
        const fileInput = document.getElementById(SELECTORS.IMPORT.FILE);
        if (!fileInput.files[0]) { 
            NotificationManager.error('Выберите файл для импорта'); 
            return; 
        }
        
        const file = fileInput.files[0];
        const resultDiv = document.getElementById(SELECTORS.IMPORT.RESULT);
        
        try {
            NotificationManager.info('📁 Обработка файла...');
            resultDiv.innerHTML = '<div class="progress-indicator">🔄 Обработка файла...</div>';
            
            const content = await file.text();
            let mappingsArray;
            
            try {
                const parsed = JSON.parse(content);
                mappingsArray = parsed.mappings || (Array.isArray(parsed) ? parsed : [parsed]);
            } catch (e) {
                throw new Error('Неверный формат JSON файла');
            }
            
            for (const mapping of mappingsArray) {
                await apiFetch('/mappings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(mapping)
                });
            }
            
            resultDiv.innerHTML = `<div class="success-message">✅ Успешно импортировано ${mappingsArray.length} маппингов!</div>`;
            NotificationManager.success(`✅ Импортировано ${mappingsArray.length} маппингов!`);
            await fetchAndRenderMappings();
        } catch (e) {
            resultDiv.innerHTML = `<div class="error-message">❌ Ошибка: ${e.message}</div>`;
            NotificationManager.error(`Ошибка импорта: ${e.message}`);
        }
    };
    
    window.importAndReplace = async () => {
        if (!confirm('Заменить все существующие маппинги? Это действие необратимо!')) return;
        
        try {
            await apiFetch('/mappings', { method: 'DELETE' });
            await importMappings();
        } catch (e) {
            NotificationManager.error(`Ошибка замены: ${e.message}`);
        }
    };
    
    window.updateFileDisplay = () => {
        const fileInput = document.getElementById(SELECTORS.IMPORT.FILE);
        const fileDisplay = document.getElementById(SELECTORS.IMPORT.DISPLAY);
        const importActions = document.getElementById(SELECTORS.IMPORT.ACTIONS);
        
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileSize = (file.size / 1024).toFixed(1) + ' KB';
            
            fileDisplay.innerHTML = `
                <span class="file-name">📄 ${file.name}</span>
                <span class="file-size">(${fileSize})</span>
            `;
            fileDisplay.classList.add('has-file');
            importActions.style.display = 'block';
        } else {
            fileDisplay.innerHTML = '<span class="file-placeholder">No file selected</span>';
            fileDisplay.classList.remove('has-file');
            importActions.style.display = 'none';
        }
    };
    
    // Статистика
    window.updateSystemStats = async () => {
        try {
            const [mappings, requests] = await Promise.all([
                apiFetch('/mappings'),
                apiFetch('/requests')
            ]);
            
            // Safe element access for stats
            const totalMappingsEl = document.getElementById(SELECTORS.STATS.TOTAL_MAPPINGS);
            const totalRequestsEl = document.getElementById(SELECTORS.STATS.TOTAL_REQUESTS);
            
            if (totalMappingsEl) totalMappingsEl.textContent = mappings.mappings?.length || 0;
            if (totalRequestsEl) totalRequestsEl.textContent = requests.requests?.length || 0;
        } catch (e) {
            console.warn('Не удалось обновить статистику:', e.message);
        }
    };
    
    // Настройки
    window.saveSettings = () => {
        const hostElement = document.getElementById(SELECTORS.SETTINGS.HOST) || document.getElementById('default-host');
        const portElement = document.getElementById(SELECTORS.SETTINGS.PORT) || document.getElementById('default-port');
        const timeoutElement = document.getElementById(SELECTORS.SETTINGS.TIMEOUT) || document.getElementById('request-timeout');
        const autoRefreshElement = document.getElementById(SELECTORS.SETTINGS.AUTO_REFRESH) || document.getElementById('refresh-interval');
        const themeElement = document.getElementById(SELECTORS.SETTINGS.THEME) || document.getElementById('theme-select');
        const authHeaderElement = document.getElementById(SELECTORS.SETTINGS.AUTH_HEADER);
        
        const host = hostElement?.value || 'localhost';
        const port = portElement?.value || '8080';
        const timeout = timeoutElement?.value || '5000';
        const autoRefresh = autoRefreshElement?.value || '0';
        const theme = themeElement?.value || 'light';
        const authHeader = authHeaderElement?.value?.trim() || '';
        
        const settingsData = { host, port, timeout, autoRefresh, theme, authHeader };
        localStorage.setItem('wiremock-settings', JSON.stringify(settingsData));
        
        // Update global variables immediately
        wiremockBaseUrl = `http://${host}:${port}/__admin`;
        requestTimeout = parseInt(timeout);
        window.authHeader = authHeader; // Update global auth header
        
        // Apply theme immediately
        document.body.setAttribute('data-theme', theme);
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) {
            themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
        
        setupAutoRefresh();
        
        console.log('💾 Settings saved to localStorage:', {
            ...settingsData,
            wiremockBaseUrl,
            requestTimeout
        });
        
        NotificationManager.success('✅ Настройки успешно сохранены в браузере!');
        
        // Визуальная обратная связь
        const saveBtn = event.target;
        const originalText = saveBtn.textContent;
        saveBtn.textContent = '✅ Сохранено!';
        saveBtn.style.background = '#27ae60';
        
        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.background = '';
        }, 2000);
    };
    
    // Reset settings function
    window.resetSettings = () => {
        if (confirm('Сбросить все настройки к значениям по умолчанию?')) {
            // Clear saved settings
            localStorage.removeItem('wiremock-settings');
            
            // Reset form values to defaults
            const hostElement = document.getElementById(SELECTORS.SETTINGS.HOST) || document.getElementById('default-host');
            const portElement = document.getElementById(SELECTORS.SETTINGS.PORT) || document.getElementById('default-port');
            const timeoutElement = document.getElementById(SELECTORS.SETTINGS.TIMEOUT) || document.getElementById('request-timeout');
            const autoRefreshElement = document.getElementById(SELECTORS.SETTINGS.AUTO_REFRESH) || document.getElementById('refresh-interval');
            const themeElement = document.getElementById(SELECTORS.SETTINGS.THEME) || document.getElementById('theme-select');
            const authHeaderElement = document.getElementById(SELECTORS.SETTINGS.AUTH_HEADER);
            
            if (hostElement) hostElement.value = 'localhost';
            if (portElement) portElement.value = '8080';
            if (timeoutElement) timeoutElement.value = '5000';
            if (autoRefreshElement) autoRefreshElement.value = '30';
            if (themeElement) themeElement.value = 'light';
            if (authHeaderElement) authHeaderElement.value = '';
            
            // Reset global variables
            wiremockBaseUrl = 'http://localhost:8080/__admin';
            requestTimeout = 5000;
            window.authHeader = ''; // Reset auth header
            
            // Reset theme
            document.body.setAttribute('data-theme', 'light');
            const themeIcon = document.getElementById('theme-icon');
            if (themeIcon) {
                themeIcon.textContent = '🌙';
            }
            
            NotificationManager.success('Настройки сброшены к значениям по умолчанию');
        }
    };
    
    // Refresh mappings function
    window.refreshMappings = async () => {
        try {
            if (typeof fetchAndRenderMappings === 'function') {
                await fetchAndRenderMappings();
                NotificationManager.success('Маппинги обновлены');
            } else {
                console.warn('fetchAndRenderMappings function not available');
                NotificationManager.info('Функция обновления маппингов недоступна');
            }
        } catch (e) {
            console.error('Error refreshing mappings:', e);
            NotificationManager.error(`Ошибка обновления маппингов: ${e.message}`);
        }
    };
    
    window.loadSettings = () => {
        const saved = localStorage.getItem('wiremock-settings');
        if (saved) {
            const { host, port, timeout, autoRefresh, theme, authHeader } = JSON.parse(saved);
            
            // Load all form elements (settings page and main page)
            const hostElement = document.getElementById(SELECTORS.SETTINGS.HOST) || document.getElementById('default-host');
            const portElement = document.getElementById(SELECTORS.SETTINGS.PORT) || document.getElementById('default-port');
            const timeoutElement = document.getElementById(SELECTORS.SETTINGS.TIMEOUT) || document.getElementById('request-timeout');
            const autoRefreshElement = document.getElementById(SELECTORS.SETTINGS.AUTO_REFRESH) || document.getElementById('refresh-interval');
            const themeElement = document.getElementById(SELECTORS.SETTINGS.THEME) || document.getElementById('theme-select');
            const authHeaderElement = document.getElementById(SELECTORS.SETTINGS.AUTH_HEADER);
            
            // Main page connection form elements
            const mainHostElement = document.getElementById('wiremock-host');
            const mainPortElement = document.getElementById('wiremock-port');
            
            // Set form values with fallbacks (settings page)
            if (hostElement) hostElement.value = host || 'localhost';
            if (portElement) portElement.value = port || '8080';
            if (timeoutElement) timeoutElement.value = timeout || '5000';
            if (autoRefreshElement) autoRefreshElement.value = autoRefresh || '0';
            if (themeElement) themeElement.value = theme || 'light';
            if (authHeaderElement) authHeaderElement.value = authHeader || '';
            
            // Set main page connection form values
            if (mainHostElement) mainHostElement.value = host || 'localhost';
            if (mainPortElement) mainPortElement.value = port || '8080';
            
            // Apply settings to global variables
            window.wiremockBaseUrl = `http://${host || 'localhost'}:${port || '8080'}/__admin`;
            window.requestTimeout = parseInt(timeout || '5000');
            window.authHeader = authHeader || ''; // Load auth header
            
            console.log('🔧 wiremockBaseUrl initialized:', window.wiremockBaseUrl);
            
            // Apply theme
            const selectedTheme = theme || 'light';
            document.body.setAttribute('data-theme', selectedTheme);
            const themeIcon = document.getElementById('theme-icon');
            if (themeIcon) {
                themeIcon.textContent = selectedTheme === 'dark' ? '☀️' : '🌙';
            }
            
            // Setup auto-refresh
            setupAutoRefresh();
            
            console.log('🔧 Settings loaded from localStorage:', {
                host: host || 'localhost',
                port: port || '8080',
                timeout: timeout || '5000',
                autoRefresh: autoRefresh || '0',
                theme: selectedTheme,
                wiremockBaseUrl
            });
        } else {
            // Default settings
            wiremockBaseUrl = 'http://localhost:8080/__admin';
            requestTimeout = 5000;
            document.body.setAttribute('data-theme', 'light');
            console.log('🔧 Using default settings - no saved settings found');
        }
    };
    
    window.setupAutoRefresh = () => {
        const interval = parseInt(document.getElementById(SELECTORS.SETTINGS.AUTO_REFRESH)?.value || '0');
        
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }
        
        if (interval > 0) {
            autoRefreshInterval = setInterval(() => {
                const currentPage = document.querySelector('.nav-item.active')?.textContent.trim();
                if (currentPage?.includes('Mappings')) {
                    fetchAndRenderMappings();
                } else if (currentPage?.includes('Request Log')) {
                    fetchAndRenderRequests();
                }
            }, interval * 1000);
        }
    };
    
    // --- ОБРАБОТЧИК ФОРМЫ МАППИНГОВ ---
    // REMOVED: Moved to editor.js
    
    // --- РАСШИРЕННАЯ НАВИГАЦИЯ ---
    const originalShowPage = window.showPage;
    window.showPage = (pageId, element) => {
        originalShowPage(pageId, element);
        
        // Removed updateSystemStats() call on settings tab switch
        // Statistics will only update:
        // 1. On initial connection (connectToWireMock)
        // 2. By manual refresh buttons
        // 3. Via auto-refresh interval (if enabled)
        
        if (pageId === 'scenarios') {
            loadScenarios().catch(e => {
                NotificationManager.error(`Ошибка загрузки сценариев: ${e.message}`);
            });
        }
    };
    
    // --- ИНИЦИАЛИЗАЦИЯ ---
    console.log('📋 Loading settings...');
    loadSettings();
    
    console.log('🎬 Initializing UI elements...');
    updateRecordingUI();
    
    console.log('🎨 Initializing theme...');
    initializeTheme();
    
    console.log('⚙️ Setting up auto-refresh...');
    document.getElementById(SELECTORS.SETTINGS.AUTO_REFRESH)?.addEventListener('change', setupAutoRefresh);
    setupAutoRefresh();
    
    console.log('🔗 Setting up live connection field sync...');
    // Add live sync for main page connection fields
    const mainHostField = document.getElementById('wiremock-host');
    const mainPortField = document.getElementById('wiremock-port');
    
    if (mainHostField) {
        mainHostField.addEventListener('input', (e) => {
            const host = e.target.value.trim() || 'localhost';
            const port = mainPortField?.value.trim() || '8080';
            
            // Update wiremockBaseUrl immediately
            window.wiremockBaseUrl = `http://${host}:${port}/__admin`;
            
            // Sync with settings page fields
            const settingsHostField = document.getElementById(SELECTORS.SETTINGS.HOST);
            if (settingsHostField) settingsHostField.value = host;
            
            // Save to localStorage
            const currentSettings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
            const updatedSettings = { ...currentSettings, host };
            localStorage.setItem('wiremock-settings', JSON.stringify(updatedSettings));
            
            console.log('🔄 Host updated live:', { host, newBaseUrl: window.wiremockBaseUrl });
        });
    }
    
    if (mainPortField) {
        mainPortField.addEventListener('input', (e) => {
            const port = e.target.value.trim() || '8080';
            const host = mainHostField?.value.trim() || 'localhost';
            
            // Update wiremockBaseUrl immediately
            window.wiremockBaseUrl = `http://${host}:${port}/__admin`;
            
            // Sync with settings page fields
            const settingsPortField = document.getElementById(SELECTORS.SETTINGS.PORT);
            if (settingsPortField) settingsPortField.value = port;
            
            // Save to localStorage
            const currentSettings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
            const updatedSettings = { ...currentSettings, port };
            localStorage.setItem('wiremock-settings', JSON.stringify(updatedSettings));
            
            console.log('🔄 Port updated live:', { port, newBaseUrl: window.wiremockBaseUrl });
        });
    }
    
    // Add reverse sync for settings page fields to main page
    const settingsHostField = document.getElementById(SELECTORS.SETTINGS.HOST);
    const settingsPortField = document.getElementById(SELECTORS.SETTINGS.PORT);
    
    if (settingsHostField) {
        settingsHostField.addEventListener('input', (e) => {
            const host = e.target.value.trim() || 'localhost';
            const port = settingsPortField?.value.trim() || '8080';
            
            // Update wiremockBaseUrl immediately
            window.wiremockBaseUrl = `http://${host}:${port}/__admin`;
            
            // Sync with main page fields
            if (mainHostField) mainHostField.value = host;
            
            console.log('🔄 Settings host updated live:', { host, newBaseUrl: window.wiremockBaseUrl });
        });
    }
    
    if (settingsPortField) {
        settingsPortField.addEventListener('input', (e) => {
            const port = e.target.value.trim() || '8080';
            const host = settingsHostField?.value.trim() || 'localhost';
            
            // Update wiremockBaseUrl immediately
            window.wiremockBaseUrl = `http://${host}:${port}/__admin`;
            
            // Sync with main page fields
            if (mainPortField) mainPortField.value = port;
            
            console.log('🔄 Settings port updated live:', { port, newBaseUrl: window.wiremockBaseUrl });
        });
    }
    
    console.log('📅 Setting default date filters...');
    // Removed default date filters to avoid filtering out requests
    // const today = new Date().toISOString().split('T')[0];
    // const dateFromFilter = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    // const dateToFilter = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    // if (dateFromFilter) dateFromFilter.value = today;
    // if (dateToFilter) dateToFilter.value = today;
    
    console.log('✅ WireMock UI - Initialization complete!');
    console.log('🎯 Ready to connect to WireMock server');
});
