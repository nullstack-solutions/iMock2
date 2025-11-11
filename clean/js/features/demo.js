'use strict';

(function initDemoMode(global) {
    function createDemoLoader(dependencies = {}) {
        const {
            markDemoModeActive,
            notificationManager,
            fetchAndRenderMappings,
            fetchAndRenderRequests,
            isDatasetAvailable,
            getDataset,
        } = dependencies;

        if (typeof markDemoModeActive !== 'function') {
            throw new Error('Demo loader requires markDemoModeActive callback');
        }
        if (!notificationManager || typeof notificationManager === 'function') {
            throw new Error('Demo loader requires a notification manager object');
        }
        if (typeof fetchAndRenderMappings !== 'function') {
            throw new Error('Demo loader requires fetchAndRenderMappings function');
        }
        if (typeof fetchAndRenderRequests !== 'function') {
            throw new Error('Demo loader requires fetchAndRenderRequests function');
        }

        const notifySuccess = notificationManager?.success?.bind(notificationManager)
            || notificationManager?.info?.bind(notificationManager)
            || ((message) => console.warn('[DEMO]', message));
        const notifyError = notificationManager?.error?.bind(notificationManager)
            || notificationManager?.warning?.bind(notificationManager)
            || ((message) => console.warn('[DEMO]', message));
        const notifyWarning = notificationManager?.warning?.bind(notificationManager)
            || notificationManager?.info?.bind(notificationManager)
            || ((message) => console.warn('[DEMO]', message));

        return async function loadDemoData() {
            const available = typeof isDatasetAvailable === 'function'
                ? isDatasetAvailable()
                : true;

            if (!available) {
                notifyError('Demo dataset is not available in this build.');
                return {
                    status: 'unavailable',
                    mappingsLoaded: false,
                    requestsLoaded: false,
                    errors: [],
                };
            }

            const dataset = typeof getDataset === 'function' ? getDataset() : null;
            if (!dataset) {
                notifyError('Unable to load the demo dataset.');
                return {
                    status: 'missing',
                    mappingsLoaded: false,
                    requestsLoaded: false,
                    errors: [],
                };
            }

            const mappings = Array.isArray(dataset.mappings) ? dataset.mappings : [];
            const requests = Array.isArray(dataset.requests) ? dataset.requests : [];

            markDemoModeActive('manual-trigger');

            const [mappingsOutcome, requestsOutcome] = await Promise.allSettled([
                fetchAndRenderMappings(mappings, { source: 'demo' }),
                fetchAndRenderRequests(requests, { source: 'demo' }),
            ]);

            const mappingsLoaded = mappingsOutcome.status === 'fulfilled'
                ? mappingsOutcome.value !== false
                : false;
            const requestsLoaded = requestsOutcome.status === 'fulfilled'
                ? requestsOutcome.value !== false
                : false;

            const errors = [];
            if (mappingsOutcome.status === 'rejected') {
                errors.push(mappingsOutcome.reason);
            }
            if (requestsOutcome.status === 'rejected') {
                errors.push(requestsOutcome.reason);
            }

            const status = mappingsLoaded && requestsLoaded
                ? 'success'
                : (mappingsLoaded || requestsLoaded ? 'partial' : 'failed');

            if (status === 'success') {
                notifySuccess('Demo data loaded locally. Explore the interface freely.');
            } else {
                notifyWarning('Demo data only loaded partially. Check the console for details.');
                if (errors.length) {
                    notifyError('Some demo data failed to load. Inspect console for details.');
                }
            }

            return {
                status,
                mappingsLoaded,
                requestsLoaded,
                errors,
            };
        };
    }

    global.DemoMode = {
        createLoader: createDemoLoader,
    };

})(typeof window !== 'undefined' ? window : globalThis);
