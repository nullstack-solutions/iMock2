'use strict';

// === ENHANCED CACHING MECHANISM ===

// Optimized change tracking system
window.cacheManager = {
    // Primary data cache
    cache: new Map(),

    // Optimistic update queue with TTL (array to allow coalescing)
    optimisticQueue: [],

    // TTL configuration for optimistic updates (30 seconds by default)
    optimisticTTL: 30000,

    // Interval handles for lifecycle management
    cleanupInterval: null,
    syncInterval: null,

    // Synchronization flag
    isSyncing: false,

    // Initialization
    init() {
        if (this.cleanupInterval) {
            window.LifecycleManager.clearInterval(this.cleanupInterval);
        }
        if (this.syncInterval) {
            window.LifecycleManager.clearInterval(this.syncInterval);
        }

        // Periodically remove stale optimistic updates
        this.cleanupInterval = window.LifecycleManager.setInterval(() => this.cleanupStaleOptimisticUpdates(), 5000);

        // Periodically synchronize with the server
        this.syncInterval = window.LifecycleManager.setInterval(() => this.syncWithServer(), 60000);
    },

    // Add an optimistic update (simplified flow)
    addOptimisticUpdate(m, op) {
        const id = m?.id || m?.uuid;
        if (!id) return;

        // Lightweight logic - the server remains the source of truth
        this.optimisticQueue.push({ id, op, payload: m, ts: Date.now() });
        console.log(`🎯 [CACHE] Added optimistic update: ${id}, operation: ${op}`);
    },

    // Remove the optimistic update after the server confirms it
    confirmOptimisticUpdate(id) {
        const i = this.optimisticQueue.findIndex(x => x.id === id);
        if (i >= 0) {
            console.log(`✅ [CACHE] Confirmed optimistic update: ${id}`);
            this.optimisticQueue.splice(i, 1);
        }
    },

    // Remove stale optimistic updates
    cleanupStaleOptimisticUpdates() {
        const now = Date.now();
        const initialLength = this.optimisticQueue.length;
        this.optimisticQueue = this.optimisticQueue.filter(item => {
            if (now - item.ts > this.optimisticTTL) {
                console.log(`🧹 [CACHE] Removing stale optimistic update: ${item.id}`);
                return false;
            }
            return true;
        });

        const removedCount = initialLength - this.optimisticQueue.length;
        if (removedCount > 0) {
            console.log(`🧹 [CACHE] Cleaned ${removedCount} stale optimistic updates`);

            if (isCacheEnabled()) {
                console.log('🧹 [CACHE] Cache mode enabled - scheduling cache mapping validation after cleanup');
                scheduleCacheRebuild('stale-optimistic-cleanup');
            }

            this.reconcileCacheAfterOptimisticCleanup();
        }
    },

    reconcileCacheAfterOptimisticCleanup() {
        try {
            if (!(this.cache instanceof Map)) {
                return;
            }

            this.cache.clear();
            if (typeof seedCacheFromGlobals === 'function') {
                seedCacheFromGlobals(this.cache);
            }

            for (const item of this.optimisticQueue) {
                applyOptimisticEntryToCache(this.cache, item);
            }

            window.cacheLastUpdate = Date.now();
            if (typeof refreshMappingsFromCache === 'function') {
                refreshMappingsFromCache();
            }
        } catch (error) {
            console.warn('🧹 [CACHE] Failed to reconcile cache after optimistic cleanup:', error);
        }
    },

    // Remove a specific optimistic update
    removeOptimisticUpdate(id) {
        const i = this.optimisticQueue.findIndex(x => x.id === id);
        if (i >= 0) {
            console.log(`🗑️ [CACHE] Removing optimistic update: ${id}`);
            this.optimisticQueue.splice(i, 1);
        }
    },

    // Full cache rebuild
    async rebuildCache() {
        if (this.isSyncing) {
            console.log('⏳ [CACHE] Already syncing, skipping rebuild');
            return;
        }

        this.isSyncing = true;
        console.log('🔄 [CACHE] Starting cache rebuild');

        try {
            // Pull the latest data from the server
            const response = await fetchMappingsFromServer({ force: true });
            const serverMappings = response.mappings || [];

            // Clear the previous cache snapshot
            this.cache.clear();

            // Populate the cache with server data
            serverMappings.forEach(mapping => {
                const id = mapping.id || mapping.uuid;
                if (id && !isImockCacheMapping(mapping)) {
                    this.cache.set(id, mapping);
                }
            });

            // Layer optimistic updates on top of the server payload
            for (const item of this.optimisticQueue) {
                if (item.op === 'delete') {
                    this.cache.delete(item.id);
                } else {
                    this.cache.set(item.id, item.payload);
                }
            }

            // MEMORY OPTIMIZATION: No need to assign - getters pull from cache automatically
            // window.allMappings and window.originalMappings are getters → Array.from(cache.values())
            refreshMappingTabSnapshot();
            rebuildMappingIndex(window.originalMappings);

            console.log(`✅ [CACHE] Rebuild complete: ${this.cache.size} mappings`);

            // Refresh the UI
            if (typeof window.fetchAndRenderMappings === 'function') {
                window.fetchAndRenderMappings(window.allMappings);
            }

        } catch (error) {
            console.error('❌ [CACHE] Rebuild failed:', error);
        } finally {
            this.isSyncing = false;
        }
    },

    // Synchronize with the server
    async syncWithServer() {
        if (this.optimisticQueue.length === 0) {
            console.log('✨ [CACHE] No optimistic updates to sync');
            return;
        }

        console.log(`🔄 [CACHE] Syncing ${this.optimisticQueue.length} optimistic updates`);

        if (isCacheEnabled()) {
            console.log('🔄 [CACHE] Cache mode enabled - ensuring cache mapping exists before rebuilding');
            try {
                await validateAndRefreshCache();
            } catch (validationError) {
                console.warn('🔄 [CACHE] Validation during sync failed:', validationError);
            }
            return;
        }

        await this.rebuildCache();
    }
};

