'use strict';

(function(global) {
    const window = global;

    function createDemoLoader(dependencies = {}) {
        const {
            markDemoModeActive,
            notificationManager = {},
            fetchAndRenderMappings,
            fetchAndRenderRequests,
            isDatasetAvailable,
            getDataset,
        } = dependencies;

        if (typeof markDemoModeActive !== 'function' || 
            typeof fetchAndRenderMappings !== 'function' || 
            typeof fetchAndRenderRequests !== 'function') {
            throw new Error('Demo loader missing required dependencies');
        }

        const notify = (type, message) => {
            const fn = notificationManager[type] || notificationManager.info || console.warn;
            fn.call(notificationManager, message);
        };

        return async function loadDemoData() {
            const available = typeof isDatasetAvailable === 'function' ? isDatasetAvailable() : true;
            if (!available) {
                notify('error', 'Demo dataset is not available in this build.');
                return { status: 'unavailable' };
            }

            const dataset = typeof getDataset === 'function' ? getDataset() : null;
            if (!dataset) {
                notify('error', 'Unable to load the demo dataset.');
                return { status: 'missing' };
            }

            markDemoModeActive('manual-trigger');

            const results = await Promise.allSettled([
                fetchAndRenderMappings(dataset.mappings || [], { source: 'demo' }),
                fetchAndRenderRequests(dataset.requests || [], { source: 'demo' })
            ]);

            const [mappingsRes, requestsRes] = results;
            const success = mappingsRes.status === 'fulfilled' && requestsRes.status === 'fulfilled' &&
                            mappingsRes.value !== false && requestsRes.value !== false;

            if (success) {
                notify('success', 'Demo data loaded locally. Explore the interface freely.');
                return { status: 'success', mappingsLoaded: true, requestsLoaded: true };
            }

            const errors = results.filter(r => r.status === 'rejected').map(r => r.reason);
            notify('warning', 'Demo data only loaded partially. Check console.');
            if (errors.length > 0) {
                notify('error', 'Some demo data failed to load.');
            }

            return { 
                status: 'partial', 
                errors: errors
            };
        };
    }

    window.DemoMode = { createLoader: createDemoLoader };

})(typeof window !== 'undefined' ? window : globalThis);
