'use strict';

const DUPLICATE_NAME_SUFFIX = ' (copy)';

function normalizeMappingIdentifier(value) {
    if (typeof value === 'string') {
        return value.trim();
    }
    if (value === undefined || value === null) {
        return '';
    }
    return String(value).trim();
}

function collectCandidateMappingIdentifiers(mapping) {
    if (!mapping || typeof mapping !== 'object') {
        return [];
    }
    return [
        mapping.id,
        mapping.uuid,
        mapping.stubMappingId,
        mapping.stubId,
        mapping.mappingId,
        mapping.metadata?.id
    ].map(normalizeMappingIdentifier).filter(Boolean);
}

function findMappingInCache(identifier) {
    const targetIdentifier = normalizeMappingIdentifier(identifier);
    if (!targetIdentifier) {
        return null;
    }

    if (window.mappingIndex instanceof Map) {
        const direct = window.mappingIndex.get(targetIdentifier);
        if (direct) {
            return direct;
        }
    }

    if (Array.isArray(window.allMappings)) {
        return window.allMappings.find((candidate) => collectCandidateMappingIdentifiers(candidate).includes(targetIdentifier)) || null;
    }

    return null;
}

function cloneMappingForCreation(mapping, { sourceTag = 'ui' } = {}) {
    if (!mapping || typeof mapping !== 'object') {
        throw new Error('Cannot clone mapping: invalid source data');
    }

    let clone;
    if (typeof structuredClone === 'function') {
        clone = structuredClone(mapping);
    } else {
        clone = JSON.parse(JSON.stringify(mapping));
    }

    delete clone.id;
    delete clone.uuid;
    delete clone.stubMappingId;
    delete clone.stubId;
    delete clone.mappingId;

    if (!clone.metadata || typeof clone.metadata !== 'object') {
        clone.metadata = {};
    }

    delete clone.metadata.id;
    delete clone.metadata.created;
    delete clone.metadata.edited;

    const nowIso = new Date().toISOString();
    clone.metadata.created = nowIso;
    clone.metadata.edited = nowIso;
    clone.metadata.source = sourceTag;

    return clone;
}

function ensureDuplicateName(clone, original) {
    if (!clone) {
        return;
    }

    const originalName = typeof clone.name === 'string' && clone.name.trim()
        ? clone.name.trim()
        : (typeof original?.name === 'string' && original.name.trim()
            ? original.name.trim()
            : (original?.request?.url || original?.request?.urlPath || original?.request?.urlPattern || 'New mapping'));

    if (!originalName) {
        clone.name = `Copy of mapping`;
        return;
    }

    if (originalName.toLowerCase().includes('copy')) {
        clone.name = originalName;
    } else {
        clone.name = `${originalName}${DUPLICATE_NAME_SUFFIX}`;
    }
}

window.fetchAndRenderRequests = async (requestsToRender = null, options = {}) => {
    const container = document.getElementById(SELECTORS.LISTS.REQUESTS);
    const emptyState = document.getElementById(SELECTORS.EMPTY.REQUESTS);
    const loadingState = document.getElementById(SELECTORS.LOADING.REQUESTS);

    if (!container || !emptyState || !loadingState) {
        console.error('Required DOM elements not found for requests rendering');
        return false;
    }
    
    try {
        let reqSource = 'direct';
        if (requestsToRender === null) {
            loadingState.classList.remove('hidden');
            container.style.display = 'none';
            emptyState.classList.add('hidden');

            let data;
            try {
                data = await apiFetch(ENDPOINTS.REQUESTS);
            } catch (error) {
                if (window.DemoData?.isAvailable?.() && window.DemoData?.getRequestsPayload) {
                    console.warn('⚠️ Falling back to demo requests because the WireMock API request failed.', error);
                    window.demoModeLastError = error;
                    markDemoModeActive('requests-fallback');
                    data = window.DemoData.getRequestsPayload();
                } else {
                    throw error;
                }
            }

            if (data && data.__source) {
                reqSource = data.__source;
                if (reqSource === 'demo') {
                    markDemoModeActive('requests-fallback');
                }
                try { delete data.__source; } catch (_) {}
            }

            window.originalRequests = data.requests || [];
            refreshRequestTabSnapshot();
            window.allRequests = [...window.originalRequests];
        } else {
            const sourceOverride = options?.source;
            window.allRequests = Array.isArray(requestsToRender) ? [...requestsToRender] : [];
            window.originalRequests = [...window.allRequests];
            refreshRequestTabSnapshot();
            reqSource = sourceOverride || 'custom';
            if (reqSource === 'demo') {
                markDemoModeActive('manual-requests');
            }
        }

        loadingState.classList.add('hidden');

        if (window.allRequests.length === 0) {
            emptyState.classList.remove('hidden');
            container.style.display = 'none';
            updateRequestsCounter();
            return true;
        }
        
        emptyState.classList.add('hidden');
        container.style.display = 'block';

        // Invalidate cache before re-rendering to ensure fresh DOM references
        window.invalidateElementCache(SELECTORS.LISTS.REQUESTS);

        // Use Virtual Scroller for performance with large lists
        window.initRequestsVirtualScroller(window.allRequests, container);
        updateRequestsCounter();
        // Source indicator + log, mirroring mappings
        if (typeof updateRequestsSourceIndicator === 'function') updateRequestsSourceIndicator(reqSource);
        console.log(`📦 Requests render from: ${reqSource} — ${window.allRequests.length} items`);

        return true;
    } catch (error) {
        console.error('Error in fetchAndRenderRequests:', error);
        NotificationManager.error(`Failed to load requests: ${error.message}`);
        loadingState.classList.add('hidden');
        emptyState.classList.remove('hidden');
        container.style.display = 'none';
        return false;
    }
};