// Initialize the cache manager
window.cacheManager.init();

function isCacheEnabled() {
    try {
        const checkbox = document.getElementById('cache-enabled');
        const settings = (typeof window.readWiremockSettings === 'function') ? window.readWiremockSettings() : {};
        return (settings.cacheEnabled !== false) && (checkbox ? checkbox.checked : true);
    } catch (error) {
        console.warn('Failed to resolve cache enabled state:', error);
        return false;
    }
}


// --- CORE APPLICATION FUNCTIONS ---

// Enhanced WireMock connection routine with accurate uptime handling
window.connectToWireMock = async () => {
    // Get host/port from settings or input fields
    const settings = (typeof window.readWiremockSettings === 'function') ? window.readWiremockSettings() : {};
    const hostInput = document.getElementById('wiremock-host') || document.getElementById(SELECTORS.CONNECTION.HOST);
    const portInput = document.getElementById('wiremock-port') || document.getElementById(SELECTORS.CONNECTION.PORT);

    // Use saved settings or input values
    const trimOrEmpty = (value) => typeof value === 'string' ? value.trim() : '';

    let host = trimOrEmpty(hostInput?.value) || trimOrEmpty(settings.host) || trimOrEmpty(settings.wiremockHost);
    let port = trimOrEmpty(portInput?.value) || trimOrEmpty(settings.port) || trimOrEmpty(settings.wiremockPort);

    if (!host && window.wiremockBaseUrl) {
        try {
            const parsed = new URL(window.wiremockBaseUrl);
            host = `${parsed.protocol}//${parsed.hostname}`;
            if (!port && parsed.port) {
                port = parsed.port;
            }
        } catch (error) {
            console.warn('Failed to derive host from existing wiremockBaseUrl:', window.wiremockBaseUrl, error);
        }
    }

    if (!host) {
        host = 'localhost';
    }

    if (!port) {
        port = '';
    }
    
    // DON'T save connection settings here - they should already be saved from Settings page
    // Only use these values for the current connection attempt
    console.log('🔗 Connecting with:', { host, port });
    
    // Normalize base URL (proper scheme/port normalization)
    window.wiremockBaseUrl = window.normalizeWiremockBaseUrl(host, port);
    
    try {
        // The first health check starts uptime tracking
        await checkHealthAndStartUptime();
        
        // Update the UI after a successful connection
        const statusDot = document.getElementById(SELECTORS.CONNECTION.STATUS_DOT);
        const statusText = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
        const setupDiv = document.getElementById(SELECTORS.CONNECTION.SETUP);
        const addButton = document.getElementById(SELECTORS.BUTTONS.ADD_MAPPING);
        
        if (statusDot) statusDot.className = 'status-dot connected';
        if (statusText) { if (!window.lastWiremockSuccess) { window.lastWiremockSuccess = Date.now(); } if (typeof window.updateLastSuccessUI === 'function') { window.updateLastSuccessUI(); } }
        if (setupDiv) setupDiv.style.display = 'none';
        if (addButton) addButton.disabled = false;
        
        // Reveal statistics and filters
        const statsElement = document.getElementById(SELECTORS.UI.STATS);
        const statsSpacer = document.getElementById('stats-spacer');
        const filtersElement = document.getElementById(SELECTORS.UI.SEARCH_FILTERS);
        if (statsElement) statsElement.style.display = 'flex';
        if (statsSpacer) statsSpacer.style.display = 'none';
        if (filtersElement) filtersElement.style.display = 'block';
        
        // Start periodic health checks
        startHealthMonitoring();
        
        // Load data in parallel while leveraging the Cache Service
        const useCache = isCacheEnabled();
        const [mappingsLoaded, requestsLoaded] = await Promise.all([
            fetchAndRenderMappings(null, { useCache }),
            fetchAndRenderRequests()
        ]);

        await loadScenarios();

        if (mappingsLoaded && requestsLoaded) {
            NotificationManager.success('Connected to WireMock successfully!');
        } else {
            console.warn('Connected to WireMock, but some resources failed to load', {
                mappingsLoaded,
                requestsLoaded
            });
        }
        
    } catch (error) {
        console.error('Connection error:', error);
        NotificationManager.error(`Connection error: ${error.message}`);
        
        // Stop uptime tracking on failure
        stopUptime();
        
        // Reset connection state
        const statusDot = document.getElementById(SELECTORS.CONNECTION.STATUS_DOT);
        const statusText = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
        if (statusDot) statusDot.className = 'status-dot disconnected';
        if (statusText) statusText.textContent = 'Disconnected';
    }
};

