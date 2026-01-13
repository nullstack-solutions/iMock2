'use strict';

if (!window.cacheManager) {
    window.cacheManager = {
        cache: new Map(),
        optimisticQueue: [],
        lastSync: 0,
        optimisticTTL: 60000,
        isDirty: false
    };
}

const cm = window.cacheManager;

window.imockCache = window.imockCache || { data: null, timestamp: 0, version: 1 };

function seedCacheFromGlobals(cacheMap) {
    if (Array.isArray(window.allMappings)) {
        window.allMappings.forEach(m => {
            const id = m.id || m.uuid;
            if (id) cacheMap.set(id, m);
        });
    }
}

window.isImockCacheMapping = (m) => m && m.metadata && m.metadata.imockCache === true;

// Helper to manage optimistic queue entries
function upsertQueueItem(id, op, payload, ts) {
    const item = { id, op: op || 'update', payload, ts };
    const idx = cm.optimisticQueue.findIndex(x => x.id === id);
    if (idx >= 0) cm.optimisticQueue[idx] = item;
    else cm.optimisticQueue.push(item);
}

function removeQueueItem(id) {
    const idx = cm.optimisticQueue.findIndex(x => x.id === id);
    if (idx >= 0) cm.optimisticQueue.splice(idx, 1);
}

window.updateOptimisticCache = function(mappingLike, op, options = {}) {
    const m = mappingLike.mapping || mappingLike;
    const id = m.id || m.uuid;
    if (!id) return;

    const ts = Date.now();
    
    // Confirm/remove from queue by default unless explicitly adding
    if (options.queueMode !== 'add') {
        removeQueueItem(id);
    } else {
        upsertQueueItem(id, op, m, ts);
    }

    if (cm.cache.size === 0) seedCacheFromGlobals(cm.cache);

    if (op === 'delete') {
        cm.cache.delete(id);
        if (window.removeMappingFromIndex) window.removeMappingFromIndex(id);
        if (Array.isArray(window.allMappings)) {
            window.allMappings = window.allMappings.filter(x => (x.id || x.uuid) !== id);
        }
    } else {
        let stored = m;
        if (op === 'update' && cm.cache.has(id)) {
            const existing = cm.cache.get(id);
            stored = window.mergeMappingData ? window.mergeMappingData(existing, m) : { ...existing, ...m };
        } else if (window.cloneMappingForCache) {
            stored = window.cloneMappingForCache(m);
        }
        cm.cache.set(id, stored);
        if (window.addMappingToIndex) window.addMappingToIndex(stored);
        
        if (Array.isArray(window.allMappings)) {
            const aIdx = window.allMappings.findIndex(x => (x.id || x.uuid) === id);
            if (aIdx >= 0) window.allMappings[aIdx] = stored;
            else window.allMappings.unshift(stored);
        }
    }

    cm.isDirty = true;
    if (options.refresh !== false && window.refreshMappingsFromCache) window.refreshMappingsFromCache();
};

cm.addOptimisticUpdate = (m, op) => {
    const id = m.id || m.uuid;
    if (!id) return;
    upsertQueueItem(id, op, m, Date.now());
};

window.rebuildCache = () => {
    cm.cache.clear();
    seedCacheFromGlobals(cm.cache);
};

window.refreshMappingsFromCache = () => {
    if (!window.fetchAndRenderMappings) return;
    const data = cm.cache.size > 0 ? Array.from(cm.cache.values()) : (window.allMappings || []);
    window.fetchAndRenderMappings(data, { source: 'cache' });
};

console.log('✅ cache.js loaded');