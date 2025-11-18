'use strict';

console.log('✅ All required modules loaded successfully');

// === CENTRALIZED DEFAULT SETTINGS ===
// This is the SINGLE SOURCE OF TRUTH for all default values
window.DEFAULT_SETTINGS = {
    host: 'localhost',
    port: '8080',
    requestTimeout: '69000',
    customHeaders: {},
    customHeadersRaw: '',
    cacheEnabled: true,
    autoRefreshEnabled: false,
    refreshInterval: '0',
    autoConnect: true,
    // Default cache timing settings
    cacheRebuildDelay: '1000',
    cacheValidationDelay: '1500',
    optimisticCacheAgeLimit: '30000',
    cacheCountDiffThreshold: '2',
    backgroundFetchDelay: '200'
};

// Make it available as a module-level constant too for backward compatibility
const DEFAULT_SETTINGS = window.DEFAULT_SETTINGS;

window.customHeaders = { ...(DEFAULT_SETTINGS.customHeaders || {}) };

let autoConnectInitiated = false;

function getStoredSettings() {
    // Try reading using the standard function first
    const fromStandard = Utils.safeCall(window.readWiremockSettings);
    if (fromStandard) {
        return fromStandard;
    }

    // Fallback to direct localStorage read
    try {
        const raw = localStorage.getItem('wiremock-settings');
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        // Try normalizing if function exists
        const normalized = Utils.safeCall(window.normalizeWiremockSettings, parsed);
        if (normalized) {
            return normalized;
        }
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.warn('Failed to parse stored settings, falling back to defaults:', error);
        return {};
    }
}

function parseCustomHeadersInput(rawValue) {
    const trimmed = (rawValue || '').trim();
    if (!trimmed) {
        return { headers: {}, raw: '' };
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Custom headers must be a JSON object.');
        }
        return { headers: parsed, raw: trimmed };
    } catch (jsonError) {
        const lines = trimmed.split(/\n+/);
        const headers = {};
        let valid = true;

        for (const line of lines) {
            if (!line.trim()) continue;
            const separatorIndex = line.indexOf(':');
            if (separatorIndex === -1) {
                valid = false;
                break;
            }
            const key = line.slice(0, separatorIndex).trim();
            const value = line.slice(separatorIndex + 1).trim();
            if (!key) {
                valid = false;
                break;
            }
            headers[key] = value;
        }

        if (valid && Object.keys(headers).length > 0) {
            return { headers, raw: trimmed };
        }

        throw new Error('Custom headers must be valid JSON or "Key: Value" pairs.');
    }
}

function serializeCustomHeaders(settings) {
    if (!settings) return '';
    if (settings.customHeadersRaw) return settings.customHeadersRaw;
    if (settings.customHeaders && typeof settings.customHeaders === 'object' && !Array.isArray(settings.customHeaders)) {
        try {
            return JSON.stringify(settings.customHeaders, null, 2);
        } catch (error) {
            console.warn('Failed to serialize custom headers:', error);
        }
    }
    return '';
}

function shouldAutoConnect(settings) {
    return Boolean(settings && settings.host && settings.port && settings.autoConnect !== false);
}

function showOnboardingOverlay() {
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
        overlay.classList.add('visible');
    });
    if (document.body) {
        document.body.classList.add('onboarding-active');
    }

    const hostField = overlay.querySelector('#onboarding-host');
    if (hostField) {
        hostField.focus();
    }
}

function hideOnboardingOverlay() {
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;

    overlay.classList.remove('visible');
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 220);
    if (document.body) {
        document.body.classList.remove('onboarding-active');
    }
}

