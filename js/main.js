'use strict';

console.log('[OK] All required modules loaded successfully');

// === CENTRALIZED DEFAULT SETTINGS ===
// This is the SINGLE SOURCE OF TRUTH for all default values
window.DEFAULT_SETTINGS = {
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

// Make it available as a module-level constant too for backward compatibility
const DEFAULT_SETTINGS = window.DEFAULT_SETTINGS;

// === FUNCTIONS FOR EDITOR INTEGRATION ===
    
window.editMapping = (mappingId) => {
    console.log('[SETUP] Opening editor for mapping:', mappingId);

    // Get current settings to pass to editor
    const currentSettings = window.SettingsStore?.getCached?.() || {};

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
    const checkClosed = window.setInterval(() => {
        if (editorWindow.closed) {
            clearInterval(checkClosed);
            window.ResourceCleaner?.intervals?.delete?.(checkClosed);
            console.log('[REFRESH] Editor closed, updating counters only');
            // Only update counters, don't refresh data to preserve optimistic updates
            if (typeof window.updateMappingsCounter === 'function') {
                window.updateMappingsCounter();
            }
            if (typeof window.updateRequestsCounter === 'function') {
                window.updateRequestsCounter();
            }
        }
    }, 1000);
    window.ResourceCleaner?.trackInterval?.(checkClosed);

    // Safety cleanup: clear interval after 5 minutes to prevent memory leaks
    const timeoutHandle = window.setTimeout(() => {
        if (!editorWindow.closed) {
            clearInterval(checkClosed);
            console.log('[REFRESH] Editor interval cleaned up after timeout');
        }
        window.ResourceCleaner?.intervals?.delete?.(checkClosed);
        window.ResourceCleaner?.timeouts?.delete?.(timeoutHandle);
    }, 5 * 60 * 1000); // 5 minutes
    window.ResourceCleaner?.trackTimeout?.(timeoutHandle);
};

// === SETTINGS MANAGEMENT ===

// Save settings from the settings page
window.saveSettings = async () => {
    try {
        // Collect settings from settings form (prioritize settings form values)
        const cacheCheckbox = document.getElementById('cache-enabled');
        const autoRefreshCheckbox = document.getElementById('auto-refresh-enabled');

        const settings = {
            host: document.getElementById('default-host')?.value || DEFAULT_SETTINGS.host,
            port: document.getElementById('default-port')?.value || DEFAULT_SETTINGS.port,
            requestTimeout: document.getElementById('request-timeout')?.value || DEFAULT_SETTINGS.requestTimeout,
            authHeader: document.getElementById('auth-header')?.value || DEFAULT_SETTINGS.authHeader,
            cacheEnabled: cacheCheckbox?.checked ?? DEFAULT_SETTINGS.cacheEnabled,
            autoRefreshEnabled: autoRefreshCheckbox?.checked ?? DEFAULT_SETTINGS.autoRefreshEnabled,
            refreshInterval: document.getElementById('refresh-interval')?.value || DEFAULT_SETTINGS.refreshInterval,
            // Cache timing settings
            cacheRebuildDelay: document.getElementById('cache-rebuild-delay')?.value || DEFAULT_SETTINGS.cacheRebuildDelay,
            cacheValidationDelay: document.getElementById('cache-validation-delay')?.value || DEFAULT_SETTINGS.cacheValidationDelay,
            optimisticCacheAgeLimit: document.getElementById('optimistic-cache-age-limit')?.value || DEFAULT_SETTINGS.optimisticCacheAgeLimit,
            cacheCountDiffThreshold: document.getElementById('cache-count-diff-threshold')?.value || DEFAULT_SETTINGS.cacheCountDiffThreshold,
            backgroundFetchDelay: document.getElementById('background-fetch-delay')?.value || DEFAULT_SETTINGS.backgroundFetchDelay
        };
        
        // Also update the main connection form to reflect the saved settings
        const hostInput = document.getElementById('wiremock-host');
        const portInput = document.getElementById('wiremock-port');
        if (hostInput) hostInput.value = settings.host;
        if (portInput) portInput.value = settings.port;
        
        // Persist securely
        if (window.SettingsStore && typeof window.SettingsStore.save === 'function') {
            await window.SettingsStore.save(settings);
        } else {
            console.warn('[main.js] SettingsStore unavailable; settings were not persisted.');
        }
        console.log('[SETUP] [main.js] Settings persisted:', settings);
        console.log('[SETUP] [main.js] Request timeout field value:', document.getElementById('request-timeout')?.value);

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
        console.log('[SAVE] Settings saved:', settings);
        
    } catch (error) {
        console.error('Error saving settings:', error);
        NotificationManager.error('Failed to save settings');
    }
};

// Reset settings to defaults
window.resetSettings = async () => {
    if (!confirm('Reset all settings to defaults?')) return;

    try {
        // Update form fields
        if (document.getElementById('default-host')) document.getElementById('default-host').value = DEFAULT_SETTINGS.host;
        if (document.getElementById('default-port')) document.getElementById('default-port').value = DEFAULT_SETTINGS.port;
        if (document.getElementById('request-timeout')) document.getElementById('request-timeout').value = DEFAULT_SETTINGS.requestTimeout;
        if (document.getElementById('auth-header')) document.getElementById('auth-header').value = DEFAULT_SETTINGS.authHeader;
        if (document.getElementById('cache-enabled')) document.getElementById('cache-enabled').checked = DEFAULT_SETTINGS.cacheEnabled;
        if (document.getElementById('auto-refresh-enabled')) document.getElementById('auto-refresh-enabled').checked = DEFAULT_SETTINGS.autoRefreshEnabled;
        if (document.getElementById('refresh-interval')) document.getElementById('refresh-interval').value = DEFAULT_SETTINGS.refreshInterval;

        // Save defaults
        if (window.SettingsStore && typeof window.SettingsStore.save === 'function') {
            await window.SettingsStore.save(DEFAULT_SETTINGS);
        } else {
            console.warn('[main.js] SettingsStore unavailable; defaults were not persisted.');
        }

        // Update global baseUrl
        window.wiremockBaseUrl = `http://${DEFAULT_SETTINGS.host}:${DEFAULT_SETTINGS.port}/__admin`;

        // Update global auth header
        window.authHeader = DEFAULT_SETTINGS.authHeader || '';

        // Broadcast update
        broadcastSettingsUpdate(DEFAULT_SETTINGS);
        
        NotificationManager.success('Settings reset to defaults!');
        console.log('[REFRESH] Settings reset to defaults');
        
    } catch (error) {
        console.error('Error resetting settings:', error);
        NotificationManager.error('Failed to reset settings');
    }
};

// Load settings into form fields
window.loadSettings = async () => {
    try {
        let settings = {};
        if (window.SettingsStore && typeof window.SettingsStore.load === 'function') {
            settings = await window.SettingsStore.load();
        } else {
            console.warn('[main.js] SettingsStore unavailable; using defaults.');
            settings = { ...DEFAULT_SETTINGS };
        }
        console.log('[SETUP] [main.js] Loading settings from storage:', settings);

        // Load into settings form fields if they exist
        if (document.getElementById('default-host')) document.getElementById('default-host').value = settings.host || DEFAULT_SETTINGS.host;
        if (document.getElementById('default-port')) document.getElementById('default-port').value = settings.port || DEFAULT_SETTINGS.port;
        if (document.getElementById('request-timeout')) document.getElementById('request-timeout').value = settings.requestTimeout || DEFAULT_SETTINGS.requestTimeout;
        if (document.getElementById('auth-header')) document.getElementById('auth-header').value = settings.authHeader || DEFAULT_SETTINGS.authHeader;
        if (document.getElementById('cache-enabled')) document.getElementById('cache-enabled').checked = settings.cacheEnabled !== undefined ? settings.cacheEnabled : DEFAULT_SETTINGS.cacheEnabled;
        if (document.getElementById('auto-refresh-enabled')) document.getElementById('auto-refresh-enabled').checked = settings.autoRefreshEnabled !== undefined ? settings.autoRefreshEnabled : DEFAULT_SETTINGS.autoRefreshEnabled;
        if (document.getElementById('refresh-interval')) document.getElementById('refresh-interval').value = settings.refreshInterval || DEFAULT_SETTINGS.refreshInterval;
        // Cache timing settings
        if (document.getElementById('cache-rebuild-delay')) document.getElementById('cache-rebuild-delay').value = settings.cacheRebuildDelay || DEFAULT_SETTINGS.cacheRebuildDelay;
        if (document.getElementById('cache-validation-delay')) document.getElementById('cache-validation-delay').value = settings.cacheValidationDelay || DEFAULT_SETTINGS.cacheValidationDelay;
        if (document.getElementById('optimistic-cache-age-limit')) document.getElementById('optimistic-cache-age-limit').value = settings.optimisticCacheAgeLimit || DEFAULT_SETTINGS.optimisticCacheAgeLimit;
        if (document.getElementById('cache-count-diff-threshold')) document.getElementById('cache-count-diff-threshold').value = settings.cacheCountDiffThreshold || DEFAULT_SETTINGS.cacheCountDiffThreshold;
        if (document.getElementById('background-fetch-delay')) document.getElementById('background-fetch-delay').value = settings.backgroundFetchDelay || DEFAULT_SETTINGS.backgroundFetchDelay;

        // Update global auth header
        window.authHeader = settings.authHeader || DEFAULT_SETTINGS.authHeader;

        console.log('[CLIPBOARD] Settings loaded into settings form');

        if (typeof window.updateRecorderLink === 'function') {
            try {
                window.updateRecorderLink(settings.host, settings.port);
            } catch (linkError) {
                console.warn('Failed to update recorder link:', linkError);
            }
        }

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
        console.log('[RADIO] Broadcasting settings update to editor windows');
        
    } catch (error) {
        console.warn('Failed to broadcast settings update:', error);
    }
}

// Initialize default WireMock URL
if (!window.wiremockBaseUrl) {
    window.wiremockBaseUrl = `http://${DEFAULT_SETTINGS.host}:${DEFAULT_SETTINGS.port}/__admin`;
    console.log('[SETUP] [main.js] Initialized default WireMock URL:', window.wiremockBaseUrl);
}

// Apply default values to HTML form fields from centralized settings
window.applyDefaultsToForm = () => {
    console.log('[SETUP] [applyDefaultsToForm] Setting form defaults from DEFAULT_SETTINGS');
    
    // Connection settings
    const hostInput = document.getElementById('default-host');
    const portInput = document.getElementById('default-port');
    const timeoutInput = document.getElementById('request-timeout');
    const authInput = document.getElementById('auth-header');
    const cacheInput = document.getElementById('cache-enabled');
    const autoRefreshInput = document.getElementById('auto-refresh-enabled');
    const intervalInput = document.getElementById('refresh-interval');
    
    if (hostInput && !hostInput.value) hostInput.value = DEFAULT_SETTINGS.host;
    if (portInput && !portInput.value) portInput.value = DEFAULT_SETTINGS.port;
    if (timeoutInput && !timeoutInput.value) timeoutInput.value = DEFAULT_SETTINGS.requestTimeout;
    if (authInput && !authInput.value) authInput.value = DEFAULT_SETTINGS.authHeader;
    if (cacheInput) cacheInput.checked = DEFAULT_SETTINGS.cacheEnabled;
    if (autoRefreshInput) autoRefreshInput.checked = DEFAULT_SETTINGS.autoRefreshEnabled;
    if (intervalInput && !intervalInput.value) intervalInput.value = DEFAULT_SETTINGS.refreshInterval;
    
    console.log('[SETUP] [applyDefaultsToForm] Form defaults applied');
};

// Load settings when page loads
document.addEventListener('DOMContentLoaded', async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    // First apply defaults to empty form fields
    applyDefaultsToForm();
    
    // Then load saved settings (will override defaults if settings exist)
    await loadSettings();
    await loadConnectionSettings();
    
    // Ensure settings are loaded before any operations
    console.log('[SETUP] [main.js] Page loaded, defaults applied, settings initialized, ready for user interaction');
});

