'use strict';

const CUSTOM_PRESETS_KEY = 'imock-filter-presets-custom';

window.FilterPresetsManager = {
    getAllPresets() {
        try {
            const customPresets = localStorage.getItem(CUSTOM_PRESETS_KEY);
            return customPresets ? JSON.parse(customPresets) : {};
        } catch (error) {
            Logger.warn('MANAGERS', 'Failed to load custom presets:', error);
            return {};
        }
    },

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

            if (typeof window.applyFilters === 'function') {
                window.applyFilters();
            }

            if (preset.filters.method && typeof window.syncFilterTabsFromSelect === 'function') {
                window.syncFilterTabsFromSelect('mapping', preset.filters.method);
            }

            if (typeof NotificationManager !== 'undefined') {
                NotificationManager.info(`Applied preset: ${preset.name}`);
            }
        }
    },

    saveCustomPreset(presetId, presetData) {
        try {
            const customPresets = this.getCustomPresets();
            customPresets[presetId] = presetData;
            localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets));

            if (typeof NotificationManager !== 'undefined') {
                NotificationManager.success(`Preset "${presetData.name}" saved`);
            }

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

    getCustomPresets() {
        try {
            const customPresets = localStorage.getItem(CUSTOM_PRESETS_KEY);
            return customPresets ? JSON.parse(customPresets) : {};
        } catch (error) {
            Logger.warn('MANAGERS', 'Failed to load custom presets:', error);
            return {};
        }
    },

    deleteCustomPreset(presetId) {
        try {
            const customPresets = this.getCustomPresets();
            delete customPresets[presetId];
            localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets));

            if (typeof NotificationManager !== 'undefined') {
                NotificationManager.success('Preset deleted');
            }

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

Logger.info('MANAGERS', 'Filter presets manager loaded');
