'use strict';

console.log('✅ All required modules loaded successfully');
    
// === FUNCTIONS FOR EDITOR INTEGRATION ===
    
window.editMapping = (mappingId) => {
    console.log('🔧 Opening editor for mapping:', mappingId);

    // Get current settings to pass to editor
    const currentSettings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');

    // Option 1: Pass ALL settings (current behavior)
    const settingsParam = encodeURIComponent(JSON.stringify(currentSettings));

    // Option 2: Pass only specific settings (uncomment to use)
    // const editorSettings = {
    //     host: currentSettings.host,
    //     port: currentSettings.port,
    //     theme: currentSettings.theme
    // };
    // const settingsParam = encodeURIComponent(JSON.stringify(editorSettings));

    const editorUrl = `editor/json-editor.html?mappingId=${mappingId}&mode=edit&settings=${settingsParam}`;
    const editorWindow = window.open(
        editorUrl,
        `editor_${mappingId}`,
        'width=1200,height=800,scrollbars=yes,resizable=yes,status=yes'
    );

    if (!editorWindow) {
        NotificationManager.error('Popup blocked. Please allow popups for this site.');
        return;
    }
        
    NotificationManager.info(`Editor opened for mapping ${mappingId}`);
        
    // Track window closure to refresh counters
    const checkClosed = setInterval(() => {
        if (editorWindow.closed) {
            clearInterval(checkClosed);
            console.log('🔄 Editor closed, updating counters only');
            // Only update counters, don't refresh data to preserve optimistic updates
            if (typeof window.updateMappingsCounter === 'function') {
                window.updateMappingsCounter();
            }
            if (typeof window.updateRequestsCounter === 'function') {
                window.updateRequestsCounter();
            }
        }
    }, 1000);

    // Safety cleanup: clear interval after 5 minutes to prevent memory leaks
    setTimeout(() => {
        if (!editorWindow.closed) {
            clearInterval(checkClosed);
            console.log('🔄 Editor interval cleaned up after timeout');
        }
    }, 5 * 60 * 1000); // 5 minutes
};

// === SETTINGS MANAGEMENT ===

// Save settings from the settings page
window.saveSettings = () => {
    try {
        // Collect settings from settings form (prioritize settings form values)
        const settings = {
            host: document.getElementById('default-host')?.value || 'localhost',
            port: document.getElementById('default-port')?.value || '8080',
            requestTimeout: document.getElementById('request-timeout')?.value || '5000',
            authHeader: document.getElementById('auth-header')?.value || '',
            cacheEnabled: document.getElementById('cache-enabled')?.checked || false,
            autoRefreshEnabled: document.getElementById('auto-refresh-enabled')?.checked || true,
            refreshInterval: document.getElementById('refresh-interval')?.value || '30',
            // Cache timing settings
            cacheRebuildDelay: document.getElementById('cache-rebuild-delay')?.value || '1000',
            cacheValidationDelay: document.getElementById('cache-validation-delay')?.value || '1500',
            optimisticCacheAgeLimit: document.getElementById('optimistic-cache-age-limit')?.value || '30000',
            cacheCountDiffThreshold: document.getElementById('cache-count-diff-threshold')?.value || '2',
            backgroundFetchDelay: document.getElementById('background-fetch-delay')?.value || '200'
        };
        
        // Also update the main connection form to reflect the saved settings
        const hostInput = document.getElementById('wiremock-host');
        const portInput = document.getElementById('wiremock-port');
        if (hostInput) hostInput.value = settings.host;
        if (portInput) portInput.value = settings.port;
        
        // Save to localStorage
        localStorage.setItem('wiremock-settings', JSON.stringify(settings));
        console.log('🔧 [main.js] Settings saved to localStorage:', settings);
        console.log('🔧 [main.js] Request timeout field value:', document.getElementById('request-timeout')?.value);

        // Update global baseUrl immediately
        if (typeof window.normalizeWiremockBaseUrl === 'function') {
            window.wiremockBaseUrl = window.normalizeWiremockBaseUrl(settings.host, settings.port);
        } else {
            window.wiremockBaseUrl = `http://${settings.host}:${settings.port}/__admin`;
        }

        // Update global auth header immediately
        window.authHeader = settings.authHeader || '';

        // Broadcast settings update to any open editor windows
        broadcastSettingsUpdate(settings);
        
        NotificationManager.success('Settings saved successfully!');
        console.log('💾 Settings saved:', settings);
        
    } catch (error) {
        console.error('Error saving settings:', error);
        NotificationManager.error('Failed to save settings');
    }
};