// Compact request renderer through UIComponents (shortened from ~62 to 18 lines)
window.renderRequestCard = function(request) {
    if (!request) {
        console.warn('Invalid request data:', request);
        return '';
    }
    
    const matched = request.wasMatched !== false;
    const clientIp = request.request?.clientIp || 'Unknown';
    
    const data = {
        id: request.id || '',
        method: request.request?.method || 'GET',
        url: request.request?.url || request.request?.urlPath || 'N/A',
        status: request.responseDefinition?.status || (matched ? 200 : 404),
        time: `${Utils.parseRequestTime(request.request.loggedDate)} <span class="request-ip">IP: ${Utils.escapeHtml(clientIp)}</span>`,
        extras: {
            badges: `
                ${matched
                    ? `<span class="badge badge-success">${Icons.render('check-circle', { className: 'badge-icon' })}<span>Matched</span></span>`
                    : `<span class="badge badge-danger">${Icons.render('x-circle', { className: 'badge-icon' })}<span>Unmatched</span></span>`}
            `,
            preview: UIComponents.createPreviewSection(`${Icons.render('request-in', { className: 'icon-inline' })} Request`, {
                'Method': request.request?.method,
                'URL': request.request?.url || request.request?.urlPath,
                'Client IP': clientIp,
                'Headers': request.request?.headers,
                'Body': request.request?.body
            }) + UIComponents.createPreviewSection(`${Icons.render('response-out', { className: 'icon-inline' })} Response`, {
                'Status': request.responseDefinition?.status,
                'Matched': matched ? 'Yes' : 'No',
                'Headers': request.responseDefinition?.headers,
                'Body': request.responseDefinition?.jsonBody || request.responseDefinition?.body
            })
        }
    };
    
    return UIComponents.createCard('request', data, []);
}

// Update the requests counter
function updateRequestsCounter() {
    const counter = document.getElementById(SELECTORS.COUNTERS.REQUESTS);
    if (counter) {
        counter.textContent = Array.isArray(window.allRequests) ? window.allRequests.length : 0;
    }
    updateRequestTabCounts();
}

window.updateRequestsCounter = updateRequestsCounter;

function updateRequestTabCounts() {
    const counts = window.requestTabTotals || computeRequestTabTotals(window.originalRequests);

    const requestCountTargets = {
        all: document.getElementById('requests-tab-all'),
        matched: document.getElementById('requests-tab-matched'),
        unmatched: document.getElementById('requests-tab-unmatched')
    };

    Object.entries(requestCountTargets).forEach(([key, element]) => {
        if (element) {
            element.textContent = counts?.[key] ?? 0;
        }
    });
}

function setActiveFilterTab(button) {
    if (!button) {
        return;
    }

    const group = button.dataset.filterGroup;
    if (!group) {
        return;
    }

    document.querySelectorAll(`.filter-tab[data-filter-group="${group}"]`).forEach(tab => {
        tab.classList.toggle('active', tab === button);
    });
}