// Listen for settings changes from editor windows or other sources
window.addEventListener('storage', (e) => {
    if (e.key === 'wiremock-settings') {
        const handleSettingsUpdate = (settings) => {
            if (!settings) return;
            console.log('[SETUP] [main.js] Settings updated from external source:', settings);

            const hostInput = document.getElementById('wiremock-host');
            const portInput = document.getElementById('wiremock-port');
            if (hostInput && settings.host) {
                hostInput.value = settings.host;
            }
            if (portInput && settings.port) {
                portInput.value = settings.port;
            }

            if (settings.host && settings.port) {
                if (typeof window.normalizeWiremockBaseUrl === 'function') {
                    window.wiremockBaseUrl = window.normalizeWiremockBaseUrl(settings.host, settings.port);
                } else {
                    window.wiremockBaseUrl = `http://${settings.host}:${settings.port}/__admin`;
                }
                console.log('[SETUP] [main.js] URL updated from settings change:', window.wiremockBaseUrl);
            }
        };

        if (window.SettingsStore && typeof window.SettingsStore.load === 'function') {
            window.SettingsStore.load().then(handleSettingsUpdate).catch(error => {
                console.error('[SETUP] [main.js] Error processing settings update:', error);
            });
        } else if (e.newValue) {
            try {
                handleSettingsUpdate(JSON.parse(e.newValue));
            } catch (error) {
                console.error('[SETUP] [main.js] Error processing settings update:', error);
            }
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
        console.log('[MAIL] [main.js] Received cache refresh request from:', event.data.source);
        if (typeof window.refreshImockCache === 'function') {
            window.refreshImockCache().catch(error => {
                console.warn('Failed to refresh cache from message:', error);
            });
        }
    }

    if (event.data && event.data.type === 'imock-optimistic-mapping-update') {
        console.log('[TARGET] [main.js] Received optimistic mapping update from:', event.data.source, event.data.mapping.id);
        if (typeof window.applyOptimisticMappingUpdate === 'function') {
            window.applyOptimisticMappingUpdate(event.data.mapping);
            // Also trigger UI refresh to show changes immediately
            if (typeof window.fetchAndRenderMappings === 'function') {
                console.log('[TARGET] [main.js] Triggering UI refresh after optimistic update');
                window.fetchAndRenderMappings(window.allMappings);
            }
        }
    }

    if (event.data && event.data.type === 'imock-optimistic-cache-update') {
        console.log('[CACHE] [main.js] Received optimistic cache update from:', event.data.source, event.data.operation, event.data.mapping?.id);
        if (typeof window.updateOptimisticCache === 'function') {
            window.updateOptimisticCache(event.data.mapping, event.data.operation);
        }
    }
});

// Listen for localStorage-based cache refresh triggers (cross-tab communication)
window.addEventListener('storage', (e) => {
    if (e.key === 'imock-cache-refresh-trigger' && e.newValue) {
        console.log('[SAVE] [main.js] Received localStorage cache refresh trigger');
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
            console.log('[TARGET] [main.js] Received localStorage optimistic update from:', data.source, 'for mapping:', data.mapping?.id);
            if (data.mapping && typeof window.applyOptimisticMappingUpdate === 'function') {
                window.applyOptimisticMappingUpdate(data.mapping);
                // Trigger UI refresh
                if (typeof window.fetchAndRenderMappings === 'function' && window.allMappings) {
                    console.log('[TARGET] [main.js] Triggering UI refresh after localStorage optimistic update');
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
                console.log('[RADIO] [main.js] Received BroadcastChannel cache refresh from:', event.data.source);
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
                console.log('[TARGET] [main.js] Received BroadcastChannel optimistic update from:', event.data.source, event.data.mapping.id);
                if (typeof window.applyOptimisticMappingUpdate === 'function') {
                    window.applyOptimisticMappingUpdate(event.data.mapping);
                    // Also trigger UI refresh to show changes immediately
                    if (typeof window.fetchAndRenderMappings === 'function') {
                        console.log('[TARGET] [main.js] Triggering UI refresh after BroadcastChannel optimistic update');
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
async function loadConnectionSettings() {
    try {
        let settings = {};
        if (window.SettingsStore && typeof window.SettingsStore.load === 'function') {
            settings = await window.SettingsStore.load();
        } else {
            console.warn('[loadConnectionSettings] SettingsStore unavailable; using defaults.');
            settings = { ...DEFAULT_SETTINGS };
        }

        console.log('[SETUP] [loadConnectionSettings] Loading settings:', settings);

        // Update main connection form - ONLY set values in form fields
        const hostInput = document.getElementById('wiremock-host');
        const portInput = document.getElementById('wiremock-port');

        if (hostInput && settings.host) {
            hostInput.value = settings.host;
            console.log('[SETUP] [loadConnectionSettings] Set host input:', settings.host);
        }
        if (portInput && settings.port) {
            portInput.value = settings.port;
            console.log('[SETUP] [loadConnectionSettings] Set port input:', settings.port);
        }

        // DON'T set window.wiremockBaseUrl here - let connectToWireMock() handle it
        // This prevents overriding user-entered values in the form
        console.log('[SETUP] [loadConnectionSettings] Form fields updated, URL will be set by connectToWireMock()');

    } catch (error) {
        console.error('Error loading connection settings:', error);
        console.log('[SETUP] [loadConnectionSettings] Error loading settings, form fields may remain empty');
    }
}