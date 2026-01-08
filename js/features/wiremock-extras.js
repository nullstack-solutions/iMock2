'use strict';

// --- NEW FUNCTIONS FOR WIREMOCK 3.13.x ---

// Fetch unused mappings
window.getUnmatchedMappings = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.MAPPINGS_UNMATCHED);
        return response.mappings || [];
    } catch (error) {
        console.error('Unmatched mappings error:', error);
        return [];
    }
};

// Remove unused mappings
window.removeUnmatchedMappings = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.MAPPINGS_UNMATCHED, {
            method: 'DELETE'
        });
        
        const count = response.mappings ? response.mappings.length : 0;
        NotificationManager.success(`Removed ${count} unused mappings`);
        
        // Refresh the mappings list
        await fetchAndRenderMappings();
        
        return response.mappings || [];
    } catch (error) {
        console.error('Remove unmatched mappings error:', error);
        NotificationManager.error(`Failed to remove unused mappings: ${error.message}`);
        return [];
    }
};

// Search mappings by metadata
window.findMappingsByMetadata = async (metadata) => {
    try {
        const response = await apiFetch(ENDPOINTS.MAPPINGS_FIND_BY_METADATA, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata)
        });
        return response.mappings || [];
    } catch (error) {
        console.error('Find mappings by metadata error:', error);
        return [];
    }
};

// Updated handler for edit results
window.handleEditSuccess = async (mapping) => {
    const id = mapping.id || mapping.uuid;

    // Add optimistic update
    window.cacheManager.addOptimisticUpdate(mapping, 'update');

    // Refresh the UI immediately
    window.applyOptimisticMappingUpdate(mapping);

    // Confirm the update after a short delay
    setTimeout(() => {
        window.cacheManager.confirmOptimisticUpdate(id);
    }, 1000);
};

console.log('✅ Features.js loaded - Business functions for mappings, requests, scenarios + WireMock 3.9.1+ API fixes');

// Update connection status text with last successful request time
window.updateLastSuccessUI = () => {
    try {
        const el = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
        if (!el) return;
        const ts = window.lastWiremockSuccess || Date.now();
        const time = new Date(ts).toLocaleTimeString();
        el.textContent = `Last OK: ${time}`;
        console.log('[HEALTH] last success UI updated:', { ts, time });
    } catch (e) {
        // noop
    }
};

// Centralized health UI updater (single source of truth)
window.applyHealthUI = (isHealthy, responseTime) => {
    try {
        window.healthState = window.healthState || { isHealthy: null, lastCheckAt: null, lastOkAt: null, lastLatencyMs: null };
        window.healthState.lastCheckAt = Date.now();
        if (isHealthy === true) {
            window.healthState.isHealthy = true;
            window.healthState.lastOkAt = Date.now();
            window.healthState.lastLatencyMs = typeof responseTime === 'number' ? responseTime : null;
        } else if (isHealthy === false) {
            window.healthState.isHealthy = false;
            window.healthState.lastLatencyMs = null;
        } // null => error/unknown

        const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
        if (healthIndicator) {
            healthIndicator.style.display = 'inline';
            if (isHealthy === true) {
                const ms = typeof responseTime === 'number' ? `${responseTime}ms` : 'OK';
                healthIndicator.innerHTML = `<span>Response Time: </span><span class="healthy">${ms}</span>`;
            } else if (isHealthy === false) {
                healthIndicator.innerHTML = `<span>Response Time: </span><span class="unhealthy">Unhealthy</span>`;
            } else {
                healthIndicator.innerHTML = `<span>Response Time: </span><span class="error">Error</span>`;
            }
        }

        // Keep status text in sync (Last OK)
        if (isHealthy === true) {
            window.lastWiremockSuccess = Date.now();
            if (typeof window.updateLastSuccessUI === 'function') window.updateLastSuccessUI();
        }
    } catch (e) {
        console.warn('applyHealthUI failed:', e);
    }
};

