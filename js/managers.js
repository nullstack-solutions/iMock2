// ===== MANAGERS.JS - Системы управления =====
// NotificationManager, TabManager, системы управления состоянием

// --- NOTIFICATION MANAGER ---
window.NotificationManager = {
    queue: [],
    isShowing: false,
    toastContainer: null,
    
    // Типы уведомлений
    TYPES: {
        INFO: 'info',
        SUCCESS: 'success', 
        ERROR: 'error',
        WARNING: 'warning'
    },
    
    // Инициализация контейнера для тостов
    init() {
        // Создаем контейнер для тостов, если его еще нет
        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.id = 'toast-container';
            document.body.appendChild(this.toastContainer);
        }
    },
    
    // Показать уведомление
    show(message, type = this.TYPES.INFO, duration = 3000) {
        this.init(); // Инициализируем контейнер при первом вызове
        this.queue.push({ message, type, duration });
        this.processQueue();
    },
    
    // Обработка очереди
    processQueue() {
        if (this.isShowing || this.queue.length === 0) return;
        
        const { message, type, duration } = this.queue.shift();
        this.isShowing = true;
        
        // Показать уведомление
        this.displayNotification(message, type);
        
        // Автоскрытие
        setTimeout(() => {
            this.hideNotification();
            this.isShowing = false;
            this.processQueue(); // Показать следующее
        }, duration);
    },
    
    // Отображение уведомления
    displayNotification(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        // Добавляем тост в контейнер
        this.toastContainer.appendChild(toast);
        
        // Анимация появления
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Сохраняем ссылку на тост для скрытия
        this.currentToast = toast;
    },
    
    // Скрытие уведомления
    hideNotification() {
        if (this.currentToast) {
            this.currentToast.classList.remove('show');
            
            setTimeout(() => {
                if (this.currentToast && this.currentToast.parentNode) {
                    this.currentToast.parentNode.removeChild(this.currentToast);
                    this.currentToast = null;
                }
            }, 300);
        }
    },
    
    // Быстрые методы
    success(msg) { this.show(msg, this.TYPES.SUCCESS); },
    error(msg) { this.show(msg, this.TYPES.ERROR); },
    info(msg) { this.show(msg, this.TYPES.INFO); },
    warning(msg) { this.show(msg, this.TYPES.WARNING); }
};

// --- TAB MANAGER ---
window.TabManager = {
    // Конфигурация вкладок
    configs: {
        mappings: {
            name: 'Маппинги',
            loadFunction: () => window.fetchAndRenderMappings && window.fetchAndRenderMappings(),
            clearFilters() {
                document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD).value = '';
                document.getElementById(SELECTORS.MAPPING_FILTERS.URL).value = '';
                document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS).value = '';
                if (window.fetchAndRenderMappings) window.fetchAndRenderMappings();
            },
            filterSelectors: [
                SELECTORS.MAPPING_FILTERS.METHOD,
                SELECTORS.MAPPING_FILTERS.URL,
                SELECTORS.MAPPING_FILTERS.STATUS
            ]
        },
        requests: {
            name: 'Запросы',
            loadFunction: () => window.fetchAndRenderRequests && window.fetchAndRenderRequests(),
            clearFilters() {
                document.getElementById(SELECTORS.REQUEST_FILTERS.METHOD).value = '';
                document.getElementById(SELECTORS.REQUEST_FILTERS.URL).value = '';
                document.getElementById(SELECTORS.REQUEST_FILTERS.STATUS).value = '';
                document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM).value = '';
                document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO).value = '';
                document.getElementById(SELECTORS.REQUEST_FILTERS.TIME_FROM).value = '';
                document.getElementById(SELECTORS.REQUEST_FILTERS.TIME_TO).value = '';
                document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK).value = '';
                if (window.fetchAndRenderRequests) window.fetchAndRenderRequests();
            },
            filterSelectors: [
                SELECTORS.REQUEST_FILTERS.METHOD,
                SELECTORS.REQUEST_FILTERS.URL,
                SELECTORS.REQUEST_FILTERS.STATUS,
                SELECTORS.REQUEST_FILTERS.DATE_FROM,
                SELECTORS.REQUEST_FILTERS.DATE_TO,
                SELECTORS.REQUEST_FILTERS.TIME_FROM,
                SELECTORS.REQUEST_FILTERS.TIME_TO,
                SELECTORS.REQUEST_FILTERS.QUICK
            ]
        },
        scenarios: {
            name: 'Сценарии',
            loadFunction: () => window.loadScenarios && window.loadScenarios(),
            clearFilters() {
                // У сценариев нет фильтров, просто перезагружаем
                if (window.loadScenarios) window.loadScenarios();
            },
            filterSelectors: [] // Нет фильтров для сценариев
        }
    },
    
    // Универсальное обновление
    refresh(tabName) {
        const config = this.configs[tabName];
        if (config && config.loadFunction) {
            try {
                config.loadFunction();
                console.log(`TabManager: Refreshed ${config.name}`);
            } catch (e) {
                console.error(`TabManager: Error refreshing ${tabName}:`, e);
                NotificationManager.error(`Ошибка обновления ${config.name}: ${e.message}`);
            }
        }
    },
    
    // Универсальная очистка фильтров
    clearFilters(tabName) {
        const config = this.configs[tabName];
        if (config && config.clearFilters) {
            try {
                config.clearFilters();
                console.log(`TabManager: Cleared filters for ${config.name}`);
            } catch (e) {
                console.error(`TabManager: Error clearing filters for ${tabName}:`, e);
                NotificationManager.error(`Ошибка очистки фильтров ${config.name}: ${e.message}`);
            }
        }
    },
    
    // Проверка наличия активных фильтров
    hasActiveFilters(tabName) {
        const config = this.configs[tabName];
        if (!config || !config.filterSelectors) return false;
        
        return config.filterSelectors.some(selector => {
            const element = document.getElementById(selector);
            return element && element.value && element.value.trim() !== '';
        });
    }
};