function syncFilterTabsFromSelect(group, value) {
    const normalizedValue = (value || '').toString().toLowerCase();
    const tabs = document.querySelectorAll(`.filter-tab[data-filter-group="${group}"]`);
    let activated = false;

    tabs.forEach(tab => {
        const tabValue = (tab.dataset.filterValue || '').toLowerCase();
        const isMatch = tabValue === normalizedValue || (!tabValue && !normalizedValue);
        if (isMatch) {
            tab.classList.add('active');
            activated = true;
        } else {
            tab.classList.remove('active');
        }
    });

    if (!activated && tabs.length > 0) {
        tabs[0].classList.add('active');
    }
}

window.handleMappingTabClick = (button, method) => {
    setActiveFilterTab(button);
    const select = document.getElementById('filter-method');
    if (select) {
        select.value = method || '';
        if (typeof applyFilters === 'function') {
            applyFilters();
        }
    }
};

window.handleRequestTabClick = (button, status) => {
    setActiveFilterTab(button);
    const select = document.getElementById('req-filter-status');
    if (select) {
        select.value = status || '';
        if (typeof applyRequestFilters === 'function') {
            applyRequestFilters();
        }
    }
};

window.initializeFilterTabs = () => {
    const mappingSelect = document.getElementById('filter-method');
    if (mappingSelect) {
        mappingSelect.addEventListener('change', () => {
            syncFilterTabsFromSelect('mapping', mappingSelect.value);
        });
        syncFilterTabsFromSelect('mapping', mappingSelect.value);
    }

    const requestStatusSelect = document.getElementById('req-filter-status');
    if (requestStatusSelect) {
        requestStatusSelect.addEventListener('change', () => {
            syncFilterTabsFromSelect('requests', requestStatusSelect.value);
        });
        syncFilterTabsFromSelect('requests', requestStatusSelect.value);
    }

    updateMappingTabCounts();
    updateRequestTabCounts();
};

// --- ACTION HANDLERS (deduplicated connectToWireMock) ---

window.openEditModal = async (identifier) => {
    // Guard against missing mappings
    if (!window.allMappings || !Array.isArray(window.allMappings)) {
        NotificationManager.show('Mappings are not loaded', NotificationManager.TYPES.ERROR);
        return;
    }

    // Find mapping by ID (simplified - use mapping.id only)
    const mappingId = String(identifier || '').trim();
    let mapping = window.mappingIndex?.get(mappingId);

    if (!mapping) {
        mapping = window.allMappings.find(m => m.id === mappingId);
    }

    if (!mapping) {
        NotificationManager.show('Mapping not found', NotificationManager.TYPES.ERROR);
        return;
    }

    // Clear previous editing state and highlight current card
    UIComponents?.clearCardState('mapping', 'is-editing');
    UIComponents?.setCardState('mapping', mapping.id, 'is-editing', true);

    // Show the modal first
    if (typeof window.showModal === 'function') {
        window.showModal('edit-mapping-modal');
    } else {
        console.warn('showModal function not found');
        return;
    }

    console.log('🔴 [OPEN MODAL DEBUG] openEditModal called for mapping identifier:', identifier);
    console.log('🔴 [OPEN MODAL DEBUG] Found mapping (cached):', mapping);

    // Estimate mapping size to decide whether to show cached version first
    const estimateSize = (obj) => {
        try {
            return JSON.stringify(obj).length;
        } catch {
            return 0;
        }
    };

    const cachedSize = estimateSize(mapping);
    const isLargeMapping = cachedSize > 500000; // 500KB threshold

    // For small mappings, populate immediately with cached data
    // For large mappings, skip the initial population to avoid double-processing
    if (!isLargeMapping && typeof window.populateEditMappingForm === 'function') {
        try {
            await window.populateEditMappingForm(mapping);
        } catch (e) {
            console.error('populateEditMappingForm failed:', e);
            NotificationManager.error('Failed to load mapping');
            return;
        }
    }

    // Then fetch the latest mapping version
    try {
        if (typeof window.setMappingEditorBusyState === 'function') {
            window.setMappingEditorBusyState(true, 'Loading latest version…');
        }

        const mappingIdForFetch = normalizeIdentifier(mapping.id) || normalizeIdentifier(mapping.uuid) || targetIdentifier;
        const latest = await apiFetch(`/mappings/${encodeURIComponent(mappingIdForFetch)}`);
        const latestMapping = latest?.mapping || latest;

        if (latestMapping && latestMapping.id) {
            console.log('🔵 [OPEN MODAL DEBUG] Loaded latest mapping from server');

            // Update the reference in allMappings
            const idx = window.allMappings.findIndex((candidate) => candidate === mapping);
            if (idx !== -1) {
                window.allMappings[idx] = latestMapping;
                addMappingToIndex(latestMapping);
            }

            // Populate form with latest data
            if (typeof window.populateEditMappingForm === 'function') {
                await window.populateEditMappingForm(latestMapping);
            }
        } else {
            console.warn('Latest mapping response has unexpected shape, keeping cached version.', latest);
            // If we skipped initial population for large mapping, populate now
            if (isLargeMapping && typeof window.populateEditMappingForm === 'function') {
                await window.populateEditMappingForm(mapping);
            }
        }
    } catch (e) {
        console.warn('Failed to load latest mapping, using cached version.', e);
        // If we skipped initial population for large mapping, populate now
        if (isLargeMapping && typeof window.populateEditMappingForm === 'function') {
            try {
                await window.populateEditMappingForm(mapping);
            } catch (err) {
                console.error('populateEditMappingForm failed:', err);
                NotificationManager.error('Failed to load mapping');
            }
        }
    } finally {
        window.setMappingEditorBusyState(false);
    }

    // Update the modal title
    const modalTitleElement = document.getElementById(SELECTORS.MODAL.TITLE);
    if (modalTitleElement) modalTitleElement.textContent = 'Edit Mapping';

    console.log('🔴 [OPEN MODAL DEBUG] openEditModal completed for mapping identifier:', identifier);
};