// Reset settings to defaults
window.resetSettings = () => {
    if (!confirm('Reset all settings to defaults?')) return;
    
    try {
        // Default settings
        const defaults = {
            host: 'localhost',
            port: '8080',
            requestTimeout: '69000',
            authHeader: '',
            cacheEnabled: true,
            autoRefreshEnabled: false,
            refreshInterval: '0',
            // Default cache timing settings
            cacheRebuildDelay: '1000',
            cacheValidationDelay: '1500',
            optimisticCacheAgeLimit: '30000',
            cacheCountDiffThreshold: '2',
            backgroundFetchDelay: '200'
        };
        
        // Update form fields
        if (document.getElementById('default-host')) document.getElementById('default-host').value = defaults.host;
        if (document.getElementById('default-port')) document.getElementById('default-port').value = defaults.port;
        if (document.getElementById('request-timeout')) document.getElementById('request-timeout').value = defaults.requestTimeout;
        if (document.getElementById('auth-header')) document.getElementById('auth-header').value = defaults.authHeader;
        if (document.getElementById('cache-enabled')) document.getElementById('cache-enabled').checked = defaults.cacheEnabled;
        if (document.getElementById('auto-refresh-enabled')) document.getElementById('auto-refresh-enabled').checked = defaults.autoRefreshEnabled;
        if (document.getElementById('refresh-interval')) document.getElementById('refresh-interval').value = defaults.refreshInterval;
        
        // Save defaults
        localStorage.setItem('wiremock-settings', JSON.stringify(defaults));
        
        // Update global baseUrl
        window.wiremockBaseUrl = `http://${defaults.host}:${defaults.port}/__admin`;

        // Update global auth header
        window.authHeader = defaults.authHeader || '';

        // Broadcast update
        broadcastSettingsUpdate(defaults);
        
        NotificationManager.success('Settings reset to defaults!');
        console.log('🔄 Settings reset to defaults');
        
    } catch (error) {
        console.error('Error resetting settings:', error);
        NotificationManager.error('Failed to reset settings');
    }
};

// Load settings into form fields
window.loadSettings = () => {
    try {
        const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');
        console.log('🔧 [main.js] Loading settings from localStorage:', settings);

        // Load into settings form fields if they exist
        if (document.getElementById('default-host')) document.getElementById('default-host').value = settings.host || 'localhost';
        if (document.getElementById('default-port')) document.getElementById('default-port').value = settings.port || '8080';
        if (document.getElementById('request-timeout')) document.getElementById('request-timeout').value = settings.requestTimeout || '5000';
        if (document.getElementById('auth-header')) document.getElementById('auth-header').value = settings.authHeader || '';
        if (document.getElementById('cache-enabled')) document.getElementById('cache-enabled').checked = settings.cacheEnabled || false;
        if (document.getElementById('auto-refresh-enabled')) document.getElementById('auto-refresh-enabled').checked = settings.autoRefreshEnabled !== false;
        if (document.getElementById('refresh-interval')) document.getElementById('refresh-interval').value = settings.refreshInterval || '30';
        // Cache timing settings
        if (document.getElementById('cache-rebuild-delay')) document.getElementById('cache-rebuild-delay').value = settings.cacheRebuildDelay || '1000';
        if (document.getElementById('cache-validation-delay')) document.getElementById('cache-validation-delay').value = settings.cacheValidationDelay || '1500';
        if (document.getElementById('optimistic-cache-age-limit')) document.getElementById('optimistic-cache-age-limit').value = settings.optimisticCacheAgeLimit || '30000';
        if (document.getElementById('cache-count-diff-threshold')) document.getElementById('cache-count-diff-threshold').value = settings.cacheCountDiffThreshold || '2';
        if (document.getElementById('background-fetch-delay')) document.getElementById('background-fetch-delay').value = settings.backgroundFetchDelay || '200';

        // Update global auth header
        window.authHeader = settings.authHeader || '';

        console.log('📋 Settings loaded into settings form');

    } catch (error) {
        console.error('Error loading settings:', error);
    }
};

