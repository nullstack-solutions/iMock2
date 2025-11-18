'use strict';

// --- UNIVERSAL FILTER MANAGER (eliminate ~90 lines of duplication) ---


// Compact filtering helpers via FilterManager
window.applyFilters = () => {
    FilterManager.applyMappingFilters();
    // Update active filters display
    if (typeof window.updateActiveFiltersDisplay === 'function') {
        window.updateActiveFiltersDisplay();
    }
};

window.clearMappingFilters = () => {
    const queryInput = document.getElementById('filter-query');
    if (queryInput) queryInput.value = '';
    FilterManager.applyMappingFilters();
    if (typeof FilterManager.flushMappingFilters === 'function') {
        FilterManager.flushMappingFilters();
    }
    // Update active filters display
    if (typeof window.updateActiveFiltersDisplay === 'function') {
        window.updateActiveFiltersDisplay();
    }
    // Clear URL parameters
    if (typeof window.updateURLFilterParams === 'function') {
        window.updateURLFilterParams('');
    }
};

// Toggle query help visibility
window.toggleQueryHelp = () => {
    const helpEl = document.getElementById('query-help');
    if (!helpEl) return;

    const isHidden = helpEl.classList.contains('hidden');
    const button = document.querySelector('[aria-controls="query-help"]');

    if (isHidden) {
        helpEl.classList.remove('hidden');
        if (button) {
            button.textContent = 'Hide Examples';
            button.setAttribute('aria-expanded', 'true');
        }
    } else {
        helpEl.classList.add('hidden');
        if (button) {
            button.textContent = 'Show Examples';
            button.setAttribute('aria-expanded', 'false');
        }
    }
};

// Quick method filter - sets method in query
window.applyQuickMethodFilter = (method) => {
    const queryInput = document.getElementById('filter-query');
    if (!queryInput) return;

    const currentQuery = queryInput.value.trim();

    // Parse existing query to check if method filter exists
    const methodPattern = /method:[^\s]+/;

    if (methodPattern.test(currentQuery)) {
        // Replace existing method filter
        queryInput.value = currentQuery.replace(methodPattern, `method:${method}`);
    } else {
        // Add new method filter
        queryInput.value = currentQuery ? `method:${method} ${currentQuery}` : `method:${method}`;
    }

    // Apply filters and update active chips display
    applyFilters();
    updateActiveFiltersDisplay();
};

// Update active filters display as chips
window.updateActiveFiltersDisplay = () => {
    const queryInput = document.getElementById('filter-query');
    const activeFiltersContainer = document.getElementById('active-filters');
    const activeFiltersList = document.getElementById('active-filters-list');

    if (!queryInput || !activeFiltersContainer || !activeFiltersList) return;

    const query = queryInput.value.trim();

    if (!query) {
        activeFiltersContainer.style.display = 'none';
        return;
    }

    // Parse query to extract filters
    const parsed = window.QueryParser ? window.QueryParser.parseQuery(query) : null;

    if (!parsed || Object.keys(parsed).length === 0) {
        activeFiltersContainer.style.display = 'none';
        return;
    }

    // Build chips HTML
    const chips = [];

    for (const [key, value] of Object.entries(parsed)) {
        if (key === 'text') continue; // Skip free text search

        let chipText = '';

        if (typeof value === 'object' && value.exclude) {
            // Exclusion filter
            const excludeValue = Array.isArray(value.exclude) ? value.exclude.join(',') : value.exclude;
            chipText = `-${key}:${excludeValue}`;
        } else if (typeof value === 'object' && value.from && value.to) {
            // Range filter
            chipText = `${key}:${value.from}-${value.to}`;
        } else if (Array.isArray(value)) {
            // Multiple values (OR)
            chipText = `${key}:${value.join(',')}`;
        } else {
            // Single value
            chipText = `${key}:${value}`;
        }

        chips.push(`
            <button type="button"
                    class="filter-chip filter-chip-active"
                    onclick="removeActiveFilter('${key}')"
                    title="Click to remove">
                ${chipText}
                <span class="filter-chip-remove" aria-hidden="true">×</span>
            </button>
        `);
    }

    activeFiltersList.innerHTML = chips.join('');
    activeFiltersContainer.style.display = chips.length > 0 ? 'flex' : 'none';
};

// Remove active filter from query
window.removeActiveFilter = (key) => {
    const queryInput = document.getElementById('filter-query');
    if (!queryInput) return;

    const currentQuery = queryInput.value.trim();

    // Remove the filter from query string
    // Handle various formats: key:value, -key:value, key:value1,value2, key:from-to
    const patterns = [
        new RegExp(`-?${key}:[^\\s]+`, 'g'), // Remove key:value or -key:value
        new RegExp(`\\s+${key}:[^\\s]+`, 'g'), // Remove with leading space
        new RegExp(`${key}:[^\\s]+\\s+`, 'g')  // Remove with trailing space
    ];

    let newQuery = currentQuery;
    for (const pattern of patterns) {
        newQuery = newQuery.replace(pattern, ' ');
    }

    // Clean up extra spaces
    newQuery = newQuery.replace(/\s+/g, ' ').trim();

    queryInput.value = newQuery;
    applyFilters();
    updateActiveFiltersDisplay();
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