// Health monitoring and uptime system
let healthCheckInterval = null;

// Perform the first health check and start uptime tracking
window.checkHealthAndStartUptime = async () => {
    try {
        // Measure response time
        const startTime = performance.now();
        let responseTime = 0;
        let isHealthy = false;

        // Check /health endpoint (WireMock 3.x standard)
        const response = await apiFetch(ENDPOINTS.HEALTH);
        responseTime = Math.round(performance.now() - startTime);
        isHealthy = typeof response === 'object' && (
            (typeof response.status === 'string' && ['up','healthy','ok'].includes(response.status.toLowerCase())) ||
            response.healthy === true
        );
        console.log('[HEALTH] initial check:', { rawStatus: response?.status, healthyFlag: response?.healthy, isHealthy });

        if (isHealthy) {
            // Start uptime only after a successful health check
            window.startTime = Date.now();
            if (window.uptimeInterval) window.LifecycleManager.clearInterval(window.uptimeInterval);
            window.uptimeInterval = window.LifecycleManager.setInterval(updateUptime, 1000);
            // Unified health UI update (fallback below keeps old DOM path)
            if (typeof window.applyHealthUI === 'function') {
                try { window.applyHealthUI(true, responseTime); } catch (e) { console.warn('applyHealthUI failed:', e); }
            }
            
            // Update the health indicator with the measured response time
            // Unified health UI (fallback DOM update remains below)
            if (typeof window.applyHealthUI === 'function') {
                try { window.applyHealthUI(isHealthy, isHealthy ? responseTime : null); } catch (e) { console.warn('applyHealthUI failed:', e); }
            }
            const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
            if (healthIndicator) {
                healthIndicator.style.display = 'inline';
                healthIndicator.innerHTML = `<span>Response Time: </span><span class="healthy">${responseTime}ms</span>`;
            }
            
            console.log(`✅ WireMock health check passed (${responseTime}ms), uptime started`);
        } else {
            throw new Error('WireMock is not healthy');
        }
    } catch (error) {
        console.error('Health check failed:', error);
        throw error;
    }
};