function attemptAutoConnect(settings, options = {}) {
    console.log('🔌 [attemptAutoConnect] Called with settings:', settings);
    console.log('🔌 [attemptAutoConnect] Options:', options);
    console.log('🔌 [attemptAutoConnect] shouldAutoConnect:', shouldAutoConnect(settings));
    console.log('🔌 [attemptAutoConnect] autoConnectInitiated:', autoConnectInitiated);

    if (!shouldAutoConnect(settings)) {
        console.log('⚠️ [attemptAutoConnect] Skipping - shouldAutoConnect returned false');
        return;
    }

    if (autoConnectInitiated && !options.force) {
        console.log('⚠️ [attemptAutoConnect] Skipping - already initiated and not forced');
        return;
    }

    autoConnectInitiated = true;
    console.log('✅ [attemptAutoConnect] Proceeding with autoconnect');

    const triggerConnection = () => {
        try {
            console.log('🔌 [attemptAutoConnect] Triggering connection...');
            const result = typeof window.connectToWireMock === 'function' ? window.connectToWireMock() : null;
            if (result && typeof result.catch === 'function') {
                result.catch((error) => {
                    console.error('❌ Auto-connect failed:', error);
                    autoConnectInitiated = false;
                });
            }
        } catch (error) {
            console.error('❌ Auto-connect encountered an error:', error);
            autoConnectInitiated = false;
        }
    };

    if (options.immediate) {
        console.log('🔌 [attemptAutoConnect] Immediate mode - connecting now');
        triggerConnection();
    } else {
        console.log('🔌 [attemptAutoConnect] Delayed mode - connecting in 150ms');
        setTimeout(triggerConnection, 150);
    }
}

function initializeOnboardingFlow() {
    const overlay = document.getElementById('onboarding-overlay');
    const form = document.getElementById('onboarding-form');
    const hostField = document.getElementById('onboarding-host');
    const portField = document.getElementById('onboarding-port');
    const headersField = document.getElementById('onboarding-headers');
    const autoConnectField = document.getElementById('onboarding-auto-connect');

    const settings = getStoredSettings();
    const hasConfiguration = Boolean(settings.host && settings.port);

    console.log('🔧 [initializeOnboardingFlow] Settings:', settings);
    console.log('🔧 [initializeOnboardingFlow] Has configuration:', hasConfiguration);
    console.log('🔧 [initializeOnboardingFlow] autoConnect setting:', settings.autoConnect);

    if (hostField) hostField.value = settings.host || DEFAULT_SETTINGS.host || '';
    if (portField) portField.value = settings.port || DEFAULT_SETTINGS.port || '';
    if (headersField) headersField.value = serializeCustomHeaders(settings);
    if (autoConnectField) autoConnectField.checked = settings.autoConnect !== false;

    if (!hasConfiguration) {
        console.log('⚠️ [initializeOnboardingFlow] No configuration - showing onboarding overlay');
        showOnboardingOverlay();
    } else {
        console.log('✅ [initializeOnboardingFlow] Configuration found - attempting autoconnect');
        attemptAutoConnect(settings);
    }

    if (form) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();

            const hostValue = hostField?.value.trim();
            const portValue = portField?.value.trim();

            if (!hostValue) {
                if (typeof NotificationManager !== 'undefined') {
                    NotificationManager.error('Host is required.');
                }
                hostField?.focus();
                return;
            }

            let customHeaderValues;
            try {
                customHeaderValues = parseCustomHeadersInput(headersField?.value ?? '');
            } catch (error) {
                console.error('Failed to parse onboarding headers:', error);
                if (typeof NotificationManager !== 'undefined') {
                    NotificationManager.error(error.message);
                }
                headersField?.focus();
                return;
            }

            const mergedSettings = {
                ...DEFAULT_SETTINGS,
                ...getStoredSettings(),
                host: hostValue,
                port: portValue || DEFAULT_SETTINGS.port,
                customHeaders: customHeaderValues.headers,
                customHeadersRaw: customHeaderValues.raw,
                autoConnect: autoConnectField ? autoConnectField.checked : DEFAULT_SETTINGS.autoConnect
            };

            localStorage.setItem('wiremock-settings', JSON.stringify(mergedSettings));
            window.customHeaders = { ...(mergedSettings.customHeaders || {}) };

            loadSettings();
            loadConnectionSettings();

            hideOnboardingOverlay();

            if (shouldAutoConnect(mergedSettings)) {
                attemptAutoConnect(mergedSettings, { immediate: true, force: true });
            } else if (typeof NotificationManager !== 'undefined') {
                NotificationManager.info('Connection saved. You can connect from the dashboard when you are ready.');
            }
        }, { once: false });
    }
}

