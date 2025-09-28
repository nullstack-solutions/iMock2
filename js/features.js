'use strict';

// ===== FEATURES.JS - Business logic =====
// Hosts all primary app features: mappings, requests, scenarios, recording, import/export, settings
// Updated: 2025-09-22 - Added missing HTML compatibility functions

// --- GLOBAL STATE (shared via window for cross-module access) ---
// Variables are defined in core.js

// Original data stores (never mutated by filters)
window.originalMappings = []; // Complete mapping list from the server
window.allMappings = []; // Currently displayed mappings (may be filtered)
window.originalRequests = []; // Complete request list from the server
window.allRequests = []; // Currently displayed request list (may be filtered)

// Reliable deletion tracking system
window.pendingDeletedIds = new Set(); // Track items pending deletion to prevent cache flicker
window.deletionTimeouts = new Map(); // Track cleanup timeouts for safety

// Ensure only one heavy /mappings request is in-flight at a time
let mappingsFetchPromise = null;

async function fetchMappingsFromServer({ force = false } = {}) {
    if (!force && mappingsFetchPromise) {
        return mappingsFetchPromise;
    }

    if (force && mappingsFetchPromise) {
        try {
            await mappingsFetchPromise;
        } catch (error) {
            console.warn('fetchMappingsFromServer: previous request failed, starting a new one', error);
        }
    }

    const requestPromise = (async () => {
        try {
            return await apiFetch(ENDPOINTS.MAPPINGS);
        } finally {
            if (mappingsFetchPromise === requestPromise) {
                mappingsFetchPromise = null;
            }
        }
    })();

    mappingsFetchPromise = requestPromise;
    return requestPromise;
}

// === ENHANCED CACHING MECHANISM ===

// Optimized change tracking system
window.cacheManager = {
    // Primary data cache
    cache: new Map(),

    // Optimistic update queue with TTL (array to allow coalescing)
    optimisticQueue: [],

    // TTL configuration for optimistic updates (30 seconds by default)
    optimisticTTL: 30000,

    // Version counter for change tracking
    version: 0,

    // Synchronization flag
    isSyncing: false,

    // Initialization
    init() {
        // Periodically remove stale optimistic updates
        setInterval(() => this.cleanupStaleOptimisticUpdates(), 5000);

        // Periodically synchronize with the server
        setInterval(() => this.syncWithServer(), 60000);
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
            // Trigger a UI refresh if stale updates were removed
            this.rebuildCache();
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

            // Update the global arrays
            window.originalMappings = Array.from(this.cache.values());
            window.allMappings = [...window.originalMappings];

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
        await this.rebuildCache();
    },

    // Retrieve a mapping from the cache
    getMapping(id) {
        return this.cache.get(id);
    },

    // Check if a mapping exists
    hasMapping(id) {
        return this.cache.has(id);
    },

    // Clear the entire cache
    clear() {
        this.cache.clear();
        this.optimisticQueue.length = 0;
        this.version = 0;
        console.log('🧹 [CACHE] Cache cleared');
    }
};

// Initialize the cache manager
window.cacheManager.init();

function isCacheEnabled() {
    try {
        const checkbox = document.getElementById('cache-enabled');
        const settings = window.SettingsStore?.getCached?.() || {};
        return (settings.cacheEnabled !== false) && (checkbox ? checkbox.checked : true);
    } catch (error) {
        console.warn('Failed to resolve cache enabled state:', error);
        return false;
    }
}


// --- CORE APPLICATION FUNCTIONS ---

