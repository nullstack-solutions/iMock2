'use strict';

const FILTER_STATE_PREFIX = 'imock-filters-';

window.FilterManager = {
    saveFilterState(tabName, filters) {
        try {
            const key = `${FILTER_STATE_PREFIX}${tabName}`;
            localStorage.setItem(key, JSON.stringify(filters));
        } catch (e) {
            Logger.warn('MANAGERS', 'Failed to save filter state:', e);
        }
    },

    loadFilterState(tabName) {
        try {
            const key = `${FILTER_STATE_PREFIX}${tabName}`;
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            Logger.warn('MANAGERS', 'Failed to load filter state:', e);
            return {};
        }
    },

    applyMappingFilters() {
        if (typeof this._applyMappingFilters !== 'function') {
            return;
        }
        this._applyMappingFilters();
    },

    flushMappingFilters() {
        if (this._applyMappingFilters && typeof this._applyMappingFilters.flush === 'function') {
            this._applyMappingFilters.flush();
        }
    },

    applyRequestFilters() {
        if (typeof this._applyRequestFilters !== 'function') {
            return;
        }
        this._applyRequestFilters();
    },

    flushRequestFilters() {
        if (this._applyRequestFilters && typeof this._applyRequestFilters.flush === 'function') {
            this._applyRequestFilters.flush();
        }
    },

    restoreFilters(tabName) {
        if (tabName === 'mappings') {
            const urlFilter = getFilterFromURL('mappings');

            if (urlFilter) {
                const elem = document.getElementById('filter-query');
                if (elem) elem.value = urlFilter;
                return { query: urlFilter };
            }

            const filters = this.loadFilterState(tabName);
            if (filters.query) {
                const elem = document.getElementById('filter-query');
                if (elem) elem.value = filters.query;
            }
            return filters;
        } else if (tabName === 'requests') {
            const urlFilter = getFilterFromURL('requests');

            if (urlFilter) {
                const elem = document.getElementById('req-filter-query');
                if (elem) {
                    elem.value = urlFilter;
                    return { query: urlFilter };
                }
            }

            const filters = this.loadFilterState(tabName);

            const queryElem = document.getElementById('req-filter-query');
            if (queryElem && filters.query) {
                queryElem.value = filters.query;
            }

            const fromElem = document.getElementById('req-filter-from');
            const toElem = document.getElementById('req-filter-to');
            if (fromElem) fromElem.value = filters.from || '';
            if (toElem) toElem.value = filters.to || '';

            return filters;
        }

        return {};
    },

    getFiltersFromURL(tabName) {
        const query = getFilterFromURL(tabName);
        return { query: query || '' };
    },

    hasURLFilters(tabName) {
        const filters = this.getFiltersFromURL(tabName);
        return Object.values(filters).some(value => value !== '');
    }
};

Logger.info('MANAGERS', 'Filter state manager loaded');