// Periodic health monitoring function
window.startHealthMonitoring = () => {
    // Clear any previous interval
    if (healthCheckInterval) {
        window.LifecycleManager.clearInterval(healthCheckInterval);
    }

    // Check health every 30 seconds
    healthCheckInterval = window.LifecycleManager.setInterval(async () => {
        try {
            const startTime = performance.now();
            let responseTime = 0;
            let isHealthyNow = false;

            const healthResponse = await apiFetch(ENDPOINTS.HEALTH);
            responseTime = Math.round(performance.now() - startTime);
            isHealthyNow = typeof healthResponse === 'object' && (
                (typeof healthResponse.status === 'string' && ['up','healthy','ok'].includes(healthResponse.status.toLowerCase())) ||
                healthResponse.healthy === true
            );
            console.log('[HEALTH] periodic check:', { rawStatus: healthResponse?.status, healthyFlag: healthResponse?.healthy, isHealthyNow });

            const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
            if (healthIndicator) {
                if (isHealthyNow) {
                    healthIndicator.innerHTML = `<span>Response Time: </span><span class="healthy">${responseTime}ms</span>`;
                } else {
                    healthIndicator.innerHTML = `<span>Response Time: </span><span class="unhealthy">Unhealthy</span>`;
                    // Stop uptime on the first failed health check
                    stopUptime();
                    window.LifecycleManager.clearInterval(healthCheckInterval);
                    NotificationManager.warning('WireMock health check failed, uptime stopped');
                }
            }
        } catch (error) {
            console.error('Health monitoring failed:', error);
            // Stop uptime when health monitoring throws
            const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
            if (typeof window.applyHealthUI === 'function') {
                try { window.applyHealthUI(null, null); } catch {}
            } else if (healthIndicator) {
                healthIndicator.innerHTML = `<span>Response Time: </span><span class="error">Error</span>`;
            }
            stopUptime();
            window.LifecycleManager.clearInterval(healthCheckInterval);
            NotificationManager.error('Health monitoring failed, uptime stopped');
        }
    }, 30000); // 30 seconds
};


function refreshMappingsFromCache({ maintainFilters = true } = {}) {
    try {

        // MEMORY OPTIMIZATION: Update cacheManager.cache instead of getters
        const sanitized = buildCacheSnapshot();

        // Populate cacheManager.cache (getters will reflect this automatically)
        window.cacheManager.cache.clear();
        sanitized.forEach(mapping => {
            const id = mapping.id || mapping.uuid;
            if (id) window.cacheManager.cache.set(id, mapping);
        });

        refreshMappingTabSnapshot();
        rebuildMappingIndex(window.originalMappings);

        const methodFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value || '';
        const urlFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value || '';
        const statusFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value || '';
        const hasFilters = maintainFilters && Boolean(methodFilter || urlFilter || statusFilter);

        if (hasFilters && typeof FilterManager !== 'undefined' && typeof FilterManager.applyMappingFilters === 'function') {
            FilterManager.applyMappingFilters();
            if (typeof FilterManager.flushMappingFilters === 'function') {
                FilterManager.flushMappingFilters();
            }
        } else if (typeof fetchAndRenderMappings === 'function') {
            fetchAndRenderMappings(window.allMappings);
        }

        if (typeof updateDataSourceIndicator === 'function') {
            updateDataSourceIndicator('cache');
        }
    } catch (error) {
        console.warn('refreshMappingsFromCache failed:', error);
    }
}