// Enhanced WireMock connection routine with accurate uptime handling
window.connectToWireMock = async () => {
    // Try main page elements first, then fallback to settings page elements
    const hostInput = document.getElementById('wiremock-host') || document.getElementById(SELECTORS.CONNECTION.HOST);
    const portInput = document.getElementById('wiremock-port') || document.getElementById(SELECTORS.CONNECTION.PORT);
    
    if (!hostInput || !portInput) {
        console.error('Connection input elements not found');
        NotificationManager.error('Error: connection fields not found');
        return;
    }
    
    const host = hostInput.value.trim() || 'localhost';
    const port = portInput.value.trim() || '8080';
    
    // DON'T save connection settings here - they should already be saved from Settings page
    // Only use these values for the current connection attempt
    console.log('🔗 Connecting with:', { host, port });
    
    // Update the base URL (with proper scheme/port normalization)
    if (typeof window.normalizeWiremockBaseUrl === 'function') {
        window.wiremockBaseUrl = window.normalizeWiremockBaseUrl(host, port);
    } else {
        // Fall back to the previous behavior (in case script load order changes)
        const hasScheme = /^(https?:)\/\//i.test(host);
        const scheme = hasScheme ? host.split(':')[0] : 'http';
        const cleanHost = hasScheme ? host.replace(/^(https?:)\/\//i, '') : host;
        const finalPort = (port && String(port).trim()) || (scheme === 'https' ? '443' : '8080');
        window.wiremockBaseUrl = `${scheme}://${cleanHost}:${finalPort}/__admin`;
    }
    
    try {
        let renderSource = 'unknown';
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

        // Try /health first (WireMock 3.x) then fall back to /mappings (compatible with 2.x)
        try {
            const response = await apiFetch(ENDPOINTS.HEALTH);
            responseTime = Math.round(performance.now() - startTime);
            isHealthy = typeof response === 'object' && (
                (typeof response.status === 'string' && ['up','healthy','ok'].includes(response.status.toLowerCase())) ||
                response.healthy === true
            );
            console.log('[HEALTH] initial check:', { rawStatus: response?.status, healthyFlag: response?.healthy, isHealthy });
        } catch (primaryError) {
            // Fallback: verify core API availability via /mappings
            const fallback = await fetchMappingsFromServer();
            responseTime = Math.round(performance.now() - startTime);
            // Treat a JSON object response (WireMock default) as healthy
            isHealthy = typeof fallback === 'object';
        }

        if (isHealthy) {
            // Start uptime only after a successful health check
            window.startTime = Date.now();
            if (window.uptimeInterval) clearInterval(window.uptimeInterval);
            window.uptimeInterval = setInterval(updateUptime, 1000);
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
        clearInterval(healthCheckInterval);
    }

    // Check health every 30 seconds
    healthCheckInterval = setInterval(async () => {
        try {
            const startTime = performance.now();
            let responseTime = 0;
            let isHealthyNow = false;

            try {
                const healthResponse = await apiFetch(ENDPOINTS.HEALTH);
                responseTime = Math.round(performance.now() - startTime);
                isHealthyNow = typeof healthResponse === 'object' && (
                    (typeof healthResponse.status === 'string' && ['up','healthy','ok'].includes(healthResponse.status.toLowerCase())) ||
                    healthResponse.healthy === true
                );
                console.log('[HEALTH] periodic check:', { rawStatus: healthResponse?.status, healthyFlag: healthResponse?.healthy, isHealthyNow });
            } catch (primaryError) {
                // Fallback to /mappings
                const fallback = await fetchMappingsFromServer();
                responseTime = Math.round(performance.now() - startTime);
                isHealthyNow = typeof fallback === 'object';
            }

            const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
            if (healthIndicator) {
                if (isHealthyNow) {
                    healthIndicator.innerHTML = `<span>Response Time: </span><span class="healthy">${responseTime}ms</span>`;
                } else {
                    healthIndicator.innerHTML = `<span>Response Time: </span><span class="unhealthy">Unhealthy</span>`;
                    // Stop uptime on the first failed health check
                    stopUptime();
                    clearInterval(healthCheckInterval);
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
            clearInterval(healthCheckInterval);
            NotificationManager.error('Health monitoring failed, uptime stopped');
        }
    }, 30000); // 30 seconds
};

// ===== UPTIME FUNCTIONS =====

window.updateUptime = function() {
    if (!window.startTime) return;
    const uptimeSeconds = Math.floor((Date.now() - window.startTime) / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    const uptimeElement = document.getElementById('uptime');
    if (uptimeElement) {
        if (hours > 0) {
            uptimeElement.textContent = `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            uptimeElement.textContent = `${minutes}m ${seconds}s`;
        } else {
            uptimeElement.textContent = `${seconds}s`;
        }
    }
};

window.stopUptime = function() {
    if (window.uptimeInterval) {
        clearInterval(window.uptimeInterval);
        window.uptimeInterval = null;
    }
    window.startTime = null;
    const uptimeElement = document.getElementById('uptime');
    if (uptimeElement) {
        uptimeElement.textContent = '0s';
    }
};


// --- COMPACT UTILITIES (trimmed from ~80 to 20 lines) ---

const Utils = {
    escapeHtml: (unsafe) => typeof unsafe !== 'string' ? String(unsafe) :
        unsafe.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])),

    parseRequestTime: (date) => {
        if (!date) return new Date().toLocaleString('en-US');
        try {
            const d = new Date(typeof date === 'number' ? (date > 1e12 ? date : date * 1000) : date);
            return isNaN(d.getTime()) ? `Invalid: ${date}` : d.toLocaleString('en-US');
        } catch { return `Invalid: ${date}`; }
    },

    getStatusClass: (status) => {
        const code = parseInt(status, 10) || 0;
        if (code >= 200 && code < 300) return 'success';
        if (code >= 300 && code < 400) return 'redirect';
        if (code >= 400 && code < 500) return 'client-error';
        if (code >= 500) return 'server-error';
        return 'unknown';
    }
};

const escapeHtml = Utils.escapeHtml;
if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = Utils.escapeHtml;
}

const LazyJsonFormatter = (() => {
    const queue = [];
    let scheduled = false;

    const runTasks = (deadline) => {
        scheduled = false;
        const hasDeadline = deadline && typeof deadline.timeRemaining === 'function';
        let start = Date.now();
        while (queue.length && (
            (hasDeadline && deadline.timeRemaining() > 4) ||
            (!hasDeadline && Date.now() - start < 8)
        )) {
            const task = queue.shift();
            try {
                const jsonString = JSON.stringify(task.value, null, 2);
                const truncated = jsonString.length > task.maxLength;
                const previewText = truncated
                    ? `${jsonString.slice(0, task.maxLength)}
… (truncated - ${jsonString.length - task.maxLength} more characters)`
                    : jsonString;
                task.onResult({ previewText, truncated, fullText: truncated ? jsonString : previewText });
            } catch (error) {
                task.onError?.(error);
            }
        }
        if (queue.length) {
            schedule();
        }
    };

    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(runTasks, { timeout: 1000 });
        } else {
            window.setTimeout(() => runTasks(), 16);
        }
    };

    return {
        enqueue(options) {
            if (!options || typeof options.onResult !== 'function') {
                throw new Error('LazyJsonFormatter requires an onResult callback');
            }
            queue.push({
                value: options.value,
                maxLength: options.maxLength ?? 1000,
                onResult: options.onResult,
                onError: options.onError
            });
            schedule();
        }
    };
})();

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

const UIComponents = {
    createIcon(symbol, className = 'icon') {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', className);
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const use = document.createElementNS(SVG_NS, 'use');
        use.setAttributeNS(XLINK_NS, 'xlink:href', `#${symbol}`);
        use.setAttribute('href', `#${symbol}`);
        svg.appendChild(use);
        return svg;
    },

    createBadge(text, className = 'badge badge-secondary', title) {
        const badge = document.createElement('span');
        badge.className = className;
        if (title) {
            badge.title = title;
        }
        badge.textContent = text;
        return badge;
    },

    createShowMoreButton(fullText) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary btn-small';
        button.textContent = 'Show Full Content';
        const fullId = `full-${Math.random().toString(36).slice(2)}`;
        button.dataset.target = fullId;
        button.dataset.json = fullText;
        button.setAttribute('aria-expanded', 'false');
        button.addEventListener('click', () => UIComponents.toggleFullContent(fullId, button));
        return button;
    },

    appendValueContent(container, value) {
        if (value === null || value === undefined || value === '') {
            return;
        }

        if (value instanceof Node) {
            container.appendChild(value);
            return;
        }

        if (typeof value === 'object') {
            const placeholder = document.createElement('pre');
            placeholder.textContent = 'Preparing preview…';
            container.appendChild(placeholder);

            LazyJsonFormatter.enqueue({
                value,
                maxLength: 500,
                onResult: ({ previewText, truncated, fullText }) => {
                    placeholder.textContent = previewText;
                    if (truncated) {
                        const button = UIComponents.createShowMoreButton(fullText);
                        container.appendChild(button);
                        const fullContainer = document.createElement('div');
                        fullContainer.id = button.dataset.target;
                        fullContainer.style.display = 'none';
                        container.appendChild(fullContainer);
                    }
                },
                onError: (error) => {
                    placeholder.textContent = `Error formatting JSON: ${error.message}`;
                }
            });
            return;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    UIComponents.appendValueContent(container, parsed);
                    return;
                } catch (_) {
                    // fall through to string rendering
                }
            }

            if (value.includes('\n')) {
                const pre = document.createElement('pre');
                pre.textContent = value;
                container.appendChild(pre);
            } else {
                const span = document.createElement('span');
                span.textContent = value;
                container.appendChild(span);
            }
            return;
        }

        const span = document.createElement('span');
        span.textContent = String(value);
        container.appendChild(span);
    },

    createCard(type, data, actions = []) {
        const { id, method, url, status, name, time, extras = {} } = data;
        const card = document.createElement('div');
        card.className = `${type}-card`;
        card.dataset.id = id;

        const header = document.createElement('div');
        header.className = `${type}-header`;
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-controls', `preview-${id}`);
        header.setAttribute('aria-expanded', 'false');

        const handleToggle = (event) => {
            event.preventDefault();
            event.stopPropagation();
            UIComponents.toggleDetails(id, type);
        };

        header.addEventListener('click', handleToggle);
        header.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleToggle(event);
            }
        });

        const info = document.createElement('div');
        info.className = `${type}-info`;

        const topLine = document.createElement('div');
        topLine.className = `${type}-top-line`;

        const methodBadge = document.createElement('span');
        methodBadge.className = `method-badge ${String(method || '').toLowerCase()}`;
        const arrow = document.createElement('span');
        arrow.className = 'collapse-arrow';
        arrow.id = `arrow-${id}`;
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '▶';
        methodBadge.appendChild(arrow);
        methodBadge.appendChild(document.createTextNode(` ${method}`));
        topLine.appendChild(methodBadge);

        if (name) {
            const nameEl = document.createElement('span');
            nameEl.className = `${type}-name`;
            nameEl.textContent = name;
            topLine.appendChild(nameEl);
        }

        if (time) {
            const timeEl = document.createElement('span');
            timeEl.className = `${type}-time`;
            timeEl.textContent = time;
            topLine.appendChild(timeEl);
        }

        info.appendChild(topLine);

        const urlLine = document.createElement('div');
        urlLine.className = `${type}-url-line`;

        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${Utils.getStatusClass(status)}`;
        statusBadge.textContent = status;
        statusBadge.setAttribute('aria-label', `Status ${status}`);
        urlLine.appendChild(statusBadge);

        const urlEl = document.createElement('span');
        urlEl.className = `${type}-url`;
        urlEl.textContent = url;
        urlLine.appendChild(urlEl);

        if (extras.badges) {
            extras.badges.forEach((badge) => {
                if (badge instanceof Node) {
                    urlLine.appendChild(badge);
                }
            });
        }

        info.appendChild(urlLine);
        header.appendChild(info);

        const actionsContainer = document.createElement('div');
        actionsContainer.className = `${type}-actions`;

        actions.forEach((action) => {
            if (!action || !action.handler) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `btn btn-sm btn-${action.class || 'secondary'}`;
            const label = action.title || action.label || 'Action';
            button.setAttribute('title', label);
            button.setAttribute('aria-label', label);
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const fn = window[action.handler];
                if (typeof fn === 'function') {
                    fn(id);
                } else {
                    console.warn(`Action handler not found: ${action.handler}`);
                }
            });
            if (action.iconName) {
                button.appendChild(UIComponents.createIcon(action.iconName, 'icon icon-sm'));
            }
            if (action.label) {
                const sr = document.createElement('span');
                sr.className = 'sr-only';
                sr.textContent = action.label;
                button.appendChild(sr);
            }
            actionsContainer.appendChild(button);
        });

        header.appendChild(actionsContainer);

        const previewContainer = document.createElement('div');
        previewContainer.className = `${type}-preview`;
        previewContainer.id = `preview-${id}`;
        previewContainer.style.display = 'none';

        if (extras.previewSections) {
            extras.previewSections.forEach((section) => {
                if (section instanceof Node) {
                    previewContainer.appendChild(section);
                }
            });
        }

        card.appendChild(header);
        card.appendChild(previewContainer);

        return card;
    },

    createPreviewSection(title, items) {
        const section = document.createElement('div');
        section.className = 'preview-section';

        const heading = document.createElement('h4');
        heading.textContent = title;
        section.appendChild(heading);

        Object.entries(items).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '') {
                return;
            }
            const wrapper = document.createElement('div');
            wrapper.className = 'preview-value';

            const label = document.createElement('strong');
            label.textContent = `${key}:`;
            wrapper.appendChild(label);

            const content = document.createElement('div');
            content.className = 'preview-content show';
            wrapper.appendChild(content);

            UIComponents.appendValueContent(content, value);
            section.appendChild(wrapper);
        });

        return section;
    },

    toggleDetails(id, type) {
        const preview = document.getElementById(`preview-${id}`);
        const arrow = document.getElementById(`arrow-${id}`);
        if (!preview || !arrow) {
            return;
        }
        const isHidden = preview.style.display === 'none';
        preview.style.display = isHidden ? 'block' : 'none';
        arrow.textContent = isHidden ? '▼' : '▶';

        const card = preview.closest(`.${type}-card`);
        const header = card?.querySelector(`.${type}-header`);
        if (header) {
            header.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        }
    },

    toggleFullContent(elementId, trigger) {
        const element = document.getElementById(elementId);
        if (!element) {
            return;
        }

        const button = trigger instanceof HTMLElement ? trigger : document.querySelector(`button[data-target="${elementId}"]`);
        const isHidden = element.style.display === 'none';

        if (isHidden) {
            if (!element.dataset.loaded) {
                const json = button?.dataset?.json;
                if (json) {
                    const pre = document.createElement('pre');
                    pre.textContent = json;
                    element.replaceChildren(pre);
                    element.dataset.loaded = 'true';
                }
            }
            element.style.display = 'block';
            if (button) {
                button.textContent = 'Hide Full Content';
                button.setAttribute('aria-expanded', 'true');
            }
        } else {
            element.style.display = 'none';
            if (button) {
                button.textContent = 'Show Full Content';
                button.setAttribute('aria-expanded', 'false');
            }
        }
    }
};

window.toggleFullContent = (elementId, trigger) => UIComponents.toggleFullContent(elementId, trigger);
window.toggleDetails = UIComponents.toggleDetails;

// --- DATA LOADING AND PRESENTATION ---

// Compact mapping loader (reusing the previous implementation until DataManager ships)
window.fetchAndRenderMappings = async (mappingsToRender = null, options = {}) => {
    const container = document.getElementById(SELECTORS.LISTS.MAPPINGS);
    const emptyState = document.getElementById(SELECTORS.EMPTY.MAPPINGS);
    const loadingState = document.getElementById(SELECTORS.LOADING.MAPPINGS);

    if (!container || !emptyState || !loadingState) {
        console.error('Required DOM elements not found for mappings rendering');
        return false;
    }

    let renderSource = 'unknown';

    try {
        if (mappingsToRender === null) {
            loadingState.classList.remove('hidden');
            container.style.display = 'none';
            emptyState.classList.add('hidden');
            
            let data;
            let dataSource = 'direct';
            if (options && options.useCache) {
                const cached = await loadImockCacheBestOf3();
                if (cached && cached.data && Array.isArray(cached.data.mappings)) {
                    // Cache hit - use cached data for quick UI, but always fetch fresh data for complete info
                    console.log('🧩 [CACHE] Cache hit - using cached data for quick start, fetching fresh data');
                    dataSource = 'cache';

                    // Start async fresh fetch for complete data (only if no optimistic updates in progress)
                    (async () => {
                        try {
                            // Wait a bit for any optimistic updates to complete
                            await new Promise(resolve => setTimeout(resolve, 200));

                            const freshData = await fetchMappingsFromServer({ force: true });
                            if (freshData && freshData.mappings) {
                                const serverMappings = freshData.mappings.filter(x => !isImockCacheMapping(x));

                                // Create a map of current optimistic mappings for preservation
                                const currentIds = new Set(window.allMappings.map(m => m.id || m.uuid));
                                const serverIds = new Set(serverMappings.map(m => m.id || m.uuid));

                                // Merge strategy: combine server data with optimistic state
                                // 1. Start with all server mappings (authoritative source)
                                // 2. Update existing ones with full server data
                                // 3. Keep optimistic creations that aren't on server yet
                                // 4. Remove optimistic deletions

                                const mergedMappings = [];

                                // Add all server mappings first (they have full data)
                                serverMappings.forEach(serverMapping => {
                                    const serverId = serverMapping.id || serverMapping.uuid;

                                    // Check if this server mapping was optimistically deleted
                                    const optimisticItem = window.cacheManager.optimisticQueue.find(x => x.id === serverId);
                                    const isOptimisticallyDeleted = optimisticItem && optimisticItem.op === 'delete';

                                    if (!isOptimisticallyDeleted) {
                                        mergedMappings.push(serverMapping);
                                    }
                                });

                                // Add optimistic creations (mappings that exist locally but not on server)
                                window.allMappings.forEach(currentMapping => {
                                    const currentId = currentMapping.id || currentMapping.uuid;

                                    // If this mapping doesn't exist on server, it's an optimistic creation
                                    const existsOnServer = serverIds.has(currentId);
                                    if (!existsOnServer) {
                                        mergedMappings.push(currentMapping);
                                    }
                                });

                                // Update with merged data
                                window.allMappings = mergedMappings;
                                window.originalMappings = [...mergedMappings];
                                syncCacheWithMappings(window.originalMappings);

                                // Re-render UI with merged complete data
                                fetchAndRenderMappings(window.allMappings);
                            }
                        } catch (e) {
                            console.warn('🧩 [CACHE] Failed to load fresh data:', e);
                        }
                    })();

                    // Use cached slim data for immediate UI (will be replaced by fresh data)
                    data = cached.data;
                } else {
                    data = await fetchMappingsFromServer({ force: true });
                    dataSource = 'direct';
                    // regenerate cache asynchronously
                    try { console.log('🧩 [CACHE] Async regenerate after cache miss'); regenerateImockCache(); } catch {}
                }
            } else {
                data = await fetchMappingsFromServer({ force: true });
                dataSource = 'direct';
            }
            // If we fetched a full admin list, strip service cache mapping from UI
            let incoming = data.mappings || [];

            // Server data is now authoritative - optimistic updates are handled through UI updates only
            if (window.cacheManager.optimisticQueue.length > 0) {
                console.log('🎯 [OPTIMISTIC] Applying optimistic updates to incoming data:', window.cacheManager.optimisticQueue.length, 'updates');

                incoming = incoming.map(serverMapping => {
                    const optimisticItem = window.cacheManager.optimisticQueue.find(x => x.id === (serverMapping.id || serverMapping.uuid));
                    if (optimisticItem) {
                        if (optimisticItem.op === 'delete') {
                            console.log('🎯 [OPTIMISTIC] Removing deleted mapping from results:', serverMapping.id);
                            return null; // Mark for removal
                        }
                        // Use optimistic version
                        console.log('🎯 [OPTIMISTIC] Using optimistic version for:', serverMapping.id);
                        return optimisticItem.payload;
                    }
                    return serverMapping;
                }).filter(m => m !== null); // Remove deleted mappings

                // Add any new optimistic mappings that weren't on server
                window.cacheManager.optimisticQueue.forEach(item => {
                    if (item.op !== 'delete' && !incoming.some(m => (m.id || m.uuid) === item.id)) {
                        console.log('🎯 [OPTIMISTIC] Adding new optimistic mapping:', item.id);
                        incoming.unshift(item.payload);
                    }
                });
            }

            // Hide any items marked as pending-deleted to avoid stale cache flicker
            try {
                if (window.pendingDeletedIds && window.pendingDeletedIds.size > 0) {
                    const before = incoming.length;
                    incoming = incoming.filter(m => !window.pendingDeletedIds.has(m.id || m.uuid));
                    if (before !== incoming.length) console.log('🧩 [CACHE] filtered pending-deleted from render:', before - incoming.length);
                }
            } catch {}
            window.originalMappings = Array.isArray(incoming) ? incoming.filter(m => !isImockCacheMapping(m)) : [];
            syncCacheWithMappings(window.originalMappings);
            window.allMappings = [...window.originalMappings];
            // Update data source indicator in UI
            updateDataSourceIndicator(dataSource);
            renderSource = dataSource;
        } else {
            window.allMappings = mappingsToRender;
            renderSource = 'custom';
        }
        
        loadingState.classList.add('hidden');
        
        if (window.allMappings.length === 0) {
            emptyState.classList.remove('hidden');
            container.style.display = 'none';
            updateMappingsCounter();
            return true;
        }
        
        emptyState.classList.add('hidden');
        container.style.display = 'block';
        
        // Invalidate cache before re-rendering to ensure fresh DOM references
        window.invalidateElementCache(SELECTORS.LISTS.MAPPINGS);

        // Sort mappings
        const sortedMappings = [...window.allMappings].sort((a, b) => {
            const priorityA = a.priority || 1;
            const priorityB = b.priority || 1;
            if (priorityA !== priorityB) return priorityA - priorityB;
            
            const methodOrder = { 'GET': 1, 'POST': 2, 'PUT': 3, 'PATCH': 4, 'DELETE': 5 };
            const methodA = methodOrder[a.request?.method] || 999;
            const methodB = methodOrder[b.request?.method] || 999;
            if (methodA !== methodB) return methodA - methodB;
            
            const urlA = a.request?.url || a.request?.urlPattern || a.request?.urlPath || '';
            const urlB = b.request?.url || b.request?.urlPattern || b.request?.urlPath || '';
            return urlA.localeCompare(urlB);
        });
        console.log(`📦 Mappings render from: ${renderSource} — ${sortedMappings.length} items`);
        if (window.ListRenderer && typeof window.ListRenderer.render === 'function') {
            window.ListRenderer.render(container, sortedMappings, window.renderMappingCard);
        } else {
            container.innerHTML = '';
            const fragment = document.createDocumentFragment();
            sortedMappings.forEach(mapping => {
                const node = window.renderMappingCard(mapping);
                if (node instanceof Node) {
                    fragment.appendChild(node);
                }
            });
            container.appendChild(fragment);
        }
        updateMappingsCounter();
        // Reapply mapping filters if any are active, preserving user's view
        try {
            const hasFilters = (document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value || '')
                || (document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value || '')
                || (document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value || '');
            if (hasFilters && typeof FilterManager !== 'undefined' && FilterManager.applyMappingFilters) {
                FilterManager.applyMappingFilters();
                console.log('[FILTERS] Mapping filters re-applied after refresh');
            }
        } catch {}

        return true;
    } catch (error) {
        console.error('Error in fetchAndRenderMappings:', error);
        NotificationManager.error(`Failed to load mappings: ${error.message}`);
        loadingState.classList.add('hidden');
        emptyState.classList.remove('hidden');
        container.style.display = 'none';
        return false;
    }
};

// Function to get a specific mapping by ID
window.getMappingById = async (mappingId) => {
    try {
        if (!mappingId) {
            throw new Error('Mapping ID is required');
        }

        console.log(`📥 [getMappingById] Fetching mapping with ID: ${mappingId}`);
        console.log(`📥 [getMappingById] Current wiremockBaseUrl:`, window.wiremockBaseUrl);
        console.log(`📥 [getMappingById] window.allMappings available:`, Array.isArray(window.allMappings));
        console.log(`📥 [getMappingById] Cache size:`, window.allMappings?.length || 0);

        // Try to get from cache first
        const cachedMapping = window.allMappings?.find(m => m.id === mappingId);
        if (cachedMapping) {
            console.log(`📦 [getMappingById] Found mapping in cache: ${mappingId}`, cachedMapping);
            return cachedMapping;
        } else {
            console.log(`📦 [getMappingById] Mapping not found in cache, will fetch from API`);
        }

        // Fetch from WireMock API
        console.log(`📡 [getMappingById] Making API call to: /mappings/${mappingId}`);
        const response = await apiFetch(`/mappings/${mappingId}`);
        console.log(`📡 [getMappingById] Raw API response:`, response);

        // Handle both wrapped and unwrapped responses
        const mapping = response && typeof response === 'object' && response.mapping
            ? response.mapping
            : response;

        console.log(`📡 [getMappingById] Processed mapping:`, mapping);

        if (!mapping || typeof mapping !== 'object') {
            console.log(`❌ [getMappingById] API returned invalid data for mapping ${mappingId}`);
            throw new Error(`Mapping with ID ${mappingId} not found or invalid response`);
        }

        console.log(`✅ [getMappingById] Successfully fetched mapping: ${mappingId}`, mapping);
        return mapping;

    } catch (error) {
        console.error(`❌ [getMappingById] Error fetching mapping ${mappingId}:`, error);
        console.error(`❌ [getMappingById] Error details:`, {
            message: error.message,
            status: error.status,
            statusText: error.statusText,
            url: `${window.wiremockBaseUrl}/mappings/${mappingId}`
        });
        throw error;
    }
};

// Updated applyOptimisticMappingUpdate helper
window.applyOptimisticMappingUpdate = (mappingLike) => {
    try {
        if (!mappingLike) {
            console.warn('🎯 [OPTIMISTIC] No mapping data provided');
            return;
        }

        const mapping = mappingLike.mapping || mappingLike;
        const mappingId = mapping?.id || mapping?.uuid;
        if (!mapping || !mappingId) {
            console.warn('🎯 [OPTIMISTIC] Invalid mapping data - missing id:', mapping);
            return;
        }

        // Ignore synthetic cache service mappings
        if (isImockCacheMapping(mapping)) {
            console.log('🎯 [OPTIMISTIC] Skipping cache mapping update');
            return;
        }

        const cacheAvailable = window.cacheManager && window.cacheManager.cache instanceof Map;
        const optimisticOperation = cacheAvailable && window.cacheManager.cache.has(mappingId) ? 'update' : 'create';


        // Use updateOptimisticCache if available, otherwise fallback to legacy/manual logic
        if (typeof updateOptimisticCache === 'function') {
            updateOptimisticCache(mapping, optimisticOperation, { queueMode: 'add' });
        } else {
            // Fallback to legacy direct mutation if the new helper is unavailable
            if (cacheAvailable) {
                if (typeof window.cacheManager?.addOptimisticUpdate === 'function') {
                    try {
                        window.cacheManager.addOptimisticUpdate(mapping, optimisticOperation);
                    } catch (queueError) {
                        console.warn('🎯 [OPTIMISTIC] Failed to enqueue optimistic update:', queueError);
                    }
                }
                seedCacheFromGlobals(window.cacheManager.cache);
                const incoming = cloneMappingForCache(mapping);
                if (!incoming) {
                    console.warn('🎯 [OPTIMISTIC] Failed to clone mapping for cache:', mappingId);
                } else {
                    if (!incoming.id && mappingId) {
                        incoming.id = mappingId;
                    }
                    if (!incoming.uuid && (mapping.uuid || mappingId)) {
                        incoming.uuid = mapping.uuid || mappingId;
                    }

                    if (window.cacheManager.cache.has(mappingId)) {
                        const merged = mergeMappingData(window.cacheManager.cache.get(mappingId), incoming);
                        window.cacheManager.cache.set(mappingId, merged);
                    } else {
                        window.cacheManager.cache.set(mappingId, incoming);
                    }
                }
            }

            window.cacheLastUpdate = Date.now();
            refreshMappingsFromCache();
        }

        console.log('🎯 [OPTIMISTIC] Applied update for mapping:', mappingId);

    } catch (e) {
        console.warn('🎯 [OPTIMISTIC] Update failed:', e);
    }
};

// Refresh mappings in background and then re-render without jank
window.backgroundRefreshMappings = async (useCache = false) => {
    try {
        let data;
        let source = 'direct';
        if (useCache) {
            const cached = await loadImockCacheBestOf3();
            if (cached && cached.data && Array.isArray(cached.data.mappings)) {
                data = cached.data;
                source = 'cache';
            } else {
                data = await fetchMappingsFromServer({ force: true });
                source = 'direct';
            }
        } else {
            data = await fetchMappingsFromServer({ force: true });
            source = 'direct';
        }
        const incoming = data.mappings || [];
        window.originalMappings = Array.isArray(incoming) ? incoming.filter(m => !isImockCacheMapping(m)) : [];
        syncCacheWithMappings(window.originalMappings);
        window.allMappings = [...window.originalMappings];
        updateDataSourceIndicator(source);
        // re-render without loading state
        fetchAndRenderMappings(window.allMappings);
    } catch (e) {
        console.warn('Background refresh failed:', e);
    }
};

// Compact mapping renderer through UIComponents (shortened from ~67 to 15 lines)
window.renderMappingCard = function(mapping) {
    if (!mapping || !(mapping.id || mapping.uuid)) {
        console.warn('Invalid mapping data:', mapping);
        return null;
    }

    const mappingId = mapping.id || mapping.uuid;
    const method = mapping.request?.method || 'GET';
    const url = mapping.request?.urlPath || mapping.request?.urlPathPattern || mapping.request?.urlPattern || mapping.request?.url || 'N/A';
    const status = mapping.response?.status || 200;
    const name = mapping.name || mapping.metadata?.name || `Mapping ${mappingId.substring(0, 8)}`;

    const previewSections = [
        UIComponents.createPreviewSection('Request', {
            'Method': method,
            'URL': mapping.request?.url || mapping.request?.urlPattern || mapping.request?.urlPath || mapping.request?.urlPathPattern,
            'Headers': mapping.request?.headers,
            'Body': mapping.request?.bodyPatterns || mapping.request?.body,
            'Query Parameters': mapping.request?.queryParameters
        }),
        UIComponents.createPreviewSection('Response', {
            'Status': mapping.response?.status,
            'Headers': mapping.response?.headers,
            'Body': mapping.response?.jsonBody || mapping.response?.body,
            'Delay': mapping.response?.fixedDelayMilliseconds ? `${mapping.response.fixedDelayMilliseconds}ms` : null
        }),
        UIComponents.createPreviewSection('Overview', {
            'ID': mappingId,
            'Name': name,
            'Priority': mapping.priority,
            'Persistent': mapping.persistent,
            'Scenario': mapping.scenarioName,
            'Required State': mapping.requiredScenarioState,
            'New State': mapping.newScenarioState,
            'Created': (window.showMetaTimestamps !== false && mapping.metadata?.created) ? new Date(mapping.metadata.created).toLocaleString() : null,
            'Edited': (window.showMetaTimestamps !== false && mapping.metadata?.edited) ? new Date(mapping.metadata.edited).toLocaleString() : null,
            'Source': mapping.metadata?.source ? `Edited from ${mapping.metadata.source}` : null
        })
    ];

    const badges = [];
    const shortId = mappingId.length > 12 ? `${mappingId.slice(0, 8)}…${mappingId.slice(-4)}` : mappingId;
    badges.push(UIComponents.createBadge(shortId, 'badge badge-secondary', 'Mapping ID'));

    if (typeof mapping.priority === 'number') {
        badges.push(UIComponents.createBadge(`P${mapping.priority}`, 'badge badge-secondary', 'Priority'));
    }
    if (mapping.scenarioName) {
        badges.push(UIComponents.createBadge(mapping.scenarioName, 'badge badge-secondary', 'Scenario'));
    }
    if (window.showMetaTimestamps !== false && mapping.metadata?.created) {
        badges.push(UIComponents.createBadge(`C: ${new Date(mapping.metadata.created).toLocaleString()}`, 'badge badge-secondary', 'Created'));
    }
    if (window.showMetaTimestamps !== false && mapping.metadata?.edited) {
        badges.push(UIComponents.createBadge(`E: ${new Date(mapping.metadata.edited).toLocaleString()}`, 'badge badge-secondary', 'Edited'));
    }
    if (mapping.metadata?.source) {
        badges.push(UIComponents.createBadge(mapping.metadata.source.toUpperCase(), 'badge badge-info', 'Last edited from'));
    }

    const actions = [
        { class: 'secondary', handler: 'editMapping', title: 'Edit mapping in JSON editor', label: 'Edit in editor', iconName: 'icon-pencil' },
        { class: 'primary', handler: 'openEditModal', title: 'Edit mapping', label: 'Edit mapping', iconName: 'icon-edit' },
        { class: 'danger', handler: 'deleteMapping', title: 'Delete mapping', label: 'Delete mapping', iconName: 'icon-trash' }
    ];

    const data = {
        id: mappingId,
        method,
        url,
        status,
        name,
        extras: {
            previewSections,
            badges
        }
    };

    return UIComponents.createCard('mapping', data, actions);
};

// Update the mapping counter
window.updateMappingsCounter = function() {
    const counter = document.getElementById(SELECTORS.COUNTERS.MAPPINGS);
    if (counter) {
        counter.textContent = window.allMappings.length;
    }
}

// Update the data-source indicator (cache/remote/direct)
function updateDataSourceIndicator(source) {
    const el = document.getElementById('data-source-indicator');
    if (!el) return;
    let text = 'Source: direct';
    let cls = 'badge badge-secondary';
    switch (source) {
        case 'cache':
            text = 'Source: cache';
            cls = 'badge badge-success';
            break;
        case 'cache_rebuilding':
            text = 'Source: cache (rebuilding…)';
            cls = 'badge badge-success';
            break;
        case 'remote':
            text = 'Source: remote';
            cls = 'badge badge-warning';
            break;
        case 'remote_error':
            text = 'Source: remote (error/CORS)';
            cls = 'badge badge-danger';
            break;
        default:
            text = 'Source: direct';
            cls = 'badge badge-secondary';
    }
    el.textContent = text;
    el.className = cls;
}

// Requests data source indicator (symmetry with mappings)
function updateRequestsSourceIndicator(source) {
    const el = document.getElementById('requests-source-indicator');
    if (!el) return;
    let text = 'Requests: direct';
    let cls = 'badge badge-secondary';
    switch (source) {
        case 'custom':
            text = 'Requests: custom';
            cls = 'badge badge-secondary';
            break;
        case 'remote':
            text = 'Requests: remote';
            cls = 'badge badge-warning';
            break;
        case 'remote_error':
            text = 'Requests: remote (error/CORS)';
            cls = 'badge badge-danger';
            break;
        default:
            text = 'Requests: direct';
            cls = 'badge badge-secondary';
    }
    el.textContent = text;
    el.className = cls;
}

// Compact detail toggles via UIComponents
window.toggleMappingDetails = (mappingId) => UIComponents.toggleDetails(mappingId, 'mapping');
window.toggleRequestDetails = (requestId) => UIComponents.toggleDetails(requestId, 'request');

// Compact request loader (temporary reuse until DataManager exists)
window.fetchAndRenderRequests = async (requestsToRender = null) => {
    const container = document.getElementById(SELECTORS.LISTS.REQUESTS);
    const emptyState = document.getElementById(SELECTORS.EMPTY.REQUESTS);
    const loadingState = document.getElementById(SELECTORS.LOADING.REQUESTS);
    
    if (!container || !emptyState || !loadingState) {
        console.error('Required DOM elements not found for requests rendering');
        return false;
    }
    
    try {
        let reqSource = 'direct';
        if (requestsToRender === null) {
            loadingState.classList.remove('hidden');
            container.style.display = 'none';
            emptyState.classList.add('hidden');
            
            const data = await apiFetch(ENDPOINTS.REQUESTS);
            window.originalRequests = data.requests || [];
            window.allRequests = [...window.originalRequests];
        } else {
            window.allRequests = requestsToRender;
            reqSource = 'custom';
        }
        
        loadingState.classList.add('hidden');
        
        if (window.allRequests.length === 0) {
            emptyState.classList.remove('hidden');
            container.style.display = 'none';
            updateRequestsCounter();
            return true;
        }
        
        emptyState.classList.add('hidden');
        container.style.display = 'block';

        // Invalidate cache before re-rendering to ensure fresh DOM references
        window.invalidateElementCache(SELECTORS.LISTS.REQUESTS);

        if (window.ListRenderer && typeof window.ListRenderer.render === 'function') {
            window.ListRenderer.render(container, window.allRequests, window.renderRequestCard);
        } else {
            container.innerHTML = '';
            const fragment = document.createDocumentFragment();
            window.allRequests.forEach(request => {
                const node = window.renderRequestCard(request);
                if (node instanceof Node) {
                    fragment.appendChild(node);
                }
            });
            container.appendChild(fragment);
        }
        updateRequestsCounter();
        // Source indicator + log, mirroring mappings
        if (typeof updateRequestsSourceIndicator === 'function') updateRequestsSourceIndicator(reqSource);
        console.log(`📦 Requests render from: ${reqSource} — ${window.allRequests.length} items`);

        return true;
    } catch (error) {
        console.error('Error in fetchAndRenderRequests:', error);
        NotificationManager.error(`Failed to load requests: ${error.message}`);
        loadingState.classList.add('hidden');
        emptyState.classList.remove('hidden');
        container.style.display = 'none';
        return false;
    }
};

// Compact request renderer through UIComponents (shortened from ~62 to 18 lines)

window.renderRequestCard = function(request) {
    if (!request) {
        console.warn('Invalid request data:', request);
        return null;
    }

    const matched = request.wasMatched !== false;
    const clientIp = request.request?.clientIp || 'Unknown';

    const previewSections = [
        UIComponents.createPreviewSection('Request', {
            'Method': request.request?.method,
            'URL': request.request?.url || request.request?.urlPath,
            'Client IP': clientIp,
            'Headers': request.request?.headers,
            'Body': request.request?.body
        }),
        UIComponents.createPreviewSection('Response', {
            'Status': request.responseDefinition?.status,
            'Matched': matched ? 'Yes' : 'No',
            'Headers': request.responseDefinition?.headers,
            'Body': request.responseDefinition?.jsonBody || request.responseDefinition?.body
        })
    ];

    const badges = [];
    badges.push(UIComponents.createBadge(matched ? 'Matched' : 'Unmatched', matched ? 'badge badge-success' : 'badge badge-danger', 'Match result'));
    badges.push(UIComponents.createBadge(`IP ${clientIp}`, 'badge badge-secondary', 'Client IP'));

    const data = {
        id: request.id || '',
        method: request.request?.method || 'GET',
        url: request.request?.url || request.request?.urlPath || 'N/A',
        status: request.responseDefinition?.status || (matched ? 200 : 404),
        name: null,
        time: Utils.parseRequestTime(request.request?.loggedDate || request.loggedDate),
        extras: {
            previewSections,
            badges
        }
    };

    return UIComponents.createCard('request', data, []);
};

// Update the requests counter
function updateRequestsCounter() {
    const counter = document.getElementById(SELECTORS.COUNTERS.REQUESTS);
    if (counter) {
        counter.textContent = window.allRequests.length;
    }
}

// --- ACTION HANDLERS (deduplicated connectToWireMock) ---

window.openEditModal = async (identifier) => {
    // Guard against missing mappings
    if (!window.allMappings || !Array.isArray(window.allMappings)) {
        NotificationManager.show('Mappings are not loaded', NotificationManager.TYPES.ERROR);
        return;
    }

    const normalizeIdentifier = (value) => {
        if (typeof value === 'string') return value.trim();
        if (value === undefined || value === null) return '';
        return String(value).trim();
    };

    const collectCandidateIdentifiers = (mapping) => {
        if (!mapping || typeof mapping !== 'object') return [];
        return [
            mapping.id,
            mapping.uuid,
            mapping.stubMappingId,
            mapping.stubId,
            mapping.mappingId,
            mapping.metadata?.id
        ].map(normalizeIdentifier).filter(Boolean);
    };

    const targetIdentifier = normalizeIdentifier(identifier);

    let mapping = window.allMappings.find((candidate) => collectCandidateIdentifiers(candidate).includes(targetIdentifier));
    if (!mapping) {
        console.warn('🔍 [OPEN MODAL DEBUG] Mapping not found by identifier lookup. Identifier:', identifier);
        NotificationManager.show('Mapping not found', NotificationManager.TYPES.ERROR);
        return;
    }
    
    // Show the modal first
    if (typeof window.showModal === 'function') {
        window.showModal('edit-mapping-modal');
    } else {
        console.warn('showModal function not found');
        return;
    }
    
    console.log('🔴 [OPEN MODAL DEBUG] openEditModal called for mapping identifier:', identifier);
    console.log('🔴 [OPEN MODAL DEBUG] Found mapping (cached):', mapping);
    
    // Prefill the form with cached data to render the UI instantly
    if (typeof window.populateEditMappingForm === 'function') {
        window.populateEditMappingForm(mapping);
    } else {
        console.error('populateEditMappingForm function not found!');
        return;
    }

    // Then fetch the latest mapping version by UUID
    try {
        if (typeof window.setMappingEditorBusyState === 'function') {
            window.setMappingEditorBusyState(true, 'Loading…');
        }

        const mappingIdForFetch = normalizeIdentifier(mapping.id) || normalizeIdentifier(mapping.uuid) || targetIdentifier;
        const latest = await apiFetch(`/mappings/${encodeURIComponent(mappingIdForFetch)}`);
        const latestMapping = latest?.mapping || latest; // support multiple response formats
        if (latestMapping && latestMapping.id) {
            console.log('🔵 [OPEN MODAL DEBUG] Loaded latest mapping from server:', latestMapping);
            window.populateEditMappingForm(latestMapping);
            // Update the reference in allMappings to keep lists and operations consistent
            const idx = window.allMappings.findIndex((candidate) => candidate === mapping);
            if (idx !== -1) {
                window.allMappings[idx] = latestMapping;
            } else {
                const fallbackIdx = window.allMappings.findIndex((candidate) => collectCandidateIdentifiers(candidate).includes(targetIdentifier));
                if (fallbackIdx !== -1) {
                    window.allMappings[fallbackIdx] = latestMapping;
                }
            }
        } else {
            console.warn('Latest mapping response has unexpected shape, keeping cached version.', latest);
        }
    } catch (e) {
        console.warn('Failed to load latest mapping, using cached version.', e);
    } finally {
        if (typeof window.setMappingEditorBusyState === 'function') {
            window.setMappingEditorBusyState(false);
        }
    }

    // Update the modal title
    const modalTitleElement = document.getElementById(SELECTORS.MODAL.TITLE);
    if (modalTitleElement) modalTitleElement.textContent = 'Edit Mapping';
    
    console.log('🔴 [OPEN MODAL DEBUG] openEditModal completed for mapping identifier:', identifier);
};

// REMOVED: updateMapping function moved to editor.js

window.deleteMapping = async (id) => {
    if (!confirm('Delete this mapping?')) return;

    try {
        // API call FIRST
        await apiFetch(`/mappings/${id}`, { method: 'DELETE' });

        NotificationManager.success('Mapping deleted!');

        // Update cache and UI with server confirmation
        updateOptimisticCache({ id }, 'delete');

    } catch (e) {
        // Handle 404: mapping already deleted
        if (e.message.includes('404')) {
            console.log('🗑️ [DELETE] Mapping already deleted from server (404), updating cache locally');
            updateOptimisticCache({ id }, 'delete');
            NotificationManager.success('Mapping was already deleted');
        } else {
            NotificationManager.error(`Delete failed: ${e.message}`);
        }
    }
};

window.clearRequests = async () => {
    if (!confirm('Clear all requests?')) return;
    
    try {
        await apiFetch('/requests', { method: 'DELETE' });
        NotificationManager.success('Requests cleared!');
        await fetchAndRenderRequests();
    } catch (e) {
        NotificationManager.error(`Clear failed: ${e.message}`);
    }
};

// --- REMOVED: duplicated applyFilters (FilterManager covers it) ---

// --- UNIVERSAL FILTER MANAGER (eliminate ~90 lines of duplication) ---


// Compact filtering helpers via FilterManager
const debouncedApplyMappingFilters = window.createDebounce(() => FilterManager.applyMappingFilters(), 250);
const debouncedApplyRequestFilters = window.createDebounce(() => FilterManager.applyRequestFilters(), 250);

window.applyFilters = () => debouncedApplyMappingFilters();
window.clearMappingFilters = () => {
    document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD).value = '';
    document.getElementById(SELECTORS.MAPPING_FILTERS.URL).value = '';
    document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS).value = '';
    FilterManager.applyMappingFilters();
};
window.applyRequestFilters = () => debouncedApplyRequestFilters();

// Quick filter function for preset time ranges
window.applyQuickFilter = () => {
    const quickFilterEl = document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK);
    if (!quickFilterEl) return;
    
    const value = quickFilterEl.value;
    if (!value) {
        // Clear time range if no quick filter selected
        const dateFromEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
        const dateToEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
        if (dateFromEl) dateFromEl.value = '';
        if (dateToEl) dateToEl.value = '';
        FilterManager.applyRequestFilters();
        return;
    }
    
    const now = new Date();
    const fromTime = new Date(now);
    
    // Parse the quick filter value (e.g., "5m", "1h", "3d")
    const match = value.match(/^(\d+)([mhd])$/);
    if (!match) return;
    
    const amount = parseInt(match[1]);
    const unit = match[2];
    
    // Calculate the "from" time based on the unit
    switch (unit) {
        case 'm': // minutes
            fromTime.setMinutes(fromTime.getMinutes() - amount);
            break;
        case 'h': // hours
            fromTime.setHours(fromTime.getHours() - amount);
            break;
        case 'd': // days
            fromTime.setDate(fromTime.getDate() - amount);
            break;
        default:
            return;
    }
    
    // Format dates for datetime-local input (YYYY-MM-DDTHH:MM)
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    // Set the time range inputs
    const dateFromEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    
    if (dateFromEl) dateFromEl.value = formatDateTime(fromTime);
    if (dateToEl) dateToEl.value = formatDateTime(now);
    
    // Apply the filters
    FilterManager.applyRequestFilters();
};

// Clear quick filter selection (used when custom time range is set)
window.clearQuickFilter = () => {
    const quickEl = document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK);
    if (quickEl) quickEl.value = '';
};
window.clearRequestFilters = () => {
    // Clear existing filters with safe access
    const methodEl = document.getElementById(SELECTORS.REQUEST_FILTERS.METHOD);
    const urlEl = document.getElementById(SELECTORS.REQUEST_FILTERS.URL);
    const statusEl = document.getElementById(SELECTORS.REQUEST_FILTERS.STATUS);
    const dateFromEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    const quickEl = document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK);
    
    if (methodEl) methodEl.value = '';
    if (urlEl) urlEl.value = '';
    if (statusEl) statusEl.value = '';
    if (dateFromEl) dateFromEl.value = '';
    if (dateToEl) dateToEl.value = '';
    if (quickEl) quickEl.value = ''; // Reset quick filter selection
    
    FilterManager.applyRequestFilters();
};

// --- ADDITIONAL MANAGEMENT HELPERS ---

// Legacy wrappers kept for HTML compatibility
window.clearFilters = () => {
    window.clearMappingFilters();
};

window.refreshRequests = async () => {
    await fetchAndRenderRequests();
    // Apply filters automatically after an update
    const hasActiveFilters = document.getElementById(SELECTORS.REQUEST_FILTERS.METHOD)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.URL)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.STATUS)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO)?.value;
    
    if (hasActiveFilters) {
        FilterManager.applyRequestFilters();
        console.log('[FILTERS] Request filters re-applied after refresh');
    }
};

// Quick helper to apply a temporary filter (fixed for Request Log)
window.applyQuickTimeFilter = () => {
    // Set the filter to the last 24 hours
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Use the correct selectors for Request Log
    const dateFromInput = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToInput = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    
    // Format dates for datetime-local input (YYYY-MM-DDTHH:MM)
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    if (dateFromInput) {
        dateFromInput.value = formatDateTime(yesterday);
    }
    if (dateToInput) {
        dateToInput.value = formatDateTime(now);
    }
    
    // Apply filters
    FilterManager.applyRequestFilters();
};

// --- RESOURCE CLEANUP ---

// Clear dangling timeouts on navigation
window.cleanupPendingDeletions = () => {
    for (const [id, timeout] of window.deletionTimeouts) {
        clearTimeout(timeout);
    }
    window.deletionTimeouts.clear();
    window.pendingDeletedIds.clear();
};

// Invoke when the page is closed
window.addEventListener('beforeunload', window.cleanupPendingDeletions);

// --- PREVIEW ---

window.togglePreview = (mappingId) => {
    const preview = document.getElementById(`preview-${mappingId}`);
    if (preview.style.display === 'none') {
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
};

window.toggleRequestPreview = (requestId) => {
    const preview = document.getElementById(`request-preview-${requestId}`);
    if (preview.style.display === 'none') {
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
};

// --- SCENARIOS ---

let scenarioListHandlerAttached = false;

function getScenarioByIdentifier(identifier) {
    if (typeof identifier !== 'string') {
        return null;
    }

    const scenarios = Array.isArray(allScenarios) ? allScenarios : [];

    const directMatch = scenarios.find((scenario) =>
        (typeof scenario?.id === 'string' && scenario.id === identifier) ||
        (typeof scenario?.name === 'string' && scenario.name === identifier)
    );

    if (directMatch) {
        return directMatch;
    }

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
        return null;
    }

    return scenarios.find((scenario) => {
        const scenarioId = typeof scenario?.id === 'string' ? scenario.id.trim() : '';
        const scenarioName = typeof scenario?.name === 'string' ? scenario.name.trim() : '';
        return scenarioId === trimmedIdentifier || scenarioName === trimmedIdentifier;
    }) || null;
}

function setScenariosLoading(isLoading) {
    const loadingEl = document.getElementById('scenarios-loading');
    if (loadingEl) {
        loadingEl.classList.toggle('hidden', !isLoading);
    }

    if (isLoading) {
        const listEl = document.getElementById(SELECTORS.LISTS.SCENARIOS);
        if (listEl) {
            listEl.style.display = 'none';
        }
    }
}

window.loadScenarios = async () => {
    const emptyEl = document.getElementById('scenarios-empty');
    if (emptyEl) emptyEl.classList.add('hidden');

    setScenariosLoading(true);

    try {
        const data = await apiFetch(ENDPOINTS.SCENARIOS);
        allScenarios = Array.isArray(data?.scenarios) ? data.scenarios : [];
    } catch (e) {
        allScenarios = [];
        console.error('Load scenarios error:', e);
        NotificationManager.error(`Failed to load scenarios: ${e.message}`);
    } finally {
        setScenariosLoading(false);
        renderScenarios();
    }
};

window.refreshScenarios = async () => {
    await TabManager.refresh('scenarios');
};

window.resetAllScenarios = async () => {
    if (!confirm('Reset all scenarios to the initial state?')) return;

    setScenariosLoading(true);

    try {
        await apiFetch(ENDPOINTS.SCENARIOS_RESET, { method: 'POST' });
        NotificationManager.success('All scenarios have been reset!');
        await loadScenarios();
    } catch (e) {
        NotificationManager.error(`Scenario reset failed: ${e.message}`);
        setScenariosLoading(false);
    }
};

function updateScenarioStateSuggestions(selectedScenarioIdentifier) {
    const stateOptionsEl = document.getElementById('scenario-state-options');
    const stateInput = document.getElementById('scenario-state');

    if (!stateOptionsEl) return;

    const scenarios = Array.isArray(allScenarios) ? allScenarios : [];
    const selectedScenario = getScenarioByIdentifier(selectedScenarioIdentifier);

    const states = new Set();

    const addState = (state) => {
        if (typeof state !== 'string') return;
        const normalized = state.trim();
        if (normalized) {
            states.add(normalized);
        }
    };

    addState('Started');

    const harvestStates = (scenario) => {
        if (!scenario) return;
        addState(scenario.state);
        (scenario.possibleStates || []).forEach(addState);
        (scenario.mappings || []).forEach((mapping) => {
            addState(mapping?.requiredScenarioState);
            addState(mapping?.newScenarioState);
        });
    };

    if (selectedScenario) {
        harvestStates(selectedScenario);
    }

    if (states.size === 0) {
        scenarios.forEach(harvestStates);
    }

    const sortedStates = Array.from(states).sort((a, b) => a.localeCompare(b));
    stateOptionsEl.innerHTML = sortedStates.map((state) => `
        <option value="${escapeHtml(state)}"></option>
    `).join('');

    if (stateInput) {
        if (sortedStates.length > 0) {
            stateInput.setAttribute('placeholder', `Enter state (e.g. ${sortedStates[0]})`);
        } else {
            stateInput.setAttribute('placeholder', 'Enter state name');
        }
    }
}

window.setScenarioState = async (scenarioIdentifier, newState) => {
    const scenarioSelect = document.getElementById('scenario-select');
    const scenarioStateInput = document.getElementById('scenario-state');

    const inlineScenarioIdentifier = typeof scenarioIdentifier === 'string' ? scenarioIdentifier : '';
    const inlineState = typeof newState === 'string' ? newState.trim() : '';

    let candidateIdentifier = inlineScenarioIdentifier;
    if (!candidateIdentifier && scenarioSelect) {
        candidateIdentifier = scenarioSelect.value || '';
    }

    const targetScenario = getScenarioByIdentifier(candidateIdentifier);
    const endpointIdentifier = typeof targetScenario?.id === 'string'
        ? targetScenario.id
        : (typeof targetScenario?.name === 'string' ? targetScenario.name : candidateIdentifier);
    const displayName = typeof targetScenario?.name === 'string'
        ? targetScenario.name
        : (typeof targetScenario?.id === 'string' ? targetScenario.id : candidateIdentifier);

    const resolvedState = inlineState || scenarioStateInput?.value?.trim() || '';

    if (!endpointIdentifier || !endpointIdentifier.trim() || !resolvedState) {
        NotificationManager.warning('Please select scenario and enter state');
        return false;
    }

    const stateEndpointBuilder = typeof window.buildScenarioStateEndpoint === 'function'
        ? window.buildScenarioStateEndpoint
        : (name) => `${ENDPOINTS.SCENARIOS}/${encodeURIComponent(name)}/state`;
    const stateEndpoint = stateEndpointBuilder(endpointIdentifier);

    if (!stateEndpoint) {
        NotificationManager.error('Unable to determine the scenario state endpoint.');
        return false;
    }

    if (scenarioSelect) {
        const selectValue = typeof targetScenario?.id === 'string'
            ? targetScenario.id
            : (typeof targetScenario?.name === 'string' ? targetScenario.name : endpointIdentifier);
        scenarioSelect.value = selectValue;
        updateScenarioStateSuggestions(selectValue);
    } else {
        updateScenarioStateSuggestions(endpointIdentifier);
    }

    setScenariosLoading(true);

    const scenarioExists = !!targetScenario;

    try {
        await apiFetch(stateEndpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: resolvedState })
        });

        NotificationManager.success(`Scenario "${displayName}" switched to state "${resolvedState}"`);
        if (!inlineState && scenarioStateInput) {
            scenarioStateInput.value = '';
        }
        updateScenarioStateSuggestions(endpointIdentifier);
        await loadScenarios();
        return true;
    } catch (error) {
        console.error('Change scenario state error:', error);
        const notFound = /HTTP\s+404/.test(error?.message || '');
        if (notFound && !scenarioExists) {
            NotificationManager.error(`Scenario "${displayName}" was not found on the server.`);
        } else {
            NotificationManager.error(`Scenario state change failed: ${error.message}`);
        }
        setScenariosLoading(false);
        return false;
    }
};

window.renderScenarios = () => {
    const listEl = document.getElementById(SELECTORS.LISTS.SCENARIOS);
    const emptyEl = document.getElementById('scenarios-empty');
    const countEl = document.getElementById('scenarios-count');
    const selectEl = document.getElementById('scenario-select');
    const stateOptionsEl = document.getElementById('scenario-state-options');

    if (!listEl) return;

    if (countEl) {
        countEl.textContent = Array.isArray(allScenarios) ? allScenarios.length : 0;
    }

    const normalizedScenarios = Array.isArray(allScenarios) ? allScenarios : [];

    if (normalizedScenarios.length === 0) {
        listEl.innerHTML = '';
        listEl.style.display = 'none';
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (selectEl) {
            selectEl.innerHTML = '<option value="">Select Scenario</option>';
        }
        if (stateOptionsEl) {
            stateOptionsEl.innerHTML = '';
        }
        updateScenarioStateSuggestions('');
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    const previousSelection = selectEl?.value || '';
    if (selectEl) {
        const options = ['<option value="">Select Scenario</option>']
            .concat(normalizedScenarios.map(scenario => {
                const scenarioIdentifier = typeof scenario?.id === 'string'
                    ? scenario.id
                    : (typeof scenario?.name === 'string' ? scenario.name : '');
                const scenarioLabel = typeof scenario?.name === 'string'
                    ? scenario.name
                    : (typeof scenario?.id === 'string' ? scenario.id : 'Unnamed scenario');
                return `
                <option value="${escapeHtml(scenarioIdentifier)}">${escapeHtml(scenarioLabel)}</option>
            `;
            }));
        selectEl.innerHTML = options.join('');
        if (previousSelection) {
            const matchedScenario = getScenarioByIdentifier(previousSelection);
            if (matchedScenario) {
                selectEl.value = matchedScenario.id || matchedScenario.name || '';
            }
        }
    }

    if (stateOptionsEl) {
        updateScenarioStateSuggestions(selectEl?.value || previousSelection || '');
    }

    if (selectEl && !selectEl.dataset.scenarioHandlerAttached) {
        selectEl.addEventListener('change', (event) => {
            updateScenarioStateSuggestions(event.target.value);
        });
        selectEl.dataset.scenarioHandlerAttached = '1';
    }

    listEl.style.display = '';
    listEl.innerHTML = normalizedScenarios.map((scenario) => {
        const scenarioIdentifier = typeof scenario?.id === 'string'
            ? scenario.id
            : (typeof scenario?.name === 'string' ? scenario.name : '');
        const scenarioIdentifierAttr = escapeHtml(scenarioIdentifier);
        const displayLabel = typeof scenario?.name === 'string'
            ? scenario.name
            : (typeof scenario?.id === 'string' ? scenario.id : 'Unnamed scenario');
        const displayedName = escapeHtml(displayLabel);
        const displayedState = escapeHtml(scenario.state || 'Started');
        const possibleStates = Array.isArray(scenario.possibleStates) ? scenario.possibleStates.filter(Boolean) : [];

        const actionButtons = possibleStates.map((state) => {
            if (!state || state === scenario.state) return '';
            const stateAttr = escapeHtml(state);
            const displayedPossibleState = escapeHtml(state);
            return `
                <button
                    class="btn btn-sm btn-secondary"
                    data-scenario-action="transition"
                    data-scenario="${scenarioIdentifierAttr}"
                    data-state="${stateAttr}"
                >
                    → ${displayedPossibleState}
                </button>
            `;
        }).join('');

        const possibleStatesMarkup = possibleStates.length ? `
            <div class="scenario-possible-states">
                <div class="scenario-section-title">Possible states</div>
                <div class="scenario-state-badges">
                    ${possibleStates.map((state) => {
                        const isCurrent = state === scenario.state;
                        const badgeClass = isCurrent ? 'badge badge-success' : 'badge badge-secondary';
                        return `<span class="${badgeClass}">${escapeHtml(state)}</span>`;
                    }).join('')}
                </div>
            </div>
        ` : '';

        const descriptionMarkup = scenario.description ? `
            <div class="scenario-info">
                <div class="scenario-description">${escapeHtml(scenario.description)}</div>
            </div>
        ` : '';

        const mappingSummaries = Array.isArray(scenario.mappings) ? scenario.mappings : [];
        const mappingListMarkup = mappingSummaries.length ? `
            <ul class="scenario-mapping-list">
                ${mappingSummaries.map((mapping) => {
                    const mappingId = mapping?.id || mapping?.uuid || mapping?.stubMappingId || mapping?.stubId || mapping?.mappingId || '';
                    const mappingIdAttr = mappingId ? escapeHtml(mappingId) : '';
                    const mappingName = escapeHtml(mapping?.name || mappingId || 'Unnamed mapping');
                    const method = mapping?.request?.method || mapping?.method || mapping?.requestMethod || '';
                    const url = mapping?.request?.urlPattern || mapping?.request?.urlPath || mapping?.request?.url || mapping?.url || mapping?.requestUrl || '';
                    const methodLabel = method ? `<span class="scenario-mapping-method">${escapeHtml(method)}</span>` : '';
                    const urlLabel = url ? `<span class="scenario-mapping-url">${escapeHtml(url)}</span>` : '';
                    const metaLabel = methodLabel || urlLabel ? `
                        <div class="scenario-mapping-meta">
                            ${[methodLabel, urlLabel].filter(Boolean).join(' · ')}
                        </div>
                    ` : '';
                    const requiredState = mapping?.requiredScenarioState || mapping?.requiredState || '';
                    const newState = mapping?.newScenarioState || mapping?.newState || '';
                    const transitionMarkup = [
                        requiredState ? `<span class="badge badge-warning" title="Required scenario state">Requires: ${escapeHtml(requiredState)}</span>` : '',
                        newState ? `<span class="badge badge-info" title="Next scenario state">→ ${escapeHtml(newState)}</span>` : ''
                    ].filter(Boolean).join(' ');
                    const transitions = transitionMarkup ? `
                        <div class="scenario-mapping-states">${transitionMarkup}</div>
                    ` : '';
                    const editButton = mappingId ? `
                        <div class="scenario-mapping-actions">
                            <button
                                class="btn btn-sm btn-secondary"
                                data-scenario-action="edit-mapping"
                                data-mapping-id="${mappingIdAttr}"
                            >
                                📝 Edit mapping
                            </button>
                        </div>
                    ` : '';

                    return `
                        <li class="scenario-mapping-item">
                            <div class="scenario-mapping-name">${mappingName}</div>
                            ${metaLabel}
                            ${transitions}
                            ${editButton}
                        </li>
                    `;
                }).join('')}
            </ul>
        ` : `
            <div class="scenario-mapping-empty">No stub mappings are bound to this scenario yet.</div>
        `;

        return `
            <div class="scenario-item">
                <div class="scenario-header">
                    <div class="scenario-name">${displayedName}</div>
                    <div class="scenario-state">${displayedState}</div>
                </div>
                ${descriptionMarkup}
                ${possibleStatesMarkup}
                <div class="scenario-mappings">
                    <div class="scenario-section-title">Stub mappings</div>
                    ${mappingListMarkup}
                </div>
                <div class="scenario-actions">
                    ${actionButtons}
                    <button
                        class="btn btn-sm btn-danger"
                        data-scenario-action="transition"
                        data-scenario="${scenarioIdentifierAttr}"
                        data-state="Started"
                    >
                        🔄 Reset
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (!scenarioListHandlerAttached) {
        listEl.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-scenario-action]');
            if (!button) return;

            const action = button.dataset.scenarioAction;

            if (action === 'transition') {
                const scenarioIdentifierValue = button.dataset.scenario || '';
                const targetState = button.dataset.state || '';
                if (!scenarioIdentifierValue.trim() || !targetState.trim()) {
                    return;
                }

                button.disabled = true;
                try {
                    await setScenarioState(scenarioIdentifierValue, targetState);
                } finally {
                    button.disabled = false;
                }
            } else if (action === 'edit-mapping') {
                const mappingIdValue = button.dataset.mappingId;
                if (mappingIdValue && typeof window.openEditModal === 'function') {
                    window.openEditModal(mappingIdValue);
                }
            }
        });
        scenarioListHandlerAttached = true;
    }
};

