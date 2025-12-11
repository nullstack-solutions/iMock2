'use strict';

/**
 * Unified CacheService - Replaces 3 parallel caching mechanisms
 * 
 * This service consolidates:
 * 1. cacheManager (cache.js) - Map<id, mapping> with optimisticQueue
 * 2. optimisticShadowMappings (mappings.js) - Map<id, {ts, op, mapping}>
 * 3. WireMock Cache Mapping (wiremock-extras.js) - Server-side cache as mapping
 * 
 * @namespace CacheService
 */
const CacheService = (function() {
    'use strict';

    // === PRIVATE STATE ===
    
    /**
     * Main storage for mappings
     * @type {Map<string, Object>}
     */
    const storage = new Map();
    
    /**
     * Pending optimistic operations
     * @type {Map<string, Object>}
     */
    const pendingOps = new Map();
    
    /**
     * BroadcastChannel for cross-tab synchronization
     * @type {BroadcastChannel|null}
     */
    let broadcastChannel = null;
    
    /**
     * Server cache enabled flag
     * @type {boolean}
     */
    let serverCacheEnabled = true;
    
    /**
     * Last server sync timestamp
     * @type {number}
     */
    let lastServerSync = 0;
    
    /**
     * Cache statistics
     * @type {Object}
     */
    const stats = {
        hits: 0,
        misses: 0,
        optimisticHits: 0,
        serverSyncs: 0,
        conflicts: 0,
        lastReset: Date.now()
    };

    // === CONSTANTS ===
    
    const OPTIMISTIC_TTL = 60000; // 1 minute
    const SERVER_CACHE_MAPPING_ID = '00000000-0000-0000-0000-00000000cace';
    const SERVER_CACHE_URL = '/__imock/cache';
    const BROADCAST_CHANNEL_NAME = 'imock-cache-sync';
    const CLEANUP_INTERVAL = 300000; // 5 minutes
    
    /**
     * Operation types for optimistic updates
     * @readonly
     * @enum {string}
     */
    const OPERATION_TYPES = {
        CREATE: 'create',
        UPDATE: 'update',
        DELETE: 'delete'
    };

    // === PRIVATE HELPERS ===
    
    /**
     * Initialize BroadcastChannel for cross-tab synchronization
     * @private
     */
    function initBroadcastChannel() {
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
                broadcastChannel.onmessage = handleBroadcastMessage;
                Logger.cache('BroadcastChannel initialized for cache synchronization');
            } else {
                Logger.warn('CACHE', 'BroadcastChannel not supported - cross-tab sync disabled');
            }
        } catch (error) {
            Logger.warn('CACHE', 'Failed to initialize BroadcastChannel:', error);
        }
    }
    
    /**
     * Handle incoming broadcast messages
     * @private
     * @param {MessageEvent} event - Broadcast message event
     */
    function handleBroadcastMessage(event) {
        try {
            const message = event.data;
            if (!message || typeof message !== 'object' || message.type !== 'cache-update') {
                return;
            }
            
            Logger.cache('Received cache update broadcast:', message.operation, message.id);
            
            switch (message.operation) {
                case OPERATION_TYPES.CREATE:
                case OPERATION_TYPES.UPDATE:
                    if (message.data) {
                        storage.set(message.id, cloneMapping(message.data));
                    }
                    break;
                case OPERATION_TYPES.DELETE:
                    storage.delete(message.id);
                    break;
            }
            
            // Trigger UI update if available
            if (typeof window.triggerUIUpdate === 'function') {
                window.triggerUIUpdate('broadcast-sync');
            }
        } catch (error) {
            Logger.error('CACHE', 'Error handling broadcast message:', error);
        }
    }
    
    /**
     * Broadcast cache update to other tabs
     * @private
     * @param {string} operation - Operation type
     * @param {string} id - Mapping ID
     * @param {Object|null} data - Mapping data (for create/update)
     */
    function broadcastUpdate(operation, id, data = null) {
        if (!broadcastChannel) {
            return;
        }
        
        try {
            const message = {
                type: 'cache-update',
                operation,
                id,
                data,
                timestamp: Date.now()
            };
            
            broadcastChannel.postMessage(message);
            Logger.cache('Broadcasted cache update:', operation, id);
        } catch (error) {
            Logger.warn('CACHE', 'Failed to broadcast update:', error);
        }
    }
    
    /**
     * Clone mapping for safe storage
     * @private
     * @param {Object} mapping - Mapping to clone
     * @returns {Object|null} Cloned mapping or null if failed
     */
    function cloneMapping(mapping) {
        if (!mapping || typeof mapping !== 'object') {
            return null;
        }
        
        try {
            if (typeof structuredClone === 'function') {
                return structuredClone(mapping);
            }
            return JSON.parse(JSON.stringify(mapping));
        } catch (error) {
            Logger.warn('CACHE', 'Failed to clone mapping:', error);
            return { ...mapping };
        }
    }
    
    /**
     * Check if mapping is a cache service mapping
     * @private
     * @param {Object} mapping - Mapping to check
     * @returns {boolean} True if it's a cache service mapping
     */
    function isCacheServiceMapping(mapping) {
        if (!mapping || typeof mapping !== 'object') {
            return false;
        }
        
        const byId = (mapping?.id || mapping?.uuid) === SERVER_CACHE_MAPPING_ID;
        const byMeta = mapping?.metadata?.imock?.type === 'cache';
        const byName = (mapping?.name || '').toLowerCase() === 'imock cache';
        const byUrl = (mapping?.request?.url || mapping?.request?.urlPath) === SERVER_CACHE_URL;
        
        return !!(byId || byMeta || byName || byUrl);
    }
    
    /**
     * Get timestamp from mapping metadata
     * @private
     * @param {Object} mapping - Mapping to extract timestamp from
     * @returns {number} Timestamp or NaN if not found
     */
    function getMappingTimestamp(mapping) {
        if (!mapping || typeof mapping !== 'object') {
            return NaN;
        }
        
        const metadata = mapping.metadata || {};
        const candidates = [
            metadata.edited,
            metadata.updated,
            metadata.updatedAt,
            metadata.created,
            metadata.timestamp
        ];
        
        for (const candidate of candidates) {
            if (!candidate) continue;
            
            if (candidate instanceof Date) {
                const value = candidate.getTime();
                if (Number.isFinite(value)) return value;
            }
            
            const parsed = Date.parse(candidate);
            if (Number.isFinite(parsed)) return parsed;
            
            const numeric = Number(candidate);
            if (Number.isFinite(numeric)) return numeric;
        }
        
        if (typeof mapping.__optimisticTs === 'number') {
            return mapping.__optimisticTs;
        }
        
        return NaN;
    }
    
    /**
     * Clean up expired optimistic operations
     * @private
     */
    function cleanupExpiredOperations() {
        const now = Date.now();
        const expired = [];
        
        for (const [id, operation] of pendingOps.entries()) {
            if (now - operation.timestamp > OPTIMISTIC_TTL) {
                expired.push(id);
            }
        }
        
        if (expired.length > 0) {
            Logger.cache(`Cleaning up ${expired.length} expired optimistic operations`);
            expired.forEach(id => {
                pendingOps.delete(id);
                storage.delete(id); // Remove optimistic data
            });
        }
    }
    
    /**
     * Merge server data with optimistic updates
     * @private
     * @param {Object} serverMapping - Server mapping data
     * @param {Object} optimisticMapping - Optimistic mapping data
     * @returns {Object} Merged mapping
     */
    function mergeWithOptimistic(serverMapping, optimisticMapping) {
        const serverTs = getMappingTimestamp(serverMapping);
        const optimisticTs = getMappingTimestamp(optimisticMapping);
        
        // If optimistic is newer, use it
        if (Number.isFinite(optimisticTs) && (!Number.isFinite(serverTs) || optimisticTs > serverTs)) {
            stats.conflicts++;
            Logger.cache('Conflict resolved: using optimistic version for', optimisticMapping.id);
            return optimisticMapping;
        }
        
        return serverMapping;
    }
    
    /**
     * Save cache to server storage
     * @private
     * @returns {Promise<boolean>} True if successful
     */
    async function saveToServer() {
        if (!serverCacheEnabled) {
            return false;
        }
        
        try {
            const mappings = Array.from(storage.values()).filter(m => !isCacheServiceMapping(m));
            const slim = mappings.map(m => ({
                id: m.id || m.uuid,
                name: m.name || m.metadata?.name,
                priority: m.priority,
                persistent: m.persistent,
                scenarioName: m.scenarioName,
                request: {
                    method: m.request?.method,
                    url: m.request?.urlPath || m.request?.urlPattern || m.request?.url || 'N/A'
                },
                response: {
                    status: m.response?.status
                },
                metadata: {
                    created: m.metadata?.created,
                    edited: m.metadata?.edited,
                    source: m.metadata?.source
                }
            }));
            
            const payload = { mappings: slim };
            const hash = simpleHash(JSON.stringify(payload));
            
            const meta = {
                imock: {
                    type: 'cache',
                    version: 1,
                    timestamp: Date.now(),
                    count: slim.length,
                    hash: hash
                }
            };
            
            const cacheMapping = {
                id: SERVER_CACHE_MAPPING_ID,
                name: 'iMock Cache',
                priority: 1,
                persistent: false,
                request: { method: 'GET', url: SERVER_CACHE_URL },
                response: {
                    status: 200,
                    jsonBody: payload,
                    headers: { 'Content-Type': 'application/json; charset=utf-8' }
                },
                metadata: meta
            };
            
            // Try update first, then create
            try {
                await apiFetch(`/mappings/${SERVER_CACHE_MAPPING_ID}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cacheMapping)
                });
            } catch (error) {
                await apiFetch('/mappings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cacheMapping)
                });
            }
            
            lastServerSync = Date.now();
            stats.serverSyncs++;
            Logger.cache(`Saved ${slim.length} mappings to server cache`);
            return true;
            
        } catch (error) {
            Logger.error('CACHE', 'Failed to save cache to server:', error);
            return false;
        }
    }
    
    /**
     * Simple hash function for cache validation
     * @private
     * @param {string} str - String to hash
     * @returns {string} Hash string
     */
    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        }
        return (hash >>> 0).toString(16);
    }
    
    /**
     * Load cache from server storage
     * @private
     * @returns {Promise<boolean>} True if successful
     */
    async function loadFromServer() {
        if (!serverCacheEnabled) {
            return false;
        }
        
        try {
            // Try fixed ID first
            let cacheMapping = null;
            try {
                cacheMapping = await apiFetch(`/mappings/${SERVER_CACHE_MAPPING_ID}`);
            } catch (error) {
                // Try metadata search
                try {
                    const response = await apiFetch(ENDPOINTS.MAPPINGS_FIND_BY_METADATA, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            matchesJsonPath: "$[?(@.metadata.imock.type == 'cache')]"
                        })
                    });
                    const mappings = response?.mappings || response?.items || [];
                    cacheMapping = mappings.find(isCacheServiceMapping) || null;
                } catch (metadataError) {
                    Logger.cache('Server cache not found');
                    return false;
                }
            }
            
            if (!cacheMapping || !cacheMapping.response?.jsonBody?.mappings) {
                Logger.cache('Invalid server cache format');
                return false;
            }
            
            const serverMappings = cacheMapping.response.jsonBody.mappings;
            serverMappings.forEach(mapping => {
                if (!isCacheServiceMapping(mapping)) {
                    storage.set(mapping.id || mapping.uuid, cloneMapping(mapping));
                }
            });
            
            lastServerSync = Date.now();
            Logger.cache(`Loaded ${serverMappings.length} mappings from server cache`);
            return true;
            
        } catch (error) {
            Logger.error('CACHE', 'Failed to load cache from server:', error);
            return false;
        }
    }
    
    // === PUBLIC API ===
    
    const api = {
        /**
         * Get mapping by ID with optimistic support
         * @param {string} id - Mapping ID
         * @returns {Object|null} Mapping data or null if not found
         */
        get(id) {
            if (!id) {
                Logger.warn('CACHE', 'get() called without ID');
                return null;
            }
            
            const normalizedId = String(id);
            
            // Check optimistic operations first
            const optimisticOp = pendingOps.get(normalizedId);
            if (optimisticOp && optimisticOp.operation !== OPERATION_TYPES.DELETE) {
                stats.optimisticHits++;
                Logger.cache('Optimistic hit for mapping:', normalizedId);
                return optimisticOp.data;
            }
            
            // Check main storage
            const mapping = storage.get(normalizedId);
            if (mapping) {
                stats.hits++;
                return mapping;
            }
            
            stats.misses++;
            return null;
        },
        
        /**
         * Get all mappings from cache
         * @returns {Object[]} Array of all mappings
         */
        getAll() {
            const mappings = Array.from(storage.values()).filter(m => !isCacheServiceMapping(m));
            
            // Apply optimistic updates
            const result = mappings.map(mapping => {
                const optimisticOp = pendingOps.get(mapping.id || mapping.uuid);
                if (optimisticOp) {
                    if (optimisticOp.operation === OPERATION_TYPES.DELETE) {
                        return null; // Mark for removal
                    }
                    return optimisticOp.data; // Use optimistic version
                }
                return mapping;
            }).filter(m => m !== null);
            
            // Add optimistic creations
            pendingOps.forEach(op => {
                if (op.operation === OPERATION_TYPES.CREATE && 
                    !result.some(m => (m.id || m.uuid) === op.id)) {
                    result.unshift(op.data);
                }
            });
            
            return result;
        },
        
        /**
         * Save mapping to cache
         * @param {string} id - Mapping ID
         * @param {Object} mapping - Mapping data
         * @param {Object} options - Options object
         * @param {boolean} options.optimistic - Whether this is an optimistic update
         * @param {boolean} options.broadcast - Whether to broadcast this update
         * @param {boolean} options.serverSync - Whether to sync to server
         * @returns {boolean} True if successful
         */
        set(id, mapping, options = {}) {
            const {
                optimistic = false,
                broadcast = true,
                serverSync = false
            } = options;
            
            if (!id || !mapping) {
                Logger.warn('CACHE', 'set() called without ID or mapping');
                return false;
            }
            
            const normalizedId = String(id);
            const existing = storage.get(normalizedId);
            const operation = existing ? OPERATION_TYPES.UPDATE : OPERATION_TYPES.CREATE;
            
            if (optimistic) {
                // Store optimistic operation
                pendingOps.set(normalizedId, {
                    operation,
                    data: cloneMapping(mapping),
                    timestamp: Date.now()
                });
                
                // Update storage immediately for UI
                storage.set(normalizedId, cloneMapping(mapping));
                
                Logger.cache(`Optimistic ${operation} for mapping:`, normalizedId);
            } else {
                // Confirm operation - remove from pending
                pendingOps.delete(normalizedId);
                storage.set(normalizedId, cloneMapping(mapping));
                
                Logger.cache(`Confirmed ${operation} for mapping:`, normalizedId);
            }
            
            // Broadcast to other tabs
            if (broadcast) {
                this.broadcastUpdate(operation, normalizedId, mapping);
            }
            
            // Server sync if requested
            if (serverSync) {
                saveToServer();
            }
            
            return true;
        },
        
        /**
         * Delete mapping from cache
         * @param {string} id - Mapping ID
         * @param {Object} options - Options object
         * @param {boolean} options.optimistic - Whether this is an optimistic delete
         * @param {boolean} options.broadcast - Whether to broadcast this update
         * @param {boolean} options.serverSync - Whether to sync to server
         * @returns {boolean} True if successful
         */
        delete(id, options = {}) {
            const {
                optimistic = false,
                broadcast = true,
                serverSync = false
            } = options;
            
            if (!id) {
                Logger.warn('CACHE', 'delete() called without ID');
                return false;
            }
            
            const normalizedId = String(id);
            const existing = storage.get(normalizedId);
            
            if (!existing && !optimistic) {
                Logger.warn('CACHE', 'Attempted to delete non-existent mapping:', normalizedId);
                return false;
            }
            
            if (optimistic) {
                // Store optimistic delete
                pendingOps.set(normalizedId, {
                    operation: OPERATION_TYPES.DELETE,
                    data: null,
                    timestamp: Date.now()
                });
                
                // Remove from storage immediately for UI
                storage.delete(normalizedId);
                
                Logger.cache(`Optimistic delete for mapping:`, normalizedId);
            } else {
                // Confirm delete - remove from pending and storage
                pendingOps.delete(normalizedId);
                storage.delete(normalizedId);
                
                Logger.cache(`Confirmed delete for mapping:`, normalizedId);
            }
            
            // Broadcast to other tabs
            if (broadcast) {
                this.broadcastUpdate(OPERATION_TYPES.DELETE, normalizedId, null);
            }
            
            // Server sync if requested
            if (serverSync) {
                saveToServer();
            }
            
            return true;
        },
        
        /**
         * Apply optimistic update
         * @param {string} id - Mapping ID
         * @param {Object} data - Mapping data
         * @param {string} operation - Operation type ('create', 'update', 'delete')
         * @returns {boolean} True if successful
         */
        applyOptimistic(id, data, operation) {
            const normalizedId = String(id);
            const normalizedOp = String(operation || OPERATION_TYPES.UPDATE).toLowerCase();
            
            switch (normalizedOp) {
                case OPERATION_TYPES.CREATE:
                case OPERATION_TYPES.UPDATE:
                    return this.set(id, data, { optimistic: true });
                case OPERATION_TYPES.DELETE:
                    return this.delete(id, { optimistic: true });
                default:
                    Logger.warn('CACHE', 'Invalid optimistic operation:', operation);
                    return false;
            }
        },
        
        /**
         * Confirm server operation
         * @param {string} id - Mapping ID
         * @param {Object} serverData - Server response data
         * @returns {boolean} True if successful
         */
        confirmOperation(id, serverData) {
            const normalizedId = String(id);
            const optimisticOp = pendingOps.get(normalizedId);
            
            if (!optimisticOp) {
                // No pending operation, just store server data
                return this.set(id, serverData, { optimistic: false });
            }
            
            // Merge server data with optimistic updates if needed
            let finalData = serverData;
            if (optimisticOp.operation !== OPERATION_TYPES.DELETE && optimisticOp.data) {
                finalData = mergeWithOptimistic(serverData, optimisticOp.data);
            }
            
            // Confirm the operation
            const success = this.set(id, finalData, { optimistic: false });
            
            if (success) {
                Logger.cache(`Confirmed server operation for mapping:`, normalizedId);
            }
            
            return success;
        },
        
        /**
         * Revert failed optimistic operation
         * @param {string} id - Mapping ID
         * @returns {boolean} True if successful
         */
        revertOperation(id) {
            const normalizedId = String(id);
            const optimisticOp = pendingOps.get(normalizedId);
            
            if (!optimisticOp) {
                Logger.warn('CACHE', 'No pending operation to revert for:', normalizedId);
                return false;
            }
            
            // Remove optimistic operation
            pendingOps.delete(normalizedId);
            
            // Restore original state or remove if it was a create
            if (optimisticOp.operation === OPERATION_TYPES.CREATE) {
                storage.delete(normalizedId);
            } else if (optimisticOp.originalData) {
                storage.set(normalizedId, optimisticOp.originalData);
            }
            
            Logger.cache(`Reverted optimistic operation for mapping:`, normalizedId);
            
            // Broadcast the revert
            this.broadcastUpdate(optimisticOp.operation === OPERATION_TYPES.CREATE ? 
                OPERATION_TYPES.DELETE : OPERATION_TYPES.UPDATE, 
                normalizedId, 
                optimisticOp.originalData
            );
            
            return true;
        },
        
        /**
         * Sync from server data
         * @param {Object[]} mappings - Array of server mappings
         * @returns {boolean} True if successful
         */
        syncFromServer(mappings) {
            if (!Array.isArray(mappings)) {
                Logger.warn('CACHE', 'syncFromServer() called with invalid data');
                return false;
            }
            
            Logger.cache(`Syncing ${mappings.length} mappings from server`);
            
            // Clear current storage
            storage.clear();
            
            // Load server mappings
            mappings.forEach(mapping => {
                if (!isCacheServiceMapping(mapping)) {
                    const id = mapping.id || mapping.uuid;
                    if (id) {
                        storage.set(String(id), cloneMapping(mapping));
                    }
                }
            });
            
            lastServerSync = Date.now();
            stats.serverSyncs++;
            
            // Clean up any pending operations that are now invalid
            cleanupExpiredOperations();
            
            Logger.cache('Server sync completed');
            return true;
        },
        
        /**
         * Clear all cache data
         * @param {Object} options - Options object
         * @param {boolean} options.includePending - Whether to clear pending operations
         * @param {boolean} options.broadcast - Whether to broadcast clear
         * @returns {boolean} True if successful
         */
        clear(options = {}) {
            const {
                includePending = true,
                broadcast = true
            } = options;
            
            storage.clear();
            
            if (includePending) {
                pendingOps.clear();
            }
            
            if (broadcast) {
                this.broadcastUpdate('clear', '*', null);
            }
            
            Logger.cache('Cache cleared');
            return true;
        },
        
        /**
         * Get cache statistics
         * @returns {Object} Cache statistics
         */
        getStats() {
            return {
                ...stats,
                storageSize: storage.size,
                pendingOps: pendingOps.size,
                lastServerSync,
                uptime: Date.now() - stats.lastReset
            };
        },
        
        /**
         * Reset cache statistics
         */
        resetStats() {
            stats.hits = 0;
            stats.misses = 0;
            stats.optimisticHits = 0;
            stats.serverSyncs = 0;
            stats.conflicts = 0;
            stats.lastReset = Date.now();
            Logger.cache('Cache statistics reset');
        },
        
        /**
         * Enable/disable server cache
         * @param {boolean} enabled - Whether to enable server cache
         */
        setServerCacheEnabled(enabled) {
            serverCacheEnabled = Boolean(enabled);
            Logger.cache(`Server cache ${serverCacheEnabled ? 'enabled' : 'disabled'}`);
        },
        
        /**
         * Check if server cache is enabled
         * @returns {boolean} True if server cache is enabled
         */
        isServerCacheEnabled() {
            return serverCacheEnabled;
        },
        
        /**
         * Force cleanup of expired operations
         */
        cleanup() {
            cleanupExpiredOperations();
            Logger.cache('Cleanup completed');
        },
        
        /**
         * Initialize the cache service
         * @param {Object} options - Initialization options
         * @param {boolean} options.loadFromServer - Whether to load from server on init
         * @param {boolean} options.enableBroadcast - Whether to enable broadcast channel
         * @returns {Promise<boolean>} True if initialization successful
         */
        async initialize(options = {}) {
            const {
                loadFromServer = true,
                enableBroadcast = true
            } = options;
            
            Logger.cache('Initializing CacheService');
            
            // Initialize broadcast channel
            if (enableBroadcast) {
                initBroadcastChannel();
            }
            
            // Load from server if requested
            if (loadFromServer && serverCacheEnabled) {
                try {
                    await loadFromServer();
                } catch (error) {
                    Logger.warn('CACHE', 'Failed to load from server during init:', error);
                }
            }
            
            // Start cleanup interval
            if (window.LifecycleManager) {
                window.LifecycleManager.setInterval(() => {
                    cleanupExpiredOperations();
                }, CLEANUP_INTERVAL);
            }
            
            Logger.cache('CacheService initialization completed');
            return true;
        },
        
        /**
         * Broadcast update helper (exposed for external use)
         * @private
         */
        broadcastUpdate(operation, id, data) {
            broadcastUpdate(operation, id, data);
        }
    };
    
    // === MIGRATION HELPERS ===
    
    /**
     * Migrate from legacy cacheManager
     * @param {Map} legacyCache - Legacy cache data
     * @returns {number} Number of items migrated
     */
    api.migrateFromCacheManager = function(legacyCache) {
        if (!legacyCache || typeof legacyCache.forEach !== 'function') {
            Logger.warn('CACHE', 'Invalid legacy cache provided for migration');
            return 0;
        }
        
        let migrated = 0;
        legacyCache.forEach((mapping, id) => {
            if (mapping && !isCacheServiceMapping(mapping)) {
                storage.set(String(id), cloneMapping(mapping));
                migrated++;
            }
        });
        
        Logger.cache(`Migrated ${migrated} items from legacy cacheManager`);
        return migrated;
    };
    
    /**
     * Migrate from optimisticShadowMappings
     * @param {Map} shadowMappings - Legacy shadow mappings
     * @returns {number} Number of items migrated
     */
    api.migrateFromShadowMappings = function(shadowMappings) {
        if (!shadowMappings || typeof shadowMappings.forEach !== 'function') {
            Logger.warn('CACHE', 'Invalid shadow mappings provided for migration');
            return 0;
        }
        
        let migrated = 0;
        shadowMappings.forEach((entry, id) => {
            if (entry && entry.mapping && !isCacheServiceMapping(entry.mapping)) {
                const normalizedId = String(id);
                pendingOps.set(normalizedId, {
                    operation: entry.op || OPERATION_TYPES.UPDATE,
                    data: cloneMapping(entry.mapping),
                    timestamp: entry.ts || Date.now()
                });
                storage.set(normalizedId, cloneMapping(entry.mapping));
                migrated++;
            }
        });
        
        Logger.cache(`Migrated ${migrated} items from optimisticShadowMappings`);
        return migrated;
    };
    
    /**
     * Get current cache state for debugging
     * @returns {Object} Debug information
     */
    api.getDebugState = function() {
        return {
            storage: Array.from(storage.entries()),
            pendingOps: Array.from(pendingOps.entries()),
            stats: this.getStats(),
            config: {
                serverCacheEnabled,
                lastServerSync,
                optimisticTTL: OPTIMISTIC_TTL
            }
        };
    };
    
    // Initialize the service
    api.initialize();
    
    return api;
})();

// Make CacheService globally available
window.CacheService = CacheService;

// Log initialization
if (window.Logger) {
    Logger.cache('CacheService module loaded');
}