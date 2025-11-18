'use strict';

/**
 * Near Misses API - Helps debug unmatched requests
 *
 * When a request doesn't match any mapping, Near Misses shows
 * which mappings were "close" and why they didn't match.
 */

/**
 * Find near matches for a specific request
 * @param {Object} request Request object to analyze
 * @returns {Promise<Array>} Array of near miss mappings with reasons
 */
window.findNearMissesForRequest = async (request) => {
    try {
        const response = await apiFetch(ENDPOINTS.NEAR_MISSES_REQUEST, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
        return response.nearMisses || [];
    } catch (error) {
        console.error('[Near Misses] Error finding near misses for request:', error);
        return [];
    }
};

/**
 * Find near matches for a request pattern
 * @param {Object} pattern Request pattern to analyze
 * @returns {Promise<Array>} Array of near miss mappings with reasons
 */
window.findNearMissesForPattern = async (pattern) => {
    try {
        const response = await apiFetch(ENDPOINTS.NEAR_MISSES_PATTERN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pattern)
        });
        return response.nearMisses || [];
    } catch (error) {
        console.error('[Near Misses] Error finding near misses for pattern:', error);
        return [];
    }
};

/**
 * Get near misses for all unmatched requests
 * @returns {Promise<Array>} Array of near misses for unmatched requests
 */
window.getNearMissesForUnmatched = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_UNMATCHED_NEAR_MISSES);
        return response.nearMisses || [];
    } catch (error) {
        console.error('[Near Misses] Error getting near misses for unmatched:', error);
        return [];
    }
};

console.log('✅ Near Misses API initialized');
