'use strict';

(function(global) {
    const window = global;

    function initFeatures(state) {
        if (!state) return false;

        // --- UPTIME ---
        window.updateUptime = () => {
            if (!window.startTime) return;
            const diff = Math.floor((Date.now() - window.startTime) / 1000);
            const h = Math.floor(diff / 3600);
            const m = Math.floor((diff % 3600) / 60);
            const s = diff % 60;
            const el = document.getElementById('uptime');
            if (el) el.textContent = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
        };

        window.stopUptime = () => {
            if (window.uptimeInterval) clearInterval(window.uptimeInterval);
            window.startTime = null;
            const el = document.getElementById('uptime');
            if (el) el.textContent = '0s';
        };

        // --- COMPATIBILITY WRAPPERS ---
        window.checkHealth = async () => {
            try {
                await window.checkHealthAndStartUptime();
                NotificationManager.success('Online');
            } catch (e) { NotificationManager.error('Offline'); }
        };

        window.refreshMappings = async () => {
            const success = await fetchAndRenderMappings(null, { useCache: isCacheEnabled() });
            if (success) NotificationManager.success('Refreshed');
        };

        window.loadMockData = async () => {
            const loader = window.DemoMode?.createLoader({
                markDemoModeActive: window.markDemoModeActive,
                notificationManager: NotificationManager,
                fetchAndRenderMappings,
                fetchAndRenderRequests,
                isDatasetAvailable: () => window.DemoData?.isAvailable?.(),
                getDataset: () => window.DemoData?.getDataset?.(),
            });
            return loader ? await loader() : NotificationManager.error('Demo mode unavailable');
        };

        // --- IMPORT / EXPORT ---
        window.updateFileDisplay = () => {
            const input = document.getElementById(SELECTORS.IMPORT.FILE);
            const display = document.getElementById(SELECTORS.IMPORT.DISPLAY);
            if (!input || !display) return;
            const file = input.files[0];
            display.innerHTML = file ? `<strong>${file.name}</strong> (${Math.round(file.size / 1024)} KB)` : 'No file selected';
            const actions = document.getElementById(SELECTORS.IMPORT.ACTIONS);
            if (actions) actions.style.display = file ? 'block' : 'none';
        };

        window.executeImport = async () => {
            const input = document.getElementById(SELECTORS.IMPORT.FILE);
            if (!input?.files[0]) return;
            
            try {
                const text = await input.files[0].text();
                const payload = JSON.parse(text);
                await apiFetch(ENDPOINTS.MAPPINGS_IMPORT, { method: 'POST', body: JSON.stringify(payload) });
                NotificationManager.success('Imported successfully');
                window.refreshMappings();
            } catch (e) { NotificationManager.error('Import failed: ' + e.message); }
        };

        window.exportMappings = async () => {
            try {
                const data = await apiFetch(ENDPOINTS.MAPPINGS);
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `mappings-${Date.now()}.json`;
                a.click();
            } catch (e) { NotificationManager.error('Export failed'); }
        };

        return true;
    }

    // Bootstrap
    if (!initFeatures(window.FeaturesState)) {
        window.addEventListener('features:state-ready', (e) => initFeatures(e.detail.state));
    }

})(typeof window !== 'undefined' ? window : globalThis);