// --- FILTER MANAGER ---
window.FilterManager = {
    // Применение фильтров маппингов
    applyMappingFilters() {
        const methodFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value || '';
        const urlFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value || '';
        const statusFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value || '';
        
        const mappingCards = document.querySelectorAll('#mappings-list .mapping-card');
        let visibleCount = 0;
        
        mappingCards.forEach(card => {
            const method = card.querySelector('.method-badge')?.textContent || '';
            const url = card.querySelector('.mapping-url')?.textContent || '';
            const status = card.querySelector('.status-badge')?.textContent || '';
            const name = card.querySelector('.mapping-name')?.textContent || '';
            
            const matchesMethod = !methodFilter || method.includes(methodFilter);
            const matchesUrl = !urlFilter || url.toLowerCase().includes(urlFilter.toLowerCase());
            const matchesStatus = !statusFilter || status.includes(statusFilter);
            // Поиск по названию мапинга
            const matchesName = !urlFilter || name.toLowerCase().includes(urlFilter.toLowerCase());
            
            if (matchesMethod && (matchesUrl || matchesName) && matchesStatus) {
                card.style.display = 'block';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });
        
        console.log(`Mapping filters applied: ${visibleCount} mappings shown`);
    },
    
    // Применение фильтров запросов
    applyRequestFilters() {
        const methodFilter = document.getElementById(SELECTORS.REQUEST_FILTERS.METHOD)?.value || '';
        const urlFilter = document.getElementById(SELECTORS.REQUEST_FILTERS.URL)?.value || '';
        const statusFilter = document.getElementById(SELECTORS.REQUEST_FILTERS.STATUS)?.value || '';
        const dateFromFilter = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM)?.value || '';
        const dateToFilter = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO)?.value || '';
        const fromTimeFilter = document.getElementById(SELECTORS.REQUEST_FILTERS.TIME_FROM)?.value || '';
        const toTimeFilter = document.getElementById(SELECTORS.REQUEST_FILTERS.TIME_TO)?.value || '';
        
        // Логируем установленные фильтры
        console.log('Applying request filters:', {
            method: methodFilter,
            url: urlFilter,
            status: statusFilter,
            dateFrom: dateFromFilter,
            dateTo: dateToFilter,
            timeFrom: fromTimeFilter,
            timeTo: toTimeFilter
        });
        
        const requestItems = document.querySelectorAll('#requests-list .request-card');
        let visibleCount = 0;
        let filteredItems = [];
        
        requestItems.forEach(item => {
            const method = item.querySelector('.method-badge')?.textContent || '';
            const url = item.querySelector('.request-url')?.textContent || '';
            const statusBadge = item.querySelector('.status-badge')?.textContent || '';
            // Ищем badge для matched/unmatched в разных местах
            const matchedBadge = item.querySelector('.badge-success, .badge-danger, .badge');
            const timestamp = item.querySelector('.request-time')?.textContent || '';
            
            // Определяем статус фильтрации (matched/unmatched)
            let displayStatus = statusBadge; // По умолчанию используем HTTP статус
            let hasMatchedBadge = false;
            
            // Более надежный способ определения matched/unmatched статуса
            if (item.querySelector('.badge-success')) {
                displayStatus = 'matched';
                hasMatchedBadge = true;
            } else if (item.querySelector('.badge-danger')) {
                displayStatus = 'unmatched';
                hasMatchedBadge = true;
            }
            
            // Debug logging
            console.log('Request filter debug:', {
                method, url, statusBadge, displayStatus, statusFilter, hasMatchedBadge,
                matchedBadge: matchedBadge?.outerHTML,
                timestamp
            });
            
            // Проверка базовых фильтров
            const matchesMethod = !methodFilter || method.toLowerCase().includes(methodFilter.toLowerCase());
            const matchesUrl = !urlFilter || this.matchUrlPattern(url, urlFilter);
            
            // Для фильтра matched/unmatched проверяем только запросы с соответствующими бейджами
            let matchesStatus = true;
            if (statusFilter && statusFilter !== '') {
                if (statusFilter === 'matched') {
                    matchesStatus = hasMatchedBadge && displayStatus === 'matched';
                } else if (statusFilter === 'unmatched') {
                    matchesStatus = hasMatchedBadge && displayStatus === 'unmatched';
                } else {
                    // Для других статусов (HTTP кодов) используем обычное сравнение
                    matchesStatus = displayStatus.toLowerCase().includes(statusFilter.toLowerCase()) || 
                                   statusFilter.toLowerCase().includes(displayStatus.toLowerCase());
                }
            }
            
            // Debug logging for filter results
            console.log('Filter results:', { matchesMethod, matchesUrl, matchesStatus });
            
            // Проверка временных фильтров
            let matchesTime = true;
            if (dateFromFilter || dateToFilter || fromTimeFilter || toTimeFilter) {
                // Парсим дату из отформатированной строки в русском формате (dd.mm.yyyy, hh:mm:ss)
                // Сначала извлекаем только дату и время, игнорируя IP адрес
                let cleanTimestamp = timestamp;
                if (timestamp.includes(' IP:')) {
                    cleanTimestamp = timestamp.split(' IP:')[0];
                }
                
                let requestDate;
                if (cleanTimestamp.includes(',')) {
                    const [datePart, timePart] = cleanTimestamp.split(', ');
                    const [day, month, year] = datePart.split('.');
                    // timePart может содержать секунды, извлекаем только часы и минуты
                    const timeComponents = timePart.split(':');
                    const hours = timeComponents[0];
                    const minutes = timeComponents[1];
                    const seconds = timeComponents[2] || '00'; // если секунды отсутствуют, используем 00
                    requestDate = new Date(year, month - 1, day, hours, minutes, seconds);
                } else {
                    // Пытаемся стандартный парсинг
                    requestDate = new Date(cleanTimestamp);
                }
                
                // Debug logging for time parsing
                console.log('Time filter debug:', {
                    originalTimestamp: timestamp,
                    parsedDate: requestDate,
                    isValid: !isNaN(requestDate.getTime()),
                    dateFromFilter, dateToFilter, fromTimeFilter, toTimeFilter
                });
                
                // Проверяем валидность даты
                if (isNaN(requestDate.getTime())) {
                    console.log('Invalid date, hiding request');
                    matchesTime = false;
                } else {
                    const requestDateStr = requestDate.toISOString().split('T')[0];
                    const requestTimeStr = requestDate.toTimeString().split(' ')[0].substring(0, 5);
                    
                    // Debug logging for time comparison
                    console.log('Time comparison:', {
                        requestDateStr, dateFromFilter, dateToFilter,
                        requestTimeStr, fromTimeFilter, toTimeFilter,
                        dateFromCheck: dateFromFilter ? requestDateStr >= dateFromFilter : 'skip',
                        dateToCheck: dateToFilter ? requestDateStr <= dateToFilter : 'skip',
                        timeFromCheck: fromTimeFilter ? requestTimeStr >= fromTimeFilter : 'skip',
                        timeToCheck: toTimeFilter ? requestTimeStr <= toTimeFilter : 'skip'
                    });
                    
                    // Правильная проверка временных фильтров
                    // Если установлена дата "с", скрываем запросы до этой даты
                    if (dateFromFilter && requestDateStr < dateFromFilter) {
                        console.log('Date from filter mismatch, hiding request', {requestDateStr, dateFromFilter, comparison: requestDateStr < dateFromFilter});
                        matchesTime = false;
                    }
                    // Если установлена дата "по", скрываем запросы после этой даты
                    if (dateToFilter && requestDateStr > dateToFilter) {
                        console.log('Date to filter mismatch, hiding request', {requestDateStr, dateToFilter, comparison: requestDateStr > dateToFilter});
                        matchesTime = false;
                    }
                    // Если установлено время "с", скрываем запросы до этого времени
                    if (fromTimeFilter && requestTimeStr < fromTimeFilter) {
                        console.log('Time from filter mismatch, hiding request', {requestTimeStr, fromTimeFilter, comparison: requestTimeStr < fromTimeFilter});
                        matchesTime = false;
                    }
                    // Если установлено время "по", скрываем запросы после этого времени
                    if (toTimeFilter && requestTimeStr > toTimeFilter) {
                        console.log('Time to filter mismatch, hiding request', {requestTimeStr, toTimeFilter, comparison: requestTimeStr > toTimeFilter});
                        matchesTime = false;
                    }
                }
            }
            
            // Final debug logging
            console.log('Final filter result:', { matchesMethod, matchesUrl, matchesStatus, matchesTime, willShow: matchesMethod && matchesUrl && matchesStatus && matchesTime });
            
            if (matchesMethod && matchesUrl && matchesStatus && matchesTime) {
                item.style.display = 'block';
                visibleCount++;
                filteredItems.push({
                    method,
                    url,
                    status: displayStatus,
                    timestamp
                });
            } else {
                item.style.display = 'none';
            }
        });
        
        // Обновляем счетчик
        const requestLogTab = document.querySelector('[onclick="showTab(\'requests\')"]');
        if (requestLogTab) {
            const originalText = requestLogTab.textContent.split(' (')[0];
            requestLogTab.textContent = `${originalText} (${visibleCount})`;
        }
        
        // Логируем результат фильтрации
        console.log(`Request filters applied: ${visibleCount} requests shown out of ${requestItems.length} total`, {
            totalRequests: requestItems.length,
            visibleRequests: visibleCount,
            hiddenRequests: requestItems.length - visibleCount,
            sampleVisibleItems: filteredItems.slice(0, 5) // Показываем первые 5 видимых элементов
        });
    },
    
    // Проверка соответствия URL паттерну
    matchUrlPattern(url, pattern) {
        if (!pattern) return true;
        
        try {
            // Если паттерн содержит регулярные выражения
            if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
                const regexPattern = pattern
                    .replace(/\*/g, '.*')
                    .replace(/\?/g, '.')
                    .replace(/\./g, '\\.');
                return new RegExp(regexPattern, 'i').test(url);
            }
            
            // Простой поиск подстроки
            return url.toLowerCase().includes(pattern.toLowerCase());
        } catch (e) {
            // Если ошибка в регулярном выражении, используем простой поиск
            return url.toLowerCase().includes(pattern.toLowerCase());
        }
    },
    
    // Быстрый фильтр времени (исправлено для работы с минутами)
    applyQuickTimeFilter() {
        const quickFilter = document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK)?.value;
        if (!quickFilter) return;
        
        const now = new Date();
        const minutesAgo = parseInt(quickFilter);
        const fromTime = new Date(now.getTime() - minutesAgo * 60000);
        
        const todayStr = now.toISOString().split('T')[0];
        
        // Устанавливаем даты "от" и "до" (сегодня)
        document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM).value = todayStr;
        document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO).value = todayStr;
        
        document.getElementById(SELECTORS.REQUEST_FILTERS.TIME_FROM).value = fromTime.toTimeString().slice(0, 5);
        document.getElementById(SELECTORS.REQUEST_FILTERS.TIME_TO).value = now.toTimeString().slice(0, 5);
        
        // Применяем фильтры
        this.applyRequestFilters();
    }
};

console.log('✅ Managers.js loaded - NotificationManager, TabManager, FilterManager');