function updateOptimisticCache(mapping, operation, options = {}) {
    try {
        const mappingId = mapping?.id || mapping?.uuid;
        if (!mappingId) {
            console.warn('updateOptimisticCache called without valid id:', mapping);
            return;
        }

        if (!window.cacheManager || !(window.cacheManager.cache instanceof Map)) {
            console.warn('updateOptimisticCache skipped - cacheManager unavailable');
            return;
        }

        const cache = window.cacheManager.cache;
        seedCacheFromGlobals(cache);
        const normalizedOperation = (operation || 'update').toLowerCase();
        const queueMode = typeof options.queueMode === 'string' ? options.queueMode : 'confirm';
        const shouldAddToQueue = queueMode === 'add';
        const shouldConfirmQueue = queueMode === 'confirm';

        if (shouldAddToQueue && typeof window.cacheManager.addOptimisticUpdate === 'function') {
            try {
                window.cacheManager.addOptimisticUpdate(mapping, normalizedOperation);
            } catch (queueError) {
                console.warn('updateOptimisticCache: failed to enqueue optimistic update', queueError);
            }
        }

        if (normalizedOperation === 'delete') {
            removeMappingFromIndex(mappingId);
            if (window.pendingDeletedIds instanceof Set) {
                window.pendingDeletedIds.add(mappingId);
            }
            if (window.deletionTimeouts instanceof Map) {
                const existing = window.deletionTimeouts.get(mappingId);
                if (existing) {
                    clearTimeout(existing);
                }
                const timeout = setTimeout(() => {
                    try {
                        if (window.pendingDeletedIds instanceof Set) {
                            window.pendingDeletedIds.delete(mappingId);
                        }
                    } finally {
                        if (window.deletionTimeouts instanceof Map) {
                            window.deletionTimeouts.delete(mappingId);
                        }
                    }
                }, 15000);
                window.deletionTimeouts.set(mappingId, timeout);
            }
            if (shouldConfirmQueue && typeof window.cacheManager.removeOptimisticUpdate === 'function') {
                window.cacheManager.removeOptimisticUpdate(mappingId);
            }
        } else {
            addMappingToIndex(mapping);

            if (shouldConfirmQueue && typeof window.cacheManager.confirmOptimisticUpdate === 'function') {
                window.cacheManager.confirmOptimisticUpdate(mappingId);
            }
        }

        applyOptimisticEntryToCache(cache, { id: mappingId, op: normalizedOperation, payload: mapping });

        window.cacheLastUpdate = Date.now();
        refreshMappingsFromCache();

        enqueueCacheSync(mapping, normalizedOperation);
    } catch (error) {
        console.warn('updateOptimisticCache failed:', error);
    }
}

function applyOptimisticEntryToCache(cache, entry) {
    if (!(cache instanceof Map) || !entry || !entry.id) {
        return;
    }

    const operation = typeof entry.op === 'string' ? entry.op.toLowerCase() : 'update';
    if (operation === 'delete') {
        cache.delete(entry.id);
        return;
    }

    const source = entry.payload;
    let payload = null;
    if (typeof cloneMappingForCache === 'function') {
        payload = cloneMappingForCache(source);
    }
    if (!payload && source && typeof source === 'object') {
        payload = { ...source };
    }

    if (!payload) {
        console.warn('applyOptimisticEntryToCache skipped - no payload for entry', entry.id);
        return;
    }

    if (!payload.id) {
        payload.id = entry.id;
    }
    if (!payload.uuid && source && source.uuid) {
        payload.uuid = source.uuid;
    }

    if (cache.has(entry.id)) {
        const existing = cache.get(entry.id);
        if (typeof mergeMappingData === 'function') {
            cache.set(entry.id, mergeMappingData(existing, payload));
        } else {
            cache.set(entry.id, { ...existing, ...payload });
        }
    } else {
        cache.set(entry.id, payload);
    }
}

// Simple debounce for cache rebuilds that leverages the existing refreshImockCache
let _cacheRebuildTimer;
function scheduleCacheRebuild(reason = 'unspecified', options = {}) {
  try {
    if (!isCacheEnabled()) {
      return;
    }

    const normalizedOptions = (options && typeof options === 'object') ? options : {};
    const { force = false } = normalizedOptions;

    const settings = (typeof window.readWiremockSettings === 'function') ? window.readWiremockSettings() : {};
    const delay = Number(settings.cacheRebuildDelay) || 1000;
    clearTimeout(_cacheRebuildTimer);
    _cacheRebuildTimer = setTimeout(async () => {
      try {
        console.log(`🧩 [CACHE] Scheduled cache validation triggered by: ${reason}`);
        if (!force) {
          const existing = await fetchExistingCacheMapping();
          if (existing && extractCacheJsonBody(existing)) {
            console.log('🧩 [CACHE] Skipping scheduled rebuild - cache mapping already exists');
            return;
          }
        } else {
          console.log('🧩 [CACHE] Forced rebuild requested - bypassing cache mapping presence check');
        }
        if (typeof window.refreshImockCache === 'function') {
          await window.refreshImockCache();
        }
      } catch (timerError) {
        console.warn('🧩 [CACHE] Scheduled rebuild attempt failed:', timerError);
      }
    }, delay);
  } catch (error) {
    console.warn('🧩 [CACHE] scheduleCacheRebuild failed:', error);
  }
}

// Guard against an infinite optimistic update loop in progress
let optimisticInProgress = false;
let optimisticDelayRetries = 0;

