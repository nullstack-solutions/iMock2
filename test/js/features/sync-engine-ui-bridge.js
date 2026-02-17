'use strict';

(function initialiseSyncEngineUiBridge() {
    if (window.__syncEngineUiBridgeReady) {
        return;
    }
    window.__syncEngineUiBridgeReady = true;

    const on = (eventName, handler) => {
        if (!window.AppEvents || typeof window.AppEvents.on !== 'function') {
            return;
        }
        window.AppEvents.on(eventName, handler);
    };

    on('sync:loading', () => {
        if (typeof window.showLoadingState === 'function') {
            window.showLoadingState();
        }
    });

    on('sync:render-mappings', (event) => {
        if (typeof window.fetchAndRenderMappings !== 'function') {
            return;
        }
        const detail = event?.detail || {};
        const mappings = Array.isArray(detail.mappings)
            ? detail.mappings
            : (window.MappingsStore?.getAll?.() || []);
        window.fetchAndRenderMappings(mappings, {
            source: detail.source || 'direct',
            skipSyncCheck: detail.skipSyncCheck === true,
        });
    });

    on('sync:apply-mapping-filters', () => {
        if (window.FilterManager && typeof window.FilterManager.applyMappingFilters === 'function') {
            window.FilterManager.applyMappingFilters();
        }
    });

    on('sync:data-source', (event) => {
        if (typeof window.updateDataSourceIndicator !== 'function') {
            return;
        }
        const source = event?.detail?.source;
        if (typeof source === 'string' && source.length > 0) {
            window.updateDataSourceIndicator(source);
        }
    });

    on('sync:indicator', (event) => {
        const indicator = document.getElementById('sync-indicator');
        if (!indicator) {
            return;
        }
        const isActive = event?.detail?.active === true;
        indicator.classList.toggle('is-active', isActive);
    });

    on('sync:notify', (event) => {
        const detail = event?.detail || {};
        const level = detail.level || 'warning';
        const message = detail.message;
        if (!message || !window.NotificationManager) {
            return;
        }
        if (typeof window.NotificationManager[level] === 'function') {
            window.NotificationManager[level](message);
        } else if (typeof window.NotificationManager.warning === 'function') {
            window.NotificationManager.warning(message);
        }
    });

    on('wiremock:success', (event) => {
        const timestamp = event?.detail?.timestamp;
        if (typeof timestamp === 'number') {
            window.lastWiremockSuccess = timestamp;
        }
        if (window.Utils && typeof window.Utils.safeCall === 'function') {
            window.Utils.safeCall(window.updateLastSuccessUI);
        } else if (typeof window.updateLastSuccessUI === 'function') {
            try {
                window.updateLastSuccessUI();
            } catch (_) {}
        }
    });
})();
