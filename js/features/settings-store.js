'use strict';

(function initialiseSettingsStore() {
    if (window.SettingsStore) {
        return;
    }

    const getStoredSettings = () => {
        const fromStandard = window.Utils?.safeCall?.(window.readWiremockSettings);
        if (fromStandard) {
            return fromStandard;
        }

        try {
            const raw = localStorage.getItem('wiremock-settings');
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw);
            const normalized = window.Utils?.safeCall?.(window.normalizeWiremockSettings, parsed);
            if (normalized) {
                return normalized;
            }
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            Logger.warn('UI', 'Failed to parse stored settings, falling back to defaults:', error);
            return {};
        }
    };

    const parseCustomHeadersInput = (rawValue) => {
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
    };

    const serializeCustomHeaders = (settings) => {
        if (!settings) return '';
        if (settings.customHeadersRaw) return settings.customHeadersRaw;
        if (settings.customHeaders && typeof settings.customHeaders === 'object' && !Array.isArray(settings.customHeaders)) {
            try {
                return JSON.stringify(settings.customHeaders, null, 2);
            } catch (error) {
                Logger.warn('UI', 'Failed to serialize custom headers:', error);
            }
        }
        return '';
    };

    const shouldAutoConnect = (settings) => Boolean(settings && settings.host && settings.port && settings.autoConnect !== false);

    window.SettingsStore = {
        getStoredSettings,
        parseCustomHeadersInput,
        serializeCustomHeaders,
        shouldAutoConnect,
    };
})();
