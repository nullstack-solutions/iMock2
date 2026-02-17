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
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '⛔'
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
                if (window.LifecycleManager) {
                    window.LifecycleManager.addEventListener(document, 'keydown', this._boundHandleKeydown);
                } else {
                    document.addEventListener('keydown', this._boundHandleKeydown);
                }
            }
        },

        cleanup() {
            if (this._boundHandleKeydown) {
                if (window.LifecycleManager) {
                    window.LifecycleManager.removeEventListener(document, 'keydown', this._boundHandleKeydown);
                } else {
                    document.removeEventListener('keydown', this._boundHandleKeydown);
                }
                this._boundHandleKeydown = null;
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
                countEl.textContent = `×${payload.count}`;
                countEl.setAttribute('aria-label', `${payload.count} occurrences`);
            }

            const actions = document.createElement('div');
            actions.className = 'toast-actions';

            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'toast-close';
            closeButton.setAttribute('aria-label', 'Dismiss notification');
            closeButton.textContent = '✕';
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
                        countEl.textContent = `×${dedupeEntry.count}`;
                        countEl.setAttribute('aria-label', `${dedupeEntry.count} occurrences`);
                    } else if (content) {
                        const newCountEl = document.createElement('span');
                        newCountEl.className = 'toast-count';
                        newCountEl.textContent = `×${dedupeEntry.count}`;
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

    /**
     * Get currently active tab name
     * @returns {string} Active tab name ('mappings', 'requests', or 'scenarios')
     */
    getCurrentTab() {
        // Find active tab button
        const activeButton = document.querySelector('.tab-link.active');
        if (activeButton) {
            // Extract tab name from onclick attribute or data attribute
            const onclick = activeButton.getAttribute('onclick');
            if (onclick) {
                const match = onclick.match(/showTab\(['"](\w+)['"]\)/);
                if (match) return match[1];
            }
        }
        // Default to mappings if no active tab found
        return 'mappings';
    },

    async refresh(tabName) {
        const config = this.configs[tabName];
        if (!config) { Logger.warn('MANAGERS', `Tab config not found: ${tabName}`); return; }
        try {
            const loadFn = window[config.loadFunction];
            if (typeof loadFn === 'function') {
                await loadFn();
                Logger.info('MANAGERS', `${config.name} refreshed`);
            } else {
                Logger.warn('MANAGERS', `Load function not found: ${config.loadFunction}`);
            }
        } catch (error) {
            Logger.error('MANAGERS', `Error refreshing ${config.name}:`, error);
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
                Logger.info('MANAGERS', `${config.name} filters cleared`);
            }
        } catch (error) {
            Logger.error('MANAGERS', `Error clearing ${config.name} filters:`, error);
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
            Logger.warn('MANAGERS', 'Failed to save filter state:', e);
        }
    },
    
    // Load filter state from localStorage
    loadFilterState(tabName) {
        try {
            const key = `imock-filters-${tabName}`;
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            Logger.warn('MANAGERS', 'Failed to load filter state:', e);
            return {};
        }
    },
    
    // Apply mapping filters
    applyMappingFilters() {
        if (typeof this._applyMappingFilters !== 'function') {
            return;
        }
        this._applyMappingFilters();
    },

    flushMappingFilters() {
        if (this._applyMappingFilters && typeof this._applyMappingFilters.flush === 'function') {
            this._applyMappingFilters.flush();
        }
    },
    
    // Apply request filters
    applyRequestFilters() {
        if (typeof this._applyRequestFilters !== 'function') {
            return;
        }
        this._applyRequestFilters();
    },

    flushRequestFilters() {
        if (this._applyRequestFilters && typeof this._applyRequestFilters.flush === 'function') {
            this._applyRequestFilters.flush();
        }
    },
    
    // Restore filter state on page load
    // Priority: URL params > localStorage
    restoreFilters(tabName) {
        if (tabName === 'mappings') {
            // First check URL parameters (for sharing) - tab-scoped
            const urlFilter = getFilterFromURL('mappings');

            if (urlFilter) {
                // URL has priority - restore from URL
                const elem = document.getElementById('filter-query');
                if (elem) elem.value = urlFilter;
                return { query: urlFilter };
            } else {
                // Fallback to localStorage
                const filters = this.loadFilterState(tabName);
                if (filters.query) {
                    const elem = document.getElementById('filter-query');
                    if (elem) elem.value = filters.query;
                }
                return filters;
            }
        } else if (tabName === 'requests') {
            // Check URL parameters first (for sharing) - tab-scoped
            const urlFilter = getFilterFromURL('requests');

            if (urlFilter) {
                // URL has priority - restore from URL
                const elem = document.getElementById('req-filter-query');
                if (elem) {
                    elem.value = urlFilter;
                    return { query: urlFilter };
                }
            }

            // Fallback to localStorage
            const filters = this.loadFilterState(tabName);

            // Restore query-based filter
            const queryElem = document.getElementById('req-filter-query');
            if (queryElem && filters.query) {
                queryElem.value = filters.query;
            }

            // Restore time range filters (always restore from/to regardless of query)
            const fromElem = document.getElementById('req-filter-from');
            const toElem = document.getElementById('req-filter-to');
            if (fromElem) fromElem.value = filters.from || '';
            if (toElem) toElem.value = filters.to || '';

            return filters;
        }

        return {};
    },

    /**
     * Check if URL has any filter parameters
     * @param {string} tabName - 'mappings' or 'requests'
     * @returns {boolean}
     */
    hasURLFilters(tabName) {
        const filters = this.getFiltersFromURL(tabName);
        return Object.values(filters).some(value => value !== '');
    }
};

// ==========================================
// Filter Presets Manager
// ==========================================
window.FilterPresetsManager = {
    /**
     * Get all custom presets
     * @returns {Object} Custom presets
     */
    getAllPresets() {
        try {
            const customPresets = localStorage.getItem('imock-filter-presets-custom');
            return customPresets ? JSON.parse(customPresets) : {};
        } catch (error) {
            Logger.warn('MANAGERS', 'Failed to load custom presets:', error);
            return {};
        }
    },

    /**
     * Apply a preset by ID
     * @param {string} presetId - Preset identifier
     * @param {string} tabName - 'mappings' or 'requests'
     */
    applyPreset(presetId, tabName = 'mappings') {
        const presets = this.getAllPresets();
        const preset = presets[presetId];

        if (!preset) {
            Logger.warn('MANAGERS', `Preset not found: ${presetId}`);
            return;
        }

        if (tabName === 'mappings') {
            const methodElem = document.getElementById('filter-method');
            const queryElem = document.getElementById('filter-url');
            const statusElem = document.getElementById('filter-status');

            if (methodElem) methodElem.value = preset.filters.method || '';
            if (queryElem) queryElem.value = preset.filters.query || '';
            if (statusElem) statusElem.value = preset.filters.status || '';

            // Apply filters
            if (typeof window.applyFilters === 'function') {
                window.applyFilters();
            }

            // Sync tabs
            if (preset.filters.method && typeof window.syncFilterTabsFromSelect === 'function') {
                window.syncFilterTabsFromSelect('mapping', preset.filters.method);
            }

            // Show notification
            if (typeof NotificationManager !== 'undefined') {
                NotificationManager.info(`Applied preset: ${preset.name}`);
            }
        }
    },

    /**
     * Save a custom preset
     * @param {string} presetId - Unique preset ID
     * @param {Object} presetData - Preset data { name, icon, filters }
     */
    saveCustomPreset(presetId, presetData) {
        try {
            const customPresets = this.getCustomPresets();
            customPresets[presetId] = presetData;
            localStorage.setItem('imock-filter-presets-custom', JSON.stringify(customPresets));

            if (typeof NotificationManager !== 'undefined') {
                NotificationManager.success(`Preset "${presetData.name}" saved`);
            }

            // Refresh preset UI if available
            if (typeof window.renderFilterPresets === 'function') {
                window.renderFilterPresets();
            }
        } catch (error) {
            Logger.error('MANAGERS', 'Failed to save preset:', error);
            if (typeof NotificationManager !== 'undefined') {
                NotificationManager.error('Failed to save preset');
            }
        }
    },

    /**
     * Get custom presets only
     * @returns {Object} Custom presets
     */
    getCustomPresets() {
        try {
            const customPresets = localStorage.getItem('imock-filter-presets-custom');
            return customPresets ? JSON.parse(customPresets) : {};
        } catch (error) {
            Logger.warn('MANAGERS', 'Failed to load custom presets:', error);
            return {};
        }
    },

    /**
     * Delete a custom preset
     * @param {string} presetId - Preset ID to delete
     */
    deleteCustomPreset(presetId) {
        try {
            const customPresets = this.getCustomPresets();
            delete customPresets[presetId];
            localStorage.setItem('imock-filter-presets-custom', JSON.stringify(customPresets));

            if (typeof NotificationManager !== 'undefined') {
                NotificationManager.success('Preset deleted');
            }

            // Refresh preset UI
            if (typeof window.renderFilterPresets === 'function') {
                window.renderFilterPresets();
            }
        } catch (error) {
            Logger.error('MANAGERS', 'Failed to delete preset:', error);
            if (typeof NotificationManager !== 'undefined') {
                NotificationManager.error('Failed to delete preset');
            }
        }
    },

    /**
     * Get current filters as preset data
     * @param {string} tabName - 'mappings' or 'requests'
     * @returns {Object} Current filters
     */
    getCurrentFiltersAsPreset(tabName = 'mappings') {
        if (tabName === 'mappings') {
            return {
                method: document.getElementById('filter-method')?.value || '',
                query: document.getElementById('filter-url')?.value || '',
                status: document.getElementById('filter-status')?.value || ''
            };
        }
        return {};
    }
};

// ===== URL Filter Parameters for Sharing =====

/**
 * Update URL with filter query parameter for sharing (tab-scoped)
 * @param {string} query - Filter query string
 * @param {string} tabName - Tab name ('mappings' or 'requests')
 */
function updateURLFilterParams(query, tabName = 'mappings') {
    if (!window.history || !window.history.replaceState) return;

    const url = new URL(window.location.href);
    const paramName = `${tabName}_filter`;

    if (query) {
        url.searchParams.set(paramName, query);
    } else {
        url.searchParams.delete(paramName);
    }

    // Note: tab parameter is managed by showPage() function
    // Don't update it here to avoid conflicts

    // Update URL without reloading page
    window.history.replaceState({}, '', url.toString());
}

/**
 * Get filter query from URL parameters (tab-scoped)
 * @param {string} tabName - Tab name ('mappings' or 'requests')
 * @returns {string|null} - Filter query or null
 */
function getFilterFromURL(tabName = 'mappings') {
    const urlParams = new URLSearchParams(window.location.search);
    const paramName = `${tabName}_filter`;
    return urlParams.get(paramName);
}

/**
 * Get active tab from URL
 * @returns {string|null} - Tab name or null
 */
function getActiveTabFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('tab');
}

// Make URL functions globally accessible
window.updateURLFilterParams = updateURLFilterParams;
window.getFilterFromURL = getFilterFromURL;
window.getActiveTabFromURL = getActiveTabFromURL;

Logger.info('MANAGERS', 'Managers.js loaded - NotificationManager, TabManager, FilterManager');