window.initializeOnboardingFlow = initializeOnboardingFlow;
window.attemptAutoConnect = attemptAutoConnect;

// === FUNCTIONS FOR EDITOR INTEGRATION ===
    
window.editMapping = (mappingId) => {
    console.log('🔧 Opening editor for mapping:', mappingId);

    // Get current settings to pass to editor
    const currentSettings = getStoredSettings();
    const settingsParam = encodeURIComponent(JSON.stringify(currentSettings));
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
    const checkClosed = window.LifecycleManager.setInterval(() => {
        if (editorWindow.closed) {
            window.LifecycleManager.clearInterval(checkClosed);
            console.log('🔄 Editor closed, updating counters only');
            // Only update counters, don't refresh data to preserve optimistic updates
            Utils.safeCall(window.updateMappingsCounter);
            Utils.safeCall(window.updateRequestsCounter);
        }
    }, 1000);

    // Safety cleanup: clear interval after 5 minutes to prevent memory leaks
    setTimeout(() => {
        if (!editorWindow.closed) {
            window.LifecycleManager.clearInterval(checkClosed);
            console.log('🔄 Editor interval cleaned up after timeout');
        }
    }, 5 * 60 * 1000); // 5 minutes
};

// === SETTINGS MANAGEMENT ===

function computeSwaggerUiUrl(host, port) {
    const rawHost = (host ?? '').toString().trim();
    const rawPort = (port ?? '').toString().trim();

    if (!rawHost && !rawPort) {
        return null;
    }

    try {
        const baseUrl = (typeof window.normalizeWiremockBaseUrl === 'function')
            ? window.normalizeWiremockBaseUrl(rawHost, rawPort)
            : `http://${rawHost || 'localhost'}:${rawPort || '8080'}/__admin`;

        if (!baseUrl) {
            return null;
        }

        return `${baseUrl.replace(/\/?$/, '')}/swagger-ui/`;
    } catch (error) {
        console.warn('Failed to compute Swagger UI URL:', error);
        return null;
    }
}

window.updateSwaggerUILink = (host, port) => {
    const link = document.getElementById('swagger-ui-link');
    const hint = document.getElementById('swagger-ui-link-hint');

    if (!link) {
        return;
    }

    const currentHost = host ?? document.getElementById('default-host')?.value ?? '';
    const currentPort = port ?? document.getElementById('default-port')?.value ?? '';
    const url = computeSwaggerUiUrl(currentHost, currentPort);

    if (url) {
        link.href = url;
        link.textContent = url;
        link.classList.remove('is-disabled');
        link.removeAttribute('aria-disabled');

        if (hint) {
            hint.textContent = 'Opens the WireMock Admin Swagger UI in a new tab.';
        }
    } else {
        link.removeAttribute('href');
        link.textContent = 'Define host and port to enable Swagger UI link';
        link.classList.add('is-disabled');
        link.setAttribute('aria-disabled', 'true');

        if (hint) {
            hint.textContent = 'We build this link from your saved connection details.';
        }
    }
};

