'use strict';

// --- FIXED FUNCTIONS FOR WIREMOCK 3.9.1+ API ---

// Corrected request count function (requires JSON POST)
window.getRequestCount = async (criteria = {}) => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_COUNT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(criteria)
        });
        return response.count || 0;
    } catch (error) {
        Logger.error('REQUESTS', 'Request count error:', error);
        NotificationManager.error(`Request count failed: ${error.message}`);
        return 0;
    }
};

// New request search function
window.findRequests = async (criteria) => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_FIND, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(criteria)
        });
        return response.requests || [];
    } catch (error) {
        Logger.error('REQUESTS', 'Find requests error:', error);
        NotificationManager.error(`Request search failed: ${error.message}`);
        return [];
    }
};

// Fetch unmatched requests
window.getUnmatchedRequests = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_UNMATCHED);
        return response.requests || [];
    } catch (error) {
        Logger.error('REQUESTS', 'Unmatched requests error:', error);
        return [];
    }
};