// Central toggle for showing metadata timestamps on mapping cards
try {
    const savedToggle = localStorage.getItem('imock-show-meta-timestamps');
    if (savedToggle !== null) {
        window.showMetaTimestamps = savedToggle === '1';
    }
} catch {}
window.toggleMetaTimestamps = () => {
    try {
        window.showMetaTimestamps = window.showMetaTimestamps === false ? true : false;
        localStorage.setItem('imock-show-meta-timestamps', window.showMetaTimestamps ? '1' : '0');
        // Re-render current list without refetch
        if (Array.isArray(window.allMappings)) {
            fetchAndRenderMappings(window.allMappings);
        }
    } catch (e) { console.warn('toggleMetaTimestamps failed:', e); }
};

// --- iMock cache mapping helpers (best-of-3 discovery) ---
const IMOCK_CACHE_ID = '00000000-0000-0000-0000-00000000cace';
const IMOCK_CACHE_URL = '/__imock/cache';

// Helper function to check if an error is an authorization error
// Checks both error properties and message content for robustness
function isAuthorizationError(error) {
    if (!error) return false;
    
    // Check status property first (if available)
    if (error.status === 401 || error.status === 403) {
        return true;
    }
    
    // Check code property (if available)
    if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN') {
        return true;
    }
    
    // Fall back to message parsing (convert to lowercase once for efficiency)
    if (error.message) {
        const lowerMessage = error.message.toLowerCase();
        return lowerMessage.includes('401') || 
               lowerMessage.includes('403') || 
               lowerMessage.includes('authorization error') ||
               lowerMessage.includes('unauthorized') ||
               lowerMessage.includes('forbidden');
    }
    
    return false;
}

// Helper function to show error notification
function showErrorNotification(message) {
    if (typeof NotificationManager !== 'undefined' && NotificationManager.error) {
        NotificationManager.error(message);
    }
}

// Helper function to show warning notification
function showWarningNotification(message) {
    if (typeof NotificationManager !== 'undefined' && NotificationManager.warning) {
        NotificationManager.warning(message);
    }
}

// Helper to show appropriate notification based on error type
function notifyError(error, authMessage, defaultMessage) {
    if (isAuthorizationError(error)) {
        showErrorNotification(authMessage);
    } else if (defaultMessage) {
        showWarningNotification(defaultMessage);
    }
}

// Make helper functions globally accessible
window.isAuthorizationError = isAuthorizationError;
window.showErrorNotification = showErrorNotification;
window.showWarningNotification = showWarningNotification;
window.notifyError = notifyError;

function isImockCacheMapping(m) {
    try {
        const byId = (m?.id || m?.uuid) === IMOCK_CACHE_ID;
        const byMeta = m?.metadata?.imock?.type === 'cache';
        const byName = (m?.name || '').toLowerCase() === 'imock cache';
        const byUrl = (m?.request?.url || m?.request?.urlPath) === IMOCK_CACHE_URL;
        return !!(byId || byMeta || byName || byUrl);
    } catch { return false; }
}

function pickUrl(req) {
    return req?.urlPath || req?.urlPathPattern || req?.urlPattern || req?.url || 'N/A';
}

function slimMapping(m) {
    return {
        id: m.id || m.uuid,
        name: m.name || m.metadata?.name,
        priority: m.priority,
        persistent: m.persistent,
        scenarioName: m.scenarioName,
        requiredScenarioState: m.requiredScenarioState,
        newScenarioState: m.newScenarioState,
        request: {
            method: m.request?.method,
            url: pickUrl(m.request),
            // No headers/query params in cache - only essential matching data
        },
        // No response data, minimal metadata - essential for UI display
        metadata: {
            created: m.metadata?.created,
            edited: m.metadata?.edited,
            source: m.metadata?.source,
            // Essential metadata fields for timestamps and source tracking
        },
    };
}

function buildSlimList(arr) {
    const items = (arr || []).filter(x => !isImockCacheMapping(x)).map(slimMapping);
    return { mappings: items };
}

