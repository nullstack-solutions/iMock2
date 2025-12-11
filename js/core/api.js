'use strict';

/**
 * API Module
 * Provides enhanced API client with error handling and user-friendly error messages
 */

/**
 * Helper to ensure custom headers object is properly formatted
 * @param {*} value - The value to normalize
 * @returns {Object} Normalized headers object
 */
const ensureCustomHeaderObject = (value) => {
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

/**
 * Migrate legacy settings to new format
 * @param {Object} rawSettings - Raw settings object
 * @returns {Object} Migrated settings
 */
const migrateLegacySettings = (rawSettings) => {
    if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
        return {};
    }

    const normalized = { ...rawSettings };
    const customHeaders = ensureCustomHeaderObject(normalized.customHeaders);

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
                Logger.warn('SETTINGS', 'Failed to serialize migrated custom headers:', error);
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

/**
 * Enhanced API Client with better error handling and retry logic
 */
class ApiClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || '';
        this.defaultTimeout = options.timeout || window.DEFAULTS?.REQUEST_TIMEOUT || 69000;
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.lastSuccessTime = null;
    }

    /**
     * Build full URL for API endpoint
     * @param {string} endpoint - The API endpoint
     * @returns {string} Full URL
     */
    buildUrl(endpoint) {
        return `${this.baseUrl}${endpoint}`;
    }

    /**
     * Get current timeout setting
     * @returns {number} Timeout in milliseconds
     */
    getCurrentTimeout() {
        const settings = Utils.safeCall(window.readWiremockSettings) || {};
        return settings.requestTimeout ? parseInt(settings.requestTimeout) : this.defaultTimeout;
    }

    /**
     * Get current custom headers
     * @returns {Object} Custom headers object
     */
    getCurrentHeaders() {
        const settings = Utils.safeCall(window.readWiremockSettings) || {};
        return {
            ...this.defaultHeaders,
            ...ensureCustomHeaderObject(settings.customHeaders || window.customHeaders)
        };
    }

    /**
     * Determine if logging should be verbose for this endpoint
     * @param {string} endpoint - The API endpoint
     * @returns {boolean} Whether to use verbose logging
     */
    shouldUseVerboseLogging(endpoint) {
        // Reduce logging verbosity for periodic endpoints to prevent memory leaks
        const isPeriodicEndpoint = endpoint === window.ENDPOINTS?.HEALTH || endpoint === window.ENDPOINTS?.MAPPINGS;
        return !isPeriodicEndpoint;
    }

    /**
     * Update last success time and UI
     */
    updateLastSuccess() {
        this.lastSuccessTime = Date.now();
        try {
            window.lastWiremockSuccess = this.lastSuccessTime;
            Utils.safeCall(window.updateLastSuccessUI);
        } catch (_) {
            // Ignore UI update errors
        }
    }

    /**
     * Execute HTTP request with timeout and retry logic
     * @param {string} endpoint - The API endpoint
     * @param {Object} options - Request options
     * @returns {Promise} Response data
     */
    async fetch(endpoint, options = {}) {
        const controller = new AbortController();
        const timeout = this.getCurrentTimeout();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const fullUrl = this.buildUrl(endpoint);
        const method = options.method || 'GET';
        const headers = { ...this.getCurrentHeaders(), ...options.headers };
        const verboseLogging = this.shouldUseVerboseLogging(endpoint);

        // Log request
        if (verboseLogging) {
            Logger.api(`${method} ${endpoint}`);
        }

        let attempt = 0;
        let lastError;

        while (attempt < this.retryAttempts) {
            attempt++;
            
            try {
                const response = await fetch(fullUrl, { 
                    ...options, 
                    signal: controller.signal, 
                    headers 
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    const error = new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
                    error.status = response.status;
                    error.statusText = response.statusText;
                    error.response = response;
                    throw error;
                }

                const responseData = response.headers.get('content-type')?.includes('application/json') 
                    ? await response.json() 
                    : await response.text();

                // Log success
                if (verboseLogging) {
                    Logger.api(`${method} ${endpoint} - OK`);
                }

                // Update success tracking for certain endpoints
                if (endpoint === window.ENDPOINTS?.HEALTH || endpoint === window.ENDPOINTS?.MAPPINGS) {
                    this.updateLastSuccess();
                }

                return responseData;

            } catch (error) {
                lastError = error;
                
                // Don't retry on abort or client errors (4xx)
                if (error.name === 'AbortError' || (error.status >= 400 && error.status < 500)) {
                    break;
                }

                // Log error
                if (verboseLogging) {
                    Logger.error('API', `${method} ${endpoint} - Attempt ${attempt} failed:`, error);
                }

                // Wait before retry (except on last attempt)
                if (attempt < this.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
                }
            }
        }

        clearTimeout(timeoutId);
        
        // Final error logging
        if (verboseLogging) {
            Logger.error('API', `${method} ${endpoint} - All attempts failed:`, lastError);
        }

        // Throw user-friendly error
        throw getUserFriendlyError(lastError, endpoint);
    }

    /**
     * GET request
     * @param {string} endpoint - The API endpoint
     * @param {Object} options - Request options
     * @returns {Promise} Response data
     */
    async get(endpoint, options = {}) {
        return this.fetch(endpoint, { ...options, method: 'GET' });
    }

    /**
     * POST request
     * @param {string} endpoint - The API endpoint
     * @param {*} data - Request body data
     * @param {Object} options - Request options
     * @returns {Promise} Response data
     */
    async post(endpoint, data, options = {}) {
        return this.fetch(endpoint, {
            ...options,
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined
        });
    }

    /**
     * PUT request
     * @param {string} endpoint - The API endpoint
     * @param {*} data - Request body data
     * @param {Object} options - Request options
     * @returns {Promise} Response data
     */
    async put(endpoint, data, options = {}) {
        return this.fetch(endpoint, {
            ...options,
            method: 'PUT',
            body: data ? JSON.stringify(data) : undefined
        });
    }

    /**
     * PATCH request
     * @param {string} endpoint - The API endpoint
     * @param {*} data - Request body data
     * @param {Object} options - Request options
     * @returns {Promise} Response data
     */
    async patch(endpoint, data, options = {}) {
        return this.fetch(endpoint, {
            ...options,
            method: 'PATCH',
            body: data ? JSON.stringify(data) : undefined
        });
    }

    /**
     * DELETE request
     * @param {string} endpoint - The API endpoint
     * @param {Object} options - Request options
     * @returns {Promise} Response data
     */
    async delete(endpoint, options = {}) {
        return this.fetch(endpoint, { ...options, method: 'DELETE' });
    }

    /**
     * Health check
     * @returns {Promise<boolean} Whether the service is healthy
     */
    async healthCheck() {
        try {
            await this.get(window.ENDPOINTS?.HEALTH || '/health');
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get API statistics
     * @returns {Object} API client statistics
     */
    getStats() {
        return {
            baseUrl: this.baseUrl,
            defaultTimeout: this.defaultTimeout,
            retryAttempts: this.retryAttempts,
            retryDelay: this.retryDelay,
            lastSuccessTime: this.lastSuccessTime,
            timeSinceLastSuccess: this.lastSuccessTime ? Date.now() - this.lastSuccessTime : null
        };
    }
}

/**
 * Convert technical errors to user-friendly messages
 * @param {Error} error - The original error
 * @param {string} endpoint - The API endpoint that failed
 * @returns {Error} Error with user-friendly message
 */
function getUserFriendlyError(error, endpoint) {
    if (error.name === 'AbortError') {
        return new Error(`Request timeout. Please check your connection and try again.`);
    }

    if (error.status) {
        switch (error.status) {
            case 400:
                return new Error(`Invalid request. Please check your input and try again.`);
            case 401:
                return new Error(`Authentication failed. Please check your credentials.`);
            case 403:
                return new Error(`Access denied. You don't have permission to perform this action.`);
            case 404:
                return new Error(`The requested resource was not found.`);
            case 405:
                return new Error(`Method not allowed. This action is not supported.`);
            case 408:
                return new Error(`Request timeout. Please try again.`);
            case 409:
                return new Error(`Conflict. The resource already exists or is being modified.`);
            case 422:
                return new Error(`Invalid data. Please check your input and try again.`);
            case 429:
                return new Error(`Too many requests. Please wait and try again later.`);
            case 500:
                return new Error(`Server error. Please try again later.`);
            case 502:
                return new Error(`Service temporarily unavailable. Please try again later.`);
            case 503:
                return new Error(`Service unavailable. Please try again later.`);
            case 504:
                return new Error(`Gateway timeout. Please try again later.`);
            default:
                return new Error(`Request failed (${error.status}). Please try again.`);
        }
    }

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return new Error(`Network error. Please check your connection and try again.`);
    }

    if (error.name === 'TypeError' && error.message.includes('JSON')) {
        return new Error(`Invalid response format. Please try again.`);
    }

    // Return original error if we can't make it user-friendly
    return error;
}

// Create default API client instance
window.ApiClient = ApiClient;
window.apiClient = new ApiClient({
    baseUrl: () => window.wiremockBaseUrl,
    timeout: window.DEFAULTS?.REQUEST_TIMEOUT || 69000
});

/**
 * Legacy apiFetch function for backward compatibility
 * @param {string} endpoint - The API endpoint
 * @param {Object} options - Request options
 * @returns {Promise} Response data
 */
window.apiFetch = async (endpoint, options = {}) => {
    // Update API client base URL if needed
    if (window.wiremockBaseUrl && window.apiClient.baseUrl !== window.wiremockBaseUrl) {
        window.apiClient.baseUrl = window.wiremockBaseUrl;
    }
    
    return window.apiClient.fetch(endpoint, options);
};

// Export helper functions for backward compatibility
window.ensureCustomHeaderObject = ensureCustomHeaderObject;
window.migrateLegacySettings = migrateLegacySettings;
window.getUserFriendlyError = getUserFriendlyError;

// Settings helpers
window.normalizeWiremockSettings = (settings) => migrateLegacySettings(settings);

window.readWiremockSettings = () => {
    try {
        const raw = localStorage.getItem('wiremock-settings');
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        return migrateLegacySettings(parsed);
    } catch (error) {
        Logger.warn('SETTINGS', 'Failed to read stored settings, returning empty object:', error);
        return {};
    }
};

// Helper to build documented scenario state endpoint
window.buildScenarioStateEndpoint = (scenarioName) => {
    const rawName = typeof scenarioName === 'string' ? scenarioName : '';
    if (!rawName.trim()) {
        return '';
    }

    return `${window.ENDPOINTS?.SCENARIOS || '/scenarios'}/${encodeURIComponent(rawName)}/state`;
};

Logger.debug('API', 'API module loaded');