// Broadcast settings update to all open editor windows
function broadcastSettingsUpdate(settings) {
    try {
        // Use localStorage event to notify other windows
        localStorage.setItem('wiremock-settings-broadcast', JSON.stringify({
            timestamp: Date.now(),
            settings: settings
        }));
        
        // Also try to directly message any child windows
        // Note: This won't work for windows opened from other tabs
        console.log('📡 Broadcasting settings update to editor windows');
        
    } catch (error) {
        console.warn('Failed to broadcast settings update:', error);
    }
}

// Initialize default WireMock URL
if (!window.wiremockBaseUrl) {
    window.wiremockBaseUrl = 'http://localhost:8080/__admin';
    console.log('🔧 [main.js] Initialized default WireMock URL:', window.wiremockBaseUrl);
}

// Load settings when page loads
document.addEventListener('DOMContentLoaded', async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    loadSettings();
    loadConnectionSettings();
    // Ensure settings are loaded before any operations
    console.log('🔧 [main.js] Page loaded, settings initialized, ready for user interaction');
});

// Listen for settings changes from editor windows or other sources
window.addEventListener('storage', (e) => {
    if (e.key === 'wiremock-settings' && e.newValue) {
        try {
            const settings = JSON.parse(e.newValue);
            console.log('🔧 [main.js] Settings updated from external source:', settings);

            // Update main connection form fields
            const hostInput = document.getElementById('wiremock-host');
            const portInput = document.getElementById('wiremock-port');
            if (hostInput && settings.host) {
                hostInput.value = settings.host;
            }
            if (portInput && settings.port) {
                portInput.value = settings.port;
            }

            // Update URL if we have valid settings
            if (settings.host && settings.port) {
                if (typeof window.normalizeWiremockBaseUrl === 'function') {
                    window.wiremockBaseUrl = window.normalizeWiremockBaseUrl(settings.host, settings.port);
                } else {
                    window.wiremockBaseUrl = `http://${settings.host}:${settings.port}/__admin`;
                }
                console.log('🔧 [main.js] URL updated from settings change:', window.wiremockBaseUrl);
            }
        } catch (error) {
            console.error('🔧 [main.js] Error processing settings update:', error);
        }
    }
});

// Listen for messages from editor windows (e.g., cache refresh requests)
window.addEventListener('message', (event) => {
    // Only accept messages from same origin for security
    if (event.origin !== window.location.origin) {
        return;
    }

    if (event.data && event.data.type === 'imock-cache-refresh') {
        console.log('📨 [main.js] Received cache refresh request from:', event.data.source);
        if (typeof window.refreshImockCache === 'function') {
            window.refreshImockCache().catch(error => {
                console.warn('Failed to refresh cache from message:', error);
            });
        }
    }

    if (event.data && event.data.type === 'imock-optimistic-mapping-update') {
        console.log('🎯 [main.js] Received optimistic mapping update from:', event.data.source, event.data.mapping.id);
        if (typeof window.applyOptimisticMappingUpdate === 'function') {
            window.applyOptimisticMappingUpdate(event.data.mapping);
            // Also trigger UI refresh to show changes immediately
            if (typeof window.fetchAndRenderMappings === 'function') {
                console.log('🎯 [main.js] Triggering UI refresh after optimistic update');
                window.fetchAndRenderMappings(window.allMappings);
            }
        }
    }

    if (event.data && event.data.type === 'imock-optimistic-cache-update') {
        console.log('🧩 [main.js] Received optimistic cache update from:', event.data.source, event.data.operation, event.data.mapping?.id);
        if (typeof window.updateOptimisticCache === 'function') {
            window.updateOptimisticCache(event.data.mapping, event.data.operation);
        }
    }
});

