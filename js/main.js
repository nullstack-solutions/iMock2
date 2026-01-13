'use strict';

(function(global) {
    const window = global;

    window.DEFAULT_SETTINGS = {
        host: 'localhost',
        port: '8080',
        requestTimeout: '60000',
        customHeaders: {},
        cacheEnabled: true,
        autoRefreshEnabled: false,
        autoConnect: true
    };

    function getSettings() {
        const saved = localStorage.getItem('wiremock-settings');
        return saved ? { ...window.DEFAULT_SETTINGS, ...JSON.parse(saved) } : window.DEFAULT_SETTINGS;
    }

    window.attemptAutoConnect = async function(force = false) {
        const settings = getSettings();
        if (!force && !settings.autoConnect) return;

        if (typeof window.connectToWireMock === 'function') {
            try {
                await window.connectToWireMock(window.normalizeWiremockBaseUrl(settings.host, settings.port));
            } catch (e) {
                console.warn('Auto-connect failed', e);
            }
        }
    };

    function initOnboarding() {
        const settings = getSettings();
        const hasConfig = Boolean(settings.host && settings.port);
        
        if (!hasConfig) {
            window.showModal('onboarding-overlay');
        } else {
            window.attemptAutoConnect();
        }

        const form = document.getElementById('onboarding-form');
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                const host = document.getElementById('onboarding-host')?.value;
                const port = document.getElementById('onboarding-port')?.value;
                
                const newSettings = { ...settings, host, port };
                localStorage.setItem('wiremock-settings', JSON.stringify(newSettings));
                
                window.hideModal('onboarding-overlay');
                window.attemptAutoConnect(true);
            };
        }
    }

    window.saveSettings = function() {
        const settings = {
            host: document.getElementById('default-host')?.value,
            port: document.getElementById('default-port')?.value,
            requestTimeout: document.getElementById('request-timeout')?.value,
            cacheEnabled: document.getElementById('cache-enabled')?.checked,
            autoConnect: document.getElementById('auto-connect-enabled')?.checked
        };

        localStorage.setItem('wiremock-settings', JSON.stringify(settings));
        NotificationManager.success('Settings saved');
        
        // Update URL
        window.wiremockBaseUrl = window.normalizeWiremockBaseUrl(settings.host, settings.port);
    };

    window.editMapping = (id) => {
        const settings = encodeURIComponent(JSON.stringify(getSettings()));
        const url = `editor/json-editor.html?mappingId=${id}&mode=edit&settings=${settings}`;
        window.open(url, `editor_${id}`, 'width=1200,height=800');
    };

    // App Initialization
    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.pathname.includes('json-editor.html')) return;

        // Apply UI defaults
        const settings = getSettings();
        const mappingHost = document.getElementById('wiremock-host');
        if (mappingHost) mappingHost.value = settings.host;
        
        const settingsHost = document.getElementById('default-host');
        if (settingsHost) settingsHost.value = settings.host;

        // Initialize flows
        initOnboarding();
        
        if (window.EventDelegation) window.EventDelegation.init();
        if (window.loadAllSavedFilters) window.loadAllSavedFilters();
        
        console.log('🚀 iMock2 Initialized');
    });

})(typeof window !== 'undefined' ? window : globalThis);