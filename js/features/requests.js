'use strict';

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

        renderList(container, window.allRequests, {
            renderItem: renderRequestMarkup,
            getKey: getRequestRenderKey,
            getSignature: getRequestRenderSignature
        });
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

    // Show modal with loader immediately
    window.showModal('edit-mapping-modal');
    window.setMappingEditorBusyState(true, 'Loading…');

    // Update modal title
    const modalTitleElement = document.getElementById(SELECTORS.MODAL.TITLE);
    if (modalTitleElement) modalTitleElement.textContent = 'Edit Mapping';

    // Fetch latest mapping from server (single load, no optimistic cache)
    try {
        const latest = await apiFetch(`/mappings/${encodeURIComponent(mapping.id)}`);
        const latestMapping = latest?.mapping || latest;

        if (latestMapping?.id) {
            // Populate form once with fresh data
            window.populateEditMappingForm(latestMapping);

            // Update cache
            const idx = window.allMappings.findIndex(m => m.id === mapping.id);
            if (idx !== -1) {
                window.allMappings[idx] = latestMapping;
                addMappingToIndex(latestMapping);
            }
        } else {
            throw new Error('Invalid mapping response');
        }
    } catch (e) {
        console.warn('Failed to load mapping from server, using cache:', e);
        // Fallback to cached version if server fails
        window.populateEditMappingForm(mapping);
    } finally {
        window.setMappingEditorBusyState(false);
    }
};

// REMOVED: updateMapping function moved to editor.js

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

