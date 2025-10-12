'use strict';

// --- NEAR MISSES FUNCTIONS ---

// Find near matches for a request
window.findNearMissesForRequest = async (request) => {
    try {
        const response = await apiFetch(ENDPOINTS.NEAR_MISSES_REQUEST, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for request error:', error);
        return [];
    }
};

// Find near matches for a pattern
window.findNearMissesForPattern = async (pattern) => {
    try {
        const response = await apiFetch(ENDPOINTS.NEAR_MISSES_PATTERN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pattern)
        });
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for pattern error:', error);
        return [];
    }
};

// Get near matches for unmatched requests
window.getNearMissesForUnmatched = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_UNMATCHED_NEAR_MISSES);
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for unmatched error:', error);
        return [];
    }
};

