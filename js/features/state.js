'use strict';

(function initializeFeatureState(global) {
    const window = global;
    const state = window.FeaturesState || {};

    // Threshold for reusing recently completed fetch results to avoid redundant requests
    // When a force refresh is requested but a result just completed, reuse it if within this window
    const FETCH_REUSE_WINDOW_MS = 1000;

    if (!(window.mappingIndex instanceof Map)) window.mappingIndex = new Map();
    window.mappingTabTotals ??= { all: 0, get: 0, post: 0, put: 0, patch: 0, delete: 0 };
    window.requestTabTotals ??= { all: 0, matched: 0, unmatched: 0 };
    if (!(window.pendingDeletedIds instanceof Set)) window.pendingDeletedIds = new Set();
    if (!(window.deletionTimeouts instanceof Map)) window.deletionTimeouts = new Map();
    window.isDemoMode ??= false;
    window.demoModeAnnounced ??= false;
    window.demoModeLastError ??= null;

    let mappingsFetchPromise = null;

    function markDemoModeActive(reason = 'automatic') {
        window.isDemoMode = true;
        window.demoModeReason = reason;
        if (!window.demoModeAnnounced && window.NotificationManager?.info) {
            window.NotificationManager.info('WireMock API unreachable. Showing demo data so the interface stays interactive.');
            window.demoModeAnnounced = true;
        }
    }

    function addMappingToIndex(mapping) {
        if (!mapping || typeof mapping !== 'object') return;
        if (!(window.mappingIndex instanceof Map)) window.mappingIndex = new Map();
        const identifiers = new Set();
        ['id', 'uuid', 'stubMappingId', 'stubId', 'mappingId'].forEach(field => { if (mapping[field]) identifiers.add(String(mapping[field]).trim()); });
        if (mapping.metadata?.id) identifiers.add(String(mapping.metadata.id).trim());
        identifiers.forEach(id => { if (id) window.mappingIndex.set(id, mapping); });
    }

    function rebuildMappingIndex(mappings) {
        if (!(window.mappingIndex instanceof Map)) window.mappingIndex = new Map();
        else window.mappingIndex.clear();
        if (Array.isArray(mappings)) mappings.forEach(addMappingToIndex);
    }

function computeMappingTabTotals(source = []) {
        const totals = { all: 0, get: 0, post: 0, put: 0, patch: 0, delete: 0 };
        
        // If no source provided, use MappingsStore
        if (!Array.isArray(source) || source.length === 0) {
            source = window.MappingsStore?.getAll ? window.MappingsStore.getAll() : [];
        }
        
        if (!Array.isArray(source) || source.length === 0) return totals;
        totals.all = source.length;
        source.forEach(mapping => { const method = (mapping?.request?.method || '').toLowerCase(); if (Object.prototype.hasOwnProperty.call(totals, method)) totals[method] += 1; });
        return totals;
    }

function refreshMappingTabSnapshot() {
        // Use MappingsStore as single source of truth
        const mappings = window.MappingsStore?.getAll ? window.MappingsStore.getAll() : [];
        window.mappingTabTotals = computeMappingTabTotals(mappings);
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
        // Use MappingsStore for requests
        const requests = window.MappingsStore?.getAllRequests ? window.MappingsStore.getAllRequests() : [];
        window.requestTabTotals = computeRequestTabTotals(requests);
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
        // If there's already an in-flight request, return it (deduplicate)
        if (mappingsFetchPromise) {
            if (!force) {
                Logger.debug('STATE', 'fetchMappingsFromServer: reusing in-flight request');
                return mappingsFetchPromise;
            }
            // If force=true, wait for existing request to complete first
            // This prevents overlapping parallel requests
            try {
                Logger.debug('STATE', 'fetchMappingsFromServer: waiting for in-flight request before force refresh');
                const result = await mappingsFetchPromise;
                // If the in-flight request just completed, return its result
                // unless we really need fresh data
                const timeSinceResult = Date.now() - (window._lastMappingsFetchTime || 0);
                if (timeSinceResult < FETCH_REUSE_WINDOW_MS) {
                    Logger.debug('STATE', 'fetchMappingsFromServer: reusing just-completed result');
                    return result;
                }
            } catch (error) {
                Logger.warn('STATE', 'fetchMappingsFromServer: previous request failed, starting a new one', error);
            }
        }

        const requestPromise = (async () => {
            try {
                const result = await window.apiFetch(window.ENDPOINTS.MAPPINGS);
                window._lastMappingsFetchTime = Date.now();
                return result;
            } catch (error) {
                if (window.DemoData?.isAvailable?.() && window.DemoData?.getMappingsPayload) {
                    Logger.warn('STATE', 'Falling back to demo mappings because the WireMock API request failed.', error);
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

    function updateOptimisticCache(mapping, operation, options = {}) {
        try {
            if (!mapping) {
                Logger.warn('STATE', 'updateOptimisticCache: no mapping provided');
                return;
            }

            const mappingId = mapping.id || mapping.uuid;

            // For delete operations, we only need the ID
            if (operation === 'delete') {
                if (!mappingId) {
                    Logger.warn('STATE', 'updateOptimisticCache: delete operation requires mapping ID');
                    return;
                }

                // Remove from MappingsStore
                if (window.MappingsStore?.items instanceof Map) {
                    window.MappingsStore.items.delete(mappingId);

                    // Add to pending deletions
                    if (typeof window.MappingsStore?.addPending === 'function') {
                        window.MappingsStore.addPending({
                            id: mappingId,
                            type: 'delete',
                            payload: null,
                            optimisticMapping: null
                        });
                    }

                    // Rebuild indexes
                    if (typeof window.MappingsStore.rebuildIndexes === 'function') {
                        window.MappingsStore.rebuildIndexes();
                    }
                }

                // Refresh UI
                window.cacheLastUpdate = Date.now();
                if (typeof window.refreshMappingsFromCache === 'function') {
                    window.refreshMappingsFromCache();
                }

                Logger.info('STATE', 'Deleted mapping from optimistic cache:', mappingId);
                return;
            }

            // For create/update operations
            if (!mappingId) {
                Logger.warn('STATE', 'updateOptimisticCache: mapping must have an id or uuid');
                return;
            }

            // Update MappingsStore
            if (window.MappingsStore?.items instanceof Map) {
                const existingMapping = window.MappingsStore.items.get(mappingId);

                // Merge with existing data if updating
                const finalMapping = existingMapping && operation === 'update'
                    ? { ...existingMapping, ...mapping }
                    : mapping;

                window.MappingsStore.items.set(mappingId, finalMapping);

                // Add to pending operations if queueMode is 'add'
                if (options.queueMode === 'add' && typeof window.MappingsStore?.addPending === 'function') {
                    window.MappingsStore.addPending({
                        id: mappingId,
                        type: operation,
                        payload: mapping,
                        optimisticMapping: finalMapping
                    });
                }
                // Confirm operation if queueMode is 'confirm'
                else if (options.queueMode === 'confirm' && typeof window.MappingsStore?.confirmPending === 'function') {
                    window.MappingsStore.confirmPending(mappingId);
                }

                // Rebuild indexes
                if (typeof window.MappingsStore.rebuildIndexes === 'function') {
                    window.MappingsStore.rebuildIndexes();
                }
            }

            // Refresh UI
            window.cacheLastUpdate = Date.now();
            if (typeof window.refreshMappingsFromCache === 'function') {
                window.refreshMappingsFromCache();
            }

            Logger.info('STATE', `[updateOptimisticCache] ${operation} mapping:`, mappingId);

        } catch (error) {
            Logger.error('STATE', 'updateOptimisticCache failed:', error);
        }
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
    state.updateOptimisticCache = updateOptimisticCache;

    window.markDemoModeActive = markDemoModeActive;
    window.addMappingToIndex = addMappingToIndex;
    window.rebuildMappingIndex = rebuildMappingIndex;
    window.computeMappingTabTotals = computeMappingTabTotals;
    window.refreshMappingTabSnapshot = refreshMappingTabSnapshot;
    window.computeRequestTabTotals = computeRequestTabTotals;
    window.refreshRequestTabSnapshot = refreshRequestTabSnapshot;
    window.removeMappingFromIndex = removeMappingFromIndex;
    window.fetchMappingsFromServer = fetchMappingsFromServer;
    window.updateOptimisticCache = updateOptimisticCache;

    window.FeaturesState = state;

    Logger.info('STATE', 'state.js loaded - State management functions registered');

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