// --- FIXED FUNCTIONS FOR WIREMOCK 3.9.1+ API ---

// Corrected request count function (requires JSON POST)
window.getRequestCount = async (criteria = {}) => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_COUNT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(criteria)
        });
        return response.count || 0;
    } catch (error) {
        console.error('Request count error:', error);
        NotificationManager.error(`Request count failed: ${error.message}`);
        return 0;
    }
};

// New request search function
window.findRequests = async (criteria) => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_FIND, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(criteria)
        });
        return response.requests || [];
    } catch (error) {
        console.error('Find requests error:', error);
        NotificationManager.error(`Request search failed: ${error.message}`);
        return [];
    }
};

// Fetch unmatched requests
window.getUnmatchedRequests = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_UNMATCHED);
        return response.requests || [];
    } catch (error) {
        console.error('Unmatched requests error:', error);
        return [];
    }
};

// --- UPDATED RECORDING HELPERS ---

// Start recording
window.startRecording = async (config = {}) => {
    try {
        const defaultConfig = {
            targetBaseUrl: 'https://example.com',
            filters: {
                urlPathPatterns: ['.*'],
                method: 'ANY',
                headers: {}
            },
            captureHeaders: {},
            requestBodyPattern: {},
            persist: true,
            repeatsAsScenarios: false,
            transformers: ['response-template'],
            transformerParameters: {}
        };
        
        const recordingConfig = { ...defaultConfig, ...config };

        await apiFetch(ENDPOINTS.RECORDINGS_START, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recordingConfig)
        });

        NotificationManager.success('Recording started!');
        window.isRecording = true;

        // Refresh the UI
        const indicator = document.getElementById(SELECTORS.RECORDING.INDICATOR);
        if (indicator) indicator.style.display = 'block';
        
    } catch (error) {
        console.error('Start recording error:', error);
        NotificationManager.error(`Failed to start recording: ${error.message}`);
    }
};

