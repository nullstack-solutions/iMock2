'use strict';

/**
 * MappingsStore - Single Source of Truth for all mappings
 *
 * Architecture:
 * - One Map for storage (no triple copying)
 * - Pending operations for optimistic UI
 * - Indexes for fast lookups
 * - Metadata for sync coordination
 *
 * Designed for:
 * - High latency environments (40-50s /mappings requests)
 * - Multi-user collaboration (20+ concurrent users)
 * - Fast UI despite slow network
 */

window.MappingsStore = {
  // === SINGLE SOURCE OF TRUTH ===
  items: new Map(), // id → Mapping (full objects)

  // === SYNC METADATA ===
  metadata: {
    serverVersion: null,        // ETag or version from server
    lastFullSync: null,         // Timestamp of last full /mappings fetch
    lastIncrementalSync: null,  // Timestamp of last incremental update
    isSyncing: false,           // Currently syncing with server
    syncError: null,            // Last sync error if any
  },

  // === PENDING OPERATIONS (Optimistic UI) ===
  pending: new Map(), // id → PendingOperation

  // === INDEXES FOR FAST LOOKUPS ===
  indexes: {
    byMethod: new Map(),    // 'GET' → Set<id>
    byUrl: new Map(),       // url pattern → Set<id>
    byPriority: new Map(),  // priority → Set<id>
    byScenario: new Map(),  // scenario name → Set<id>
  },

  // === STATISTICS ===
  stats: {
    totalMappings: 0,
    pendingOperations: 0,
    lastSyncDuration: 0,
  },

  /**
   * Initialize the store
   */
  init() {
    console.log('🏪 [STORE] Initializing MappingsStore');
    this.clear();

    // Backward compatibility - expose as global arrays for existing code
    this._setupBackwardCompatibility();

    console.log('✅ [STORE] MappingsStore initialized');
  },

  /**
   * Get a mapping by ID
   */
  get(id) {
    if (!id) return null;

    // Check pending first (optimistic data is newer)
    const pending = this.pending.get(id);
    if (pending && pending.type !== 'delete') {
      return pending.optimisticMapping;
    }

    return this.items.get(id) || null;
  },

  /**
   * Get all mappings (excluding deleted)
   */
  getAll() {
    const mappings = [];

    // Add all server mappings
    this.items.forEach((mapping, id) => {
      const pending = this.pending.get(id);
      if (pending && pending.type === 'delete') {
        // Skip deleted mappings
        return;
      }

      // Use optimistic version if exists
      if (pending && pending.type === 'update') {
        mappings.push(pending.optimisticMapping);
      } else {
        mappings.push(mapping);
      }
    });

    // Add optimistic creates (temp IDs)
    this.pending.forEach((op, id) => {
      if (op.type === 'create' && !this.items.has(id)) {
        mappings.push(op.optimisticMapping);
      }
    });

    return mappings;
  },

  /**
   * Set mappings from server (full sync)
   */
  setFromServer(mappings, metadata = {}) {
    console.log(`🔄 [STORE] Setting ${mappings.length} mappings from server`);

    this.items.clear();

    mappings.forEach(mapping => {
      const id = mapping.id || mapping.uuid;
      if (id) {
        this.items.set(id, mapping);
      }
    });

    // Update metadata
    this.metadata.serverVersion = metadata.version || metadata.etag || null;
    this.metadata.lastFullSync = Date.now();

    // Rebuild indexes
    this.rebuildIndexes();

    // Update backward compatibility arrays
    this._updateBackwardCompatibility();

    // Update stats
    this._updateStats();

    console.log(`✅ [STORE] Loaded ${this.items.size} mappings`);
  },

  /**
   * Apply incremental changes from server
   */
  applyChanges({ added = [], updated = [], deleted = [] }) {
    console.log(`🔄 [STORE] Applying changes: +${added.length} ~${updated.length} -${deleted.length}`);

    const conflicts = [];

    // Process updates
    updated.forEach(serverMapping => {
      const id = serverMapping.id || serverMapping.uuid;
      const pending = this.pending.get(id);

      if (pending && pending.type === 'update') {
        // CONFLICT: Local pending update + server update
        conflicts.push({
          id,
          type: 'update',
          local: pending.optimisticMapping,
          server: serverMapping,
          localTimestamp: pending.timestamp,
        });
        return;
      }

      // No conflict - apply server update
      this.items.set(id, serverMapping);
      this._addToIndexes(id, serverMapping);
    });

    // Process deletions
    deleted.forEach(id => {
      if (this.pending.has(id)) {
        // CONFLICT: Local pending operation on deleted mapping
        conflicts.push({
          id,
          type: 'delete',
          local: this.pending.get(id).optimisticMapping,
          server: null,
        });
      }

      this.items.delete(id);
      this._removeFromIndexes(id);
    });

    // Process additions
    added.forEach(mapping => {
      const id = mapping.id || mapping.uuid;
      this.items.set(id, mapping);
      this._addToIndexes(id, mapping);
    });

    this.metadata.lastIncrementalSync = Date.now();

    // Update backward compatibility
    this._updateBackwardCompatibility();

    // Update stats
    this._updateStats();

    // Return conflicts for resolution
    return conflicts;
  },

  /**
   * Add pending operation (optimistic update)
   */
  addPending(operation) {
    const { id, type, payload, optimisticMapping } = operation;

    this.pending.set(id, {
      id,
      type, // 'create' | 'update' | 'delete'
      payload,
      optimisticMapping,
      timestamp: Date.now(),
      retries: 0,
    });

    console.log(`⏳ [STORE] Added pending ${type}: ${id}`);

    // Update backward compatibility immediately
    this._updateBackwardCompatibility();

    this._updateStats();
  },

  /**
   * Confirm pending operation (server confirmed)
   */
  confirmPending(id, serverMapping = null) {
    const pending = this.pending.get(id);
    if (!pending) return;

    console.log(`✅ [STORE] Confirmed pending ${pending.type}: ${id}`);

    if (pending.type === 'create' && serverMapping) {
      // Replace temp ID with real ID
      const realId = serverMapping.id || serverMapping.uuid;
      this.items.set(realId, serverMapping);
      this._addToIndexes(realId, serverMapping);
    } else if (pending.type === 'update' && serverMapping) {
      this.items.set(id, serverMapping);
      this._addToIndexes(id, serverMapping);
    } else if (pending.type === 'delete') {
      this.items.delete(id);
      this._removeFromIndexes(id);
    }

    this.pending.delete(id);

    // Update backward compatibility
    this._updateBackwardCompatibility();

    this._updateStats();
  },

  /**
   * Rollback pending operation (server rejected)
   */
  rollbackPending(id, originalMapping = null) {
    const pending = this.pending.get(id);
    if (!pending) return;

    console.log(`↩️ [STORE] Rolling back pending ${pending.type}: ${id}`);

    if (pending.type === 'create') {
      // Remove optimistic create
      this.items.delete(id);
    } else if (pending.type === 'update' && originalMapping) {
      // Restore original
      this.items.set(id, originalMapping);
      this._addToIndexes(id, originalMapping);
    } else if (pending.type === 'delete' && originalMapping) {
      // Restore deleted mapping
      this.items.set(id, originalMapping);
      this._addToIndexes(id, originalMapping);
    }

    this.pending.delete(id);

    // Update backward compatibility
    this._updateBackwardCompatibility();

    this._updateStats();
  },

  /**
   * Rebuild all indexes
   */
  rebuildIndexes() {
    // Clear existing indexes
    Object.values(this.indexes).forEach(index => index.clear());

    // Rebuild from items
    this.items.forEach((mapping, id) => {
      this._addToIndexes(id, mapping);
    });

    console.log(`📇 [STORE] Rebuilt indexes for ${this.items.size} mappings`);
  },

  /**
   * Filter mappings by criteria
   */
  filter({ method, url, priority, scenario }) {
    let results = new Set(this.items.keys());

    // Filter by method (fast index lookup)
    if (method) {
      const methodIds = this.indexes.byMethod.get(method.toUpperCase());
      if (methodIds) {
        results = this._intersect(results, methodIds);
      } else {
        return []; // No matches
      }
    }

    // Filter by URL (index lookup for exact match, regex for pattern)
    if (url) {
      const exactMatch = this.indexes.byUrl.get(url);
      if (exactMatch) {
        results = this._intersect(results, exactMatch);
      } else {
        // Fallback to regex search
        results = new Set([...results].filter(id => {
          const mapping = this.items.get(id);
          return this._matchesUrl(mapping, url);
        }));
      }
    }

    // Filter by priority (index lookup)
    if (priority !== undefined) {
      const priorityIds = this.indexes.byPriority.get(priority);
      if (priorityIds) {
        results = this._intersect(results, priorityIds);
      } else {
        return [];
      }
    }

    // Filter by scenario (index lookup)
    if (scenario) {
      const scenarioIds = this.indexes.byScenario.get(scenario);
      if (scenarioIds) {
        results = this._intersect(results, scenarioIds);
      } else {
        return [];
      }
    }

    // Convert to array of mappings
    return Array.from(results).map(id => this.get(id)).filter(Boolean);
  },

  /**
   * Clear all data
   */
  clear() {
    this.items.clear();
    this.pending.clear();
    Object.values(this.indexes).forEach(index => index.clear());

    this.metadata = {
      serverVersion: null,
      lastFullSync: null,
      lastIncrementalSync: null,
      isSyncing: false,
      syncError: null,
    };

    this._updateStats();

    console.log('🧹 [STORE] Cleared all data');
  },

  // === PRIVATE METHODS ===

  _addToIndexes(id, mapping) {
    // Index by method
    const method = mapping.request?.method || 'GET';
    if (!this.indexes.byMethod.has(method)) {
      this.indexes.byMethod.set(method, new Set());
    }
    this.indexes.byMethod.get(method).add(id);

    // Index by URL
    const url = mapping.request?.urlPattern || mapping.request?.url || mapping.request?.urlPath;
    if (url) {
      if (!this.indexes.byUrl.has(url)) {
        this.indexes.byUrl.set(url, new Set());
      }
      this.indexes.byUrl.get(url).add(id);
    }

    // Index by priority
    const priority = mapping.priority || 1;
    if (!this.indexes.byPriority.has(priority)) {
      this.indexes.byPriority.set(priority, new Set());
    }
    this.indexes.byPriority.get(priority).add(id);

    // Index by scenario
    if (mapping.scenarioName) {
      if (!this.indexes.byScenario.has(mapping.scenarioName)) {
        this.indexes.byScenario.set(mapping.scenarioName, new Set());
      }
      this.indexes.byScenario.get(mapping.scenarioName).add(id);
    }
  },

  _removeFromIndexes(id) {
    // Remove from all indexes
    Object.values(this.indexes).forEach(index => {
      index.forEach((idSet, key) => {
        idSet.delete(id);
        if (idSet.size === 0) {
          index.delete(key);
        }
      });
    });
  },

  _intersect(set1, set2) {
    const result = new Set();
    set1.forEach(item => {
      if (set2.has(item)) {
        result.add(item);
      }
    });
    return result;
  },

  _matchesUrl(mapping, pattern) {
    const url = mapping.request?.urlPattern || mapping.request?.url || mapping.request?.urlPath || '';

    if (url === pattern) return true;

    try {
      const regex = new RegExp(pattern);
      return regex.test(url);
    } catch (e) {
      return url.includes(pattern);
    }
  },

  _updateStats() {
    this.stats.totalMappings = this.items.size;
    this.stats.pendingOperations = this.pending.size;
  },

  /**
   * Backward compatibility with existing code that uses window.allMappings
   */
  _setupBackwardCompatibility() {
    // Define reactive properties that auto-update from store
    Object.defineProperty(window, 'allMappings', {
      get: () => this.getAll(),
      set: (value) => {
        console.warn('[STORE] Direct assignment to window.allMappings is deprecated. Use MappingsStore.setFromServer()');
      },
      configurable: true,
    });

    Object.defineProperty(window, 'originalMappings', {
      get: () => Array.from(this.items.values()),
      set: (value) => {
        console.warn('[STORE] Direct assignment to window.originalMappings is deprecated');
      },
      configurable: true,
    });

    console.log('🔗 [STORE] Backward compatibility layer active');
  },

  _updateBackwardCompatibility() {
    // Trigger any listeners on the old arrays
    if (typeof window.rebuildMappingIndex === 'function') {
      window.rebuildMappingIndex(this.getAll());
    }

    if (typeof window.refreshMappingTabSnapshot === 'function') {
      window.refreshMappingTabSnapshot();
    }
  },
};

// Initialize on load
if (typeof window !== 'undefined') {
  window.MappingsStore.init();
}
