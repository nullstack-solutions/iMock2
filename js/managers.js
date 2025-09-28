'use strict';

// === MANAGERS.JS ===
// Management systems for notifications, tabs, and filters

// --- NOTIFICATION MANAGER ---
// Enhanced notification system with queue and better UX
if (!window.NotificationManager) {
    window.NotificationManager = {
        TYPES: {
            INFO: 'info',
            SUCCESS: 'success',
            ERROR: 'error',
            WARNING: 'warning'
        },

        ICONS: {
            info: '[INFO]',
            success: '[OK]',
            warning: '[WARN]',
            error: '[BLOCK]'
        },

        queue: [],
        visibleToasts: [],
        dedupeMap: new Map(),
        toastContainer: null,
        cooldownTimer: null,
        lastShownAt: 0,
        maxVisible: 3,
        cooldownMs: 650,
        dedupeWindowMs: 4000,
        defaultDuration: 4000,
        motionQuery: null,
        _boundHandleKeydown: null,

        init() {
            if (!this.toastContainer) {
                this.toastContainer = document.getElementById('toast-container');
                if (!this.toastContainer) {
                    this.toastContainer = document.createElement('div');
                    this.toastContainer.id = 'toast-container';
                    this.toastContainer.setAttribute('aria-live', 'polite');
                    this.toastContainer.setAttribute('aria-atomic', 'false');
                    document.body.appendChild(this.toastContainer);
                }
            }

            if (!this.motionQuery && window.matchMedia) {
                this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            }

            if (!this._boundHandleKeydown) {
                this._boundHandleKeydown = this.handleKeydown.bind(this);
                document.addEventListener('keydown', this._boundHandleKeydown);
            }
        },

        normalizePayload(message, typeOrOptions = this.TYPES.INFO, durationOrOptions = undefined) {
            if (message == null) {
                return null;
            }

            const payload = {
                message: String(message).trim(),
                type: this.TYPES.INFO,
                duration: this.defaultDuration,
                action: null
            };

            if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
                Object.assign(payload, typeOrOptions);
            } else {
                payload.type = typeof typeOrOptions === 'string' ? typeOrOptions : this.TYPES.INFO;

                if (typeof durationOrOptions === 'number') {
                    payload.duration = durationOrOptions;
                } else if (typeof durationOrOptions === 'object' && durationOrOptions !== null) {
                    Object.assign(payload, durationOrOptions);
                }
            }

            if (!payload.message) {
                return null;
            }

            if (!Object.values(this.TYPES).includes(payload.type)) {
                payload.type = this.TYPES.INFO;
            }

            if (payload.action && typeof payload.action !== 'object') {
                payload.action = null;
            }

            if (payload.action && typeof payload.action?.label !== 'string') {
                payload.action = null;
            }

            if (payload.action && typeof payload.action?.handler !== 'function') {
                payload.action.handler = () => {};
            }

            if (payload.action) {
                payload.duration = null;
            } else if (typeof payload.duration !== 'number' || payload.duration <= 0) {
                payload.duration = this.defaultDuration;
            }

            payload.createdAt = Date.now();
            payload.count = payload.count && Number.isInteger(payload.count) ? payload.count : 1;
            payload.dedupeKey = this.getDedupeKey(payload);

            return payload;
        },

        show(message, typeOrOptions = this.TYPES.INFO, durationOrOptions = undefined) {
            this.init();

            const payload = this.normalizePayload(message, typeOrOptions, durationOrOptions);
            if (!payload) return;

            const dedupeEntry = this.dedupeMap.get(payload.dedupeKey);
            if (dedupeEntry && Date.now() - dedupeEntry.timestamp <= this.dedupeWindowMs) {
                dedupeEntry.count += 1;
                dedupeEntry.timestamp = Date.now();
                dedupeEntry.payload.count = dedupeEntry.count;
                this.updateToastCount(dedupeEntry);
                clearTimeout(dedupeEntry.cleanupTimer);
                dedupeEntry.cleanupTimer = setTimeout(() => {
                    this.dedupeMap.delete(payload.dedupeKey);
                }, this.dedupeWindowMs);
                return;
            }

            this.queue.push(payload);
            this.dedupeMap.set(payload.dedupeKey, {
                count: payload.count,
                timestamp: Date.now(),
                payload,
                toastEl: null,
                cleanupTimer: setTimeout(() => {
                    this.dedupeMap.delete(payload.dedupeKey);
                }, this.dedupeWindowMs)
            });

            this.processQueue();
        },

        success(message, options) {
            this.show(message, { type: this.TYPES.SUCCESS, ...(typeof options === 'object' ? options : { duration: options }) });
        },

        error(message, options) {
            this.show(message, { type: this.TYPES.ERROR, ...(typeof options === 'object' ? options : { duration: options }) });
        },

        warning(message, options) {
            this.show(message, { type: this.TYPES.WARNING, ...(typeof options === 'object' ? options : { duration: options }) });
        },

        info(message, options) {
            this.show(message, { type: this.TYPES.INFO, ...(typeof options === 'object' ? options : { duration: options }) });
        },

        handleKeydown(event) {
            if (event.key !== 'Escape') return;
            if (!this.visibleToasts.length) return;

            const latest = this.visibleToasts[this.visibleToasts.length - 1];
            if (latest) {
                this.dismissToast(latest.toastEl, latest.payload, 'escape');
            }
        },

        processQueue() {
            if (!this.queue.length) return;
            if (this.visibleToasts.length >= this.maxVisible) return;

            const now = Date.now();
            const elapsed = now - this.lastShownAt;
            if (elapsed < this.cooldownMs) {
                if (!this.cooldownTimer) {
                    this.cooldownTimer = setTimeout(() => {
                        this.cooldownTimer = null;
                        this.processQueue();
                    }, this.cooldownMs - elapsed);
                }
                return;
            }

            const nextIndex = this.getNextToastIndex();
            if (nextIndex === -1) {
                return;
            }

            const payload = this.queue.splice(nextIndex, 1)[0];
            this.displayToast(payload);
        },

        getNextToastIndex() {
            if (!this.queue.length) return -1;

            const priority = {
                [this.TYPES.ERROR]: 3,
                [this.TYPES.WARNING]: 2,
                [this.TYPES.INFO]: 1,
                [this.TYPES.SUCCESS]: 1
            };

            let bestIndex = 0;
            let bestScore = -Infinity;
            let bestTime = Infinity;

            for (let i = 0; i < this.queue.length; i += 1) {
                const candidate = this.queue[i];
                const score = priority[candidate.type] || 0;
                if (score > bestScore || (score === bestScore && candidate.createdAt < bestTime)) {
                    bestScore = score;
                    bestTime = candidate.createdAt;
                    bestIndex = i;
                }
            }

            return bestIndex;
        },

        displayToast(payload) {
            const toast = document.createElement('div');
            toast.className = `toast toast-${payload.type}`;
            toast.setAttribute('role', payload.type === this.TYPES.ERROR ? 'alert' : 'status');
            toast.setAttribute('aria-live', payload.type === this.TYPES.ERROR ? 'assertive' : 'polite');
            toast.setAttribute('aria-atomic', 'true');
            toast.dataset.key = payload.dedupeKey;

            const icon = document.createElement('span');
            icon.className = 'toast-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = this.ICONS[payload.type] || this.ICONS.info;

            const content = document.createElement('div');
            content.className = 'toast-content';

            const messageEl = document.createElement('p');
            messageEl.className = 'toast-message';
            messageEl.textContent = payload.message;

            const countEl = document.createElement('span');
            countEl.className = 'toast-count';
            if (payload.count > 1) {
                countEl.textContent = `x${payload.count}`;
                countEl.setAttribute('aria-label', `${payload.count} occurrences`);
            }

            const actions = document.createElement('div');
            actions.className = 'toast-actions';

            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'toast-close';
            closeButton.setAttribute('aria-label', 'Dismiss notification');
            closeButton.textContent = 'x';
            closeButton.addEventListener('click', () => this.dismissToast(toast, payload, 'close'));

            if (payload.action) {
                const actionButton = document.createElement('button');
                actionButton.type = 'button';
                actionButton.className = 'toast-action';
                actionButton.textContent = payload.action.label;
                actionButton.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    try {
                        payload.action.handler();
                    } finally {
                        this.dismissToast(toast, payload, 'action');
                    }
                });
                actions.appendChild(actionButton);
            }

            actions.appendChild(closeButton);

            content.appendChild(messageEl);
            if (payload.count > 1) {
                content.appendChild(countEl);
            }

            toast.appendChild(icon);
            toast.appendChild(content);
            toast.appendChild(actions);

            if (this.toastContainer.firstChild) {
                this.toastContainer.insertBefore(toast, this.toastContainer.firstChild);
            } else {
                this.toastContainer.appendChild(toast);
            }

            const dedupeEntry = this.dedupeMap.get(payload.dedupeKey);
            if (dedupeEntry) {
                dedupeEntry.toastEl = toast;
                dedupeEntry.payload = payload;
            }

            const toastRecord = {
                toastEl: toast,
                payload,
                remaining: payload.duration,
                hideTimer: null,
                startedAt: null
            };

            this.visibleToasts.push(toastRecord);
            this.lastShownAt = Date.now();

            requestAnimationFrame(() => {
                toast.classList.add('show');
            });

            const pauseTimer = () => {
                if (!toastRecord.hideTimer) return;
                clearTimeout(toastRecord.hideTimer);
                toastRecord.hideTimer = null;
                if (toastRecord.startedAt && toastRecord.remaining) {
                    toastRecord.remaining -= Date.now() - toastRecord.startedAt;
                }
            };

            const resumeTimer = () => {
                if (toastRecord.hideTimer || payload.duration === null) return;
                if (typeof toastRecord.remaining !== 'number' || toastRecord.remaining <= 0) {
                    toastRecord.remaining = this.defaultDuration;
                }
                toastRecord.startedAt = Date.now();
                toastRecord.hideTimer = setTimeout(() => {
                    this.dismissToast(toast, payload, 'timeout');
                }, toastRecord.remaining);
            };

            toast.addEventListener('mouseenter', pauseTimer);
            toast.addEventListener('focusin', pauseTimer);
            toast.addEventListener('mouseleave', resumeTimer);
            toast.addEventListener('focusout', resumeTimer);

            if (payload.duration !== null) {
                toastRecord.remaining = payload.duration;
                resumeTimer();
            }

            if (this.motionQuery && this.motionQuery.matches) {
                toast.classList.add('toast-reduced-motion');
            }

            this.processQueue();
        },

        dismissToast(toast, payload, reason) {
            if (!toast || toast.dataset.dismissed === 'true') return;

            toast.dataset.dismissed = 'true';
            toast.classList.remove('show');

            const recordIndex = this.visibleToasts.findIndex(record => record.toastEl === toast);
            if (recordIndex !== -1) {
                const record = this.visibleToasts[recordIndex];
                if (record.hideTimer) {
                    clearTimeout(record.hideTimer);
                }
                this.visibleToasts.splice(recordIndex, 1);
            }

            const dedupeEntry = this.dedupeMap.get(payload.dedupeKey);
            if (dedupeEntry && dedupeEntry.toastEl === toast) {
                dedupeEntry.toastEl = null;
            }

            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                this.processQueue();
            }, this.motionQuery && this.motionQuery.matches ? 0 : 250);
        },

        updateToastCount(dedupeEntry) {
            if (!dedupeEntry) return;
            if (dedupeEntry.toastEl) {
                const countEl = dedupeEntry.toastEl.querySelector('.toast-count');
                const content = dedupeEntry.toastEl.querySelector('.toast-content');
                if (dedupeEntry.count > 1) {
                    if (countEl) {
                        countEl.textContent = `x${dedupeEntry.count}`;
                        countEl.setAttribute('aria-label', `${dedupeEntry.count} occurrences`);
                    } else if (content) {
                        const newCountEl = document.createElement('span');
                        newCountEl.className = 'toast-count';
                        newCountEl.textContent = `x${dedupeEntry.count}`;
                        newCountEl.setAttribute('aria-label', `${dedupeEntry.count} occurrences`);
                        content.appendChild(newCountEl);
                    }
                } else if (countEl && countEl.parentNode) {
                    countEl.parentNode.removeChild(countEl);
                }

                const record = this.visibleToasts.find(item => item.toastEl === dedupeEntry.toastEl);
                if (record && record.payload.duration !== null) {
                    if (record.hideTimer) {
                        clearTimeout(record.hideTimer);
                    }
                    record.remaining = Math.max(record.payload.duration, this.defaultDuration);
                    record.startedAt = Date.now();
                    record.hideTimer = setTimeout(() => {
                        this.dismissToast(record.toastEl, record.payload, 'timeout');
                    }, record.remaining);
                }
            } else if (dedupeEntry.payload) {
                dedupeEntry.payload.count = dedupeEntry.count;
            }
        },

        getDedupeKey(payload) {
            return `${payload.type}::${payload.message}::${payload.action ? payload.action.label : ''}`;
        }
    };
}