// Stop recording
window.stopRecording = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_STOP, {
            method: 'POST'
        });

        window.isRecording = false;
        window.recordedCount = 0;

        // Refresh the UI
        const indicator = document.getElementById(SELECTORS.RECORDING.INDICATOR);
        if (indicator) indicator.style.display = 'none';

        const count = response.mappings ? response.mappings.length : 0;
        NotificationManager.success(`Recording stopped! Captured ${count} mappings`);

        // Refresh the mappings list
        await fetchAndRenderMappings();

        return response.mappings || [];
    } catch (error) {
        console.error('Stop recording error:', error);
        NotificationManager.error(`Failed to stop recording: ${error.message}`);
        return [];
    }
};

// Clear any recorded mappings from the UI and reset counters
window.clearRecordings = async () => {
    try {
        const listEl = document.getElementById('recordings-list');
        if (listEl) {
            listEl.innerHTML = '';
        }

        const statusEl = document.getElementById('recording-status');
        if (statusEl) {
            statusEl.textContent = '';
        }

        window.recordedCount = 0;
        window.isRecording = false;

        NotificationManager.info('Recording history cleared.');
    } catch (error) {
        console.error('Clear recordings error:', error);
        NotificationManager.error(`Failed to clear recordings: ${error.message}`);
    }
};

