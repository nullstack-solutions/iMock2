'use strict';

(function(global) {
    const window = global;

    // --- CONSTANTS ---
    const IMOCK_CACHE_ID = '00000000-0000-0000-0000-00000000cace';
    const IMOCK_CACHE_URL = '/__imock/cache';

    // --- API & UI EXTENSIONS ---

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

    window.updateLastSuccessUI = () => {
        try {
            const el = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
            if (!el) return;
            const ts = window.lastWiremockSuccess || Date.now();
            el.textContent = `Last OK: ${new Date(ts).toLocaleTimeString()}`;
        } catch (e) {}
    };

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
            }

            const indicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
            if (indicator) {
                indicator.style.display = 'inline';
                if (isHealthy === true) {
                    const ms = typeof responseTime === 'number' ? `${responseTime}ms` : 'OK';
                    indicator.innerHTML = `<span>Response Time: </span><span class="healthy">${ms}</span>`;
                } else if (isHealthy === false) {
                    indicator.innerHTML = `<span>Response Time: </span><span class="unhealthy">Unhealthy</span>`;
                } else {
                    indicator.innerHTML = `<span>Response Time: </span><span class="error">Error</span>`;
                }
            }

            if (isHealthy === true) {
                window.lastWiremockSuccess = Date.now();
                if (typeof window.updateLastSuccessUI === 'function') window.updateLastSuccessUI();
            }
        } catch (e) {
            console.warn('applyHealthUI failed:', e);
        }
    };

    try {
        const savedToggle = localStorage.getItem('imock-show-meta-timestamps');
        if (savedToggle !== null) window.showMetaTimestamps = savedToggle === '1';
    } catch {}

    window.toggleMetaTimestamps = () => {
        try {
            window.showMetaTimestamps = !window.showMetaTimestamps;
            localStorage.setItem('imock-show-meta-timestamps', window.showMetaTimestamps ? '1' : '0');
            if (Array.isArray(window.allMappings)) {
                fetchAndRenderMappings(window.allMappings);
            }
        } catch (e) { console.warn('toggleMetaTimestamps failed:', e); }
    };

    // --- CACHE HELPERS ---

    window.isImockCacheMapping = function(m) {
        try {
            return (m?.id === IMOCK_CACHE_ID) || 
                   (m?.uuid === IMOCK_CACHE_ID) ||
                   (m?.metadata?.imock?.type === 'cache') ||
                   (m?.name?.toLowerCase() === 'imock cache') ||
                   (m?.request?.url === IMOCK_CACHE_URL) ||
                   (m?.request?.urlPath === IMOCK_CACHE_URL);
        } catch { return false; }
    };

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
            },
            response: {
                status: m.response?.status,
            },
            metadata: {
                created: m.metadata?.created,
                edited: m.metadata?.edited,
                source: m.metadata?.source,
            },
        };
    }

    function buildSlimList(arr) {
        const items = (arr || []).filter(x => !window.isImockCacheMapping(x)).map(slimMapping);
        return { mappings: items };
    }

    async function getCacheByFixedId() {
        try {
            const m = await apiFetch(`/mappings/${IMOCK_CACHE_ID}`);
            if (m && window.isImockCacheMapping(m)) return m;
        } catch {}
        return null;
    }

    async function getCacheByMetadata() {
        try {
            const queries = [
                { matchesJsonPath: "$[?(@.metadata.imock.type == 'cache')]" },
                { matchesJsonPath: { expression: "$[?(@.metadata.imock.type == 'cache')]" } },
            ];
            for (const body of queries) {
                try {
                    const res = await apiFetch(ENDPOINTS.MAPPINGS_FIND_BY_METADATA, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });
                    const list = res?.mappings || res?.items || [];
                    const found = list.find(window.isImockCacheMapping);
                    if (found) return found;
                } catch (e) {}
            }
        } catch {}
        return null;
    }

    async function upsertImockCacheMapping(slim) {
        const slimStr = JSON.stringify(slim || {});
        let h = 0;
        for (let i = 0; i < slimStr.length; i++) h = (h * 31 + slimStr.charCodeAt(i)) | 0;
        const hash = (h >>> 0).toString(16);

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
            metadata: {
                imock: {
                    type: 'cache',
                    version: 1,
                    timestamp: Date.now(),
                    count: (slim?.mappings || []).length,
                    hash: hash,
                },
            },
        };

        try {
            return await apiFetch(`/mappings/${IMOCK_CACHE_ID}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stub),
            });
        } catch (e) {
            return await apiFetch('/mappings', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stub),
            });
        }
    }

    window.regenerateImockCache = async function(existingData = null) {
        let all = existingData;
        if (!all) {
            all = await fetchMappingsFromServer({ force: true });
        }

        const mappings = all?.mappings || [];
        const slim = buildSlimList(mappings);
        let finalPayload = slim;
        
        try {
            const response = await upsertImockCacheMapping(slim);
            const serverPayload = extractCacheJsonBody(response);
            if (serverPayload) finalPayload = serverPayload;
        } catch (e) {
            console.warn('🧩 [CACHE] Upsert cache failed:', e);
        }
        return finalPayload;
    };

    window.loadImockCacheBestOf3 = async function() {
        console.log('🧩 [CACHE] loadImockCacheBestOf3 start');
        const b = await getCacheByFixedId();
        if (b && b.response?.jsonBody) return { source: 'cache', data: b.response.jsonBody };
        const c = await getCacheByMetadata();
        if (c && c.response?.jsonBody) return { source: 'cache', data: c.response.jsonBody };
        console.log('🧩 [CACHE] No cache found');
        return null;
    };

    window.cloneMappingForCache = function(mapping) {
        if (!mapping) return null;
        try {
            if (typeof structuredClone === 'function') return structuredClone(mapping);
        } catch (e) {}
        try {
            return JSON.parse(JSON.stringify(mapping));
        } catch (e) { return { ...mapping }; }
    };

    window.mergeMappingData = function(existing, incoming) {
        if (!existing) return incoming;
        if (!incoming) return existing;
        return {
            ...existing,
            ...incoming,
            request: { ...existing.request, ...incoming.request },
            response: { ...existing.response, ...incoming.response },
            metadata: { ...existing.metadata, ...incoming.metadata }
        };
    };

    // --- CACHE SYNC QUEUE ---

    function extractCacheJsonBody(payload) {
        try {
            if (!payload || typeof payload !== 'object') return null;
            if (payload.response?.jsonBody) return payload.response.jsonBody;
            if (payload.mapping?.response?.jsonBody) return payload.mapping.response.jsonBody;
            if (payload.jsonBody?.mappings || Array.isArray(payload.mappings)) {
                const mappings = Array.isArray(payload.jsonBody?.mappings)
                    ? payload.jsonBody.mappings
                    : (Array.isArray(payload.mappings) ? payload.mappings : []);
                return { mappings: mappings.map(item => ({ ...item })) };
            }
        } catch (error) {}
        return null;
    }

    function cloneSlimMappingsList(source) {
        return Array.isArray(source) ? source.map(item => ({ ...item })) : [];
    }

    function buildUpdatedCachePayload(existingPayload, mapping, operation) {
        try {
            const normalizedOp = (operation || 'update').toLowerCase();
            const mappingId = mapping?.id || mapping?.uuid;
            
            if (!mappingId) {
                return existingPayload ? { mappings: cloneSlimMappingsList(existingPayload.mappings) } : { mappings: [] };
            }

            const base = existingPayload && Array.isArray(existingPayload.mappings)
                ? cloneSlimMappingsList(existingPayload.mappings)
                : [];

            const index = base.findIndex(item => (item?.id || item?.uuid) === mappingId);

            if (normalizedOp === 'delete') {
                if (index !== -1) base.splice(index, 1);
            } else if (mapping) {
                const slim = slimMapping(mapping);
                if (index !== -1) base[index] = { ...base[index], ...slim };
                else base.push(slim);
            }

            return { mappings: base };
        } catch (error) {
            return null;
        }
    }

    async function fetchExistingCacheMapping() {
        try {
            let cacheMapping = await getCacheByFixedId();
            if (cacheMapping) return cacheMapping;
            return await getCacheByMetadata();
        } catch (error) {}
        return null;
    }

    async function syncCacheMappingWithServer(mapping, operation) {
        try {
            if (!isCacheEnabled()) return;

            const existingMapping = await fetchExistingCacheMapping();
            if (!existingMapping || !existingMapping.response) return;

            const currentPayload = extractCacheJsonBody(existingMapping) || { mappings: [] };
            const updatedPayload = buildUpdatedCachePayload(currentPayload, mapping, operation);
            if (!updatedPayload) return;

            const response = await upsertImockCacheMapping(updatedPayload);
            const finalPayload = extractCacheJsonBody(response) || updatedPayload;
            window.imockCacheSnapshot = finalPayload;
            window.cacheLastUpdate = Date.now();
        } catch (error) {
            console.warn('🧩 [CACHE] syncCacheMappingWithServer failed:', error);
        }
    }

    let cacheSyncQueue = Promise.resolve();
    window.enqueueCacheSync = function(mapping, operation) {
        cacheSyncQueue = cacheSyncQueue
            .catch(() => {})
            .then(() => syncCacheMappingWithServer(mapping, operation));
    };

    window.syncCacheWithMappings = function(mappings) {
        try {
            const manager = window.cacheManager;
            if (!manager || !(manager.cache instanceof Map) || !Array.isArray(mappings)) return;

            const cache = manager.cache;
            const seenIds = new Set();

            mappings.forEach(mapping => {
                if (!mapping || window.isImockCacheMapping(mapping)) return;
                const id = mapping.id || mapping.uuid;
                if (!id) return;

                seenIds.add(id);
                const cloned = window.cloneMappingForCache(mapping) || { ...mapping };
                
                if (cache.has(id)) {
                    cache.set(id, window.mergeMappingData(cache.get(id), cloned));
                } else {
                    cache.set(id, cloned);
                }
            });

            const optimisticQueue = Array.isArray(manager.optimisticQueue) ? manager.optimisticQueue : [];
            const optimisticIds = new Set(optimisticQueue.filter(i => i && i.op !== 'delete' && i.id).map(i => i.id));

            Array.from(cache.keys()).forEach(existingId => {
                if (!seenIds.has(existingId) && !optimisticIds.has(existingId)) {
                    cache.delete(existingId);
                }
            });

            window.cacheLastUpdate = Date.now();
        } catch (error) {
            console.warn('syncCacheWithMappings failed:', error);
        }
    };

    window.buildCacheSnapshot = function() {
        const manager = window.cacheManager;
        if (!manager || !(manager.cache instanceof Map)) return [];

        try {
            const snapshot = [];
            for (const mapping of manager.cache.values()) {
                if (!mapping || window.isImockCacheMapping(mapping)) continue;
                snapshot.push(window.cloneMappingForCache(mapping) || { ...mapping });
            }
            return snapshot;
        } catch (error) {
            console.warn('buildCacheSnapshot failed:', error);
            return [];
        }
    };

    console.log('✅ WireMock extras loaded');

})(typeof window !== 'undefined' ? window : globalThis);