function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(16);
}

async function getCacheByFixedId() {
    try {
        console.log('🧩 [CACHE] Trying fixed ID lookup...');
        const m = await apiFetch(`/mappings/${IMOCK_CACHE_ID}`);
        if (m && isImockCacheMapping(m)) return m;
        console.log('🧩 [CACHE] Fixed ID miss');
    } catch (error) {
        // Check for authorization errors
        if (isAuthorizationError(error)) {
            console.error('🧩 [CACHE] Authorization error loading cache by fixed ID:', error);
            // Preserve original error and add context
            error.isAuthError = true;
            error.context = 'cache-fixed-id-lookup';
            throw error;
        }
        // For 404 or other errors, this is expected (cache may not exist yet)
        console.log('🧩 [CACHE] Fixed ID lookup failed (expected if cache not created):', error.message);
    }
    return null;
}

async function getCacheByMetadata() {
    try {
        // WireMock 3 expects JSONPath on metadata
        const tryBodies = [
            { matchesJsonPath: "$[?(@.metadata.imock.type == 'cache')]" },
            { matchesJsonPath: { expression: "$[?(@.metadata.imock.type == 'cache')]" } },
        ];
        console.log('🧩 [CACHE] Trying metadata lookup (JSONPath)...');
        for (const body of tryBodies) {
            try {
                const res = await apiFetch(ENDPOINTS.MAPPINGS_FIND_BY_METADATA, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const list = res?.mappings || res?.items || [];
                const found = list.find(isImockCacheMapping);
                if (found) { console.log('🧩 [CACHE] Metadata hit'); return found; }
            } catch (e) {
                // Check for authorization errors
                if (isAuthorizationError(e)) {
                    console.error('🧩 [CACHE] Authorization error loading cache by metadata:', e);
                    // Preserve original error and add context
                    e.isAuthError = true;
                    e.context = 'cache-metadata-lookup';
                    throw e;
                }
                // try next body shape or endpoint may not be supported
                console.log('🧩 [CACHE] Metadata lookup attempt failed (trying next format):', e.message);
            }
        }
        console.log('🧩 [CACHE] Metadata miss');
    } catch (error) {
        // Only propagate if it's an authorization error (already handled above)
        if (isAuthorizationError(error)) {
            throw error;
        }
        console.log('🧩 [CACHE] Metadata lookup error:', error.message);
    }
    return null;
}

async function upsertImockCacheMapping(slim) {
    console.log('🧩 [CACHE] Upsert cache mapping start');
    const meta = {
        imock: {
            type: 'cache',
            version: 1,
            timestamp: Date.now(),
            count: (slim?.mappings || []).length,
            hash: simpleHash(JSON.stringify(slim || {})),
        },
    };
    const stub = {
        id: IMOCK_CACHE_ID,
        name: 'iMock Cache',
        priority: 1,
        persistent: false,
        request: { method: 'GET', url: IMOCK_CACHE_URL },
        response: {
            status: 200,
            jsonBody: slim,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
        },
        metadata: meta,
    };
    try {
        // Try update first; if 404, create
        console.log('🧩 [CACHE] PUT /mappings/{id}');
        const response = await apiFetch(`/mappings/${IMOCK_CACHE_ID}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stub),
        });
        console.log('🧩 [CACHE] Upsert done (PUT)');
        return response;
    } catch (e) {
        console.log('🧩 [CACHE] PUT failed, POST /mappings');
        const response = await apiFetch('/mappings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stub),
        });
        console.log('🧩 [CACHE] Upsert done (POST)');
        return response;
    }
}

async function regenerateImockCache(existingData = null) {
    console.log('🧩 [CACHE] Regenerate cache start');
    const t0 = performance.now();

    try {
        // Get fresh data from server - server is now the source of truth
        let all = existingData;
        if (!all) {
            all = await fetchMappingsFromServer({ force: true });
        }

        const mappings = all?.mappings || [];

        console.log('🧩 [CACHE] Using fresh server data for cache regeneration');

        const slim = buildSlimList(mappings);
        let finalPayload = slim;
        try {
            const response = await upsertImockCacheMapping(slim);
            const serverPayload = extractCacheJsonBody(response);
            if (serverPayload) {
                finalPayload = serverPayload;
            }
        } catch (e) {
            console.warn('🧩 [CACHE] Upsert cache failed:', e);
            // Check for authorization errors
            if (isAuthorizationError(e)) {
                console.error('🧩 [CACHE] Authorization error during cache upsert');
                showErrorNotification('Authorization error saving cache. Check your credentials.');
            }
            throw e; // Propagate error to caller
        }
        const dt = Math.round(performance.now() - t0);
        console.log(`🧩 [CACHE] Regenerate cache done (${(finalPayload?.mappings||[]).length} items) in ${dt}ms`);
        return finalPayload;
    } catch (error) {
        const dt = Math.round(performance.now() - t0);
        console.error(`🧩 [CACHE] Regenerate cache failed after ${dt}ms:`, error);
        throw error;
    }
}

async function loadImockCacheBestOf3() {
    // Preferred order: fixed ID, then find-by-metadata (JSONPath), else none
    console.log('🧩 [CACHE] loadImockCacheBestOf3 start');
    
    try {
        const b = await getCacheByFixedId();
        if (b && b.response?.jsonBody) { 
            console.log('🧩 [CACHE] Using cache: fixed id'); 
            return { source: 'cache', data: b.response.jsonBody }; 
        }
    } catch (error) {
        // Authorization errors should be shown to user
        if (isAuthorizationError(error)) {
            console.error('🧩 [CACHE] Authorization error during cache load:', error);
            showErrorNotification('Authorization error loading cache. Check your credentials.');
            throw error; // Propagate to caller
        }
        console.warn('🧩 [CACHE] Fixed ID lookup failed:', error);
    }
    
    try {
        const c = await getCacheByMetadata();
        if (c && c.response?.jsonBody) { 
            console.log('🧩 [CACHE] Using cache: metadata'); 
            return { source: 'cache', data: c.response.jsonBody }; 
        }
    } catch (error) {
        // Authorization errors should be shown to user
        if (isAuthorizationError(error)) {
            console.error('🧩 [CACHE] Authorization error during cache load:', error);
            showErrorNotification('Authorization error loading cache. Check your credentials.');
            throw error; // Propagate to caller
        }
        console.warn('🧩 [CACHE] Metadata lookup failed:', error);
    }
    
    console.log('🧩 [CACHE] No cache found');
    return null;
}

// Resolve conflicts by querying the server for the authoritative version of a specific mapping
async function resolveConflictWithServer(mappingId) {
    try {
        console.log('🔍 [CONFLICT] Resolving conflict for', mappingId, 'with server query');

        // Query the specific mapping from server
        const serverResponse = await apiFetch(`/mappings/${mappingId}`);
        const serverMapping = serverResponse?.mapping || serverResponse;

        if (!serverMapping) {
            console.warn('🔍 [CONFLICT] Server returned no mapping for', mappingId);
            return null; // No authoritative data available
        }

        console.log('🔍 [CONFLICT] Server returned authoritative data for', mappingId);
        return serverMapping;

    } catch (error) {
        console.warn('🔍 [CONFLICT] Server query failed for', mappingId, error);
        return null; // Fall back to no resolution
    }
}

function cloneMappingForCache(mapping) {
    if (!mapping) return null;

    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(mapping);
        }
    } catch (error) {
        console.warn('structuredClone failed for mapping cache clone:', error);
    }

    try {
        return JSON.parse(JSON.stringify(mapping));
    } catch (error) {
        console.warn('JSON clone failed for mapping cache clone:', error);
    }

    return { ...mapping };
}

function mergeMappingData(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;

    return {
        ...existing,
        ...incoming,
        request: { ...existing.request, ...incoming.request },
        response: { ...existing.response, ...incoming.response },
        metadata: { ...existing.metadata, ...incoming.metadata }
    };
}
function seedCacheFromGlobals(cache) {
    try {
        if (!(cache instanceof Map)) {
            return;
        }

        const sources = [
            Array.isArray(window.originalMappings) ? window.originalMappings : null,
            Array.isArray(window.allMappings) ? window.allMappings : null,
        ];

        let seededFrom;
        for (const source of sources) {
            if (!source || source.length === 0) {
                continue;
            }

            let inserted = 0;
            for (const mapping of source) {
                if (!mapping || isImockCacheMapping(mapping)) {
                    continue;
                }

                const existingId = mapping.id || mapping.uuid;
                if (!existingId || cache.has(existingId)) {
                    continue;
                }

                const cloned = cloneMappingForCache(mapping) || { ...mapping };
                if (!cloned.id) {
                    cloned.id = existingId;
                }
                if (!cloned.uuid && (mapping.uuid || existingId)) {
                    cloned.uuid = mapping.uuid || existingId;
                }

                cache.set(existingId, cloned);
                inserted++;
            }

            if (inserted > 0) {
                seededFrom = source === window.originalMappings ? 'originalMappings' : 'allMappings';
                console.log(`🧩 [CACHE] Seeded ${inserted} mappings into cache from ${seededFrom}`);
                break;
            }
        }

        if (!seededFrom && cache.size === 0) {
            console.log('🧩 [CACHE] Nothing available to seed cache from globals');
        }
    } catch (error) {
        console.warn('seedCacheFromGlobals failed:', error);
    }
}

function syncCacheWithMappings(mappings) {
    try {
        const manager = window.cacheManager;
        if (!manager || !(manager.cache instanceof Map) || !Array.isArray(mappings)) {
            return;
        }

        const cache = manager.cache;
        const seenIds = new Set();

        mappings.forEach(mapping => {
            if (!mapping || isImockCacheMapping(mapping)) {
                return;
            }

            const id = mapping.id || mapping.uuid;
            if (!id) {
                return;
            }

            seenIds.add(id);

            const cloned = cloneMappingForCache(mapping) || { ...mapping };
            if (cache.has(id)) {
                cache.set(id, mergeMappingData(cache.get(id), cloned));
            } else {
                cache.set(id, cloned);
            }
        });

        const optimisticQueue = Array.isArray(manager.optimisticQueue) ? manager.optimisticQueue : [];
        const optimisticIds = new Set();
        for (const item of optimisticQueue) {
            if (!item || item.op === 'delete') {
                continue;
            }
            if (item.id) {
                optimisticIds.add(item.id);
            }
        }

        Array.from(cache.keys()).forEach(existingId => {
            if (!seenIds.has(existingId) && !optimisticIds.has(existingId)) {
                cache.delete(existingId);
            }
        });

        window.cacheLastUpdate = Date.now();
    } catch (error) {
        console.warn('syncCacheWithMappings failed:', error);
    }
}

function buildCacheSnapshot() {
    const manager = window.cacheManager;
    if (!manager || !(manager.cache instanceof Map)) {
        return [];
    }

    try {
        const snapshot = [];
        for (const mapping of manager.cache.values()) {
            if (!mapping || isImockCacheMapping(mapping)) {
                continue;
            }

            // Cache entries are stored as clones, but clone again defensively before
            // exposing them to global arrays to prevent accidental mutation leaks.
            const cloned = cloneMappingForCache(mapping) || { ...mapping };
            snapshot.push(cloned);
        }
        return snapshot;
    } catch (error) {
        console.warn('buildCacheSnapshot failed:', error);
        return [];
    }
}

function extractCacheJsonBody(payload) {
    try {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        if (payload.response?.jsonBody) {
            return payload.response.jsonBody;
        }

        if (payload.mapping?.response?.jsonBody) {
            return payload.mapping.response.jsonBody;
        }

        if (payload.jsonBody?.mappings || Array.isArray(payload.mappings)) {
            const mappings = Array.isArray(payload.jsonBody?.mappings)
                ? payload.jsonBody.mappings
                : Array.isArray(payload.mappings)
                    ? payload.mappings
                    : [];
            return { mappings: mappings.map(item => ({ ...item })) };
        }
    } catch (error) {
        console.warn('extractCacheJsonBody failed:', error);
    }
    return null;
}

function cloneSlimMappingsList(source) {
    if (!Array.isArray(source)) {
        return [];
    }
    return source.map(item => ({ ...item }));
}

function buildUpdatedCachePayload(existingPayload, mapping, operation) {
    try {
        const normalizedOp = (operation || 'update').toLowerCase();
        const mappingId = mapping?.id || mapping?.uuid;
        const incoming = normalizedOp === 'delete' ? null : mapping;

        if (!mappingId) {
            return existingPayload ? { mappings: cloneSlimMappingsList(existingPayload.mappings) } : { mappings: [] };
        }

        const base = existingPayload && Array.isArray(existingPayload.mappings)
            ? cloneSlimMappingsList(existingPayload.mappings)
            : [];

        const index = base.findIndex(item => (item?.id || item?.uuid) === mappingId);

        if (normalizedOp === 'delete') {
            if (index !== -1) {
                base.splice(index, 1);
            }
            return { mappings: base };
        }

        if (!incoming) {
            return { mappings: base };
        }

        const slim = slimMapping(incoming);

        if (index !== -1) {
            base[index] = { ...base[index], ...slim };
        } else {
            base.push(slim);
        }

        return { mappings: base };
    } catch (error) {
        console.warn('buildUpdatedCachePayload failed:', error);
        return null;
    }
}

async function fetchExistingCacheMapping() {
    try {
        let cacheMapping = await getCacheByFixedId();
        if (cacheMapping) {
            return cacheMapping;
        }
        cacheMapping = await getCacheByMetadata();
        if (cacheMapping) {
            return cacheMapping;
        }
    } catch (error) {
        console.warn('🧩 [CACHE] fetchExistingCacheMapping failed:', error);
        // Propagate authorization errors
        if (isAuthorizationError(error)) {
            throw error;
        }
    }
    return null;
}

async function syncCacheMappingWithServer(mapping, operation) {
    try {
        if (!isCacheEnabled()) {
            console.log('🧩 [CACHE] Remote cache sync skipped - cache disabled');
            return;
        }

        const existingMapping = await fetchExistingCacheMapping();
        if (!existingMapping || !existingMapping.response) {
            console.log('🧩 [CACHE] Remote cache sync skipped - cache mapping missing');
            return;
        }

        const currentPayload = extractCacheJsonBody(existingMapping) || { mappings: [] };
        const updatedPayload = buildUpdatedCachePayload(currentPayload, mapping, operation);
        if (!updatedPayload) {
            console.log('🧩 [CACHE] Remote cache sync skipped - unable to build payload');
            return;
        }

        const response = await upsertImockCacheMapping(updatedPayload);
        const finalPayload = extractCacheJsonBody(response) || updatedPayload;
        window.imockCacheSnapshot = finalPayload;
        window.cacheLastUpdate = Date.now();
        console.log('🧩 [CACHE] Remote cache mapping updated via optimistic sync');
    } catch (error) {
        console.warn('🧩 [CACHE] syncCacheMappingWithServer failed:', error);
        
        // Show error notification for authorization issues
        if (isAuthorizationError(error)) {
            console.error('🧩 [CACHE] Authorization error syncing cache with server');
            showErrorNotification('Authorization error syncing cache. Check your credentials.');
        }
    }
}

let cacheSyncQueue = Promise.resolve();
function enqueueCacheSync(mapping, operation) {
    try {
        cacheSyncQueue = cacheSyncQueue
            .catch(() => { })
            .then(() => syncCacheMappingWithServer(mapping, operation));
    } catch (error) {
        console.warn('🧩 [CACHE] enqueueCacheSync failed:', error);
    }
}

