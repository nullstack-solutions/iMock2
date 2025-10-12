'use strict';

// --- UNIVERSAL FILTER MANAGER (eliminate ~90 lines of duplication) ---


// Compact filtering helpers via FilterManager
window.applyFilters = () => FilterManager.applyMappingFilters();
window.clearMappingFilters = () => {
    document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD).value = '';
    document.getElementById(SELECTORS.MAPPING_FILTERS.URL).value = '';
    document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS).value = '';
    FilterManager.applyMappingFilters();
    if (typeof FilterManager.flushMappingFilters === 'function') {
        FilterManager.flushMappingFilters();
    }
};
window.applyRequestFilters = () => FilterManager.applyRequestFilters();

// Quick filter function for preset time ranges
window.applyQuickFilter = () => {
    const quickFilterEl = document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK);
    if (!quickFilterEl) return;

    const value = quickFilterEl.value;
    if (!value) {
        // Clear time range if no quick filter selected
        const dateFromEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
        const dateToEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
        if (dateFromEl) dateFromEl.value = '';
        if (dateToEl) dateToEl.value = '';
        FilterManager.applyRequestFilters();
        if (typeof FilterManager.flushRequestFilters === 'function') {
            FilterManager.flushRequestFilters();
        }
        return;
    }
    
    const now = new Date();
    const fromTime = new Date(now);
    
    // Parse the quick filter value (e.g., "5m", "1h", "3d")
    const match = value.match(/^(\d+)([mhd])$/);
    if (!match) return;
    
    const amount = parseInt(match[1]);
    const unit = match[2];
    
    // Calculate the "from" time based on the unit
    switch (unit) {
        case 'm': // minutes
            fromTime.setMinutes(fromTime.getMinutes() - amount);
            break;
        case 'h': // hours
            fromTime.setHours(fromTime.getHours() - amount);
            break;
        case 'd': // days
            fromTime.setDate(fromTime.getDate() - amount);
            break;
        default:
            return;
    }
    
    // Format dates for datetime-local input (YYYY-MM-DDTHH:MM)
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    // Set the time range inputs
    const dateFromEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    
    if (dateFromEl) dateFromEl.value = formatDateTime(fromTime);
    if (dateToEl) dateToEl.value = formatDateTime(now);

    // Apply the filters
    FilterManager.applyRequestFilters();
    if (typeof FilterManager.flushRequestFilters === 'function') {
        FilterManager.flushRequestFilters();
    }
};

// Clear quick filter selection (used when custom time range is set)
window.clearQuickFilter = () => {
    const quickEl = document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK);
    if (quickEl) quickEl.value = '';
};
window.clearRequestFilters = () => {
    // Clear existing filters with safe access
    const methodEl = document.getElementById(SELECTORS.REQUEST_FILTERS.METHOD);
    const urlEl = document.getElementById(SELECTORS.REQUEST_FILTERS.URL);
    const statusEl = document.getElementById(SELECTORS.REQUEST_FILTERS.STATUS);
    const dateFromEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    const quickEl = document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK);
    
    if (methodEl) methodEl.value = '';
    if (urlEl) urlEl.value = '';
    if (statusEl) statusEl.value = '';
    if (dateFromEl) dateFromEl.value = '';
    if (dateToEl) dateToEl.value = '';
    if (quickEl) quickEl.value = ''; // Reset quick filter selection

    FilterManager.applyRequestFilters();
    if (typeof FilterManager.flushRequestFilters === 'function') {
        FilterManager.flushRequestFilters();
    }
};