// Save settings from the settings page
window.saveSettings = () => {
    try {
        // Collect settings from settings form (prioritize settings form values)
        const cacheCheckbox = document.getElementById('cache-enabled');
        const autoRefreshCheckbox = document.getElementById('auto-refresh-enabled');
        const autoConnectCheckbox = document.getElementById('auto-connect-enabled');
        const customHeadersInput = document.getElementById('custom-headers');

        let customHeadersResult;
        try {
            customHeadersResult = parseCustomHeadersInput(customHeadersInput?.value ?? '');
        } catch (parseError) {
            console.error('Failed to parse custom headers:', parseError);
            if (typeof NotificationManager !== 'undefined') {
                NotificationManager.error(parseError.message);
            }
            customHeadersInput?.focus();
            return;
        }

        const settings = {
            ...DEFAULT_SETTINGS,
            ...getStoredSettings(),
            host: document.getElementById('default-host')?.value || DEFAULT_SETTINGS.host,
            port: document.getElementById('default-port')?.value || DEFAULT_SETTINGS.port,
            requestTimeout: document.getElementById('request-timeout')?.value || DEFAULT_SETTINGS.requestTimeout,
            cacheEnabled: cacheCheckbox?.checked ?? DEFAULT_SETTINGS.cacheEnabled,
            autoRefreshEnabled: autoRefreshCheckbox?.checked ?? DEFAULT_SETTINGS.autoRefreshEnabled,
            refreshInterval: document.getElementById('refresh-interval')?.value || DEFAULT_SETTINGS.refreshInterval,
            // Cache timing settings
            cacheRebuildDelay: document.getElementById('cache-rebuild-delay')?.value || DEFAULT_SETTINGS.cacheRebuildDelay,
            cacheValidationDelay: document.getElementById('cache-validation-delay')?.value || DEFAULT_SETTINGS.cacheValidationDelay,
            optimisticCacheAgeLimit: document.getElementById('optimistic-cache-age-limit')?.value || DEFAULT_SETTINGS.optimisticCacheAgeLimit,
            cacheCountDiffThreshold: document.getElementById('cache-count-diff-threshold')?.value || DEFAULT_SETTINGS.cacheCountDiffThreshold,
            backgroundFetchDelay: document.getElementById('background-fetch-delay')?.value || DEFAULT_SETTINGS.backgroundFetchDelay,
            autoConnect: autoConnectCheckbox?.checked ?? DEFAULT_SETTINGS.autoConnect,
            customHeaders: customHeadersResult.headers,
            customHeadersRaw: customHeadersResult.raw
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
        window.customHeaders = { ...(settings.customHeaders || {}) };

        // Broadcast settings update to any open editor windows
        broadcastSettingsUpdate(settings);

        NotificationManager.success('Settings saved successfully!');
        console.log('💾 Settings saved:', settings);

        if (typeof window.updateSwaggerUILink === 'function') {
            window.updateSwaggerUILink(settings.host, settings.port);
        }

    } catch (error) {
        console.error('Error saving settings:', error);
        NotificationManager.error('Failed to save settings');
    }
};

// Reset settings to defaults
window.resetSettings = () => {
    if (!confirm('Reset all settings to defaults?')) return;

    try {
        // Cache element references
        const elements = {
            host: document.getElementById('default-host'),
            port: document.getElementById('default-port'),
            timeout: document.getElementById('request-timeout'),
            cacheEnabled: document.getElementById('cache-enabled'),
            autoRefresh: document.getElementById('auto-refresh-enabled'),
            refreshInterval: document.getElementById('refresh-interval'),
            customHeaders: document.getElementById('custom-headers'),
            autoConnect: document.getElementById('auto-connect-enabled')
        };

        // Update form fields
        if (elements.host) elements.host.value = DEFAULT_SETTINGS.host;
        if (elements.port) elements.port.value = DEFAULT_SETTINGS.port;
        if (elements.timeout) elements.timeout.value = DEFAULT_SETTINGS.requestTimeout;
        if (elements.cacheEnabled) elements.cacheEnabled.checked = DEFAULT_SETTINGS.cacheEnabled;
        if (elements.autoRefresh) elements.autoRefresh.checked = DEFAULT_SETTINGS.autoRefreshEnabled;
        if (elements.refreshInterval) elements.refreshInterval.value = DEFAULT_SETTINGS.refreshInterval;
        if (elements.customHeaders) elements.customHeaders.value = DEFAULT_SETTINGS.customHeadersRaw || '';
        if (elements.autoConnect) elements.autoConnect.checked = DEFAULT_SETTINGS.autoConnect;

        // Save defaults
        localStorage.setItem('wiremock-settings', JSON.stringify(DEFAULT_SETTINGS));

        // Update global baseUrl
        window.wiremockBaseUrl = `http://${DEFAULT_SETTINGS.host}:${DEFAULT_SETTINGS.port}/__admin`;

        // Update global auth header
        window.customHeaders = { ...(DEFAULT_SETTINGS.customHeaders || {}) };

        // Broadcast update
        broadcastSettingsUpdate(DEFAULT_SETTINGS);

        if (typeof window.updateSwaggerUILink === 'function') {
            window.updateSwaggerUILink(DEFAULT_SETTINGS.host, DEFAULT_SETTINGS.port);
        }

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
        const settings = getStoredSettings();
        console.log('🔧 [main.js] Loading settings from localStorage:', settings);

        // Cache element references
        const elements = {
            host: document.getElementById('default-host'),
            port: document.getElementById('default-port'),
            timeout: document.getElementById('request-timeout'),
            cacheEnabled: document.getElementById('cache-enabled'),
            autoRefresh: document.getElementById('auto-refresh-enabled'),
            refreshInterval: document.getElementById('refresh-interval'),
            cacheRebuildDelay: document.getElementById('cache-rebuild-delay'),
            cacheValidationDelay: document.getElementById('cache-validation-delay'),
            optimisticCacheAgeLimit: document.getElementById('optimistic-cache-age-limit'),
            cacheCountDiffThreshold: document.getElementById('cache-count-diff-threshold'),
            backgroundFetchDelay: document.getElementById('background-fetch-delay'),
            customHeaders: document.getElementById('custom-headers'),
            autoConnect: document.getElementById('auto-connect-enabled')
        };

        // Load into settings form fields if they exist
        if (elements.host) elements.host.value = settings.host || DEFAULT_SETTINGS.host;
        if (elements.port) elements.port.value = settings.port || DEFAULT_SETTINGS.port;
        if (elements.timeout) elements.timeout.value = settings.requestTimeout || DEFAULT_SETTINGS.requestTimeout;
        if (elements.cacheEnabled) elements.cacheEnabled.checked = settings.cacheEnabled !== undefined ? settings.cacheEnabled : DEFAULT_SETTINGS.cacheEnabled;
        if (elements.autoRefresh) elements.autoRefresh.checked = settings.autoRefreshEnabled !== undefined ? settings.autoRefreshEnabled : DEFAULT_SETTINGS.autoRefreshEnabled;
        if (elements.refreshInterval) elements.refreshInterval.value = settings.refreshInterval || DEFAULT_SETTINGS.refreshInterval;
        // Cache timing settings
        if (elements.cacheRebuildDelay) elements.cacheRebuildDelay.value = settings.cacheRebuildDelay || DEFAULT_SETTINGS.cacheRebuildDelay;
        if (elements.cacheValidationDelay) elements.cacheValidationDelay.value = settings.cacheValidationDelay || DEFAULT_SETTINGS.cacheValidationDelay;
        if (elements.optimisticCacheAgeLimit) elements.optimisticCacheAgeLimit.value = settings.optimisticCacheAgeLimit || DEFAULT_SETTINGS.optimisticCacheAgeLimit;
        if (elements.cacheCountDiffThreshold) elements.cacheCountDiffThreshold.value = settings.cacheCountDiffThreshold || DEFAULT_SETTINGS.cacheCountDiffThreshold;
        if (elements.backgroundFetchDelay) elements.backgroundFetchDelay.value = settings.backgroundFetchDelay || DEFAULT_SETTINGS.backgroundFetchDelay;
        if (elements.customHeaders) elements.customHeaders.value = serializeCustomHeaders(settings);
        if (elements.autoConnect) elements.autoConnect.checked = settings.autoConnect !== false;

        // Update global auth header
        window.customHeaders = (settings.customHeaders && typeof settings.customHeaders === 'object' && !Array.isArray(settings.customHeaders))
            ? { ...settings.customHeaders }
            : { ...(DEFAULT_SETTINGS.customHeaders || {}) };

        console.log('📋 Settings loaded into settings form');

        if (typeof window.updateSwaggerUILink === 'function') {
            window.updateSwaggerUILink(settings.host, settings.port);
        }

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
        console.log('📡 Broadcasting settings update to editor windows');
        
    } catch (error) {
        console.warn('Failed to broadcast settings update:', error);
    }
}

// Initialize default WireMock URL
if (!window.wiremockBaseUrl) {
    window.wiremockBaseUrl = `http://${DEFAULT_SETTINGS.host}:${DEFAULT_SETTINGS.port}/__admin`;
    console.log('🔧 [main.js] Initialized default WireMock URL:', window.wiremockBaseUrl);
}

// Apply default values to HTML form fields from centralized settings
window.applyDefaultsToForm = () => {
    console.log('🔧 [applyDefaultsToForm] Setting form defaults from DEFAULT_SETTINGS');
    
    // Connection settings
    const hostInput = document.getElementById('default-host');
    const portInput = document.getElementById('default-port');
    const timeoutInput = document.getElementById('request-timeout');
    const cacheInput = document.getElementById('cache-enabled');
    const autoRefreshInput = document.getElementById('auto-refresh-enabled');
    const intervalInput = document.getElementById('refresh-interval');
    const customHeadersInput = document.getElementById('custom-headers');
    const autoConnectInput = document.getElementById('auto-connect-enabled');

    if (hostInput && !hostInput.value) hostInput.value = DEFAULT_SETTINGS.host;
    if (portInput && !portInput.value) portInput.value = DEFAULT_SETTINGS.port;
    if (timeoutInput && !timeoutInput.value) timeoutInput.value = DEFAULT_SETTINGS.requestTimeout;
    if (cacheInput) cacheInput.checked = DEFAULT_SETTINGS.cacheEnabled;
    if (autoRefreshInput) autoRefreshInput.checked = DEFAULT_SETTINGS.autoRefreshEnabled;
    if (intervalInput && !intervalInput.value) intervalInput.value = DEFAULT_SETTINGS.refreshInterval;
    if (customHeadersInput && !customHeadersInput.value) customHeadersInput.value = DEFAULT_SETTINGS.customHeadersRaw || '';
    if (autoConnectInput) autoConnectInput.checked = DEFAULT_SETTINGS.autoConnect;

    console.log('🔧 [applyDefaultsToForm] Form defaults applied');
};

// Load settings when page loads
document.addEventListener('DOMContentLoaded', async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));

    // Check if we're on the JSON Editor page - if so, skip main app initialization
    const isEditorPage = window.location.pathname.includes('json-editor.html') ||
                         window.location.search.includes('mappingId=') ||
                         window.location.search.includes('mode=edit') ||
                         window.location.search.includes('mode=create');

    if (isEditorPage) {
        console.log('📝 JSON Editor page detected - skipping main app initialization');
        return; // Exit early, don't initialize main app logic
    }

    if (typeof window.initializeSidebarPreference === 'function') {
        window.initializeSidebarPreference();
    }

    // First apply defaults to empty form fields
    applyDefaultsToForm();

    // Then load saved settings (will override defaults if settings exist)
    loadSettings();
    loadConnectionSettings();

    if (typeof window.updateSwaggerUILink === 'function') {
        window.updateSwaggerUILink();
    }

    const settingsHostInput = document.getElementById('default-host');
    const settingsPortInput = document.getElementById('default-port');

    const updateSwaggerLinkFromInputs = () => {
        if (typeof window.updateSwaggerUILink === 'function') {
            window.updateSwaggerUILink();
        }
    };

    settingsHostInput?.addEventListener('input', updateSwaggerLinkFromInputs);
    settingsPortInput?.addEventListener('input', updateSwaggerLinkFromInputs);
    settingsHostInput?.addEventListener('change', updateSwaggerLinkFromInputs);
    settingsPortInput?.addEventListener('change', updateSwaggerLinkFromInputs);

    // Ensure settings are loaded before any operations
    console.log('🔧 [main.js] Page loaded, defaults applied, settings initialized, ready for user interaction');

    if (typeof window.initializeFilterTabs === 'function') {
        window.initializeFilterTabs();
    }

    // Restore ALL filters from URL first (for all tabs)
    if (typeof window.FilterManager?.restoreFilters === 'function') {
        // Restore mappings filters
        window.FilterManager.restoreFilters('mappings');
        if (typeof window.updateActiveFiltersDisplay === 'function') {
            window.updateActiveFiltersDisplay();
        }

        // Restore requests filters
        window.FilterManager.restoreFilters('requests');
        if (typeof window.updateRequestActiveFiltersDisplay === 'function') {
            window.updateRequestActiveFiltersDisplay();
        }
    }

    // Load saved filters from localStorage
    if (typeof window.loadAllSavedFilters === 'function') {
        window.loadAllSavedFilters();
    }

    // Then restore active tab from URL
    const urlTab = typeof window.getActiveTabFromURL === 'function' ? window.getActiveTabFromURL() : null;
    const validTabs = ['mappings', 'requests', 'scenarios', 'import-export', 'recording', 'settings'];

    if (urlTab && validTabs.includes(urlTab) && typeof window.showPage === 'function') {
        console.log(`🔗 Switching to tab from URL: ${urlTab}`);
        // Call showPage directly - it will find and activate the button itself
        window.showPage(urlTab, document.querySelector(`[onclick*="showPage('${urlTab}')"]`));
    }

    initializeOnboardingFlow();
});

