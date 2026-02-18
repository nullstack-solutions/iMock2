'use strict';

(function initialiseRenderHelpers() {
    const methodOrder = { GET: 1, POST: 2, PUT: 3, PATCH: 4, DELETE: 5 };

    const getRenderKey = (item, ...keys) => {
        if (!item || typeof item !== 'object') return '';
        for (const key of keys) {
            const value = key.includes('.')
                ? key.split('.').reduce((obj, part) => obj?.[part], item)
                : item[key];
            if (value != null) return String(value);
        }
        return '';
    };

    const stringifyForSignature = (value) => {
        if (value == null) return '';
        try {
            const str = typeof value === 'string' ? value : JSON.stringify(value);
            return str.length > 300 ? `${str.slice(0, 300)}…` : str;
        } catch {
            return '';
        }
    };

    const getMappingRenderKey = (mapping) => getRenderKey(mapping, 'id', 'uuid', 'stubId');
    const getRequestRenderKey = (request) => getRenderKey(request, 'id', 'requestId', 'mappingUuid', 'request.id', 'request.loggedDate', 'loggedDate');

    const getMappingRenderSignature = (mapping) => {
        if (!mapping || typeof mapping !== 'object') return '';
        const request = mapping.request || {};
        const response = mapping.response || {};
        const metadata = mapping.metadata || {};
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
            stringifyForSignature(metadata.additionalMetadata || metadata.tags || metadata.description || ''),
        ].join('|');
    };

    const getRequestRenderSignature = (request) => {
        if (!request || typeof request !== 'object') return '';
        const req = request.request || {};
        const res = request.responseDefinition || {};
        return [
            req.method || '',
            req.url || req.urlPath || '',
            req.loggedDate || request.loggedDate || '',
            request.wasMatched === false ? 'unmatched' : 'matched',
            res.status ?? '',
            (res.body || res.jsonBody || '').length,
            (req.body || '').length,
        ].join('|');
    };

    const sortMappingsForDisplay = (mappings) => {
        const source = Array.isArray(mappings) ? mappings : [];
        return [...source].sort((a, b) => {
            const priorityA = a?.priority ?? 1;
            const priorityB = b?.priority ?? 1;
            if (priorityA !== priorityB) return priorityA - priorityB;

            const methodA = methodOrder[a?.request?.method] || 999;
            const methodB = methodOrder[b?.request?.method] || 999;
            if (methodA !== methodB) return methodA - methodB;

            const urlA = a?.request?.url || a?.request?.urlPattern || a?.request?.urlPath || '';
            const urlB = b?.request?.url || b?.request?.urlPattern || b?.request?.urlPath || '';
            return urlA.localeCompare(urlB);
        });
    };

    const renderMappingMarkup = (mapping) => (typeof window.renderMappingCard === 'function' ? window.renderMappingCard(mapping) : '');
    const renderRequestMarkup = (request) => (typeof window.renderRequestCard === 'function' ? window.renderRequestCard(request) : '');

    const renderMappingsCollection = (container, mappings, options = {}) => {
        if (!container || typeof window.renderList !== 'function') {
            return [];
        }
        const sortedMappings = options.preSorted === true ? [...(mappings || [])] : sortMappingsForDisplay(mappings);
        const onItemChanged = options.onItemChanged;
        const onItemRemoved = options.onItemRemoved;

        if (window.PaginationManager) {
            window.PaginationManager.updateState(sortedMappings.length);
            const pageItems = window.PaginationManager.getCurrentPageItems(sortedMappings);
            window.renderList(container, pageItems, {
                renderItem: renderMappingMarkup,
                getKey: getMappingRenderKey,
                getSignature: getMappingRenderSignature,
                onItemChanged,
                onItemRemoved,
            });
            const paginationContainer = document.getElementById(options.paginationContainerId || 'mappings-pagination');
            if (paginationContainer) {
                paginationContainer.innerHTML = window.PaginationManager.renderControls();
            }
            return sortedMappings;
        }

        window.renderList(container, sortedMappings, {
            renderItem: renderMappingMarkup,
            getKey: getMappingRenderKey,
            getSignature: getMappingRenderSignature,
            onItemChanged,
            onItemRemoved,
        });
        return sortedMappings;
    };

    window.getRenderKey = getRenderKey;
    window.getMappingRenderKey = getMappingRenderKey;
    window.getRequestRenderKey = getRequestRenderKey;
    window.getMappingRenderSignature = getMappingRenderSignature;
    window.getRequestRenderSignature = getRequestRenderSignature;
    window.renderMappingMarkup = renderMappingMarkup;
    window.renderRequestMarkup = renderRequestMarkup;
    window.sortMappingsForDisplay = sortMappingsForDisplay;
    window.renderMappingsCollection = renderMappingsCollection;
})();
