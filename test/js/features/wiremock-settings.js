'use strict';

const migrateLegacyWiremockSettings = (rawSettings) => {
    if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
        return {};
    }

    const normalized = { ...rawSettings };
    const customHeaders = window.ensureCustomHeaderObject(normalized.customHeaders);

    if (typeof normalized.authHeader === 'string' && normalized.authHeader.trim()) {
        const authValue = normalized.authHeader.trim();
        if (!Object.prototype.hasOwnProperty.call(customHeaders, 'Authorization')) {
            customHeaders.Authorization = authValue;
        }
        delete normalized.authHeader;
        if (!normalized.customHeadersRaw || typeof normalized.customHeadersRaw !== 'string' || !normalized.customHeadersRaw.trim()) {
            try {
                normalized.customHeadersRaw = JSON.stringify(customHeaders, null, 2);
            } catch (error) {
                Logger.warn('API', 'Failed to serialize migrated custom headers:', error);
                normalized.customHeadersRaw = '';
            }
        }
    }

    normalized.customHeaders = customHeaders;

    if (typeof normalized.customHeadersRaw !== 'string') {
        normalized.customHeadersRaw = '';
    }

    normalized.autoConnect = normalized.autoConnect !== false;
    return normalized;
};

window.ensureCustomHeaderObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.keys(value).reduce((acc, key) => {
        const normalizedKey = String(key).trim();
        if (!normalizedKey) {
            return acc;
        }
        acc[normalizedKey] = value[key];
        return acc;
    }, {});
};

window.normalizeWiremockSettings = (settings) => migrateLegacyWiremockSettings(settings);

window.readWiremockSettings = () => {
    try {
        const raw = localStorage.getItem('wiremock-settings');
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        return migrateLegacyWiremockSettings(parsed);
    } catch (error) {
        Logger.warn('UI', 'Failed to read stored settings, returning empty object:', error);
        return {};
    }
};

window.buildScenarioStateEndpoint = (scenarioName) => {
    const rawName = typeof scenarioName === 'string' ? scenarioName : '';
    if (!rawName.trim()) {
        return '';
    }

    return `${ENDPOINTS.SCENARIOS}/${encodeURIComponent(rawName)}/state`;
};

window.normalizeWiremockBaseUrl = (hostInput, portInput) => {
    let rawHost = (hostInput || '').trim() || 'localhost';
    let port = (portInput || '').trim();
    let scheme = 'http', hostname = '';
    try {
        const url = new URL(rawHost.includes('://') ? rawHost : `http://${rawHost}`);
        scheme = url.protocol.replace(':', '') || 'http';
        hostname = url.hostname;
        port ||= url.port;
    } catch (_ignoredError) {
        const m = rawHost.match(/^([^:/]+)(?::(\d+))?$/);
        hostname = m ? m[1] : rawHost;
        port ||= m?.[2];
    }
    return `${scheme}://${hostname || 'localhost'}:${port || (scheme === 'https' ? '443' : '8080')}/__admin`;
};
