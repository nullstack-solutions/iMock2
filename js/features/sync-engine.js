'use strict';

/**
 * SyncEngine - Manages synchronization between client and WireMock server
 *
 * Strategy:
 * - Incremental sync every 30s (lightweight staleness check)
 * - Full sync every 5min or on demand (consistency check)
 * - Service Cache for quick startup (1 hour TTL)
 * - Conflict resolution with last-write-wins + notification
 *
 * Optimizations (v2.0):
 * - Incremental sync does NOT fetch full /mappings on every tick
 * - Uses timestamp-based staleness detection before triggering full fetch
 * - Full fetch only when data is considered stale or on explicit request
 * - Prevents polling storms via mutex and debouncing
 *
 * Designed for:
 * - High latency (40-50s full /mappings request)
 * - Multi-user (20+ concurrent users)
 */

window.SyncEngine = {
  // === CONFIGURATION ===
  config: {
    // Incremental sync - now much lighter weight (staleness check only)
    incrementalInterval: 30000,    // 30 seconds (was 10s - reduced frequency)

    // Full sync
    fullSyncInterval: 300000,      // 5 minutes
    fullSyncTimeout: 60000,        // 60 second timeout

    // Service Cache
    cacheRebuildInterval: 60000,   // 60 seconds (was 30s - reduced frequency)
    cacheMaxAge: 3600000,          // 1 hour

    // Retry logic
    maxRetries: 3,
    retryDelay: 2000,              // 2 seconds base delay
  },

  // === STATE ===
  timers: {
    incremental: null,
    fullSync: null,
    cacheRebuild: null,
  },

  isStarted: false,
  lastCacheHash: null,
  isIncrementalSyncing: false,
  isFullSyncing: false,

  /**
   * Initialize sync engine
   */
  init() {
    Logger.info('SYNC', 'Initializing SyncEngine');

    // Stop any existing timers
    this.stop();

    Logger.info('SYNC', 'SyncEngine initialized');
  },

  /**
   * Start sync engine
   */
  start() {
    if (this.isStarted) {
      Logger.debug('SYNC', 'Sync timers already running, skipping start');
      return;
    }

    Logger.info('SYNC', 'Starting sync timers');
    this.isStarted = true;

    // Incremental sync every 10 seconds
    this.timers.incremental = window.LifecycleManager.setInterval(
      () => this.incrementalSync(),
      this.config.incrementalInterval
    );

    // Full sync every 5 minutes
    this.timers.fullSync = window.LifecycleManager.setInterval(
      () => this.fullSync({ background: true }),
      this.config.fullSyncInterval
    );

    // Cache rebuild every 30 seconds (if changed)
    this.timers.cacheRebuild = window.LifecycleManager.setInterval(
      () => this.rebuildServiceCache(),
      this.config.cacheRebuildInterval
    );

    Logger.info('SYNC', 'Sync timers started');
  },

  /**
   * Stop sync engine
   */
  stop() {
    Logger.info('SYNC', 'Stopping sync timers');

    Object.keys(this.timers).forEach(key => {
      if (this.timers[key]) {
        window.LifecycleManager.clearInterval(this.timers[key]);
        this.timers[key] = null;
      }
    });
    this.isStarted = false;
  },

  /**
   * Initial load - try cache first, then full sync
   */
  async coldStart() {
    Logger.info('SYNC', 'Cold start - loading from cache or server');

    // Show loading state
    if (typeof window.showLoadingState === 'function') {
      window.showLoadingState();
    }

    try {
      // Try to load from Service Cache first (fast)
      const cached = await this.loadFromServiceCache();

      if (cached && cached.items && cached.items.length > 0) {
        Logger.info('SYNC', `Loaded ${cached.items.length} mappings from cache`);

        // Load cached data into store
        window.MappingsStore.setFromServer(cached.items, {
          version: cached.version,
        });

        // Render UI immediately
        if (typeof window.fetchAndRenderMappings === 'function') {
          window.fetchAndRenderMappings(window.MappingsStore.getAll(), { source: 'cache' });
        }

        // Re-apply mapping filters now that the store has cached data
        if (window.FilterManager && typeof window.FilterManager.applyMappingFilters === 'function') {
          window.FilterManager.applyMappingFilters();
        }

        // Update indicator
        if (typeof window.updateDataSourceIndicator === 'function') {
          window.updateDataSourceIndicator('cache');
        }

        Logger.info('SYNC', 'Initial UI rendered from cache');
      }

      // Full sync in background to get latest data
      Logger.info('SYNC', 'Starting background full sync for latest data');
      await this.fullSync({ background: true });

    } catch (error) {
      Logger.error('SYNC', 'Cold start failed:', error);

      // Fallback to direct full sync
      try {
        await this.fullSync({ background: false });
      } catch (fallbackError) {
        Logger.error('SYNC', 'Fallback full sync also failed:', fallbackError);
        throw fallbackError;
      }
    }
  },

  /**
   * Full sync - fetch all mappings from server
   */
  async fullSync({ background = false } = {}) {
    // Prevent overlapping full syncs
    if (this.isFullSyncing) {
      Logger.debug('SYNC', 'Full sync already in progress, skipping overlapping run');
      return;
    }

    if (window.MappingsStore.metadata.isSyncing || window.MappingsStore.metadata.isOptimisticUpdate) {
      Logger.debug('SYNC', 'Already syncing or optimistic update in progress, skipping full sync');
      return;
    }

    this.isFullSyncing = true;
    Logger.info('SYNC', `Starting full sync (background: ${background})`);

    // Show sync indicator for background syncs
    if (background) {
      this._showSyncIndicator();
    }

    window.MappingsStore.metadata.isSyncing = true;
    window.MappingsStore.metadata.syncStartTime = Date.now();
    const startTime = Date.now();

    try {
      // Fetch all mappings from server
      const response = await this._fetchWithTimeout(
        typeof window.fetchMappingsFromServer === 'function'
          ? window.fetchMappingsFromServer({ force: true })
          : fetch(`${window.wiremockBaseUrl}/mappings`).then(r => r.json()),
        this.config.fullSyncTimeout
      );

      const mappings = response.mappings || [];
      const serverVersion = response.meta?.version || response.meta?.etag || null;

      Logger.info('SYNC', `Received ${mappings.length} mappings from server`);

      // Filter out service cache mapping
      const filteredMappings = mappings.filter(m => {
        const id = m.id || m.uuid;
        return id !== '00000000-0000-0000-0000-00000000cace' && !this._isServiceCacheMapping(m);
      });

      // Update store
      window.MappingsStore.setFromServer(filteredMappings, {
        version: serverVersion,
      });

      // Update UI
      if (typeof window.fetchAndRenderMappings === 'function') {
        window.fetchAndRenderMappings(window.MappingsStore.getAll(), { source: 'direct' });
      }

      // Re-apply mapping filters now that the store has data.
      // This fixes a race condition where the debounced filter fires before
      // the store is populated, rendering an empty state that never updates.
      if (window.FilterManager && typeof window.FilterManager.applyMappingFilters === 'function') {
        window.FilterManager.applyMappingFilters();
      }

      // Update indicator
      if (typeof window.updateDataSourceIndicator === 'function') {
        window.updateDataSourceIndicator('synced');
      }

      const duration = Date.now() - startTime;
      window.MappingsStore.stats.lastSyncDuration = duration;

      Logger.info('SYNC', `Full sync completed in ${duration}ms`);

    } catch (error) {
      Logger.error('SYNC', 'Full sync failed:', error);
      window.MappingsStore.metadata.syncError = error.message;

      if (!background) {
        throw error;
      }
    } finally {
      this.isFullSyncing = false;
      window.MappingsStore.metadata.isSyncing = false;
      window.MappingsStore.metadata.syncStartTime = null;
      this._hideSyncIndicator();
    }
  },

  /**
   * Incremental sync - lightweight check for changes from other users
   * 
   * Key optimization: Does NOT fetch full /mappings on every tick.
   * Instead, it only triggers a full sync when changes are detected.
   */
  async incrementalSync() {
    if (this.isIncrementalSyncing) {
      Logger.debug('SYNC', 'Incremental sync already in progress, skipping overlapping run');
      return;
    }

    this.isIncrementalSyncing = true;
    try {
      if (window.MappingsStore.metadata.isSyncing || window.MappingsStore.metadata.isOptimisticUpdate) {
        Logger.debug('SYNC', 'Already syncing or optimistic update in progress, skipping incremental sync');
        return;
      }

      // Skip if full sync is running
      if (this.isFullSyncing) {
        Logger.debug('SYNC', 'Full sync in progress, skipping incremental');
        return;
      }

      // Skip if no last sync (means we haven't done full sync yet)
      if (!window.MappingsStore.metadata.lastFullSync) {
        Logger.debug('SYNC', 'No full sync yet, skipping incremental');
        return;
      }

      Logger.debug('SYNC', 'Starting lightweight incremental sync check');

      // Lightweight staleness check - does NOT make server calls
      // The scheduled fullSync (every 5 min) handles actual data fetching
      // This approach prevents the polling storm issue where every incremental
      // tick would trigger a full /mappings fetch
      
      const timeSinceLastSync = Date.now() - (window.MappingsStore.metadata.lastFullSync || 0);
      const staleThreshold = this.config.fullSyncInterval / 2; // 2.5 minutes
      
      if (timeSinceLastSync > staleThreshold) {
        // Data is getting stale, but we don't trigger a fetch here
        // The scheduled fullSync will handle it on its next tick
        Logger.debug('SYNC', `Data approaching staleness (${Math.round(timeSinceLastSync / 1000)}s since last sync), will refresh on next full sync`);
      } else {
        Logger.debug('SYNC', `Data is fresh (${Math.round(timeSinceLastSync / 1000)}s since last sync), skipping server check`);
      }

    } finally {
      this.isIncrementalSyncing = false;
    }
  },

  /**
   * Load from Service Cache (special mapping in WireMock)
   */
  async loadFromServiceCache() {
    try {
      Logger.debug('SYNC', 'Attempting to load from Service Cache');

      // Try to fetch the cache mapping using apiFetch for consistent auth headers
      let cacheMapping;
      try {
        cacheMapping = await window.apiFetch(`/mappings/00000000-0000-0000-0000-00000000cace`);
      } catch (fetchError) {
        // Handle 404 (cache not found) gracefully
        if (fetchError.status === 404) {
          Logger.debug('SYNC', 'Service Cache not found');
          return null;
        }
        throw fetchError;
      }

      // Extract cached data from response body
      const cached = cacheMapping.response?.jsonBody || cacheMapping;

      // Validate cache - check for both old format (mappings) and new format (items)
      const mappingsArray = cached.items || cached.mappings;
      if (!mappingsArray || !Array.isArray(mappingsArray)) {
        Logger.warn('SYNC', 'Invalid cache format');
        return null;
      }

      // For backward compatibility, normalize to use items property
      const normalizedCached = {
        ...cached,
        items: mappingsArray
      };

      // Check cache age
      const age = Date.now() - (normalizedCached.timestamp || 0);
      if (age > this.config.cacheMaxAge) {
        Logger.info('SYNC', `Cache is stale (${Math.round(age / 1000)}s old), skipping`);
        return null;
      }

      Logger.info('SYNC', `Service Cache loaded (${normalizedCached.items.length} items, ${Math.round(age / 1000)}s old)`);

      return normalizedCached;

    } catch (error) {
      Logger.warn('SYNC', 'Failed to load Service Cache:', error);
      return null;
    }
  },

  /**
   * Rebuild Service Cache (save current state)
   */
  async rebuildServiceCache() {
    // Only rebuild if no pending operations and no optimistic updates in progress
    if (window.MappingsStore.pending.size > 0 || window.MappingsStore.metadata.isOptimisticUpdate) {
      Logger.debug('SYNC', 'Skipping cache rebuild - pending operations or optimistic updates exist');
      return;
    }

    // Only rebuild if data changed
    const currentHash = this._hashMappings(window.MappingsStore.items);
    if (currentHash === this.lastCacheHash) {
      Logger.debug('SYNC', 'Skipping cache rebuild - no changes');
      return;
    }

    Logger.info('SYNC', 'Rebuilding Service Cache');

    try {
      const snapshot = {
        timestamp: Date.now(),
        version: window.MappingsStore.metadata.serverVersion,
        items: Array.from(window.MappingsStore.items.values()),
        count: window.MappingsStore.items.size,
      };

      // Clean snapshot data by removing internal fields before saving
      const cleanSnapshot = {
        ...snapshot,
        items: snapshot.items.map(item => {
          if (!item || typeof item !== 'object') return item;

          // Remove internal optimistic UI fields
          const cleaned = { ...item };
          delete cleaned._pending;
          delete cleaned._operation;
          delete cleaned._deleted;
          delete cleaned.__optimisticTs;

          // Also clean nested objects in request/response
          if (cleaned.request) {
            delete cleaned.request._pending;
            delete cleaned.request._operation;
            delete cleaned.request._deleted;
          }
          if (cleaned.response) {
            delete cleaned.response._pending;
            delete cleaned.response._operation;
            delete cleaned.response._deleted;
          }

          return cleaned;
        })
      };

      // Save as special mapping (use PUT to update if exists)
      const cacheMapping = {
        id: '00000000-0000-0000-0000-00000000cace',
        priority: 1000,
        request: {
          method: 'GET',
          url: '/__imock/cache/v2',
        },
        response: {
          status: 200,
          jsonBody: cleanSnapshot,
        },
      };

      // Try PUT first (update existing), fall back to POST (create new)
      // Use apiFetch for consistent auth headers
      try {
        await window.apiFetch(`/mappings/${cacheMapping.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cacheMapping),
        });
      } catch (putError) {
        if (putError.status === 404) {
          // Mapping doesn't exist, create it
          await window.apiFetch('/mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cacheMapping),
          });
        } else {
          throw putError;
        }
      }

      this.lastCacheHash = currentHash;

      Logger.info('SYNC', `Service Cache saved (${snapshot.count} mappings)`);

    } catch (error) {
      Logger.warn('SYNC', 'Failed to rebuild Service Cache:', error);
    }
  },

  // === PRIVATE METHODS ===

  _detectChanges(serverMappings) {
    const serverIds = new Set(serverMappings.map(m => m.id || m.uuid));
    const localIds = new Set(window.MappingsStore.items.keys());

    const added = [];
    const updated = [];
    const deleted = [];

    // Find added/updated
    serverMappings.forEach(serverMapping => {
      const id = serverMapping.id || serverMapping.uuid;

      if (!localIds.has(id)) {
        // New mapping from server
        added.push(serverMapping);
      } else {
        // Check if updated
        const localMapping = window.MappingsStore.items.get(id);
        if (this._hasChanged(localMapping, serverMapping)) {
          updated.push(serverMapping);
        }
      }
    });

    // Find deleted
    localIds.forEach(id => {
      if (!serverIds.has(id)) {
        deleted.push(id);
      }
    });

    return {
      added,
      updated,
      deleted,
      hasChanges: added.length > 0 || updated.length > 0 || deleted.length > 0,
    };
  },

  _hasChanged(local, server) {
    // Simple comparison - compare JSON strings
    try {
      return JSON.stringify(local) !== JSON.stringify(server);
    } catch (e) {
      return true;
    }
  },

  _handleConflicts(conflicts) {
    Logger.warn('SYNC', `Handling ${conflicts.length} conflicts`);

    conflicts.forEach(conflict => {
      if (conflict.type === 'delete') {
        // Server deleted - always wins
        Logger.warn('SYNC', `Conflict: mapping ${conflict.id} was deleted on server`);

        if (window.NotificationManager && typeof window.NotificationManager.warning === 'function') {
          const name = conflict.local?.name || conflict.id;
          window.NotificationManager.warning(`Mapping "${name}" was deleted by another user`);
        }

        // Remove pending operation
        window.MappingsStore.pending.delete(conflict.id);

      } else if (conflict.type === 'update') {
        // Last-write-wins: check timestamps
        const serverTimestamp = this._getTimestamp(conflict.server);
        const localTimestamp = conflict.localTimestamp || Date.now();

        if (serverTimestamp > localTimestamp) {
          // Server is newer - apply server version
          Logger.warn('SYNC', `Conflict: server version is newer for ${conflict.id}`);

          if (window.NotificationManager && typeof window.NotificationManager.warning === 'function') {
            const name = conflict.server?.name || conflict.id;
            window.NotificationManager.warning(`Your changes to "${name}" were overwritten by another user`);
          }

          // Rollback pending
          window.MappingsStore.rollbackPending(conflict.id, conflict.server);

        } else {
          // Local is newer - keep local, retry later
          Logger.warn('SYNC', `Conflict: local version is newer for ${conflict.id}, keeping local`);
        }
      }
    });
  },

  _getTimestamp(mapping) {
    return mapping?.metadata?.edited || mapping?.metadata?.updated || mapping?.metadata?.created || 0;
  },

  _formatChangesSummary(changes) {
    const parts = [];
    if (changes.added.length > 0) parts.push(`+${changes.added.length} added`);
    if (changes.updated.length > 0) parts.push(`~${changes.updated.length} updated`);
    if (changes.deleted.length > 0) parts.push(`-${changes.deleted.length} deleted`);
    return parts.join(', ');
  },

  _hashMappings(mappingsMap) {
    // Optimized hash computation for large mapping sets
    // Use only size and a quick checksum to avoid expensive operations on large sets
    if (mappingsMap.size === 0) {
      return '0:';
    }

    // For large sets, use size and hash of keys to avoid memory issues
    const keys = Array.from(mappingsMap.keys());
    if (keys.length > 1000) {
      // For very large sets, just use count and sum of first few and last few hash chars
      const startKeys = keys.slice(0, 50).sort().join('|').substring(0, 100);
      const endKeys = keys.slice(-50).sort().join('|').substring(0, 100);
      const keySignature = `${startKeys}...${endKeys}`;
      return `${mappingsMap.size}:${this._simpleHash(keySignature)}`;
    } else {
      // For smaller sets, use full sorted list as before
      const ids = keys.sort().join(',');
      return `${mappingsMap.size}:${ids}`;
    }
  },

  // Simple non-cryptographic hash function for performance
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36); // Convert to base-36 string for consistency
  },

  _isServiceCacheMapping(mapping) {
    const id = mapping.id || mapping.uuid;
    return id === '00000000-0000-0000-0000-00000000cace' || mapping.request?.url?.includes('/__imock/cache');
  },

  _fetchWithTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      ),
    ]);
  },

  /**
   * Show sync indicator in UI
   */
  _showSyncIndicator() {
    const indicator = document.getElementById('sync-indicator');
    if (indicator) {
      indicator.classList.add('is-active');
    }
  },

  /**
   * Hide sync indicator in UI
   */
  _hideSyncIndicator() {
    const indicator = document.getElementById('sync-indicator');
    if (indicator) {
      indicator.classList.remove('is-active');
    }
  },
};

// Initialize on load
if (typeof window !== 'undefined') {
  window.SyncEngine.init();
}
