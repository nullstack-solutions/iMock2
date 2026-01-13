'use strict';

(function(global) {
    const window = global;

    // Configuration for different filter types to unify logic
    const FILTER_CONFIG = {
        mappings: {
            queryInput: 'filter-query',
            activeContainer: 'active-filters',
            activeList: 'active-filters-list',
            savedList: 'saved-filters-list',
            savedSeparator: 'saved-filters-separator',
            applyFn: 'applyMappingFilters',
            flushFn: 'flushMappingFilters',
            storageKey: 'saved-filters-mappings'
        },
        requests: {
            queryInput: 'req-filter-query',
            activeContainer: 'req-active-filters',
            // Requests might use container as list directly in some implementations,
            // but we'll try to support both patterns or normalize
            activeList: 'req-active-filters',
            savedList: 'req-saved-filters-list',
            savedSeparator: 'req-saved-filters-separator',
            applyFn: 'applyRequestFilters',
            flushFn: 'flushRequestFilters',
            storageKey: 'saved-filters-requests',
            timeInputs: {
                quick: 'req-filter-quick',
                from: 'req-filter-from',
                to: 'req-filter-to'
            }
        }
    };

    // --- GENERIC HELPERS ---

    function getElement(id) {
        return document.getElementById(id);
    }

    function applyFiltersByType(type) {
        const config = FILTER_CONFIG[type];
        if (!config) return;

        if (window.FilterManager && typeof window.FilterManager[config.applyFn] === 'function') {
            window.FilterManager[config.applyFn]();
        } else if (type === 'mappings' && typeof window.FilterManager?.applyMappingFilters === 'function') {
            window.FilterManager.applyMappingFilters();
        } else if (type === 'requests' && typeof window.FilterManager?.applyRequestFilters === 'function') {
            window.FilterManager.applyRequestFilters();
        }
    }

    function updateActiveDisplay(type) {
        const config = FILTER_CONFIG[type];
        if (!config) return;

        const queryInput = getElement(config.queryInput);
        const container = getElement(config.activeContainer);
        const list = getElement(config.activeList) || container;

        if (!queryInput || !container) return;

        const query = queryInput.value.trim();
        
        if (!query || !window.QueryParser) {
            if (list) list.innerHTML = '';
            container.classList.add('filter-hidden');
            return;
        }

        const parsed = window.QueryParser.parseQuery(query);
        if (!parsed || Object.keys(parsed).length === 0) {
            if (list) list.innerHTML = '';
            container.classList.add('filter-hidden');
            return;
        }

        const chips = [];
        Object.entries(parsed).forEach(function([key, value]) {
            if (key === 'text') return;

            let chipText = '';
            if (key === 'matched') {
                const valStr = String(Array.isArray(value) ? value[0] : value).toLowerCase();
                chipText = (valStr === 'true' || valStr === 'yes' || valStr === '1') ? 'Matched' : 'Unmatched';
            } else if (typeof value === 'object' && value.exclude) {
                const exclude = Array.isArray(value.exclude) ? value.exclude.join(',') : value.exclude;
                chipText = `NOT ${key}: ${exclude}`;
            } else if (typeof value === 'object' && value.from && value.to) {
                chipText = `${key}: ${value.from}-${value.to}`;
            } else {
                chipText = `${key}: ${Array.isArray(value) ? value.join(',') : value}`;
            }

            chips.push(`
                <button type="button" class="filter-chip filter-chip-active" 
                        onclick="removeActiveFilter('${type}', '${key}')" title="Remove filter">
                    ${chipText} <span class="filter-chip-remove" aria-hidden="true">×</span>
                </button>
            `);
        });

        if (list) list.innerHTML = chips.join('');
        
        if (chips.length > 0) {
            container.classList.remove('filter-hidden');
        } else {
            container.classList.add('filter-hidden');
        }
    }

    // --- PUBLIC API ---

    window.applyFilters = function() {
        applyFiltersByType('mappings');
        if (typeof window._updateActiveFiltersDisplayDebounced === 'function') {
            window._updateActiveFiltersDisplayDebounced();
        } else {
            window.updateActiveFiltersDisplay();
        }
    };

    window.applyRequestFilters = function() {
        applyFiltersByType('requests');
        if (typeof window._updateRequestActiveFiltersDisplayDebounced === 'function') {
            window._updateRequestActiveFiltersDisplayDebounced();
        } else {
            window.updateRequestActiveFiltersDisplay();
        }
    };

    window.clearMappingFilters = function() {
        const input = getElement(FILTER_CONFIG.mappings.queryInput);
        if (input) input.value = '';
        
        applyFiltersByType('mappings');
        if (window.FilterManager?.flushMappingFilters) window.FilterManager.flushMappingFilters();
        
        window.updateActiveFiltersDisplay();
        if (typeof window.updateURLFilterParams === 'function') {
            window.updateURLFilterParams('', 'mappings');
        }
    };

    window.clearRequestFilters = function() {
        const config = FILTER_CONFIG.requests;
        const input = getElement(config.queryInput);
        if (input) input.value = '';

        // Clear time inputs
        if (config.timeInputs) {
            [config.timeInputs.quick, config.timeInputs.from, config.timeInputs.to].forEach(id => {
                const el = getElement(id);
                if (el) el.value = '';
            });
        }

        applyFiltersByType('requests');
        if (window.FilterManager?.flushRequestFilters) window.FilterManager.flushRequestFilters();

        window.updateRequestActiveFiltersDisplay();
        if (typeof window.updateURLFilterParams === 'function') {
            window.updateURLFilterParams('', 'requests');
        }
    };

    window.toggleQueryHelp = function(tab = 'mappings') {
        const helpId = tab === 'requests' ? 'req-query-help' : 'query-help';
        const helpEl = getElement(helpId);
        if (!helpEl) return;

        const isHidden = helpEl.classList.contains('hidden');
        const button = document.querySelector(`[aria-controls="${helpId}"]`);

        helpEl.classList.toggle('hidden', !isHidden);
        if (button) {
            button.textContent = isHidden ? '×' : '?';
            button.setAttribute('aria-expanded', String(isHidden));
        }
    };

    window.applyQuickMethodFilter = function(method) {
        const input = getElement(FILTER_CONFIG.mappings.queryInput);
        if (!input) return;

        const current = input.value.trim();
        const pattern = /method:[^\s]+/; // Note: regex literal is fine, no escaping needed here

        if (pattern.test(current)) {
            input.value = current.replace(pattern, `method:${method}`);
        } else {
            input.value = current ? `method:${method} ${current}` : `method:${method}`;
        }

        window.applyFilters();
    };

    // Generic remove active filter
    window.removeActiveFilter = function(type, key) {
        // If called with single argument (legacy mapping call), shift args
        let targetType = type;
        let targetKey = key;
        
        if (arguments.length === 1) {
            targetType = 'mappings';
            targetKey = type;
        }

        const config = FILTER_CONFIG[targetType];
        if (!config) return;

        const input = getElement(config.queryInput);
        if (!input) return;

        const query = input.value.trim();
        if (!query) return;

        // Remove key:value pattern
        // Handles: key:value, -key:value, key:val1,val2, key:from-to
        const patterns = [
            new RegExp(`-?${targetKey}:[^\s]+`, 'gi'),
            new RegExp(`\s+${targetKey}:[^\s]+`, 'gi'),
            new RegExp(`${targetKey}:[^\s]+\s+`, 'gi')
        ];

        let newQuery = query;
        patterns.forEach(p => { newQuery = newQuery.replace(p, ' '); });
        input.value = newQuery.replace(/\s+/g, ' ').trim();

        if (targetType === 'mappings') {
            window.applyFilters();
        } else {
            window.applyRequestFilters();
        }
    };

    // Legacy wrappers for backward compatibility
    window.removeRequestActiveFilter = function(key) {
        window.removeActiveFilter('requests', key);
    };

    window.updateActiveFiltersDisplay = function() {
        updateActiveDisplay('mappings');
    };

    window.updateRequestActiveFiltersDisplay = function() {
        updateActiveDisplay('requests');
    };

    // Debouncers
    if (window.debounce) {
        window._updateActiveFiltersDisplayDebounced = window.debounce(window.updateActiveFiltersDisplay, 200);
        window._updateRequestActiveFiltersDisplayDebounced = window.debounce(window.updateRequestActiveFiltersDisplay, 200);
    }

    // --- TIME FILTERS ---

    window.applyQuickFilter = function() { // Legacy name, actually quick request time filter
        const quickEl = getElement(FILTER_CONFIG.requests.timeInputs.quick);
        if (!quickEl) return;
        window.applyQuickTimeFilter(); 
    };

    window.clearQuickTimeFilter = function() {
        const quickEl = getElement(FILTER_CONFIG.requests.timeInputs.quick);
        if (quickEl) quickEl.value = '';
    };

    window.applyQuickTimeFilter = function() {
        const quickEl = getElement(FILTER_CONFIG.requests.timeInputs.quick);
        const fromEl = getElement(FILTER_CONFIG.requests.timeInputs.from);
        const toEl = getElement(FILTER_CONFIG.requests.timeInputs.to);

        if (!quickEl || !fromEl || !toEl) return;

        const value = quickEl.value;
        if (!value) {
            fromEl.value = '';
            toEl.value = '';
            window.applyRequestFilters();
            return;
        }

        const match = value.match(/^(\d+)([mhd])$/);
        if (!match) return;

        const amount = parseInt(match[1], 10);
        const unit = match[2];
        const now = new Date();
        const fromTime = new Date(now);

        if (unit === 'm') fromTime.setMinutes(fromTime.getMinutes() - amount);
        else if (unit === 'h') fromTime.setHours(fromTime.getHours() - amount);
        else if (unit === 'd') fromTime.setDate(fromTime.getDate() - amount);

        fromEl.value = Utils.formatDateTime(fromTime);
        toEl.value = Utils.formatDateTime(now);

        window.applyRequestFilters();
    };

    window.applyQuickRequestFilter = function(filter) {
        const input = getElement(FILTER_CONFIG.requests.queryInput);
        if (!input) return;

        const current = input.value.trim();
        // Method filter (uppercase only)
        if (/^[A-Z]+$/.test(filter)) {
            const pattern = /method:[\w,]+/i;
            if (pattern.test(current)) {
                input.value = current.replace(pattern, `method:${filter}`);
            } else {
                input.value = current ? `method:${filter} ${current}` : `method:${filter}`;
            }
        } else {
            // key:value filter
            const keyMatch = filter.match(/^(\w+):/);
            if (keyMatch) {
                const key = keyMatch[1];
                const pattern = new RegExp(`${key}:[^\s]+`, 'i');
                if (pattern.test(current)) {
                    input.value = current.replace(pattern, filter);
                } else {
                    input.value = current ? `${filter} ${current}` : filter;
                }
            } else {
                input.value = current ? `${filter} ${current}` : filter;
            }
        }

        window.applyRequestFilters();
    };

    // --- SAVED FILTERS ---

    function getSavedFilters(type) {
        const config = FILTER_CONFIG[type];
        try {
            const stored = localStorage.getItem(config.storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.warn(`Failed to load saved filters for ${type}`, e);
            return [];
        }
    }

    function saveFilter(type) {
        const config = FILTER_CONFIG[type];
        const input = getElement(config.queryInput);
        if (!input) return;

        const query = input.value.trim();
        if (!query) {
            if (window.NotificationManager) window.NotificationManager.warning('No filter to save');
            return;
        }

        const name = prompt('Enter a name for this filter:', query.substring(0, 30));
        if (!name) return;

        const filters = getSavedFilters(type);
        const existingIndex = filters.findIndex(f => f.name === name);

        if (existingIndex >= 0) {
            if (!confirm(`Filter "${name}" already exists. Overwrite?`)) return;
            filters[existingIndex] = { name, query };
        } else {
            filters.push({ name, query });
        }

        try {
            localStorage.setItem(config.storageKey, JSON.stringify(filters));
            updateSavedFiltersDisplay(type);
            if (window.NotificationManager) window.NotificationManager.success(`Filter "${name}" saved`);
        } catch (e) {
            console.error('Failed to save filter', e);
        }
    }

    function updateSavedFiltersDisplay(type) {
        const config = FILTER_CONFIG[type];
        const filters = getSavedFilters(type);
        const list = getElement(config.savedList);
        const separator = getElement(config.savedSeparator);

        if (!list) return;

        if (filters.length === 0) {
            list.classList.add('filter-hidden');
            if (separator) separator.classList.add('filter-hidden');
            return;
        }

        const chips = filters.map(filter => `
            <button type="button" class="filter-chip filter-chip-saved"
                    onclick="applySavedFilter('${type}', '${filter.name.replace(/'/g, "\'")}')"
                    title="${Utils.escapeHtml(filter.query)}">
                <span class="filter-chip-text">${Utils.escapeHtml(filter.name)}</span>
                <span class="filter-chip-remove"
                      onclick="event.stopPropagation(); deleteSavedFilter('${type}', '${filter.name.replace(/'/g, "\'")}')"
                      title="Delete filter">×</span>
            </button>
        `);

        list.innerHTML = chips.join('');
        list.classList.remove('filter-hidden');
        if (separator) separator.classList.remove('filter-hidden');
    }

    window.saveCurrentMappingFilter = function() { saveFilter('mappings'); };
    window.saveCurrentRequestFilter = function() { saveFilter('requests'); };

    window.applySavedFilter = function(type, name) {
        const filters = getSavedFilters(type);
        const filter = filters.find(f => f.name === name);
        if (!filter) return;

        const config = FILTER_CONFIG[type];
        const input = getElement(config.queryInput);
        if (input) {
            input.value = filter.query;
            if (type === 'mappings') window.applyFilters();
            else window.applyRequestFilters();
        }
    };

    window.deleteSavedFilter = function(type, name) {
        const config = FILTER_CONFIG[type];
        const filters = getSavedFilters(type).filter(f => f.name !== name);
        
        try {
            localStorage.setItem(config.storageKey, JSON.stringify(filters));
            updateSavedFiltersDisplay(type);
            if (window.NotificationManager) window.NotificationManager.info(`Filter "${name}" deleted`);
        } catch (e) {
            console.error('Failed to delete filter', e);
        }
    };

    window.loadAllSavedFilters = function() {
        updateSavedFiltersDisplay('mappings');
        updateSavedFiltersDisplay('requests');
    };

})(typeof window !== 'undefined' ? window : globalThis);