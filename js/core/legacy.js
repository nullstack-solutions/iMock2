'use strict';

/**
 * Legacy Compatibility Layer
 * 
 * This file provides backward compatibility for the refactored iMock2 application.
 * It bridges legacy patterns with new CacheService and EventBus implementations
 * while providing deprecation warnings to encourage migration.
 * 
 * @deprecated This file provides backward compatibility and will be removed in future versions
 */

(function initialiseLegacyCompatibility() {
    'use strict';
    
    // ============================================================================
    // DEPRECATION WARNING SYSTEM
    // ============================================================================
    
    const deprecationWarnings = new Set();
    
    function showDeprecationWarning(functionName, alternative) {
        if (!deprecationWarnings.has(functionName)) {
            deprecationWarnings.add(functionName);
            const message = alternative 
                ? `[DEPRECATED] ${functionName} is deprecated. Use ${alternative} instead.`
                : `[DEPRECATED] ${functionName} is deprecated and will be removed in a future version.`;
            
            if (window.Logger && typeof window.Logger.warn === 'function') {
                Logger.warn('LEGACY', message);
            } else {
                console.warn(message);
            }
        }
    }
    
    // ============================================================================
    // LEGACY CACHE MANAGER COMPATIBILITY
    // ============================================================================
    
    /**
     * Legacy CacheManager compatibility wrapper
     * Bridges old cacheManager API to new CacheService
     */
    const LegacyCacheManager = {
        /**
         * Get a mapping from cache
         * @param {string} id - Mapping ID
         * @returns {Object|null} Mapping object or null
         */
        get(id) {
            showDeprecationWarning('cacheManager.get()', 'CacheService.get()');
            
            if (window.CacheService && typeof window.CacheService.get === 'function') {
                return window.CacheService.get(id);
            }
            return null;
        },
        
        /**
         * Set a mapping in cache
         * @param {string} id - Mapping ID
         * @param {Object} mapping - Mapping object
         * @param {Object} options - Options object
         */
        set(id, mapping, options = {}) {
            showDeprecationWarning('cacheManager.set()', 'CacheService.set()');
            
            if (window.CacheService && typeof window.CacheService.set === 'function') {
                return window.CacheService.set(id, mapping, options);
            }
            return false;
        },
        
        /**
         * Check if mapping exists in cache
         * @param {string} id - Mapping ID
         * @returns {boolean} True if exists
         */
        has(id) {
            showDeprecationWarning('cacheManager.has()', 'CacheService.has()');
            
            if (window.CacheService && typeof window.CacheService.has === 'function') {
                return window.CacheService.has(id);
            }
            return false;
        },
        
        /**
         * Delete a mapping from cache
         * @param {string} id - Mapping ID
         * @returns {boolean} True if deleted
         */
        delete(id) {
            showDeprecationWarning('cacheManager.delete()', 'CacheService.delete()');
            
            if (window.CacheService && typeof window.CacheService.delete === 'function') {
                return window.CacheService.delete(id);
            }
            return false;
        },
        
        /**
         * Clear all cache
         */
        clear() {
            showDeprecationWarning('cacheManager.clear()', 'CacheService.clear()');
            
            if (window.CacheService && typeof window.CacheService.clear === 'function') {
                return window.CacheService.clear();
            }
        },
        
        /**
         * Get all mappings from cache
         * @returns {Array} Array of mappings
         */
        getAll() {
            showDeprecationWarning('cacheManager.getAll()', 'CacheService.getAll()');
            
            if (window.CacheService && typeof window.CacheService.getAll === 'function') {
                return window.CacheService.getAll();
            }
            return [];
        },
        
        /**
         * Get cache size
         * @returns {number} Number of cached items
         */
        get size() {
            showDeprecationWarning('cacheManager.size', 'CacheService.size');
            
            if (window.CacheService && typeof window.CacheService.size === 'number') {
                return window.CacheService.size;
            }
            return 0;
        }
    };
    
    // ============================================================================
    // LEGACY OPTIMISTIC SHADOW MAPPINGS COMPATIBILITY
    // ============================================================================
    
    /**
     * Legacy optimisticShadowMappings compatibility wrapper
     * Bridges old optimisticShadowMappings API to new CacheService
     */
    const LegacyOptimisticShadowMappings = new Map();
    
    /**
     * Apply optimistic shadow mappings to incoming data
     * @param {Array} incoming - Array of mappings
     * @returns {Array} Mappings with optimistic updates applied
     */
    function applyOptimisticShadowMappings(incoming) {
        showDeprecationWarning('applyOptimisticShadowMappings()', 'MappingsStore.getAll()');
        
        // Use MappingsStore as primary source of optimistic updates
        if (window.MappingsStore && typeof window.MappingsStore.getAll === 'function') {
            const mappingsStoreData = window.MappingsStore.getAll();
            if (mappingsStoreData && mappingsStoreData.length > 0) {
                // MappingsStore already handles optimistic updates, return its data
                return mappingsStoreData;
            }
        }
        
        // Use CacheService as fallback
        if (window.CacheService && Array.isArray(incoming)) {
            const cacheServiceData = window.CacheService.getAll();
            if (cacheServiceData && cacheServiceData.length > 0) {
                // CacheService already handles optimistic updates, return its data
                return cacheServiceData;
            }
        }
        
        // Fallback to legacy implementation
        if (!Array.isArray(incoming)) {
            return incoming;
        }
        
        return incoming;
    }
    
    /**
     * Remember optimistic shadow mapping
     * @param {Object} mapping - Mapping object
     * @param {string} operation - Operation type ('create', 'update', 'delete')
     */
    function rememberOptimisticShadowMapping(mapping, operation) {
        showDeprecationWarning('rememberOptimisticShadowMapping()', 'MappingsStore.applyOptimistic()');
        
        // Use MappingsStore for optimistic updates (PRIMARY)
        if (window.MappingsStore && mapping && (mapping.id || mapping.uuid)) {
            const mappingId = mapping.id || mapping.uuid;
            const normalizedOperation = typeof operation === 'string' ? operation.toLowerCase() : 'update';
            
            if (normalizedOperation === 'delete') {
                if (typeof window.MappingsStore.delete === 'function') {
                    window.MappingsStore.delete(mappingId);
                }
            } else if (normalizedOperation === 'create') {
                if (typeof window.MappingsStore.add === 'function') {
                    window.MappingsStore.add(mapping);
                }
            } else {
                if (typeof window.MappingsStore.update === 'function') {
                    window.MappingsStore.update(mappingId, mapping);
                }
            }
            return;
        }
        
        // Use CacheService as fallback
        if (window.CacheService && mapping && (mapping.id || mapping.uuid)) {
            const mappingId = mapping.id || mapping.uuid;
            const normalizedOperation = typeof operation === 'string' ? operation.toLowerCase() : 'update';
            
            if (normalizedOperation === 'delete') {
                window.CacheService.applyOptimistic(mappingId, null, 'delete');
            } else {
                window.CacheService.applyOptimistic(mappingId, mapping, normalizedOperation);
            }
        }
        
        // Fallback to legacy map
        if (mapping && (mapping.id || mapping.uuid)) {
            const mappingId = mapping.id || mapping.uuid;
            LegacyOptimisticShadowMappings.set(mappingId, {
                mapping: mapping,
                operation: operation,
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Prune optimistic shadow mappings
     * @param {Array} currentList - Current list of mappings
     */
    function pruneOptimisticShadowMappings(currentList) {
        showDeprecationWarning('pruneOptimisticShadowMappings()', 'MappingsStore.cleanup()');
        
        // Use MappingsStore cleanup as primary mechanism
        if (window.MappingsStore && typeof window.MappingsStore.cleanup === 'function') {
            window.MappingsStore.cleanup();
            return;
        }
        
        // Use CacheService cleanup as fallback
        if (window.CacheService) {
            window.CacheService.cleanup();
            return;
        }
        
        // Fallback to legacy cleanup
        const currentIds = new Set();
        if (Array.isArray(currentList)) {
            currentList.forEach(mapping => {
                if (mapping && (mapping.id || mapping.uuid)) {
                    currentIds.add(mapping.id || mapping.uuid);
                }
            });
        }
        
        for (const [id, entry] of LegacyOptimisticShadowMappings) {
            if (!currentIds.has(id)) {
                LegacyOptimisticShadowMappings.delete(id);
            }
        }
    }
    
    /**
     * Get optimistic shadow timestamp for a mapping
     * @param {Object} mapping - Mapping object
     * @returns {number} Timestamp or NaN
     */
    function getOptimisticShadowTimestamp(mapping) {
        if (!mapping || typeof mapping !== 'object') {
            return Number.NaN;
        }
        
        const mappingId = mapping.id || mapping.uuid;
        if (mappingId && LegacyOptimisticShadowMappings.has(mappingId)) {
            const entry = LegacyOptimisticShadowMappings.get(mappingId);
            return entry.timestamp;
        }
        
        const metadata = mapping.metadata || {};
        const candidates = [metadata.edited, metadata.updated, metadata.updatedAt, metadata.created, metadata.timestamp];
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
        
        return Number.NaN;
    }
    
    /**
     * Clone mapping for optimistic shadow
     * @param {Object} mapping - Mapping to clone
     * @returns {Object|null} Cloned mapping or null
     */
    function cloneMappingForOptimisticShadow(mapping) {
        if (!mapping || typeof mapping !== 'object') {
            return null;
        }
        
        try {
            return typeof structuredClone === 'function' 
                ? structuredClone(mapping) 
                : JSON.parse(JSON.stringify(mapping));
        } catch (error) {
            if (window.Logger && typeof window.Logger.warn === 'function') {
                Logger.warn('LEGACY', 'Failed to clone mapping for optimistic shadow:', error);
            }
            return { ...mapping };
        }
    }
    
    // ============================================================================
    // GLOBAL VARIABLE WRAPPERS
    // ============================================================================
    
    /**
     * Initialize mappingIndex global variable
     */
    function initializeMappingIndex() {
        if (!window.mappingIndex) {
            window.mappingIndex = {
                byId: new Map(),
                byUrl: new Map(),
                byMethod: new Map(),
                byStatus: new Map(),
                byName: new Map(),
                searchText: '',
                lastRebuild: Date.now()
            };
        }
    }
    
    /**
     * Initialize cacheLastUpdate global variable
     */
    function initializeCacheLastUpdate() {
        if (typeof window.cacheLastUpdate === 'undefined') {
            window.cacheLastUpdate = 0;
        }
    }
    
    /**
     * Update mapping index with new mappings
     * @param {Array} mappings - Array of mappings
     */
    function updateMappingIndex(mappings) {
        showDeprecationWarning('window.mappingIndex', 'MappingsStore indexes');
        
        // Use MappingsStore indexes as primary mechanism
        if (window.MappingsStore && typeof window.MappingsStore.rebuildIndexes === 'function') {
            window.MappingsStore.rebuildIndexes();
            return;
        }
        
        // Fallback to legacy implementation
        if (!window.mappingIndex) {
            initializeMappingIndex();
        }
        
        if (!Array.isArray(mappings)) return;
        
        // Clear existing indexes
        window.mappingIndex.byId.clear();
        window.mappingIndex.byUrl.clear();
        window.mappingIndex.byMethod.clear();
        window.mappingIndex.byStatus.clear();
        window.mappingIndex.byName.clear();
        
        // Rebuild indexes
        mappings.forEach(mapping => {
            if (!mapping) return;
            
            const id = mapping.id || mapping.uuid;
            if (id) {
                window.mappingIndex.byId.set(id, mapping);
            }
            
            const url = mapping.request?.url || mapping.request?.urlPattern || mapping.request?.urlPath;
            if (url) {
                window.mappingIndex.byUrl.set(url, mapping);
            }
            
            const method = mapping.request?.method;
            if (method) {
                if (!window.mappingIndex.byMethod.has(method)) {
                    window.mappingIndex.byMethod.set(method, new Set());
                }
                window.mappingIndex.byMethod.get(method).add(mapping);
            }
            
            const status = mapping.response?.status;
            if (status) {
                if (!window.mappingIndex.byStatus.has(status)) {
                    window.mappingIndex.byStatus.set(status, new Set());
                }
                window.mappingIndex.byStatus.get(status).add(mapping);
            }
            
            const name = mapping.name || mapping.metadata?.name;
            if (name) {
                window.mappingIndex.byName.set(name, mapping);
            }
        });
        
        window.mappingIndex.lastRebuild = Date.now();
    }
    
    /**
     * Rebuild mapping index (legacy function)
     * @param {Array} mappings - Array of mappings
     */
    function rebuildMappingIndex(mappings) {
        showDeprecationWarning('rebuildMappingIndex()', 'MappingsStore.rebuildIndexes()');
        updateMappingIndex(mappings);
    }
    
    // ============================================================================
    // TEST COMPATIBILITY FUNCTIONS
    // ============================================================================
    
    /**
     * Test compatibility: Check if legacy functions are available
     * @returns {Object} Test results
     */
    function runLegacyCompatibilityTests() {
        const results = {
            cacheManager: {
                available: typeof window.cacheManager !== 'undefined',
                functions: []
            },
            optimisticShadowMappings: {
                available: typeof window.applyOptimisticShadowMappings === 'function',
                functions: []
            },
            globalVariables: {
                mappingIndex: typeof window.mappingIndex !== 'undefined',
                cacheLastUpdate: typeof window.cacheLastUpdate !== 'undefined'
            },
            eventSystem: {
                available: typeof window.EventBus !== 'undefined',
                functions: []
            }
        };
        
        // Test cacheManager functions
        if (window.cacheManager) {
            ['get', 'set', 'has', 'delete', 'clear', 'getAll'].forEach(func => {
                results.cacheManager.functions.push({
                    name: func,
                    available: typeof window.cacheManager[func] === 'function'
                });
            });
        }
        
        // Test optimistic functions
        ['applyOptimisticShadowMappings', 'rememberOptimisticShadowMapping', 'pruneOptimisticShadowMappings'].forEach(func => {
            results.optimisticShadowMappings.functions.push({
                name: func,
                available: typeof window[func] === 'function'
            });
        });
        
        // Test event system
        if (window.EventBus) {
            ['on', 'off', 'emit'].forEach(func => {
                results.eventSystem.functions.push({
                    name: func,
                    available: typeof window.EventBus[func] === 'function'
                });
            });
        }
        
        return results;
    }
    
    /**
     * Test compatibility: Validate legacy API behavior
     * @returns {Promise<Object>} Test validation results
     */
    async function validateLegacyAPI() {
        const results = {
            cacheManager: false,
            optimisticUpdates: false,
            globalVariables: false,
            eventSystem: false
        };
        
        try {
            // Test cacheManager
            if (window.cacheManager && window.CacheService) {
                const testId = 'test-legacy-compat';
                const testMapping = { id: testId, name: 'Test Mapping' };
                
                window.cacheManager.set(testId, testMapping);
                const retrieved = window.cacheManager.get(testId);
                results.cacheManager = retrieved && retrieved.id === testId;
                
                window.cacheManager.delete(testId);
            }
            
            // Test optimistic updates
            if (window.applyOptimisticShadowMappings && window.CacheService) {
                const testMapping = { id: 'test-optimistic', name: 'Test Optimistic' };
                window.rememberOptimisticShadowMapping(testMapping, 'update');
                const result = window.applyOptimisticShadowMappings([]);
                results.optimisticUpdates = Array.isArray(result);
            }
            
            // Test global variables
            initializeMappingIndex();
            initializeCacheLastUpdate();
            results.globalVariables = window.mappingIndex && typeof window.cacheLastUpdate === 'number';
            
            // Test event system
            if (window.EventBus) {
                let eventReceived = false;
                window.EventBus.on('test-legacy-event', () => { eventReceived = true; });
                window.EventBus.emit('test-legacy-event');
                results.eventSystem = eventReceived;
                window.EventBus.off('test-legacy-event');
            }
            
        } catch (error) {
            if (window.Logger && typeof window.Logger.error === 'function') {
                Logger.error('LEGACY', 'Legacy API validation failed:', error);
            }
        }
        
        return results;
    }
    
    // ============================================================================
    // MIGRATION HELPERS
    // ============================================================================
    
    /**
     * Migration helper: Migrate from legacy cacheManager to MappingsStore
     * @param {Object} legacyCacheManager - Legacy cache manager instance
     * @returns {boolean} Success status
     */
    function migrateFromLegacyCacheManager(legacyCacheManager) {
        showDeprecationWarning('Legacy cacheManager migration', 'Use MappingsStore directly');
        
        if (!window.MappingsStore) {
            console.error('MappingsStore not available for migration');
            return false;
        }
        
        try {
            let migratedCount = 0;
            
            if (legacyCacheManager && typeof legacyCacheManager.getAll === 'function') {
                const legacyData = legacyCacheManager.getAll();
                
                if (Array.isArray(legacyData)) {
                    legacyData.forEach(mapping => {
                        if (mapping && (mapping.id || mapping.uuid)) {
                            const id = mapping.id || mapping.uuid;
                            if (typeof window.MappingsStore.add === 'function') {
                                window.MappingsStore.add(mapping);
                                migratedCount++;
                            }
                        }
                    });
                }
            }
            
            if (window.Logger && typeof window.Logger.info === 'function') {
                Logger.info('LEGACY', `Migrated ${migratedCount} items from legacy cacheManager to MappingsStore`);
            }
            
            return true;
        } catch (error) {
            if (window.Logger && typeof window.Logger.error === 'function') {
                Logger.error('LEGACY', 'Migration from legacy cacheManager failed:', error);
            }
            return false;
        }
    }
    
    /**
     * Migration helper: Migrate from legacy optimisticShadowMappings to MappingsStore
     * @returns {boolean} Success status
     */
    function migrateFromLegacyOptimisticShadowMappings() {
        showDeprecationWarning('Legacy optimisticShadowMappings migration', 'Use MappingsStore.applyOptimistic()');
        
        if (!window.MappingsStore) {
            console.error('MappingsStore not available for migration');
            return false;
        }
        
        try {
            let migratedCount = 0;
            
            for (const [id, entry] of LegacyOptimisticShadowMappings) {
                if (entry && entry.mapping) {
                    const normalizedOperation = typeof entry.operation === 'string' ? entry.operation.toLowerCase() : 'update';
                    
                    if (normalizedOperation === 'delete') {
                        if (typeof window.MappingsStore.delete === 'function') {
                            window.MappingsStore.delete(id);
                        }
                    } else if (normalizedOperation === 'create') {
                        if (typeof window.MappingsStore.add === 'function') {
                            window.MappingsStore.add(entry.mapping);
                        }
                    } else {
                        if (typeof window.MappingsStore.update === 'function') {
                            window.MappingsStore.update(id, entry.mapping);
                        }
                    }
                    migratedCount++;
                }
            }
            
            LegacyOptimisticShadowMappings.clear();
            
            if (window.Logger && typeof window.Logger.info === 'function') {
                Logger.info('LEGACY', `Migrated ${migratedCount} optimistic updates from legacy to MappingsStore`);
            }
            
            return true;
        } catch (error) {
            if (window.Logger && typeof window.Logger.error === 'function') {
                Logger.error('LEGACY', 'Migration from legacy optimisticShadowMappings failed:', error);
            }
            return false;
        }
    }
    
    /**
     * Migration helper: Get migration status
     * @returns {Object} Migration status
     */
    function getMigrationStatus() {
        return {
            legacyCacheManager: typeof window.cacheManager !== 'undefined',
            legacyOptimisticMappings: LegacyOptimisticShadowMappings.size > 0,
            mappingsStoreAvailable: typeof window.MappingsStore !== 'undefined',
            cacheServiceAvailable: typeof window.CacheService !== 'undefined',
            eventBusAvailable: typeof window.EventBus !== 'undefined',
            mappingIndexInitialized: typeof window.mappingIndex !== 'undefined',
            cacheLastUpdateInitialized: typeof window.cacheLastUpdate !== 'undefined'
        };
    }
    
    // ============================================================================
    // APPLY OPTIMISTIC MAPPING UPDATE (GLOBAL FUNCTION)
    // ============================================================================
    
    /**
     * Apply optimistic mapping update (global function for cross-window communication)
     * @param {Object} mappingData - Mapping data to update
     * @returns {boolean} Success status
     */
    function applyOptimisticMappingUpdate(mappingData) {
        if (!mappingData) return false;
        
        try {
            const mapping = mappingData.mapping || mappingData;
            if (!mapping || !mapping.id) return false;
            
            // Use MappingsStore if available (PRIMARY)
            if (window.MappingsStore && typeof window.MappingsStore.update === 'function') {
                window.MappingsStore.update(mapping.id, mapping);
                return true;
            }
            
            // Use CacheService as fallback
            if (window.CacheService) {
                window.CacheService.applyOptimistic(mapping.id, mapping, 'update');
                return true;
            }
            
            // Legacy fallback - only update through getters to maintain compatibility
            rememberOptimisticShadowMapping(mapping, 'update');
            
            return true;
        } catch (error) {
            if (window.Logger && typeof window.Logger.error === 'function') {
                Logger.error('LEGACY', 'Failed to apply optimistic mapping update:', error);
            }
            return false;
        }
    }
    
    // ============================================================================
    // CLEANUP FUNCTIONS
    // ============================================================================
    
    /**
     * Cleanup legacy resources
     */
    function cleanupLegacyResources() {
        if (window.Logger && typeof window.Logger.info === 'function') {
            Logger.info('LEGACY', 'Cleaning up legacy resources');
        }
        
        // Clear legacy optimistic mappings
        if (LegacyOptimisticShadowMappings.size > 0) {
            LegacyOptimisticShadowMappings.clear();
        }
        
        // Clear deprecation warnings set
        deprecationWarnings.clear();
    }
    
    // ============================================================================
    // INITIALIZATION
    // ============================================================================
    
    // Initialize global variables
    initializeMappingIndex();
    initializeCacheLastUpdate();
    
    // Expose legacy compatibility objects and functions
    window.cacheManager = LegacyCacheManager;
    window.optimisticShadowMappings = LegacyOptimisticShadowMappings;
    
    // Expose legacy functions
    window.applyOptimisticShadowMappings = applyOptimisticShadowMappings;
    window.rememberOptimisticShadowMapping = rememberOptimisticShadowMapping;
    window.pruneOptimisticShadowMappings = pruneOptimisticShadowMappings;
    window.getOptimisticShadowTimestamp = getOptimisticShadowTimestamp;
    window.cloneMappingForOptimisticShadow = cloneMappingForOptimisticShadow;
    window.rebuildMappingIndex = rebuildMappingIndex;
    window.updateMappingIndex = updateMappingIndex;
    window.applyOptimisticMappingUpdate = applyOptimisticMappingUpdate;
    
    // Expose test functions
    window.runLegacyCompatibilityTests = runLegacyCompatibilityTests;
    window.validateLegacyAPI = validateLegacyAPI;
    
    // Expose migration helpers
    window.migrateFromLegacyCacheManager = migrateFromLegacyCacheManager;
    window.migrateFromLegacyOptimisticShadowMappings = migrateFromLegacyOptimisticShadowMappings;
    window.getMigrationStatus = getMigrationStatus;
    
    // Expose cleanup function
    window.cleanupLegacyResources = cleanupLegacyResources;
    
    // Expose global getElement function for backward compatibility
    window.getElement = function(selectorId) {
        if (window.DOM && typeof window.DOM.getElement === 'function') {
            return window.DOM.getElement(selectorId);
        }
        // Fallback to direct DOM access
        return document.getElementById(selectorId) || document.querySelector(selectorId);
    };
    
    // Log initialization
    if (window.Logger && typeof window.Logger.info === 'function') {
        Logger.info('LEGACY', 'Legacy compatibility layer initialized');
    }
    
    // Auto-migrate if legacy data exists and new services are available
    if (window.MappingsStore) {
        // Check for legacy cacheManager and migrate if needed
        if (typeof window.cacheManager !== 'undefined' && window.cacheManager !== LegacyCacheManager) {
            setTimeout(() => {
                migrateFromLegacyCacheManager(window.cacheManager);
            }, 1000);
        }
        
        // Check for legacy optimistic mappings and migrate if needed
        if (LegacyOptimisticShadowMappings.size > 0) {
            setTimeout(() => {
                migrateFromLegacyOptimisticShadowMappings();
            }, 1000);
        }
    } else if (window.CacheService) {
        // Fallback to CacheService migration
        if (typeof window.cacheManager !== 'undefined' && window.cacheManager !== LegacyCacheManager) {
            setTimeout(() => {
                migrateFromLegacyCacheManager(window.cacheManager);
            }, 1000);
        }
        
        if (LegacyOptimisticShadowMappings.size > 0) {
            setTimeout(() => {
                migrateFromLegacyOptimisticShadowMappings();
            }, 1000);
        }
    }
    
})();

// Log legacy module loading
if (typeof Logger !== 'undefined' && typeof Logger.debug === 'function') {
    Logger.debug('LEGACY', 'Legacy compatibility module loaded');
}