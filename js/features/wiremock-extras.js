'use strict';

// --- NEW FUNCTIONS FOR WIREMOCK 3.13.x ---

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
    } catch {
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

function isImockCacheMapping(m) {
    try {
        const byId = (m?.id || m?.uuid) === IMOCK_CACHE_ID;
        const byMeta = m?.metadata?.imock?.type === 'cache';
        const byName = (m?.name || '').toLowerCase() === 'imock cache';
        const byUrl = (m?.request?.url || m?.request?.urlPath) === IMOCK_CACHE_URL;
        return !!(byId || byMeta || byName || byUrl);
    } catch { return false; }
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
            url: m.request?.urlPath || m.request?.urlPathPattern || m.request?.urlPattern || m.request?.url || 'N/A',
            // No headers/query params in cache - only essential matching data
        },
        response: {
            status: m.response?.status,
            // Only essential response data for filtering
        },
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

async function getCacheByFixedId() {
    try {
        console.log('🧩 [CACHE] Trying fixed ID lookup...');
        const m = await apiFetch(`/mappings/${IMOCK_CACHE_ID}`);
        if (m && isImockCacheMapping(m)) return m;
        console.log('🧩 [CACHE] Fixed ID miss');
    } catch {}
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
            } catch {
                // try next body shape
            }
        }
        console.log('🧩 [CACHE] Metadata miss');
    } catch {}
    return null;
}

async function upsertImockCacheMapping(slim) {
    console.log('🧩 [CACHE] Upsert cache mapping start');
    // Simple hash for cache validation
    const slimStr = JSON.stringify(slim || {});
    let h = 0;
    for (let i = 0; i < slimStr.length; i++) { h = (h * 31 + slimStr.charCodeAt(i)) | 0; }
    const hash = (h >>> 0).toString(16);

    const meta = {
        imock: {
            type: 'cache',
            version: 1,
            timestamp: Date.now(),
            count: (slim?.mappings || []).length,
            hash: hash,
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
    } catch {
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
    }
    const dt = Math.round(performance.now() - t0);
    console.log(`🧩 [CACHE] Regenerate cache done (${(finalPayload?.mappings||[]).length} items) in ${dt}ms`);
    return finalPayload;
}

async function refreshImockCache() {
    console.log('🔄 [CACHE] Refresh cache requested');
    try {
        // Regenerate the cache from current server state
        const result = await regenerateImockCache();

        // Refresh the UI to show latest data
        if (typeof window.refreshMappingsFromCache === 'function') {
            window.refreshMappingsFromCache();
        }

        console.log('🔄 [CACHE] Refresh cache completed');
        return result;
    } catch (error) {
        console.error('🔄 [CACHE] Refresh cache failed:', error);
        throw error;
    }
}

window.refreshImockCache = refreshImockCache;

async function loadImockCacheBestOf3() {
    // Preferred order: fixed ID, then find-by-metadata (JSONPath), else none
    console.log('🧩 [CACHE] loadImockCacheBestOf3 start');
    const b = await getCacheByFixedId();
    if (b && b.response?.jsonBody) { console.log('🧩 [CACHE] Using cache: fixed id'); return { source: 'cache', data: b.response.jsonBody }; }
    const c = await getCacheByMetadata();
    if (c && c.response?.jsonBody) { console.log('🧩 [CACHE] Using cache: metadata'); return { source: 'cache', data: c.response.jsonBody }; }
    console.log('🧩 [CACHE] No cache found');
    return null;
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

function syncCacheWithMappings(mappings) {
    try {
        const store = window.MappingsStore;
        if (!store || !(store.items instanceof Map) || !Array.isArray(mappings)) {
            return;
        }

        const cache = store.items;
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

        const pendingOps = store.pending instanceof Map ? Array.from(store.pending.values()) : [];
        const optimisticIds = new Set();
        for (const item of pendingOps) {
            if (!item || item.type === 'delete') {
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