// Get recording status
window.getRecordingStatus = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_STATUS);
        return response.status || 'Unknown';
    } catch (error) {
        console.error('Recording status error:', error);
        return 'Unknown';
    }
};

// Create a recording snapshot
window.takeRecordingSnapshot = async (config = {}) => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_SNAPSHOT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        
        const count = response.mappings ? response.mappings.length : 0;
        NotificationManager.success(`Snapshot created! Captured ${count} mappings`);
        
        return response.mappings || [];
    } catch (error) {
        console.error('Recording snapshot error:', error);
        NotificationManager.error(`Snapshot failed: ${error.message}`);
        return [];
    }
};

// --- NEAR MISSES FUNCTIONS ---

// Find near matches for a request
window.findNearMissesForRequest = async (request) => {
    try {
        const response = await apiFetch(ENDPOINTS.NEAR_MISSES_REQUEST, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for request error:', error);
        return [];
    }
};

// Find near matches for a pattern
window.findNearMissesForPattern = async (pattern) => {
    try {
        const response = await apiFetch(ENDPOINTS.NEAR_MISSES_PATTERN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pattern)
        });
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for pattern error:', error);
        return [];
    }
};

// Get near matches for unmatched requests
window.getNearMissesForUnmatched = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_UNMATCHED_NEAR_MISSES);
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for unmatched error:', error);
        return [];
    }
};

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
            } catch (e) {
                // try next body shape
            }
        }
        console.log('🧩 [CACHE] Metadata miss');
    } catch {}
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
        console.warn('fetchExistingCacheMapping failed:', error);
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

