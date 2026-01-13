'use strict';

window.refreshRequests = async () => {
    await fetchAndRenderRequests();
    const hasActiveFilters = document.getElementById(SELECTORS.REQUEST_FILTERS.METHOD)?.value || document.getElementById(SELECTORS.REQUEST_FILTERS.URL)?.value || document.getElementById(SELECTORS.REQUEST_FILTERS.STATUS)?.value || document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM)?.value || document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO)?.value;
    if (hasActiveFilters) FilterManager.applyRequestFilters();
};

window.applyQuickTimeFilter = () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dateFromInput = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToInput = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    if (dateFromInput) dateFromInput.value = Utils.formatDateTime(yesterday);
    if (dateToInput) dateToInput.value = Utils.formatDateTime(now);
    FilterManager.applyRequestFilters();
};

window.cleanupPendingDeletions = () => {
    for (const [id, timeout] of window.deletionTimeouts) {
        clearTimeout(timeout);
    }
    window.deletionTimeouts.clear();
    window.pendingDeletedIds.clear();
};

window.addEventListener('beforeunload', window.cleanupPendingDeletions);

window.toggleElementById = (elementId) => document.getElementById(elementId)?.classList.toggle('hidden');

window.togglePreview = (mappingId) => window.toggleElementById(`preview-${mappingId}`);
window.toggleRequestPreview = (requestId) => window.toggleElementById(`request-preview-${requestId}`);
<<<<<<< HEAD

// --- CONNECTION & HEALTH MANAGEMENT (Moved from cache.js) ---

window.wiremockStatus = {
    online: false,
    version: null,
    lastCheck: 0,
    latency: 0
};

window.connectToWireMock = async function(url) {
    if (!url) {
        NotificationManager.error('Please enter a WireMock URL');
        return;
    }

    // Normalize URL
    let cleanUrl = url.trim().replace(/\/+$/, '');
    if (!cleanUrl.startsWith('http')) {
        cleanUrl = 'http://' + cleanUrl;
    }

    // Save configuration
    window.wiremockBaseUrl = cleanUrl;
    localStorage.setItem('wiremock_url', cleanUrl);

    // Update UI
    const urlInput = document.getElementById('wiremock-url');
    if (urlInput) urlInput.value = cleanUrl;

    const statusBadge = document.getElementById('connection-status');
    if (statusBadge) {
        statusBadge.className = 'badge badge-warning';
        statusBadge.textContent = 'Connecting...';
    }

    try {
        await window.checkHealthAndStartUptime();
        
        // Initial data fetch
        if (window.wiremockStatus.online) {
            NotificationManager.success('Connected to WireMock');
            
            // Trigger initial loads
            if (typeof window.fetchAndRenderMappings === 'function') window.fetchAndRenderMappings();
            if (typeof window.fetchAndRenderRequests === 'function') window.fetchAndRenderRequests();
            
            // Close modal if open
            if (typeof window.hideModal === 'function') window.hideModal('connection-modal');
        } else {
            throw new Error('Health check failed');
        }
    } catch (error) {
        console.error('Connection failed:', error);
        window.wiremockStatus.online = false;
        
        if (statusBadge) {
            statusBadge.className = 'badge badge-danger';
            statusBadge.textContent = 'Disconnected';
        }
        
        NotificationManager.error('Could not connect to WireMock: ' + error.message);
        
        // Fallback to demo mode if available and appropriate
        if (window.FeaturesState && typeof window.FeaturesState.markDemoModeActive === 'function') {
            window.FeaturesState.markDemoModeActive('connection-failure');
        }
    }
};

window.startHealthCheck = function() {
    if (window.healthCheckInterval) clearInterval(window.healthCheckInterval);
    
    // Check every 30 seconds
    window.healthCheckInterval = setInterval(window.checkHealthAndStartUptime, 30000);
    
    // Also run immediately
    window.checkHealthAndStartUptime();
};

window.stopHealthCheck = function() {
    if (window.healthCheckInterval) {
        clearInterval(window.healthCheckInterval);
        window.healthCheckInterval = null;
    }
};

window.checkHealthAndStartUptime = async function() {
    const start = Date.now();
    try {
        // Simple health check endpoint
        // Use __admin/mappings as a reliable check that also validates auth/access
        const response = await fetch(`${window.wiremockBaseUrl}/__admin/mappings?limit=1`);
        
        const latency = Date.now() - start;
        window.wiremockStatus.lastCheck = Date.now();
        window.wiremockStatus.latency = latency;
        
        if (response.ok) {
            window.wiremockStatus.online = true;
            
            const statusBadge = document.getElementById('connection-status');
            if (statusBadge) {
                statusBadge.className = 'badge badge-success';
                statusBadge.textContent = `Connected (${latency}ms)`;
            }
            
            // Try to extract version if available in headers
            const version = response.headers.get('WireMock-Version');
            if (version) window.wiremockStatus.version = version;
            
        } else {
            throw new Error(`Status ${response.status}`);
        }
    } catch (e) {
        window.wiremockStatus.online = false;
        
        const statusBadge = document.getElementById('connection-status');
        if (statusBadge) {
            statusBadge.className = 'badge badge-danger';
            statusBadge.textContent = 'Disconnected';
        }
        
        console.warn('Health check failed:', e.message);
    }
    
    // Broadcast status change
    if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('wiremock:status-change', { 
            detail: window.wiremockStatus 
        }));
    }
    
    return window.wiremockStatus.online;
};
=======
>>>>>>> clean
