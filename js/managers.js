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

Logger.info('MANAGERS', 'Managers.js loaded - NotificationManager, TabManager, URL helpers');
