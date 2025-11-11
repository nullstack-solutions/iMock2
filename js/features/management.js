'use strict';

// --- ADDITIONAL MANAGEMENT HELPERS ---

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

    if (dateFromInput) {
        dateFromInput.value = Utils.formatDateTime(yesterday);
    }
    if (dateToInput) {
        dateToInput.value = Utils.formatDateTime(now);
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

// Universal toggle function for preview elements
window.toggleElementById = (elementId) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    if (element.style.display === 'none') {
        element.style.display = 'block';
    } else {
        element.style.display = 'none';
    }
};

// Backward compatibility wrappers
window.togglePreview = (mappingId) => {
    window.toggleElementById(`preview-${mappingId}`);
};

window.toggleRequestPreview = (requestId) => {
    window.toggleElementById(`request-preview-${requestId}`);
};