// REMOVED: updateMapping function moved to editor.js

window.duplicateMapping = async (identifier) => {
    const mapping = findMappingInCache(identifier);
    if (!mapping) {
        NotificationManager.error('Mapping not found for duplication');
        return;
    }

    let payload;
    try {
        payload = cloneMappingForCreation(mapping, { sourceTag: 'duplicate' });
        ensureDuplicateName(payload, mapping);
    } catch (error) {
        console.warn('Failed to prepare mapping clone:', error);
        NotificationManager.error('Unable to duplicate mapping: invalid source data');
        return;
    }

    try {
        const response = await apiFetch('/mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const createdMapping = response?.mapping || response;
        NotificationManager.success('Mapping duplicated!');

        try {
            if (createdMapping && createdMapping.id && typeof updateOptimisticCache === 'function') {
                // The server has already confirmed the copy, so update the cache immediately
                updateOptimisticCache(createdMapping, 'create');
            }
        } catch (cacheError) {
            console.warn('Failed to update optimistic cache after duplication:', cacheError);
        }

        const hasActiveFilters = document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value ||
            document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value ||
            document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value;
        if (hasActiveFilters && window.FilterManager && typeof window.FilterManager.applyMappingFilters === 'function') {
            window.FilterManager.applyMappingFilters();
        }

        if (createdMapping && createdMapping.id) {
            const openInJson = confirm('Открыть дубликат в JSON редакторе? Нажмите Cancel, чтобы использовать встроенный редактор.');
            if (openInJson) {
                if (typeof window.editMapping === 'function') {
                    window.editMapping(createdMapping.id);
                } else {
                    NotificationManager.info('JSON editor is not available in this view.');
                }
            } else if (typeof window.openEditModal === 'function') {
                window.openEditModal(createdMapping.id);
            }
        }
    } catch (error) {
        console.error('Duplicate mapping failed:', error);
        NotificationManager.error(`Failed to duplicate mapping: ${error.message}`);
    }
};

window.deleteMapping = async (id) => {
    if (!confirm('Delete this mapping?')) return;

    try {
        // API call FIRST
        await apiFetch(`/mappings/${id}`, { method: 'DELETE' });

        NotificationManager.success('Mapping deleted!');

        // Update cache and UI with server confirmation
        removeMappingFromIndex(id);
        updateOptimisticCache({ id }, 'delete');

    } catch (e) {
        // Handle 404: mapping already deleted
        if (e.message.includes('404')) {
            console.log('🗑️ [DELETE] Mapping already deleted from server (404), updating cache locally');
            removeMappingFromIndex(id);
            updateOptimisticCache({ id }, 'delete');
            NotificationManager.success('Mapping was already deleted');
        } else {
            NotificationManager.error(`Delete failed: ${e.message}`);
        }
    }
};

window.clearRequests = async () => {
    if (!confirm('Clear all requests?')) return;
    
    try {
        await apiFetch('/requests', { method: 'DELETE' });
        NotificationManager.success('Requests cleared!');
        await fetchAndRenderRequests();
    } catch (e) {
        NotificationManager.error(`Clear failed: ${e.message}`);
    }
};