// Handle browser back/forward navigation
window.addEventListener('popstate', () => {
    console.log('⬅️ Browser navigation detected, syncing filters from URL');

    if (typeof window.URLStateManager === 'undefined') {
        return;
    }

    // Get current active tab to determine which filters to sync
    const activeTab = window.TabManager?.getCurrentTab();

    if (activeTab === 'mappings') {
        window.URLStateManager.syncUIFromURL('mappings');
        if (typeof window.FilterManager !== 'undefined') {
            window.FilterManager.flushMappingFilters();
        }
    } else if (activeTab === 'requests') {
        window.URLStateManager.syncUIFromURL('requests');
        if (typeof window.FilterManager !== 'undefined') {
            window.FilterManager.flushRequestFilters();
        }
    }
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

            if (typeof window.updateSwaggerUILink === 'function') {
                window.updateSwaggerUILink(settings.host, settings.port);
            }

            if (settings.customHeaders && typeof settings.customHeaders === 'object' && !Array.isArray(settings.customHeaders)) {
                window.customHeaders = { ...settings.customHeaders };
            } else {
                window.customHeaders = {};
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
        const optimisticUpdateChannel = new BroadcastChannel('imock-optimistic-updates');

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

        // Cleanup BroadcastChannels on page unload
        window.addEventListener('beforeunload', () => {
            cacheRefreshChannel.close();
            optimisticUpdateChannel.close();
        });
    } catch (error) {
        console.warn('BroadcastChannel setup failed:', error);
    }
}

// Load connection settings into main connection form
function loadConnectionSettings() {
    try {
        const settings = getStoredSettings();

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
