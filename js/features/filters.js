'use strict';

function executeMappingFilters() {
    const queryInput = document.getElementById('filter-query');
    const query = queryInput?.value?.trim() || '';

    // Save query to filter state
    window.FilterManager.saveFilterState('mappings', { query });

    // Update URL with filter query for sharing
    updateURLFilterParams(query, 'mappings');

    // Get all mappings from MappingsStore (window.originalMappings is a getter to MappingsStore)
    const allMappingsFromStore = window.originalMappings;

    if (!Array.isArray(allMappingsFromStore) || allMappingsFromStore.length === 0) {
        const emptyState = document.getElementById(SELECTORS.EMPTY.MAPPINGS);
        const container = document.getElementById(SELECTORS.LISTS.MAPPINGS);
        if (emptyState) {
            emptyState.classList.remove('hidden');
            emptyState.setAttribute('aria-hidden', 'false');
        }
        if (container) container.style.display = 'none';
        if (typeof updateMappingsCounter === 'function') {
            updateMappingsCounter();
        }
        return;
    }

    // Use new query parser for filtering
    let filteredMappings;
    if (query) {
        if (window.QueryParser && typeof window.QueryParser.filterMappingsByQuery === 'function') {
            filteredMappings = window.QueryParser.filterMappingsByQuery(allMappingsFromStore, query);
        } else {
            Logger.warn('MANAGERS', '[Mapping Filter] QueryParser or filterMappingsByQuery is not available. Showing all mappings.');
            filteredMappings = allMappingsFromStore;
        }
    } else {
        filteredMappings = allMappingsFromStore;
    }

    // Store filtered result in a separate variable (don't assign to window.allMappings - it's a getter to MappingsStore!)
    window._filteredMappings = filteredMappings;

    const container = document.getElementById(SELECTORS.LISTS.MAPPINGS);
    const emptyState = document.getElementById(SELECTORS.EMPTY.MAPPINGS);
    const loadingState = document.getElementById(SELECTORS.LOADING.MAPPINGS);

    if (!container) {
        return;
    }

    const sortedMappings = [...filteredMappings].sort((a, b) => {
        const priorityA = a?.priority ?? 1;
        const priorityB = b?.priority ?? 1;
        if (priorityA !== priorityB) return priorityA - priorityB;

        const methodOrder = { 'GET': 1, 'POST': 2, 'PUT': 3, 'PATCH': 4, 'DELETE': 5 };
        const methodA = methodOrder[a?.request?.method] || 999;
        const methodB = methodOrder[b?.request?.method] || 999;
        if (methodA !== methodB) return methodA - methodB;

        const urlA = a?.request?.url || a?.request?.urlPattern || a?.request?.urlPath || '';
        const urlB = b?.request?.url || b?.request?.urlPattern || b?.request?.urlPath || '';
        return urlA.localeCompare(urlB);
    });

    // Update pagination state and render only current page
    if (window.PaginationManager) {
        window.PaginationManager.updateState(sortedMappings.length);

        // Get items for current page
        const pageItems = window.PaginationManager.getCurrentPageItems(sortedMappings);

        renderList(container, pageItems, {
            renderItem: renderMappingMarkup,
            getKey: getMappingRenderKey,
            getSignature: getMappingRenderSignature
        });

        // Render pagination controls
        const paginationContainer = document.getElementById('mappings-pagination');
        if (paginationContainer) {
            paginationContainer.innerHTML = window.PaginationManager.renderControls();
        }
    } else {
        // Fallback: render all items if pagination not available
        renderList(container, sortedMappings, {
            renderItem: renderMappingMarkup,
            getKey: getMappingRenderKey,
            getSignature: getMappingRenderSignature
        });
    }

    if (loadingState) {
        loadingState.classList.add('hidden');
    }

    if (sortedMappings.length === 0) {
        if (emptyState) {
            emptyState.classList.remove('hidden');
            emptyState.setAttribute('aria-hidden', 'false');
        }
        container.style.display = 'none';
    } else {
        if (emptyState) {
            emptyState.classList.add('hidden');
            emptyState.setAttribute('aria-hidden', 'true');
        }
        container.style.display = 'block';
    }

    if (typeof updateMappingsCounter === 'function') {
        updateMappingsCounter();
    }
}