function refreshMappingsFromCache({ maintainFilters = true } = {}) {
    try {

        // Use full cache snapshot logic for consistency
        const sanitized = buildCacheSnapshot();

        window.originalMappings = sanitized.slice();
        window.allMappings = sanitized.slice();

        const methodFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value || '';
        const urlFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value || '';
        const statusFilter = document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value || '';
        const hasFilters = maintainFilters && Boolean(methodFilter || urlFilter || statusFilter);

        if (hasFilters && typeof FilterManager !== 'undefined' && typeof FilterManager.applyMappingFilters === 'function') {
            FilterManager.applyMappingFilters();
        } else if (typeof fetchAndRenderMappings === 'function') {
            fetchAndRenderMappings(window.allMappings.slice());
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
            cache.delete(mappingId);
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
            const incoming = cloneMappingForCache(mapping);
            if (!incoming) {
                console.warn('updateOptimisticCache: unable to clone mapping for cache:', mappingId);
                return;
            }

            if (!incoming.id && mappingId) {
                incoming.id = mappingId;
            }
            if (!incoming.uuid && (mapping.uuid || mappingId)) {
                incoming.uuid = mapping.uuid || mappingId;
            }

            if (cache.has(mappingId)) {
                const merged = mergeMappingData(cache.get(mappingId), incoming);
                cache.set(mappingId, merged);
            } else {
                cache.set(mappingId, incoming);
            }

            if (shouldConfirmQueue && typeof window.cacheManager.confirmOptimisticUpdate === 'function') {
                window.cacheManager.confirmOptimisticUpdate(mappingId);
            }
        }

        window.cacheLastUpdate = Date.now();
        if (typeof window.cacheManager?.version === 'number') {
            window.cacheManager.version += 1;
        }
        refreshMappingsFromCache();
        enqueueCacheSync(mapping, normalizedOperation);
    } catch (error) {
        console.warn('updateOptimisticCache failed:', error);
    }
}

