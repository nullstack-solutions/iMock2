'use strict';

/**
 * Simplified cache.js - Legacy compatibility layer
 *
 * OLD ARCHITECTURE REMOVED:
 * ❌ cacheManager with 5 levels of redundancy
 * ❌ optimisticQueue with TTL
 * ❌ cacheMetadata with garbage collection
 * ❌ Multiple sync timers (cleanup, sync, gc)
 * ❌ Time-based validation
 *
 * NEW ARCHITECTURE (see store.js, sync-engine.js, operations.js):
 * ✅ MappingsStore - Single Source of Truth
 * ✅ SyncEngine - Incremental sync every 10s
 * ✅ MappingsOperations - Optimistic CRUD with rollback
 *
 * This file now only contains:
 * - Connection logic (connectToWireMock)
 * - Health monitoring
 * - Backward compatibility helpers
 */

// === BACKWARD COMPATIBILITY HELPERS ===

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

window.isCacheEnabled = isCacheEnabled;

// === CONNECTION LOGIC ===

window.connectToWireMock = async () => {
    const hostInput = document.getElementById('wiremock-host') || document.getElementById(SELECTORS.CONNECTION.HOST);
    const portInput = document.getElementById('wiremock-port') || document.getElementById(SELECTORS.CONNECTION.PORT);

    let host, port;

    if (hostInput && portInput) {
        host = hostInput.value.trim() || 'localhost';
        port = portInput.value.trim() || '8080';
    } else {
        if (window.wiremockBaseUrl) {
            console.log('🔗 Using existing wiremockBaseUrl for connection');
            host = 'localhost';
            port = '8080';
        } else {
            const settings = (typeof window.readWiremockSettings === 'function') ? window.readWiremockSettings() : {};
            host = settings.host || 'localhost';
            port = settings.port || '8080';
            console.log('🔗 Using settings for connection:', { host, port });
        }
    }

    console.log('🔗 Connecting with:', { host, port });

    // Update base URL
    if (!window.wiremockBaseUrl || hostInput) {
        if (typeof window.normalizeWiremockBaseUrl === 'function') {
            window.wiremockBaseUrl = window.normalizeWiremockBaseUrl(host, port);
        } else {
            const hasScheme = /^(https?:)\/\//i.test(host);
            const scheme = hasScheme ? host.split(':')[0] : 'http';
            const cleanHost = hasScheme ? host.replace(/^(https?:)\/\//i, '') : host;
            const finalPort = (port && String(port).trim()) || (scheme === 'https' ? '443' : '8080');
            window.wiremockBaseUrl = `${scheme}://${cleanHost}:${finalPort}/__admin`;
        }
        console.log('🔗 Updated wiremockBaseUrl:', window.wiremockBaseUrl);
    } else {
        console.log('🔗 Using pre-configured wiremockBaseUrl:', window.wiremockBaseUrl);
    }

    try {
        await checkHealthAndStartUptime();

        console.log('✅ Online mode - proceeding with data loading');

        // Update UI
        const statusDot = document.getElementById(SELECTORS.CONNECTION.STATUS_DOT);
        const statusText = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
        const setupDiv = document.getElementById(SELECTORS.CONNECTION.SETUP);
        const addButton = document.getElementById(SELECTORS.BUTTONS.ADD_MAPPING);

        if (statusDot) statusDot.className = 'status-dot connected';
        if (statusText) { if (!window.lastWiremockSuccess) { window.lastWiremockSuccess = Date.now(); } if (typeof window.updateLastSuccessUI === 'function') { window.updateLastSuccessUI(); } }
        if (setupDiv) setupDiv.style.display = 'none';
        if (addButton) addButton.disabled = false;

        const statsElement = document.getElementById(SELECTORS.UI.STATS);
        const statsSpacer = document.getElementById('stats-spacer');
        const filtersElement = document.getElementById(SELECTORS.UI.SEARCH_FILTERS);
        if (statsElement) statsElement.style.display = 'flex';
        if (statsSpacer) statsSpacer.style.display = 'none';
        if (filtersElement) filtersElement.style.display = 'block';

        // Start health monitoring
        startHealthCheck();

        // === NEW OPTIMIZED ARCHITECTURE ===
        console.log('🚀 [CONNECT] Using new optimized sync engine');

        // Load data using new SyncEngine (cache first, then full sync)
        await window.SyncEngine.coldStart();

        // Start background sync timers
        window.SyncEngine.start();

        await loadScenarios();

        NotificationManager.success('Connected to WireMock successfully!');

    } catch (error) {
        console.error('Connection error - entering offline mode:', error);
        console.log('⚠️ Offline mode - no server requests will be made');

        stopUptime();

        const statusDot = document.getElementById(SELECTORS.CONNECTION.STATUS_DOT);
        const statusText = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
        if (statusDot) statusDot.className = 'status-dot disconnected';
        if (statusText) statusText.textContent = 'Offline';

        NotificationManager.warning('WireMock server is offline. Retrying connection in background...');

        startHealthCheck();
    }
};

// === HEALTH MONITORING ===

let healthCheckTimeout = null;
let healthCheckFailureCount = 0;

window.startHealthCheck = () => {
    if (healthCheckTimeout) {
        clearTimeout(healthCheckTimeout);
        healthCheckTimeout = null;
    }

    let delay;
    if (window.isOnline) {
        delay = 30000; // 30s when online
    } else {
        // Exponential backoff when offline (2s, 4s, 8s, 16s, 32s, max 60s)
        const baseDelay = 2000;
        const maxDelay = 60000;
        delay = Math.min(baseDelay * Math.pow(2, healthCheckFailureCount), maxDelay);
    }

    console.log(`🔄 [HEALTH] Scheduling next check in ${delay}ms (${window.isOnline ? 'online' : `offline, attempt ${healthCheckFailureCount + 1}`})`);

    healthCheckTimeout = setTimeout(async () => {
        try {
            const startTime = performance.now();
            let isHealthy = false;
            let responseTime = 0;

            try {
                const response = await apiFetch(ENDPOINTS.HEALTH);
                responseTime = Math.round(performance.now() - startTime);
                isHealthy = typeof response === 'object' && (
                    (typeof response.status === 'string' && ['up','healthy','ok'].includes(response.status.toLowerCase())) ||
                    response.healthy === true
                );
            } catch (primaryError) {
                const is404 = primaryError?.message?.includes('404') || primaryError?.status === 404;

                if (is404) {
                    console.log('[HEALTH] /health not found (404), trying /mappings fallback for older WireMock');
                    try {
                        const fallbackResponse = await window.apiFetch(window.ENDPOINTS.MAPPINGS);
                        responseTime = Math.round(performance.now() - startTime);
                        isHealthy = typeof fallbackResponse === 'object' && fallbackResponse !== null && !fallbackResponse.__isDemo;
                    } catch (fallbackError) {
                        isHealthy = false;
                    }
                } else {
                    isHealthy = false;
                }
            }

            const wasOnline = window.isOnline;
            window.isOnline = isHealthy;

            if (isHealthy) {
                healthCheckFailureCount = 0;

                const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
                if (healthIndicator) {
                    healthIndicator.innerHTML = `<span>Response Time: </span><span class="healthy">${responseTime}ms</span>`;
                }

                if (!wasOnline) {
                    console.log(`✅ [HEALTH] Server is back online (${responseTime}ms)`);
                    NotificationManager.success('WireMock server is back online! Reconnecting...');
                    await window.connectToWireMock();
                } else {
                    console.log(`✅ [HEALTH] Server is healthy (${responseTime}ms)`);
                }
            } else {
                healthCheckFailureCount++;

                const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
                if (healthIndicator) {
                    healthIndicator.innerHTML = `<span>Response Time: </span><span class="unhealthy">Offline</span>`;
                }

                if (wasOnline) {
                    console.log(`⚠️ [HEALTH] Server went offline`);
                    stopUptime();

                    const statusDot = document.getElementById(SELECTORS.CONNECTION.STATUS_DOT);
                    const statusText = document.getElementById(SELECTORS.CONNECTION.STATUS_TEXT);
                    if (statusDot) statusDot.className = 'status-dot disconnected';
                    if (statusText) statusText.textContent = 'Offline';

                    NotificationManager.warning('WireMock server went offline. Retrying in background...');
                } else {
                    console.log(`⚠️ [HEALTH] Server still offline (attempt ${healthCheckFailureCount})`);
                }
            }

            startHealthCheck();

        } catch (error) {
            console.error('[HEALTH] Check error:', error);
            window.isOnline = false;
            healthCheckFailureCount++;
            startHealthCheck();
        }
    }, delay);
};

window.stopHealthCheck = () => {
    if (healthCheckTimeout) {
        clearTimeout(healthCheckTimeout);
        healthCheckTimeout = null;
        healthCheckFailureCount = 0;
        console.log('🛑 [HEALTH] Health check stopped');
    }
};

window.checkHealthAndStartUptime = async () => {
    try {
        const startTime = performance.now();
        let responseTime = 0;
        let isHealthy = false;

        try {
            const response = await apiFetch(ENDPOINTS.HEALTH);
            responseTime = Math.round(performance.now() - startTime);
            isHealthy = typeof response === 'object' && (
                (typeof response.status === 'string' && ['up','healthy','ok'].includes(response.status.toLowerCase())) ||
                response.healthy === true
            );
            console.log('[HEALTH] initial check:', { rawStatus: response?.status, healthyFlag: response?.healthy, isHealthy });
        } catch (primaryError) {
            const is404 = primaryError?.message?.includes('404') || primaryError?.status === 404;

            if (is404) {
                console.log('[HEALTH] /health not found (404), trying /mappings fallback for older WireMock');
                try {
                    const fallbackResponse = await window.apiFetch(window.ENDPOINTS.MAPPINGS);
                    responseTime = Math.round(performance.now() - startTime);
                    isHealthy = typeof fallbackResponse === 'object' && fallbackResponse !== null && !fallbackResponse.__isDemo;
                    console.log('[HEALTH] fallback check (mappings):', { isHealthy, responseTime });
                } catch (fallbackError) {
                    console.log('[HEALTH] fallback failed - offline mode');
                    isHealthy = false;
                }
            } else {
                console.log('[HEALTH] connection failed - offline mode');
                isHealthy = false;
            }
        }

        if (isHealthy) {
            window.isOnline = true;

            window.startTime = Date.now();
            if (window.uptimeInterval) window.LifecycleManager.clearInterval(window.uptimeInterval);
            window.uptimeInterval = window.LifecycleManager.setInterval(updateUptime, 1000);

            if (typeof window.applyHealthUI === 'function') {
                try { window.applyHealthUI(true, responseTime); } catch (e) { console.warn('applyHealthUI failed:', e); }
            }

            const healthIndicator = document.getElementById(SELECTORS.HEALTH.INDICATOR);
            if (healthIndicator) {
                healthIndicator.style.display = 'inline';
                healthIndicator.innerHTML = `<span>Response Time: </span><span class="healthy">${responseTime}ms</span>`;
            }

            console.log(`✅ WireMock health check passed (${responseTime}ms), uptime started, online mode`);
        } else {
            window.isOnline = false;
            throw new Error('WireMock is not reachable - offline mode');
        }
    } catch (error) {
        window.isOnline = false;
        console.error('Health check failed - entering offline mode:', error);
        throw error;
    }
};
