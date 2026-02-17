'use strict';

// === MANAGERS.JS ===
// Management systems for notifications, tabs, and filters

if (!window.NotificationManager) {
    Logger.warn('MANAGERS', 'NotificationManager is not loaded before managers.js');
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