// Simple debounce for cache rebuilds that leverages the existing refreshImockCache
let _cacheRebuildTimer;
function scheduleCacheRebuild() {
  try {
    if (!isCacheEnabled()) {
      return;
    }
    const settings = window.SettingsStore?.getCached?.() || {};
    const delay = Number(settings.cacheRebuildDelay) || 1000;
    if (_cacheRebuildTimer) {
      clearTimeout(_cacheRebuildTimer);
      window.ResourceCleaner?.timeouts?.delete?.(_cacheRebuildTimer);
    }
    _cacheRebuildTimer = window.setTimeout(async () => {
      try {
        const existing = await fetchExistingCacheMapping();
        if (existing && extractCacheJsonBody(existing)) {
          console.log('🧩 [CACHE] Skipping scheduled rebuild - cache mapping already exists');
          return;
        }
        if (typeof window.refreshImockCache === 'function') {
          await window.refreshImockCache();
        }
      } catch (timerError) {
        console.warn('🧩 [CACHE] Scheduled rebuild attempt failed:', timerError);
      } finally {
        window.ResourceCleaner?.timeouts?.delete?.(_cacheRebuildTimer);
        _cacheRebuildTimer = null;
      }
    }, delay);
    window.ResourceCleaner?.trackTimeout?.(_cacheRebuildTimer);
  } catch (error) {
    console.warn('🧩 [CACHE] scheduleCacheRebuild failed:', error);
  }
}

// Guard against an infinite optimistic update loop in progress
let optimisticInProgress = false;
let optimisticDelayRetries = 0;

// Cache validation timer (check every minute, validate every 5 minutes)
const cacheValidationInterval = window.setInterval(() => {
    const timeSinceLastUpdate = Date.now() - (window.cacheLastUpdate || 0);
    const optimisticOps = window.cacheOptimisticOperations || 0;

    // Validate if cache is older than 5 minutes OR has too many optimistic operations
    if (timeSinceLastUpdate > 5 * 60 * 1000 || optimisticOps > 20) {
        console.log('🧩 [CACHE] Validation triggered - time:', Math.round(timeSinceLastUpdate/1000), 's, ops:', optimisticOps);
        validateAndRefreshCache();
    }
}, 60 * 1000); // Check every minute
window.ResourceCleaner?.trackInterval?.(cacheValidationInterval);

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

        // Reset optimistic counters
        window.cacheOptimisticOperations = 0;
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
        window.cacheRebuilding = true;
        console.log('🔄 [CACHE] Set cache rebuilding flag');

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
        window.cacheRebuilding = false;
        console.log('🔄 [CACHE] Cleared cache rebuilding flag');
        window.cacheLastUpdate = Date.now();
        window.cacheOptimisticOperations = 0;
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

// === MISSING FUNCTIONS FOR HTML COMPATIBILITY ===

// Simple health check function for button compatibility
window.checkHealth = async () => {
    try {
        // Check if user has entered connection details in the form
        const hostInput = document.getElementById('wiremock-host');
        const portInput = document.getElementById('wiremock-port');

        if (hostInput && portInput && (hostInput.value.trim() || portInput.value.trim())) {
            // User has entered connection details - update URL before health check
            const host = hostInput.value.trim() || 'localhost';
            const port = portInput.value.trim() || '8080';

            if (typeof window.normalizeWiremockBaseUrl === 'function') {
                window.wiremockBaseUrl = window.normalizeWiremockBaseUrl(host, port);
            } else {
                window.wiremockBaseUrl = `http://${host}:${port}/__admin`;
            }
            console.log('🔧 [checkHealth] Updated WireMock URL from form:', window.wiremockBaseUrl);
        }

        await checkHealthAndStartUptime();
        NotificationManager.success('Health check passed!');
    } catch (error) {
        NotificationManager.error(`Health check failed: ${error.message}`);
    }
};

// Refresh mappings function for button compatibility
window.refreshMappings = async () => {
    try {
        const useCache = isCacheEnabled();
        const refreshed = await fetchAndRenderMappings(null, { useCache });
        if (refreshed) {
            NotificationManager.success('Mappings refreshed!');
        }
    } catch (error) {
        NotificationManager.error(`Failed to refresh mappings: ${error.message}`);
    }
};