// --- TAB MANAGER ---
// Unified tab management system
window.TabManager = {
    configs: {
        mappings: {
            name: 'Mappings',
            loadFunction: 'loadMappings',
            clearFunction: 'clearMappingFilters'
        },
        requests: {
            name: 'Requests', 
            loadFunction: 'loadRequests',
            clearFunction: 'clearRequestFilters'
        },
        scenarios: {
            name: 'Scenarios',
            loadFunction: 'loadScenarios',
            clearFunction: null
        }
    },
    
    async refresh(tabName) {
        const config = this.configs[tabName];
        if (!config) {
            console.warn(`Tab config not found: ${tabName}`);
            return;
        }
        
        try {
            const loadFn = window[config.loadFunction];
            if (typeof loadFn === 'function') {
                await loadFn();
                console.log(`[OK] ${config.name} refreshed`);
            } else {
                console.warn(`Load function not found: ${config.loadFunction}`);
            }
        } catch (error) {
            console.error(`Error refreshing ${config.name}:`, error);
            NotificationManager.error(`Failed to refresh ${config.name}: ${error.message}`);
        }
    },
    
    clearFilters(tabName) {
        const config = this.configs[tabName];
        if (!config || !config.clearFunction) return;
        
        try {
            const clearFn = window[config.clearFunction];
            if (typeof clearFn === 'function') {
                clearFn();
                console.log(`[CLEAN] ${config.name} filters cleared`);
            }
        } catch (error) {
            console.error(`Error clearing ${config.name} filters:`, error);
        }
    }
};