// Cache validation timer (check every minute, validate every 5 minutes)
window.cacheValidationInterval = window.LifecycleManager.setInterval(() => {
    const timeSinceLastUpdate = Date.now() - (window.cacheLastUpdate || 0);

    // Validate if cache is older than 5 minutes
    if (timeSinceLastUpdate > 5 * 60 * 1000) {
        console.log('🧩 [CACHE] Validation triggered - time:', Math.round(timeSinceLastUpdate/1000), 's');
        validateAndRefreshCache();
    }
}, 60 * 1000); // Check every minute

async function validateAndRefreshCache() {
    try {
        console.log('🧩 [CACHE] Starting cache validation...');

    if (!isCacheEnabled()) {
            console.log('🧩 [CACHE] Validation skipped - cache disabled');
            return;
        }

        const existing = await fetchExistingCacheMapping();
        if (existing && extractCacheJsonBody(existing)) {
            console.log('🧩 [CACHE] Validation skipped - cache mapping already present');
            return;
        }

        // Cache mapping missing - rebuild from server data
        const freshData = await fetchMappingsFromServer({ force: true });
        if (!freshData?.mappings) {
            console.warn('🧩 [CACHE] Failed to get fresh data for validation');
            return;
        }

        const payload = await regenerateImockCache(freshData);
        window.imockCacheSnapshot = payload;

        // Reset cache timestamp after rebuilding the mapping
        window.cacheLastUpdate = Date.now();

        console.log('🧩 [CACHE] Validation rebuilt cache because mapping was missing');

    } catch (e) {
        console.warn('🧩 [CACHE] Validation failed:', e);
        // Don't reset counters on failure - try again later
    }
}

// Expose cache refresh for other modules (editor.js)
window.refreshImockCache = async () => {
    if (optimisticInProgress) {
        if (optimisticDelayRetries++ > 10) {
            console.warn('[CACHE] forced refresh after optimistic delay cap');
        } else {
            console.log('🔄 [CACHE] Optimistic update in progress, delaying cache refresh...');
            return new Promise(resolve => {
                setTimeout(async () => {
                    console.log('🔄 [CACHE] Retrying cache refresh after optimistic update delay');
                    await window.refreshImockCache();
                    resolve();
                }, 1000);
            });
        }
    }
    optimisticDelayRetries = 0;
    optimisticInProgress = true;
    try {

        try {
            if (isCacheEnabled()) {
                updateDataSourceIndicator('cache_rebuilding');
                console.log('🔄 [CACHE] Updated UI indicator to rebuilding');
            }
        } catch (settingsError) {
            console.warn('🔄 [CACHE] Failed to update UI indicator:', settingsError);
        }

        console.log('🔄 [CACHE] Starting regeneration...');
        const payload = await regenerateImockCache();
        window.imockCacheSnapshot = payload;
        console.log('🔄 [CACHE] Regeneration completed');

        // Clear optimistic update queue after successful cache rebuild
        console.log('🔄 [CACHE] Clearing optimistic update queue after rebuild');
        window.cacheManager.optimisticQueue.length = 0;

        // Auto-refresh UI after cache update
        try {
            if (typeof window.fetchAndRenderMappings === 'function' && window.allMappings) {
                console.log('🔄 [CACHE] Auto-refreshing UI after cache rebuild');
                window.fetchAndRenderMappings(window.allMappings);
                console.log('🔄 [CACHE] UI refresh completed');
            } else {
                console.warn('🔄 [CACHE] UI refresh functions not available');
            }
        } catch (uiError) {
            console.warn('🔄 [CACHE] UI refresh after cache rebuild failed:', uiError);
        }
    } catch (e) {
        console.warn('🔄 [CACHE] refreshImockCache failed:', e);
    } finally {
        window.cacheLastUpdate = Date.now();
        optimisticInProgress = false;
        optimisticDelayRetries = 0;
        try {
            if (isCacheEnabled()) {
                updateDataSourceIndicator('cache');
                console.log('🔄 [CACHE] Updated UI indicator to cache');
            }
        } catch (settingsError) {
            console.warn('🔄 [CACHE] Failed to reset UI indicator:', settingsError);
        }
    }
};


window.refreshMappingsFromCache = refreshMappingsFromCache;
window.updateOptimisticCache = updateOptimisticCache;
window.isCacheEnabled = isCacheEnabled;
window.scheduleCacheRebuild = scheduleCacheRebuild;