// Force refresh cache function for button compatibility
window.forceRefreshCache = async () => {
    try {
        if (!isCacheEnabled()) {
            NotificationManager.warning('Cache is not enabled. Enable it in Settings first.');
            return;
        }

        if (typeof window.refreshImockCache !== 'function') {
            NotificationManager.error('Cache service not available');
            return;
        }

        const cacheButton = document.querySelector('[onclick="forceRefreshCache()"]');
        if (cacheButton) {
            cacheButton.classList.add('is-loading');
            cacheButton.disabled = true;
        }

        const result = await window.refreshImockCache();
        let useCache = true;

        if (result && typeof result === 'object') {
            if (result.cacheMessage) {
                setStatusMessage(SELECTORS.IMPORT.RESULT, 'info', result.cacheMessage);
            }
            if (typeof result.useCache === 'boolean') {
                useCache = result.useCache;
            }
        }

        const refreshed = await fetchAndRenderMappings(null, { useCache });
            if (refreshed) {
                NotificationManager.success('Cache rebuilt and mappings refreshed!');
        }
    } catch (error) {
        NotificationManager.error(`Failed to rebuild cache: ${error.message}`);
    } finally {
        const cacheButton = document.querySelector('[onclick="forceRefreshCache()"]');
        if (cacheButton) {
            cacheButton.classList.remove('is-loading');
            cacheButton.disabled = false;
        }
    }
};

// Missing HTML onclick functions
window.loadMockData = () => {
    NotificationManager.info('Demo mode not implemented yet');
};

window.updateScenarioState = async () => {
    const scenarioSelect = document.getElementById('scenario-select');
    const scenarioState = document.getElementById('scenario-state');
    const submitButton = document.getElementById('scenario-update-btn');

    if (!scenarioSelect?.value || !scenarioState?.value) {
        NotificationManager.warning('Please select scenario and enter state');
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
    }

    try {
        await window.setScenarioState();
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
};

window.updateFileDisplay = () => {
    const fileInput = document.getElementById(SELECTORS.IMPORT.FILE);
    const fileDisplay = document.getElementById(SELECTORS.IMPORT.DISPLAY);
    const actionContainer = document.getElementById(SELECTORS.IMPORT.ACTIONS);

    if (!fileInput || !fileDisplay) {
        console.warn('Import file elements not found.');
        return;
    }

    if (fileInput.files?.length > 0) {
        const file = fileInput.files[0];
        const sizeKb = file.size ? ` (${Math.round(file.size / 1024)} KB)` : '';
        fileDisplay.innerHTML = `<strong>${file.name}</strong>${sizeKb}`;
        if (actionContainer) actionContainer.style.display = 'block';
    } else {
        fileDisplay.innerHTML = '<span class="file-placeholder">No file selected</span>';
        if (actionContainer) actionContainer.style.display = 'none';
    }
};

window.updateRecorderLink = (host, port) => {
    try {
        const recorderLink = document.getElementById('recorder-link');
        if (!recorderLink) return;

        const baseHost = (host || '').trim();
        if (!baseHost) {
            recorderLink.removeAttribute('href');
            recorderLink.setAttribute('title', 'Configure host in Settings to enable recorder link');
            recorderLink.textContent = 'Recorder UI (configure host first)';
            return;
        }

        let normalizedHost = baseHost;
        if (!/^https?:\/\//i.test(normalizedHost)) {
            normalizedHost = padHostWithProtocol(normalizedHost);
        }

        const url = new URL(normalizedHost);
        if (port && String(port).trim()) {
            url.port = String(port).trim();
        }
        url.pathname = '/__admin/recorder/';

        recorderLink.href = url.toString();
        recorderLink.textContent = url.toString();
        recorderLink.removeAttribute('title');
    } catch (error) {
        console.warn('Failed to update recorder link:', error);
    }
};

function padHostWithProtocol(value) {
    const trimmed = value.trim();
    if (!trimmed) return 'http://localhost';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `http://${trimmed}`;
}

function setStatusMessage(elementId, type, message) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    el.textContent = `${prefix} ${message}`;
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function findImportButton() {
    if (window.elementCache?.has(SELECTORS.IMPORT.ACTIONS)) {
        const cachedContainer = window.elementCache.get(SELECTORS.IMPORT.ACTIONS);
        if (cachedContainer) {
            const cachedButton = cachedContainer.querySelector('button');
            if (cachedButton) return cachedButton;
        }
    }

    const container = document.getElementById(SELECTORS.IMPORT.ACTIONS);
    if (!container) return null;

    const button = container.querySelector('button');
    if (button && window.elementCache) {
        window.elementCache.set(SELECTORS.IMPORT.ACTIONS, container);
    }
    return button;
}

function toggleImportButtonState(isLoading) {
    const button = findImportButton();
    if (!button) return;

    button.classList.toggle('is-loading', isLoading);
    button.disabled = isLoading;
}

function serializeMappingsToYaml(data) {
    if (window.jsyaml?.dump) {
        return window.jsyaml.dump(data, { noRefs: true });
    }
    if (typeof convertJSONToYAML === 'function') {
        return convertJSONToYAML(data);
    }
    throw new Error('YAML serializer is not available.');
}

function resolveImportMode(overrideMode = null) {
    if (overrideMode) {
        return overrideMode;
    }

    const select = document.getElementById(SELECTORS.IMPORT.MODE);
    if (!select) {
        return 'MERGE';
    }

    return select.value || 'MERGE';
}

async function parseImportFile() {
    const fileInput = document.getElementById(SELECTORS.IMPORT.FILE);
    if (!fileInput?.files?.length) {
        throw new Error('Please select a file to import.');
    }

    const file = fileInput.files[0];
    const text = await file.text();
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'yaml' || extension === 'yml') {
        if (window.jsyaml?.load) {
            return window.jsyaml.load(text);
        }
        throw new Error('YAML parser is not available.');
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error('Failed to parse JSON import file.');
    }
}

function normalizeImportPayload(rawData, importMode) {
    if (!rawData || typeof rawData !== 'object') {
        throw new Error('Import file is empty or malformed.');
    }

    const clone = JSON.parse(JSON.stringify(rawData));
    const payload = {};

    const preservedKeys = ['meta', 'globalSettings', 'requestJournal', 'importSettings'];
    preservedKeys.forEach((key) => {
        if (clone && Object.prototype.hasOwnProperty.call(clone, key)) {
            payload[key] = clone[key];
        }
    });

    if (Array.isArray(clone)) {
        payload.mappings = clone;
    } else if (Array.isArray(clone.mappings)) {
        payload.mappings = clone.mappings;
    } else if (clone.mappings) {
        payload.mappings = [clone.mappings];
    } else if (Array.isArray(clone.mapping)) {
        payload.mappings = clone.mapping;
    } else if (clone.mapping) {
        payload.mappings = [clone.mapping];
    } else if (clone.request || clone.response) {
        payload.mappings = [clone];
    }

    if (!Array.isArray(payload.mappings)) {
        throw new Error('No mappings array found in the import file.');
    }

    payload.mappings = payload.mappings.filter(Boolean);
    if (payload.mappings.length === 0) {
        throw new Error('The import file does not contain any mappings.');
    }

    Object.keys(clone).forEach((key) => {
        if (['mappings', 'mapping', 'importMode'].includes(key)) {
            return;
        }
        if (!Object.prototype.hasOwnProperty.call(payload, key)) {
            payload[key] = clone[key];
        }
    });

    const mode = importMode || clone.importMode || 'MERGE';
    payload.importMode = mode;

    return payload;
}

async function executeImport(importModeOverride = null) {
    try {
        toggleImportButtonState(true);
        setStatusMessage(SELECTORS.IMPORT.RESULT, 'info', 'Processing import file...');
        const rawData = await parseImportFile();
        const mode = resolveImportMode(importModeOverride);
        const payload = normalizeImportPayload(rawData, mode);
        payload.importMode = mode;

        await apiFetch(ENDPOINTS.MAPPINGS_IMPORT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        NotificationManager.success(`Imported ${payload.mappings.length} mapping(s).`);

        const fileInput = document.getElementById(SELECTORS.IMPORT.FILE);
        if (fileInput) {
            fileInput.value = '';
            window.updateFileDisplay();
        }

        try {
            await window.refreshMappings();
        } catch (refreshError) {
            console.warn('Failed to refresh mappings after import:', refreshError);
        }
        setStatusMessage(SELECTORS.IMPORT.RESULT, 'success', `Imported ${payload.mappings.length} mapping(s) using mode ${mode}.`);
    } catch (error) {
        console.error('Import failed:', error);
        setStatusMessage(SELECTORS.IMPORT.RESULT, 'error', error.message || 'Import failed.');
        NotificationManager.error(`Import failed: ${error.message}`);
        throw error;
    } finally {
        toggleImportButtonState(false);
    }
}

window.executeImportFromUi = async () => {
    try {
        await executeImport();
    } catch (_) {
        // error handling performed inside executeImport
    }
};

window.exportMappings = async () => {
    const formatSelect = document.getElementById(SELECTORS.EXPORT.FORMAT);
    const format = formatSelect?.value || 'json';
    setStatusMessage(SELECTORS.EXPORT.RESULT, 'info', 'Preparing mappings export...');

    try {
        const data = await apiFetch(ENDPOINTS.MAPPINGS);
        const mappings = data?.mappings || [];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = `wiremock-mappings-${timestamp}`;

        if (format === 'yaml') {
            const yamlContent = serializeMappingsToYaml({ mappings });
            downloadFile(`${baseName}.yaml`, yamlContent.endsWith('\n') ? yamlContent : `${yamlContent}\n`, 'text/yaml');
        } else {
            const jsonContent = JSON.stringify({ mappings }, null, 2);
            downloadFile(`${baseName}.json`, `${jsonContent}\n`, 'application/json');
        }

        setStatusMessage(SELECTORS.EXPORT.RESULT, 'success', `Exported ${mappings.length} mapping(s) as ${format.toUpperCase()}.`);
        NotificationManager.success(`Exported ${mappings.length} mapping(s).`);
    } catch (error) {
        console.error('Export mappings failed:', error);
        setStatusMessage(SELECTORS.EXPORT.RESULT, 'error', error.message || 'Failed to export mappings.');
        NotificationManager.error(`Failed to export mappings: ${error.message}`);
    }
};

window.exportRequests = async () => {
    const formatSelect = document.getElementById(SELECTORS.EXPORT.FORMAT);
    const format = formatSelect?.value || 'json';
    setStatusMessage(SELECTORS.EXPORT.RESULT, 'info', 'Preparing request log export...');

    try {
        const data = await apiFetch(ENDPOINTS.REQUESTS);
        const requests = data?.requests || [];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = `wiremock-requests-${timestamp}`;

        if (format === 'yaml') {
            const yamlContent = serializeMappingsToYaml({ requests });
            downloadFile(`${baseName}.yaml`, yamlContent.endsWith('\n') ? yamlContent : `${yamlContent}\n`, 'text/yaml');
        } else {
            const jsonContent = JSON.stringify({ requests }, null, 2);
            downloadFile(`${baseName}.json`, `${jsonContent}\n`, 'application/json');
        }

        setStatusMessage(SELECTORS.EXPORT.RESULT, 'success', `Exported ${requests.length} request(s) as ${format.toUpperCase()}.`);
        NotificationManager.success(`Exported ${requests.length} request(s).`);
    } catch (error) {
        console.error('Export requests failed:', error);
        setStatusMessage(SELECTORS.EXPORT.RESULT, 'error', error.message || 'Failed to export request log.');
        NotificationManager.error(`Failed to export request log: ${error.message}`);
    }
};

// === IMPORT/EXPORT FUNCTIONS (Placeholders) ===

