'use strict';

(function bootstrapFeatures(global) {
    let initialized = false;

    function runWithState(state) {
        if (initialized) {
            return true;
        }
        if (!state) {
            return false;
        }
        initialized = true;
        const window = global;
        const featureState = state;

        // ===== FEATURES.JS - Business logic =====
        // === Module coordination ===

        const {
            markDemoModeActive
        } = featureState;

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
                window.LifecycleManager.clearInterval(window.uptimeInterval);
                window.uptimeInterval = null;
            }
            window.startTime = null;
            const uptimeElement = document.getElementById('uptime');
            if (uptimeElement) {
                uptimeElement.textContent = '0s';
            }
        };

        // --- COMPACT UTILITIES (trimmed from ~80 to 20 lines) ---

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
                    Logger.info('FEATURES', 'Updated WireMock URL from form:', window.wiremockBaseUrl);
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
                if (typeof window.readWiremockSettings === 'function') {
                    window.readWiremockSettings();
                }
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

        const demoLoader = window.DemoMode && typeof window.DemoMode.createLoader === 'function'
            ? window.DemoMode.createLoader({
                markDemoModeActive,
                notificationManager: NotificationManager,
                fetchAndRenderMappings,
                fetchAndRenderRequests,
                isDatasetAvailable: () => window.DemoData?.isAvailable?.(),
                getDataset: () => window.DemoData?.getDataset?.(),
            })
            : null;

        // Missing HTML onclick functions
        window.loadMockData = async () => {
            if (!demoLoader) {
                NotificationManager.error('Demo mode is not available in this build.');
                return {
                    status: 'unavailable',
                    mappingsLoaded: false,
                    requestsLoaded: false,
                    errors: [],
                };
            }

            window.demoModeLastError = null;
            const result = await demoLoader();

            if (result && result.status !== 'success') {
                const [firstError] = Array.isArray(result.errors) ? result.errors : [];
                window.demoModeLastError = firstError || result.status;
            }

            window.demoModeLastResult = result;
            return result;
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
                Logger.warn('FEATURES', 'Import file elements not found.');
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
                    normalizedHost = `http://${normalizedHost}`;
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
                Logger.warn('FEATURES', 'Failed to update recorder link:', error);
            }
        };

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
            } else if (clone.mappings && typeof clone.mappings === 'object') {
                if (Array.isArray(clone.mappings.mappings)) {
                    payload.mappings = clone.mappings.mappings;
                } else if (Array.isArray(clone.mappings.items)) {
                    payload.mappings = clone.mappings.items;
                } else {
                    const objectValues = Object.values(clone.mappings).filter(Boolean);
                    const inferredMappings = objectValues.filter((entry) => typeof entry === 'object' && (entry.request || entry.response));
                    if (inferredMappings.length > 0) {
                        payload.mappings = inferredMappings;
                    }
                }
                if (!payload.mappings && (clone.mappings.request || clone.mappings.response)) {
                    payload.mappings = [clone.mappings];
                }
            } else if (clone.mappings) {
                payload.mappings = [clone.mappings];
            } else if (Array.isArray(clone.mapping)) {
                payload.mappings = clone.mapping;
            } else if (clone.mapping) {
                payload.mappings = [clone.mapping];
            } else if (Array.isArray(clone.stubs)) {
                payload.mappings = clone.stubs;
            } else if (clone.stubs && typeof clone.stubs === 'object') {
                payload.mappings = Object.values(clone.stubs).filter(Boolean);
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

                // Rebuild cache and refresh UI after import
                // This follows the same pattern as forceRefreshCache for consistency
                try {
                    // Rebuild the cache from server to include newly imported mappings
                    if (typeof window.refreshImockCache === 'function') {
                        await window.refreshImockCache();
                    }
                    
                    // Then refresh the UI with fresh data (bypass cache to ensure consistency)
                    await fetchAndRenderMappings(null, { useCache: false });
                } catch (refreshError) {
                    Logger.warn('FEATURES', 'Failed to refresh mappings after import:', refreshError);
                }
                setStatusMessage(SELECTORS.IMPORT.RESULT, 'success', `Imported ${payload.mappings.length} mapping(s) using mode ${mode}.`);
            } catch (error) {
                Logger.error('FEATURES', 'Import failed:', error);
                setStatusMessage(SELECTORS.IMPORT.RESULT, 'error', error.message || 'Import failed.');
                NotificationManager.error(`Import failed: ${error.message}`);
                throw error;
            } finally {
                toggleImportButtonState(false);
            }
        }

        window.executeImport = executeImport;

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
                    if (!window.jsyaml?.dump) {
                        throw new Error('YAML serializer is not available.');
                    }
                    const yamlContent = window.jsyaml.dump({ mappings }, { noRefs: true });
                    downloadFile(`${baseName}.yaml`, yamlContent.endsWith('\n') ? yamlContent : `${yamlContent}\n`, 'text/yaml');
                } else {
                    const jsonContent = JSON.stringify({ mappings }, null, 2);
                    downloadFile(`${baseName}.json`, `${jsonContent}\n`, 'application/json');
                }

                setStatusMessage(SELECTORS.EXPORT.RESULT, 'success', `Exported ${mappings.length} mapping(s) as ${format.toUpperCase()}.`);
                NotificationManager.success(`Exported ${mappings.length} mapping(s).`);
            } catch (error) {
                Logger.error('FEATURES', 'Export mappings failed:', error);
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
                    if (!window.jsyaml?.dump) {
                        throw new Error('YAML serializer is not available.');
                    }
                    const yamlContent = window.jsyaml.dump({ requests }, { noRefs: true });
                    downloadFile(`${baseName}.yaml`, yamlContent.endsWith('\n') ? yamlContent : `${yamlContent}\n`, 'text/yaml');
                } else {
                    const jsonContent = JSON.stringify({ requests }, null, 2);
                    downloadFile(`${baseName}.json`, `${jsonContent}\n`, 'application/json');
                }

                setStatusMessage(SELECTORS.EXPORT.RESULT, 'success', `Exported ${requests.length} request(s) as ${format.toUpperCase()}.`);
                NotificationManager.success(`Exported ${requests.length} request(s).`);
            } catch (error) {
                Logger.error('FEATURES', 'Export requests failed:', error);
                setStatusMessage(SELECTORS.EXPORT.RESULT, 'error', error.message || 'Failed to export request log.');
                NotificationManager.error(`Failed to export request log: ${error.message}`);
            }
        };

        // === IMPORT/EXPORT FUNCTIONS (Placeholders) ===

        return true;
    }

    if (!runWithState(global.FeaturesState)) {
        let intervalId = null;

        const attemptInit = (event) => {
            const state = (event && event.detail && event.detail.state) || global.FeaturesState;
            if (runWithState(state)) {
                if (typeof global.removeEventListener === 'function') {
                    global.removeEventListener('features:state-ready', attemptInit);
                }
                if (intervalId !== null) {
                    global.clearInterval(intervalId);
                    intervalId = null;
                }
                return true;
            }
            return false;
        };

        if (typeof global.addEventListener === 'function') {
            global.addEventListener('features:state-ready', attemptInit);
        }

        if (typeof global.setInterval === 'function') {
            let attempts = 0;
            intervalId = global.setInterval(() => {
                attempts += 1;
                if (attemptInit()) {
                    return;
                }
                if (attempts >= 200) {
                    global.clearInterval(intervalId);
                    intervalId = null;
                    if (!initialized) {
                        Logger.error('FEATURES', 'features.js could not find FeaturesState after waiting for 10 seconds.');
                    }
                }
            }, 50);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