function executeRequestFilters() {
    // Get query-based filter
    const queryInput = document.getElementById('req-filter-query');
    const query = queryInput?.value?.trim() || '';

    // Get time range filters
    const fromInput = document.getElementById('req-filter-from');
    const toInput = document.getElementById('req-filter-to');
    const from = fromInput?.value || '';
    const to = toInput?.value || '';

    // Save filters to localStorage and URL
    window.FilterManager.saveFilterState('requests', { query, from, to });
    updateURLFilterParams(query, 'requests');

    if (!Array.isArray(window.originalRequests) || window.originalRequests.length === 0) {
        window.allRequests = [];
        const emptyState = document.getElementById(SELECTORS.EMPTY.REQUESTS);
        const container = document.getElementById(SELECTORS.LISTS.REQUESTS);
        if (emptyState) emptyState.classList.remove('hidden');
        if (container) container.style.display = 'none';
        if (typeof updateRequestsCounter === 'function') {
            updateRequestsCounter();
        }
        return;
    }

    // Step 1: Apply query-based filters
    let filteredRequests = query && window.QueryParser
        ? window.QueryParser.filterRequestsByQuery(window.originalRequests, query)
        : window.originalRequests;

    // Step 2: Apply time range filters
    const fromTime = from ? new Date(from).getTime() : null;
    const toTime = to ? new Date(to).getTime() : null;

    if (fromTime !== null || toTime !== null) {
        filteredRequests = filteredRequests.filter(request => {
            if (!request) return false;

            const requestTime = new Date(request.request?.loggedDate || request.loggedDate).getTime();

            if (fromTime !== null && Number.isFinite(fromTime)) {
                if (!Number.isFinite(requestTime) || requestTime < fromTime) {
                    return false;
                }
            }

            if (toTime !== null && Number.isFinite(toTime)) {
                if (!Number.isFinite(requestTime) || requestTime > toTime) {
                    return false;
                }
            }

            return true;
        });
    }

    window.allRequests = filteredRequests;

    const container = document.getElementById(SELECTORS.LISTS.REQUESTS);
    const emptyState = document.getElementById(SELECTORS.EMPTY.REQUESTS);
    const loadingState = document.getElementById(SELECTORS.LOADING.REQUESTS);

    if (!container) {
        return;
    }

    renderList(container, window.allRequests, {
        renderItem: renderRequestMarkup,
        getKey: getRequestRenderKey,
        getSignature: getRequestRenderSignature
    });

    if (loadingState) {
        loadingState.classList.add('hidden');
    }

    if (window.allRequests.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        container.style.display = 'none';
    } else {
        if (emptyState) emptyState.classList.add('hidden');
        container.style.display = 'block';
    }

    if (typeof updateRequestsCounter === 'function') {
        updateRequestsCounter();
    }

    Logger.debug('MANAGERS', `Filtered requests: ${window.allRequests.length} items`);
}

function getRenderKey(item, ...keys) {
    if (!item || typeof item !== 'object') return '';
    for (const key of keys) {
        const value = key.includes('.') ? key.split('.').reduce((obj, k) => obj?.[k], item) : item[key];
        if (value != null) return String(value);
    }
    return '';
}

function getMappingRenderKey(mapping) {
    return getRenderKey(mapping, 'id', 'uuid', 'stubId');
}

function getMappingRenderSignature(mapping) {
    if (!mapping || typeof mapping !== 'object') return '';
    const request = mapping.request || {};
    const response = mapping.response || {};
    const metadata = mapping.metadata || {};
    const stringifyForSignature = (value) => {
        if (value == null) return '';
        try {
            const str = typeof value === 'string' ? value : JSON.stringify(value);
            return str.length > 300 ? `${str.slice(0, 300)}…` : str;
        } catch { return ''; }
    };
    return [
        request.method || '',
        request.url || request.urlPattern || request.urlPath || request.urlPathPattern || '',
        response.status || '',
        response.fixedDelayMilliseconds || '',
        mapping.name || metadata.name || '',
        mapping.priority ?? '',
        mapping.scenarioName || '',
        metadata.edited || metadata.created || '',
        metadata.source || '',
        stringifyForSignature(request.headers),
        stringifyForSignature(request.bodyPatterns || request.body || ''),
        stringifyForSignature(request.queryParameters),
        stringifyForSignature(response.headers),
        stringifyForSignature(response.jsonBody !== undefined ? response.jsonBody : response.body || ''),
        stringifyForSignature(metadata.additionalMetadata || metadata.tags || metadata.description || '')
    ].join('|');
}