// --- FILTER MANAGER ---
// Centralized filter management
window.FilterManager = {
    // Save filter state to localStorage
    saveFilterState(tabName, filters) {
        try {
            const key = `imock-filters-${tabName}`;
            localStorage.setItem(key, JSON.stringify(filters));
        } catch (e) {
            console.warn('Failed to save filter state:', e);
        }
    },
    
    // Load filter state from localStorage
    loadFilterState(tabName) {
        try {
            const key = `imock-filters-${tabName}`;
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.warn('Failed to load filter state:', e);
            return {};
        }
    },
    
    // Apply mapping filters
    applyMappingFilters() {
        const method = document.getElementById('filter-method')?.value || '';
        const url = document.getElementById('filter-url')?.value || '';
        const status = document.getElementById('filter-status')?.value || '';

        const filters = { method, url, status };
        this.saveFilterState('mappings', filters);

        // Apply filters to mappings
        if (window.originalMappings && window.originalMappings.length > 0) {
            let filtered = [...window.originalMappings];

            if (method) {
                filtered = filtered.filter(mapping =>
                    (mapping.request?.method || '').toLowerCase().includes(method.toLowerCase())
                );
            }

            if (url) {
                filtered = filtered.filter(mapping => {
                    // Search in URL fields
                    const mappingUrl = mapping.request?.url || mapping.request?.urlPattern || mapping.request?.urlPath || '';
                    const urlMatch = mappingUrl.toLowerCase().includes(url.toLowerCase());

                    // Search in mapping name
                    const mappingName = mapping.name || '';
                    const nameMatch = mappingName.toLowerCase().includes(url.toLowerCase());

                    // Return true if either URL or Name matches
                    return urlMatch || nameMatch;
                });
            }

            if (status) {
                filtered = filtered.filter(mapping =>
                    (mapping.response?.status || '').toString().includes(status)
                );
            }

            window.allMappings = filtered;

            // Re-render mappings
            const container = document.getElementById(SELECTORS.LISTS.MAPPINGS);
            if (container) {
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

                if (window.ListRenderer && typeof window.ListRenderer.render === 'function') {
                    window.ListRenderer.render(container, sortedMappings, window.renderMappingCard);
                } else if (typeof window.renderMappingCard === 'function') {
                    container.innerHTML = '';
                    const fragment = document.createDocumentFragment();
                    sortedMappings.forEach(mapping => {
                        const node = window.renderMappingCard(mapping);
                        if (node instanceof Node) {
                            fragment.appendChild(node);
                        }
                    });
                    container.appendChild(fragment);
                }

                // Update UI elements
                const emptyState = document.getElementById('mappings-empty');
                const loadingState = document.getElementById('mappings-loading');

                if (window.allMappings.length === 0) {
                    if (emptyState) emptyState.classList.remove('hidden');
                    if (container) container.style.display = 'none';
                } else {
                    if (emptyState) emptyState.classList.add('hidden');
                    if (container) container.style.display = 'block';
                }

                if (typeof updateMappingsCounter === 'function') {
                    updateMappingsCounter();
                }
            }
        }
    },
    
    // Apply request filters
    applyRequestFilters() {
        const method = document.getElementById('req-filter-method')?.value || '';
        const status = document.getElementById('req-filter-status')?.value || '';
        const url = document.getElementById('req-filter-url')?.value || '';
        const from = document.getElementById('req-filter-from')?.value || '';
        const to = document.getElementById('req-filter-to')?.value || '';

        const filters = { method, status, url, from, to };
        this.saveFilterState('requests', filters);

        // Apply filters to requests
        if (window.originalRequests && window.originalRequests.length > 0) {
            let filtered = [...window.originalRequests];

            if (method) {
                filtered = filtered.filter(request =>
                    (request.request?.method || '').toLowerCase().includes(method.toLowerCase())
                );
            }

            if (status) {
                if (status === 'matched') {
                    filtered = filtered.filter(request => request.wasMatched !== false);
                } else if (status === 'unmatched') {
                    filtered = filtered.filter(request => request.wasMatched === false);
                } else {
                    filtered = filtered.filter(request => {
                        const responseStatus = request.response?.status ?? request.responseDefinition?.status ?? '';
                        return responseStatus.toString().includes(status);
                    });
                }
            }

            if (url) {
                filtered = filtered.filter(request =>
                    (request.request?.url || '').toLowerCase().includes(url.toLowerCase())
                );
            }

            if (from) {
                const fromTime = new Date(from).getTime();
                filtered = filtered.filter(request => {
                    const requestTime = new Date(request.request?.loggedDate || request.loggedDate).getTime();
                    return requestTime >= fromTime;
                });
            }

            if (to) {
                const toTime = new Date(to).getTime();
                filtered = filtered.filter(request => {
                    const requestTime = new Date(request.request?.loggedDate || request.loggedDate).getTime();
                    return requestTime <= toTime;
                });
            }

            window.allRequests = filtered;

            // Re-render requests
            const container = document.getElementById(SELECTORS.LISTS.REQUESTS);
            if (container) {
                if (window.ListRenderer && typeof window.ListRenderer.render === 'function') {
                    window.ListRenderer.render(container, window.allRequests, window.renderRequestCard);
                } else if (typeof window.renderRequestCard === 'function') {
                    container.innerHTML = '';
                    const fragment = document.createDocumentFragment();
                    window.allRequests.forEach(request => {
                        const node = window.renderRequestCard(request);
                        if (node instanceof Node) {
                            fragment.appendChild(node);
                        }
                    });
                    container.appendChild(fragment);
                }

                // Update UI elements
                const emptyState = document.getElementById('requests-empty');
                const loadingState = document.getElementById('requests-loading');

                if (window.allRequests.length === 0) {
                    if (emptyState) emptyState.classList.remove('hidden');
                    if (container) container.style.display = 'none';
                } else {
                    if (emptyState) emptyState.classList.add('hidden');
                    if (container) container.style.display = 'block';
                }

                if (typeof updateRequestsCounter === 'function') {
                    updateRequestsCounter();
                }

                console.log(`[SEARCH] Filtered requests: ${window.allRequests.length} items`);
            }
        }
    },
    
    // Restore filter state on page load
    restoreFilters(tabName) {
        const filters = this.loadFilterState(tabName);
        
        if (tabName === 'mappings') {
            if (filters.method) {
                const elem = document.getElementById('filter-method');
                if (elem) elem.value = filters.method;
            }
            if (filters.url) {
                const elem = document.getElementById('filter-url');
                if (elem) elem.value = filters.url;
            }
            if (filters.status) {
                const elem = document.getElementById('filter-status');
                if (elem) elem.value = filters.status;
            }
        } else if (tabName === 'requests') {
            if (filters.method) {
                const elem = document.getElementById('req-filter-method');
                if (elem) elem.value = filters.method;
            }
            if (filters.status) {
                const elem = document.getElementById('req-filter-status');
                if (elem) elem.value = filters.status;
            }
            if (filters.url) {
                const elem = document.getElementById('req-filter-url');
                if (elem) elem.value = filters.url;
            }
            if (filters.from) {
                const elem = document.getElementById('req-filter-from');
                if (elem) elem.value = filters.from;
            }
            if (filters.to) {
                const elem = document.getElementById('req-filter-to');
                if (elem) elem.value = filters.to;
            }
        }
    }
};

console.log('[OK] Managers.js loaded - NotificationManager, TabManager, FilterManager');
