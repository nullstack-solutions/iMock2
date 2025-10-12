'use strict';

(function initializeFeatureState(global) {
    const window = global;
    const state = window.FeaturesState || {};

    if (!Array.isArray(window.originalMappings)) {
        window.originalMappings = [];
    }
    if (!Array.isArray(window.allMappings)) {
        window.allMappings = [];
    }
    if (!Array.isArray(window.originalRequests)) {
        window.originalRequests = [];
    }
    if (!Array.isArray(window.allRequests)) {
        window.allRequests = [];
    }
    if (!(window.mappingIndex instanceof Map)) {
        window.mappingIndex = new Map();
    }
    if (typeof window.mappingTabTotals !== 'object' || window.mappingTabTotals === null) {
        window.mappingTabTotals = { all: 0, get: 0, post: 0, put: 0, patch: 0, delete: 0 };
    }
    if (typeof window.requestTabTotals !== 'object' || window.requestTabTotals === null) {
        window.requestTabTotals = { all: 0, matched: 0, unmatched: 0 };
    }
    if (!(window.pendingDeletedIds instanceof Set)) {
        window.pendingDeletedIds = new Set();
    }
    if (!(window.deletionTimeouts instanceof Map)) {
        window.deletionTimeouts = new Map();
    }

    if (typeof window.isDemoMode === 'undefined') {
        window.isDemoMode = false;
    }
    if (typeof window.demoModeAnnounced === 'undefined') {
        window.demoModeAnnounced = false;
    }
    if (typeof window.demoModeLastError === 'undefined') {
        window.demoModeLastError = null;
    }

    let mappingsFetchPromise = null;

    function markDemoModeActive(reason = 'automatic') {
        window.isDemoMode = true;
        window.demoModeReason = reason;
        if (!window.demoModeAnnounced && typeof window.NotificationManager !== 'undefined' && window.NotificationManager?.info) {
            window.NotificationManager.info('WireMock API unreachable. Showing demo data so the interface stays interactive.');
            window.demoModeAnnounced = true;
        }
    }

    function addMappingToIndex(mapping) {
        if (!mapping || typeof mapping !== 'object') {
            return;
        }
        if (!(window.mappingIndex instanceof Map)) {
            window.mappingIndex = new Map();
        }

        const identifiers = new Set();
        const fields = ['id', 'uuid', 'stubMappingId', 'stubId', 'mappingId'];
        fields.forEach(field => {
            const value = mapping[field];
            if (value) {
                identifiers.add(String(value).trim());
            }
        });
        if (mapping.metadata?.id) {
            identifiers.add(String(mapping.metadata.id).trim());
        }

        identifiers.forEach(id => {
            if (id) {
                window.mappingIndex.set(id, mapping);
            }
        });
    }

    function rebuildMappingIndex(mappings) {
        if (!(window.mappingIndex instanceof Map)) {
            window.mappingIndex = new Map();
        } else {
            window.mappingIndex.clear();
        }
        if (!Array.isArray(mappings)) {
            return;
        }
        mappings.forEach(addMappingToIndex);
    }

    function computeMappingTabTotals(source = []) {
        const totals = { all: 0, get: 0, post: 0, put: 0, patch: 0, delete: 0 };
        if (!Array.isArray(source) || source.length === 0) {
            return totals;
        }

        totals.all = source.length;
        source.forEach(mapping => {
            const method = (mapping?.request?.method || '').toLowerCase();
            if (Object.prototype.hasOwnProperty.call(totals, method)) {
                totals[method] += 1;
            }
        });
        return totals;
    }

    function refreshMappingTabSnapshot() {
        window.mappingTabTotals = computeMappingTabTotals(window.originalMappings);
        if (typeof window.updateMappingTabCounts === 'function') {
            window.updateMappingTabCounts();
        }
    }

    function computeRequestTabTotals(source = []) {
        const totals = { all: 0, matched: 0, unmatched: 0 };
        if (!Array.isArray(source) || source.length === 0) {
            return totals;
        }

        totals.all = source.length;
        source.forEach(request => {
            const matched = request?.wasMatched !== false;
            if (matched) {
                totals.matched += 1;
            } else {
                totals.unmatched += 1;
            }
        });
        return totals;
    }

    function refreshRequestTabSnapshot() {
        window.requestTabTotals = computeRequestTabTotals(window.originalRequests);
        if (typeof window.updateRequestTabCounts === 'function') {
            window.updateRequestTabCounts();
        }
    }

    function removeMappingFromIndex(identifier) {
        if (!(window.mappingIndex instanceof Map)) {
            return;
        }
        const mapping = typeof identifier === 'object' ? identifier : window.mappingIndex.get(identifier);
        if (!mapping) {
            return;
        }
        for (const [key, value] of window.mappingIndex.entries()) {
            if (value === mapping || key === identifier) {
                window.mappingIndex.delete(key);
            }
        }
    }

    async function fetchMappingsFromServer({ force = false } = {}) {
        if (!force && mappingsFetchPromise) {
            return mappingsFetchPromise;
        }

        if (force && mappingsFetchPromise) {
            try {
                await mappingsFetchPromise;
            } catch (error) {
                console.warn('fetchMappingsFromServer: previous request failed, starting a new one', error);
            }
        }

        const requestPromise = (async () => {
            try {
                return await window.apiFetch(window.ENDPOINTS.MAPPINGS);
            } catch (error) {
                if (window.DemoData?.isAvailable?.() && window.DemoData?.getMappingsPayload) {
                    console.warn('⚠️ Falling back to demo mappings because the WireMock API request failed.', error);
                    window.demoModeLastError = error;
                    markDemoModeActive('mappings-fallback');
                    return window.DemoData.getMappingsPayload();
                }
                throw error;
            } finally {
                if (mappingsFetchPromise === requestPromise) {
                    mappingsFetchPromise = null;
                }
            }
        })();

        mappingsFetchPromise = requestPromise;
        return requestPromise;
    }

    state.markDemoModeActive = markDemoModeActive;
    state.addMappingToIndex = addMappingToIndex;
    state.rebuildMappingIndex = rebuildMappingIndex;
    state.computeMappingTabTotals = computeMappingTabTotals;
    state.refreshMappingTabSnapshot = refreshMappingTabSnapshot;
    state.computeRequestTabTotals = computeRequestTabTotals;
    state.refreshRequestTabSnapshot = refreshRequestTabSnapshot;
    state.removeMappingFromIndex = removeMappingFromIndex;
    state.fetchMappingsFromServer = fetchMappingsFromServer;

    window.markDemoModeActive = markDemoModeActive;
    window.addMappingToIndex = addMappingToIndex;
    window.rebuildMappingIndex = rebuildMappingIndex;
    window.computeMappingTabTotals = computeMappingTabTotals;
    window.refreshMappingTabSnapshot = refreshMappingTabSnapshot;
    window.computeRequestTabTotals = computeRequestTabTotals;
    window.refreshRequestTabSnapshot = refreshRequestTabSnapshot;
    window.removeMappingFromIndex = removeMappingFromIndex;
    window.fetchMappingsFromServer = fetchMappingsFromServer;

    window.FeaturesState = state;

    if (typeof window.dispatchEvent === 'function') {
        let readyEvent;
        if (typeof window.CustomEvent === 'function') {
            readyEvent = new CustomEvent('features:state-ready', { detail: { state } });
        } else if (typeof document !== 'undefined' && document.createEvent) {
            readyEvent = document.createEvent('Event');
            readyEvent.initEvent('features:state-ready', false, false);
            readyEvent.detail = { state };
        }

        if (readyEvent) {
            window.dispatchEvent(readyEvent);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
