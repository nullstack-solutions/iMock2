'use strict';

(function initializeCache(global) {
    const window = global;

    // --- CACHE MANAGER INITIALIZATION ---
    window.cacheManager = {
        cache: new Map(),
        optimisticQueue: [], // Array of { id, op, payload, ts }
        lastSync: 0,
        optimisticTTL: 60000, // 1 minute
        isDirty: false
    };

    window.imockCache = {
        data: null,
        timestamp: 0,
        version: 1
    };

    // --- HELPER FUNCTIONS ---

    function seedCacheFromGlobals(cacheMap) {
        console.log('DEBUG: seedCacheFromGlobals called. allMappings length:', window.allMappings ? window.allMappings.length : 'undefined');
        if (Array.isArray(window.allMappings)) {
            window.allMappings.forEach(function(m) {
                const id = m.id || m.uuid;
                console.log('DEBUG: Seeding mapping:', id);
                if (id) cacheMap.set(id, m);
            });
        }
    }

    // --- CORE CACHE FUNCTIONS ---

    window.loadImockCacheBestOf3 = async function() {
        // In a real implementation, this might try multiple storage backends
        // For now, we simulate a fast memory retrieval
        if (window.imockCache && window.imockCache.data) {
            return window.imockCache;
        }
        return null;
    };

    window.isImockCacheMapping = function(mapping) {
        return mapping && mapping.metadata && mapping.metadata.imockCache === true;
    };

    window.regenerateImockCache = function() {
        // Determine the authoritative source of mappings
        let sourceMappings = [];
        if (Array.isArray(window.allMappings) && window.allMappings.length > 0) {
            sourceMappings = window.allMappings;
        } else if (Array.isArray(window.originalMappings)) {
            sourceMappings = window.originalMappings;
        }

        // Create a clean cache object
        const cacheData = {
            mappings: sourceMappings.filter(m => !window.isImockCacheMapping(m)),
            meta: {
                generated: Date.now(),
                count: sourceMappings.length
            }
        };

        window.imockCache = {
            data: cacheData,
            timestamp: Date.now(),
            version: 1
        };

        // Notify that cache has been updated
        console.log('📦 [CACHE] Cache regenerated with ' + cacheData.mappings.length + ' mappings');
        window.cacheManager.lastSync = Date.now();
        window.cacheManager.isDirty = false;
    };

    window.updateOptimisticCache = function(mappingLike, operation, options = {}) {
        const mapping = mappingLike.mapping || mappingLike;
        const id = mapping.id || mapping.uuid;
        
        if (!id) {
            console.warn('Cannot update optimistic cache: missing ID');
            return;
        }

        const op = operation || 'update';
        const ts = Date.now();

        // Update the optimistic queue
        const existingIndex = window.cacheManager.optimisticQueue.findIndex(item => item.id === id);
        const queueItem = { id, op, payload: mapping, ts };

        if (existingIndex >= 0) {
            window.cacheManager.optimisticQueue[existingIndex] = queueItem;
        } else {
            window.cacheManager.optimisticQueue.push(queueItem);
        }

        // Apply to immediate memory cache if available
        if (window.cacheManager.cache) {
            // Ensure cache is seeded if empty, to avoid partial state
            if (window.cacheManager.cache.size === 0) {
                seedCacheFromGlobals(window.cacheManager.cache);
            }

            if (op === 'delete') {
                window.cacheManager.cache.delete(id);
                if (typeof window.removeMappingFromIndex === 'function') {
                    window.removeMappingFromIndex(id);
                }
            } else {
                // Ensure we have a valid object to store
                let storedMapping = mapping;
                
                // If it's a partial update, try to merge with existing
                if (op === 'update' && window.cacheManager.cache.has(id)) {
                    const existing = window.cacheManager.cache.get(id);
                    if (typeof window.mergeMappingData === 'function') {
                        storedMapping = window.mergeMappingData(existing, mapping);
                    } else {
                        storedMapping = { ...existing, ...mapping };
                    }
                } else if (typeof window.cloneMappingForCache === 'function') {
                    storedMapping = window.cloneMappingForCache(mapping);
                }

                window.cacheManager.cache.set(id, storedMapping);
                
                if (typeof window.addMappingToIndex === 'function') {
                    window.addMappingToIndex(storedMapping);
                }

                // Sync update to allMappings for immediate UI/Test feedback
                if (Array.isArray(window.allMappings)) {
                    const idx = window.allMappings.findIndex(m => (m.id || m.uuid) === id);
                    if (idx >= 0) {
                        window.allMappings[idx] = storedMapping;
                    } else {
                        window.allMappings.unshift(storedMapping);
                    }
                }
            }
        }

        window.cacheManager.isDirty = true;
        
        // Trigger UI refresh if requested
        if (options.refresh !== false && typeof window.refreshMappingsFromCache === 'function') {
            window.refreshMappingsFromCache();
        }
    };

    window.garbageCollect = function() {
        const now = Date.now();
        const ttl = window.cacheManager.optimisticTTL;
        
        // Clean up expired optimistic items
        const initialLength = window.cacheManager.optimisticQueue.length;
        window.cacheManager.optimisticQueue = window.cacheManager.optimisticQueue.filter(item => {
            return (now - item.ts) < ttl;
        });

        if (window.cacheManager.optimisticQueue.length !== initialLength) {
            console.log('🧹 [CACHE] Garbage collected ' + (initialLength - window.cacheManager.optimisticQueue.length) + ' expired items');
        }

        // Check if we need to sync with server
        if (window.cacheManager.isDirty && typeof window.enqueueCacheSync === 'function') {
            window.enqueueCacheSync();
        }
    };

    window.rebuildCache = function() {
        console.log('🔄 [CACHE] Rebuilding cache from memory...');
        window.cacheManager.cache.clear();
        seedCacheFromGlobals(window.cacheManager.cache);
        window.regenerateImockCache();
    };

    // Helper to refresh UI from the cache
    window.refreshMappingsFromCache = function() {
        if (typeof window.fetchAndRenderMappings === 'function') {
            window.fetchAndRenderMappings(null, { useCache: true });
        }
    };

    // Start garbage collection loop
    setInterval(window.garbageCollect, 30000);

    console.log('✅ cache.js loaded - Cache manager initialized');

})(typeof window !== 'undefined' ? window : globalThis);