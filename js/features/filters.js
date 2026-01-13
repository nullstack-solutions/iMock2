'use strict';

// --- UNIVERSAL FILTER MANAGER (eliminate ~90 lines of duplication) ---

// Compact filtering helpers via FilterManager
window.applyFilters = () => {
    FilterManager.applyMappingFilters();
    // Update active filters display with debounce
    if (typeof window._updateActiveFiltersDisplayDebounced === 'function') {
        window._updateActiveFiltersDisplayDebounced();
    } else if (typeof window.updateActiveFiltersDisplay === 'function') {
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
    // Clear URL parameters (tab-scoped)
    if (typeof window.updateURLFilterParams === 'function') {
        window.updateURLFilterParams('', 'mappings');
    }
};

// Toggle query help visibility
window.toggleQueryHelp = (tab = 'mappings') => {
    const helpId = tab === 'requests' ? 'req-query-help' : 'query-help';
    const helpEl = document.getElementById(helpId);
    if (!helpEl) return;

    const isHidden = helpEl.classList.contains('hidden');
    const button = document.querySelector(`[aria-controls="${helpId}"]`);

    if (isHidden) {
        helpEl.classList.remove('hidden');
        if (button) {
            button.textContent = '×';
            button.setAttribute('aria-expanded', 'true');
        }
    } else {
        helpEl.classList.add('hidden');
        if (button) {
            button.textContent = '?';
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
        activeFiltersContainer.classList.add('filter-hidden');
        return;
    }

    // Parse query to extract filters
    const parsed = window.QueryParser ? window.QueryParser.parseQuery(query) : null;

    if (!parsed || Object.keys(parsed).length === 0) {
        activeFiltersContainer.classList.add('filter-hidden');
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
    // Use classList to avoid layout shift (CLS optimization)
    if (chips.length > 0) {
        activeFiltersContainer.classList.remove('filter-hidden');
    } else {
        activeFiltersContainer.classList.add('filter-hidden');
    }
};

// Debounced version for oninput events (prevents memory leaks from rapid DOM updates)
window._updateActiveFiltersDisplayDebounced = window.debounce ?
    window.debounce(window.updateActiveFiltersDisplay, 200) :
    window.updateActiveFiltersDisplay;

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

// Helper function to set date range values and apply filters
function applyDateRange(fromEl, toEl, fromTime, toTime) {
    if (fromEl) fromEl.value = Utils.formatDateTime(fromTime);
    if (toEl) toEl.value = Utils.formatDateTime(toTime);
    FilterManager.applyRequestFilters();
    if (typeof FilterManager.flushRequestFilters === 'function') {
        FilterManager.flushRequestFilters();
    }
}

// Quick filter function for preset time ranges
window.applyQuickFilter = () => {
    const quickFilterEl = document.getElementById(SELECTORS.REQUEST_FILTERS.QUICK);
    if (!quickFilterEl) return;

    const value = quickFilterEl.value;
    const dateFromEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_FROM);
    const dateToEl = document.getElementById(SELECTORS.REQUEST_FILTERS.DATE_TO);
    
    if (!value) {
        // Clear time range if no quick filter selected
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
    
    switch (unit) {
        case 'm':
            fromTime.setMinutes(fromTime.getMinutes() - amount);
            break;
        case 'h':
            fromTime.setHours(fromTime.getHours() - amount);
            break;
        case 'd':
            fromTime.setDate(fromTime.getDate() - amount);
            break;
        default:
            return;
    }
    
    applyDateRange(dateFromEl, dateToEl, fromTime, now);
};

// Clear quick time filter selection (used when custom time range is set)
window.clearQuickTimeFilter = () => {
    const quickEl = document.getElementById('req-filter-quick');
    if (quickEl) quickEl.value = '';
};

// Apply quick time filter (5m, 15m, 30m, 1h, etc.)
window.applyQuickTimeFilter = () => {
    const quickEl = document.getElementById('req-filter-quick');
    const fromEl = document.getElementById('req-filter-from');
    const toEl = document.getElementById('req-filter-to');

    if (!quickEl || !fromEl || !toEl) return;

    const value = quickEl.value;
    if (!value) {
        // Clear time filters
        fromEl.value = '';
        toEl.value = '';
        FilterManager.applyRequestFilters();
        if (typeof FilterManager.flushRequestFilters === 'function') {
            FilterManager.flushRequestFilters();
        }
        return;
    }

    // Calculate time range
    const now = new Date();
    let fromTime = new Date(now);

    // Parse time value
    const match = value.match(/^(\d+)([mhd])$/);
    if (match) {
        const amount = parseInt(match[1], 10);
        const unit = match[2];

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
        }
    }

    // Set the time range and apply filters
    applyDateRange(fromEl, toEl, fromTime, now);
};

window.clearRequestFilters = () => {
    // Clear query-based filter
    const queryInput = document.getElementById('req-filter-query');
    if (queryInput) queryInput.value = '';

    // Clear time range filters
    const fromEl = document.getElementById('req-filter-from');
    const toEl = document.getElementById('req-filter-to');
    const quickEl = document.getElementById('req-filter-quick');
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    if (quickEl) quickEl.value = '';

    FilterManager.applyRequestFilters();
    if (typeof FilterManager.flushRequestFilters === 'function') {
        FilterManager.flushRequestFilters();
    }

    // Update active filters display
    if (typeof window.updateRequestActiveFiltersDisplay === 'function') {
        window.updateRequestActiveFiltersDisplay();
    }

    // Clear URL parameters (tab-scoped)
    if (typeof window.updateURLFilterParams === 'function') {
        window.updateURLFilterParams('', 'requests');
    }
};

// Apply quick filter for requests (similar to mappings)
window.applyQuickRequestFilter = (filter) => {
    const queryInput = document.getElementById('req-filter-query');
    if (!queryInput) return;

    const existingQuery = queryInput.value.trim();

    // Check if it's a method filter (GET, POST, etc.) or other filter (matched:true, etc.)
    if (/^[A-Z]+$/.test(filter)) {
        // It's a method - set as method:XXX
        const methodPattern = /method:[\w,]+/i;

        if (methodPattern.test(existingQuery)) {
            // Replace existing method
            queryInput.value = existingQuery.replace(methodPattern, `method:${filter}`);
        } else {
            // Add method at the beginning
            queryInput.value = existingQuery ? `method:${filter} ${existingQuery}` : `method:${filter}`;
        }
    } else {
        // It's a key:value filter like "matched:true"
        // Extract the key (matched, status, client, etc.)
        const keyMatch = filter.match(/^(\w+):/);
        if (keyMatch) {
            const key = keyMatch[1];
            const keyPattern = new RegExp(`${key}:[^\\s]+`, 'i');

            if (keyPattern.test(existingQuery)) {
                // Replace existing filter with same key
                queryInput.value = existingQuery.replace(keyPattern, filter);
            } else {
                // Add new filter at the beginning
                queryInput.value = existingQuery ? `${filter} ${existingQuery}` : filter;
            }
        } else {
            // Fallback: just append
            queryInput.value = existingQuery ? `${filter} ${existingQuery}` : filter;
        }
    }

    FilterManager.applyRequestFilters();
    if (typeof FilterManager.flushRequestFilters === 'function') {
        FilterManager.flushRequestFilters();
    }

    // Update active filters display with debounce
    if (typeof window._updateRequestActiveFiltersDisplayDebounced === 'function') {
        window._updateRequestActiveFiltersDisplayDebounced();
    } else if (typeof window.updateRequestActiveFiltersDisplay === 'function') {
        window.updateRequestActiveFiltersDisplay();
    }
};

// Update active request filters display
window.updateRequestActiveFiltersDisplay = () => {
    const container = document.getElementById('req-active-filters');
    const queryInput = document.getElementById('req-filter-query');

    if (!container || !queryInput) return;

    const query = queryInput.value.trim();
    if (!query || !window.QueryParser) {
        container.innerHTML = '';
        container.classList.add('filter-hidden');
        return;
    }

    const parsed = window.QueryParser.parseQuery(query);
    if (!parsed) {
        container.innerHTML = '';
        container.classList.add('filter-hidden');
        return;
    }

    const chips = [];

    for (const [key, value] of Object.entries(parsed)) {
        if (key === 'text') continue; // Skip free text for now

        let chipText = '';
        if (key === 'matched') {
            const matchValues = Array.isArray(value) ? value : [value];
            const valStr = String(matchValues[0]).toLowerCase();
            if (valStr === 'true' || valStr === 'yes' || valStr === '1') {
                chipText = 'Matched';
            } else {
                chipText = 'Unmatched';
            }
        } else if (Array.isArray(value)) {
            chipText = `${key}: ${value.join(', ')}`;
        } else if (typeof value === 'object' && value.exclude) {
            const excludeVals = Array.isArray(value.exclude) ? value.exclude : [value.exclude];
            chipText = `NOT ${key}: ${excludeVals.join(', ')}`;
        } else {
            chipText = `${key}: ${value}`;
        }

        chips.push(`<button type="button" class="filter-chip filter-chip-active" onclick="removeRequestActiveFilter('${key}')" title="Remove filter">${chipText} ×</button>`);
    }

    container.innerHTML = chips.join('');
    // Use classList to avoid layout shift (CLS optimization)
    if (chips.length > 0) {
        container.classList.remove('filter-hidden');
    } else {
        container.classList.add('filter-hidden');
    }
};

// Debounced version for oninput events (prevents memory leaks from rapid DOM updates)
window._updateRequestActiveFiltersDisplayDebounced = window.debounce ?
    window.debounce(window.updateRequestActiveFiltersDisplay, 200) :
    window.updateRequestActiveFiltersDisplay;

// Remove active filter for requests
window.removeRequestActiveFilter = (key) => {
    const queryInput = document.getElementById('req-filter-query');
    if (!queryInput) return;

    const query = queryInput.value.trim();
    if (!query) return;

    // Remove the key:value pattern from query
    const pattern = new RegExp(`-?${key}:[\\w\\/\\*.,\\-]+(\\s+|$)`, 'gi');
    const newQuery = query.replace(pattern, '').replace(/\s+/g, ' ').trim();

    queryInput.value = newQuery;

    FilterManager.applyRequestFilters();
    if (typeof FilterManager.flushRequestFilters === 'function') {
        FilterManager.flushRequestFilters();
    }

    // Update active filters display
    if (typeof window.updateRequestActiveFiltersDisplay === 'function') {
        window.updateRequestActiveFiltersDisplay();
    }
};

// === SAVED FILTERS MANAGEMENT ===

// Get saved filters from localStorage
function getSavedFilters(tab) {
    const key = `saved-filters-${tab}`;
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        Logger.warn('FILTERS', `Failed to load saved filters for ${tab}:`, error);
        return [];
    }
}

// Save filters to localStorage
function setSavedFilters(tab, filters) {
    const key = `saved-filters-${tab}`;
    try {
        localStorage.setItem(key, JSON.stringify(filters));
    } catch (error) {
        Logger.error('FILTERS', `Failed to save filters for ${tab}:`, error);
    }
}

// Save current mapping filter
window.saveCurrentMappingFilter = () => {
    const queryInput = document.getElementById('filter-query');
    if (!queryInput) return;

    const query = queryInput.value.trim();
    if (!query) {
        if (typeof NotificationManager !== 'undefined') {
            NotificationManager.warning('No filter to save');
        }
        return;
    }

    // Prompt for filter name
    const name = prompt('Enter a name for this filter:', query.substring(0, 30));
    if (!name) return;

    // Get existing saved filters
    const savedFilters = getSavedFilters('mappings');

    // Check if filter with same name exists
    const existingIndex = savedFilters.findIndex(f => f.name === name);
    if (existingIndex >= 0) {
        if (!confirm(`Filter "${name}" already exists. Overwrite?`)) return;
        savedFilters[existingIndex] = { name, query };
    } else {
        savedFilters.push({ name, query });
    }

    // Save to localStorage
    setSavedFilters('mappings', savedFilters);

    // Update display
    updateSavedFiltersDisplay('mappings');

    if (typeof NotificationManager !== 'undefined') {
        NotificationManager.success(`Filter "${name}" saved`);
    }
};

// Save current request filter
window.saveCurrentRequestFilter = () => {
    const queryInput = document.getElementById('req-filter-query');
    if (!queryInput) return;

    const query = queryInput.value.trim();
    if (!query) {
        if (typeof NotificationManager !== 'undefined') {
            NotificationManager.warning('No filter to save');
        }
        return;
    }

    // Prompt for filter name
    const name = prompt('Enter a name for this filter:', query.substring(0, 30));
    if (!name) return;

    // Get existing saved filters
    const savedFilters = getSavedFilters('requests');

    // Check if filter with same name exists
    const existingIndex = savedFilters.findIndex(f => f.name === name);
    if (existingIndex >= 0) {
        if (!confirm(`Filter "${name}" already exists. Overwrite?`)) return;
        savedFilters[existingIndex] = { name, query };
    } else {
        savedFilters.push({ name, query });
    }

    // Save to localStorage
    setSavedFilters('requests', savedFilters);

    // Update display
    updateSavedFiltersDisplay('requests');

    if (typeof NotificationManager !== 'undefined') {
        NotificationManager.success(`Filter "${name}" saved`);
    }
};

// Apply saved filter
window.applySavedFilter = (tab, name) => {
    const savedFilters = getSavedFilters(tab);
    const filter = savedFilters.find(f => f.name === name);

    if (!filter) {
        Logger.warn('FILTERS', `Saved filter "${name}" not found`);
        return;
    }

    // Set the query input
    if (tab === 'mappings') {
        const queryInput = document.getElementById('filter-query');
        if (queryInput) {
            queryInput.value = filter.query;
            applyFilters();
            updateActiveFiltersDisplay();
        }
    } else if (tab === 'requests') {
        const queryInput = document.getElementById('req-filter-query');
        if (queryInput) {
            queryInput.value = filter.query;
            FilterManager.applyRequestFilters();
            updateRequestActiveFiltersDisplay();
        }
    }
};

// Delete saved filter
window.deleteSavedFilter = (tab, name) => {
    const savedFilters = getSavedFilters(tab);
    const filteredFilters = savedFilters.filter(f => f.name !== name);

    setSavedFilters(tab, filteredFilters);
    updateSavedFiltersDisplay(tab);

    if (typeof NotificationManager !== 'undefined') {
        NotificationManager.info(`Filter "${name}" deleted`);
    }
};

// Update saved filters display
function updateSavedFiltersDisplay(tab) {
    const savedFilters = getSavedFilters(tab);

    let listId, separatorId;
    if (tab === 'mappings') {
        listId = 'saved-filters-list';
        separatorId = 'saved-filters-separator';
    } else if (tab === 'requests') {
        listId = 'req-saved-filters-list';
        separatorId = 'req-saved-filters-separator';
    } else {
        return;
    }

    const list = document.getElementById(listId);
    const separator = document.getElementById(separatorId);

    if (!list) return;

    if (savedFilters.length === 0) {
        list.classList.add('filter-hidden');
        if (separator) separator.classList.add('filter-hidden');
        return;
    }

    // Build chips HTML - with X inside the button
    const chips = savedFilters.map(filter => `
        <button type="button"
                class="filter-chip filter-chip-saved"
                onclick="applySavedFilter('${tab}', '${filter.name.replace(/'/g, "\\'")}')"
                title="${filter.query}">
            <span class="filter-chip-text">${filter.name}</span>
            <span class="filter-chip-remove"
                  onclick="event.stopPropagation(); deleteSavedFilter('${tab}', '${filter.name.replace(/'/g, "\\'")}')"
                  title="Delete filter"
                  aria-label="Delete filter">×</span>
        </button>
    `);

    list.innerHTML = chips.join('');
    list.classList.remove('filter-hidden');
    if (separator) separator.classList.remove('filter-hidden');
}

// Load saved filters on page load
window.loadAllSavedFilters = () => {
    updateSavedFiltersDisplay('mappings');
    updateSavedFiltersDisplay('requests');
};