// Listen for localStorage-based cache refresh triggers (cross-tab communication)
window.addEventListener('storage', (e) => {
    if (e.key === 'imock-cache-refresh-trigger' && e.newValue) {
        console.log('💾 [main.js] Received localStorage cache refresh trigger');
        if (typeof window.refreshImockCache === 'function') {
            window.refreshImockCache().catch(error => {
                console.warn('Failed to refresh cache from localStorage trigger:', error);
            });
        }
    }

    // Handle optimistic updates via localStorage
    if (e.key === 'imock-optimistic-update' && e.newValue) {
        try {
            const data = JSON.parse(e.newValue);
            console.log('🎯 [main.js] Received localStorage optimistic update from:', data.source, 'for mapping:', data.mapping?.id);
            if (data.mapping && typeof window.applyOptimisticMappingUpdate === 'function') {
                window.applyOptimisticMappingUpdate(data.mapping);
                // Trigger UI refresh
                if (typeof window.fetchAndRenderMappings === 'function' && window.allMappings) {
                    console.log('🎯 [main.js] Triggering UI refresh after localStorage optimistic update');
                    window.fetchAndRenderMappings(window.allMappings);
                }
                // Update counter if available
                if (typeof window.updateMappingsCounter === 'function') {
                    window.updateMappingsCounter();
                }
            }
        } catch (error) {
            console.warn('Failed to process optimistic update from localStorage:', error);
        }
    }
});

// Listen for BroadcastChannel cache refresh messages (modern browsers)
if (typeof BroadcastChannel !== 'undefined') {
    try {
        const cacheRefreshChannel = new BroadcastChannel('imock-cache-refresh');
        cacheRefreshChannel.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'cache-refresh') {
                console.log('📡 [main.js] Received BroadcastChannel cache refresh from:', event.data.source);
                if (typeof window.refreshImockCache === 'function') {
                    window.refreshImockCache().catch(error => {
                        console.warn('Failed to refresh cache from BroadcastChannel:', error);
                    });
                }
            }
        });

        // Listen for optimistic mapping updates via BroadcastChannel
        const optimisticUpdateChannel = new BroadcastChannel('imock-optimistic-updates');
        optimisticUpdateChannel.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'optimistic-mapping-update') {
                console.log('🎯 [main.js] Received BroadcastChannel optimistic update from:', event.data.source, event.data.mapping.id);
                if (typeof window.applyOptimisticMappingUpdate === 'function') {
                    window.applyOptimisticMappingUpdate(event.data.mapping);
                    // Also trigger UI refresh to show changes immediately
                    if (typeof window.fetchAndRenderMappings === 'function') {
                        console.log('🎯 [main.js] Triggering UI refresh after BroadcastChannel optimistic update');
                        window.fetchAndRenderMappings(window.allMappings);
                    }
                }
            }
        });
    } catch (error) {
        console.warn('BroadcastChannel setup failed:', error);
    }
}

// Load connection settings into main connection form
function loadConnectionSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem('wiremock-settings') || '{}');

        console.log('🔧 [loadConnectionSettings] Loading settings:', settings);

        // Update main connection form - ONLY set values in form fields
        const hostInput = document.getElementById('wiremock-host');
        const portInput = document.getElementById('wiremock-port');

        if (hostInput && settings.host) {
            hostInput.value = settings.host;
            console.log('🔧 [loadConnectionSettings] Set host input:', settings.host);
        }
        if (portInput && settings.port) {
            portInput.value = settings.port;
            console.log('🔧 [loadConnectionSettings] Set port input:', settings.port);
        }

        // DON'T set window.wiremockBaseUrl here - let connectToWireMock() handle it
        // This prevents overriding user-entered values in the form
        console.log('🔧 [loadConnectionSettings] Form fields updated, URL will be set by connectToWireMock()');

    } catch (error) {
        console.error('Error loading connection settings:', error);
        console.log('🔧 [loadConnectionSettings] Error loading settings, form fields may remain empty');
    }
}