function renderMappingMarkup(mapping) {
    return typeof window.renderMappingCard === 'function' ? window.renderMappingCard(mapping) : '';
}

function getRequestRenderKey(request) {
    return getRenderKey(request, 'id', 'requestId', 'mappingUuid', 'request.id', 'request.loggedDate', 'loggedDate');
}

function getRequestRenderSignature(request) {
    if (!request || typeof request !== 'object') return '';
    const req = request.request || {}, res = request.responseDefinition || {};
    return [req.method || '', req.url || req.urlPath || '', req.loggedDate || request.loggedDate || '',
            request.wasMatched === false ? 'unmatched' : 'matched', res.status ?? '',
            (res.body || res.jsonBody || '').length, (req.body || '').length].join('|');
}

function renderRequestMarkup(request) {
    return typeof window.renderRequestCard === 'function' ? window.renderRequestCard(request) : '';
}

window.FilterManager._applyMappingFilters = window.debounce(executeMappingFilters, 180);
window.FilterManager._applyRequestFilters = window.debounce(executeRequestFilters, 180);

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
                    data-action="remove-active-filter"
                    data-filter-key="${Utils.escapeHtml(key)}"
                    title="Click to remove">
                ${Utils.escapeHtml(chipText)}
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
    
    // Set the time range and apply filters
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

        chips.push(`<button type="button" class="filter-chip filter-chip-active" data-action="remove-request-active-filter" data-filter-key="${Utils.escapeHtml(key)}" title="Remove filter">${Utils.escapeHtml(chipText)} ×</button>`);
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
                data-action="apply-saved-filter"
                data-filter-tab="${Utils.escapeHtml(tab)}"
                data-filter-name="${Utils.escapeHtml(filter.name)}"
                title="${Utils.escapeHtml(filter.query)}">
            <span class="filter-chip-text">${Utils.escapeHtml(filter.name)}</span>
            <span class="filter-chip-remove"
                  data-action="delete-saved-filter"
                  data-filter-tab="${Utils.escapeHtml(tab)}"
                  data-filter-name="${Utils.escapeHtml(filter.name)}"
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

// === EVENT DELEGATION FOR FILTER CHIPS ===
// Scoped to specific filter containers to avoid overhead on every document click.
// Replaces inline onclick handlers to prevent XSS and support CSP.
if (!window._filterChipDelegationInitialized) {
    window._filterChipDelegationInitialized = true;

    function handleFilterChipClick(e) {
        // Handle delete-saved-filter first (nested inside apply-saved-filter button,
        // so it must be matched before the parent to prevent both actions firing)
        const deleteBtn = e.target.closest('[data-action="delete-saved-filter"]');
        if (deleteBtn) {
            e.stopPropagation();
            const tab = deleteBtn.dataset.filterTab;
            const name = deleteBtn.dataset.filterName;
            if (tab && name) {
                window.deleteSavedFilter(tab, name);
            }
            return;
        }

        // Handle apply-saved-filter
        const applyBtn = e.target.closest('[data-action="apply-saved-filter"]');
        if (applyBtn) {
            const tab = applyBtn.dataset.filterTab;
            const name = applyBtn.dataset.filterName;
            if (tab && name) {
                window.applySavedFilter(tab, name);
            }
            return;
        }

        // Handle remove-active-filter (mapping filter chips)
        const removeBtn = e.target.closest('[data-action="remove-active-filter"]');
        if (removeBtn) {
            const key = removeBtn.dataset.filterKey;
            if (key) {
                window.removeActiveFilter(key);
            }
            return;
        }

        // Handle remove-request-active-filter (request filter chips)
        const removeReqBtn = e.target.closest('[data-action="remove-request-active-filter"]');
        if (removeReqBtn) {
            const key = removeReqBtn.dataset.filterKey;
            if (key) {
                window.removeRequestActiveFilter(key);
            }
            return;
        }
    }

    // Attach to each filter chip container instead of document
    const containerIds = [
        'active-filters-list',
        'req-active-filters',
        'saved-filters-list',
        'req-saved-filters-list',
    ];
    containerIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handleFilterChipClick);
    });
}

