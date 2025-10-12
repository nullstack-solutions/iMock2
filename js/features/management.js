'use strict';

// --- ADDITIONAL MANAGEMENT HELPERS ---

// Legacy wrappers kept for HTML compatibility
window.clearFilters = () => {
    window.clearMappingFilters();
};

window.refreshRequests = async () => {
    await fetchAndRenderRequests();
    // Apply filters automatically after an update
    const hasActiveFilters = document.getElementById(SELECTORS.REQUEST_FILTERS.METHOD)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.URL)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.STATUS)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM)?.value ||
                          document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO)?.value;
    
    if (hasActiveFilters) {
        FilterManager.applyRequestFilters();
        console.log('[FILTERS] Request filters re-applied after refresh');
    }
};

// Quick helper to apply a temporary filter (fixed for Request Log)
window.applyQuickTimeFilter = () => {
    // Set the filter to the last 24 hours
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Use the correct selectors for Request Log
    const dateFromInput = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToInput = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    
    // Format dates for datetime-local input (YYYY-MM-DDTHH:MM)
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    if (dateFromInput) {
        dateFromInput.value = formatDateTime(yesterday);
    }
    if (dateToInput) {
        dateToInput.value = formatDateTime(now);
    }
    
    // Apply filters
    FilterManager.applyRequestFilters();
};


// --- RESOURCE CLEANUP ---

// Clear dangling timeouts on navigation
window.cleanupPendingDeletions = () => {
    for (const [id, timeout] of window.deletionTimeouts) {
        clearTimeout(timeout);
    }
    window.deletionTimeouts.clear();
    window.pendingDeletedIds.clear();
};

// Invoke when the page is closed
window.addEventListener('beforeunload', window.cleanupPendingDeletions);

// --- PREVIEW ---

window.togglePreview = (mappingId) => {
    const preview = document.getElementById(`preview-${mappingId}`);
    if (preview.style.display === 'none') {
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
};

window.toggleRequestPreview = (requestId) => {
    const preview = document.getElementById(`request-preview-${requestId}`);
    if (preview.style.display === 'none') {
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
};

