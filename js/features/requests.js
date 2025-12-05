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

        // Use Virtual Scroller for performance with large lists
        // Falls back to traditional rendering for < 500 items
        if (typeof window.initRequestsVirtualScroller === 'function') {
            window.initRequestsVirtualScroller(window.allRequests, container);
        } else {
            // Fallback: traditional rendering
            renderList(container, window.allRequests, {
                renderItem: renderRequestMarkup,
                getKey: getRequestRenderKey,
                getSignature: getRequestRenderSignature
            });
        }
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

// Make this function globally accessible for URLStateManager
window.syncFilterTabsFromSelect = function syncFilterTabsFromSelect(group, value) {
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

    updateRequestTabCounts();
};

// --- ACTION HANDLERS (deduplicated connectToWireMock) ---

// Protection against concurrent modal openings
let isModalOpening = false;

window.openEditModal = async (identifier) => {
    // Prevent concurrent modal openings
    if (isModalOpening) {
        console.warn('[Modal Performance] Modal already opening, ignoring duplicate request');
        return;
    }

    isModalOpening = true;

    try {
        const normalizeIdentifier = (value) => {
            if (typeof value === 'string') return value.trim();
            if (value === undefined || value === null) return '';
            return String(value).trim();
        };

        const targetIdentifier = normalizeIdentifier(identifier);

        if (!targetIdentifier) {
            NotificationManager.show('Invalid mapping identifier', NotificationManager.TYPES.ERROR);
            return;
        }

        // Clear previous editing states
        if (typeof UIComponents?.clearCardState === 'function') {
            UIComponents.clearCardState('mapping', 'is-editing');
        }
        if (targetIdentifier && typeof UIComponents?.setCardState === 'function') {
            UIComponents.setCardState('mapping', targetIdentifier, 'is-editing', true);
        }

        // Show modal with loading state immediately
        if (typeof window.showModal === 'function') {
            window.showModal('edit-mapping-modal');
        } else {
            console.warn('showModal function not found');
            return;
        }

        if (typeof window.setMappingEditorBusyState === 'function') {
            window.setMappingEditorBusyState(true, 'Loading…');
        }

        // Update the modal title
        const modalTitleElement = document.getElementById(SELECTORS.MODAL.TITLE);
        if (modalTitleElement) modalTitleElement.textContent = 'Edit Mapping';

        console.log('🔴 [OPEN MODAL DEBUG] openEditModal called for mapping identifier:', identifier);

        // PERFORMANCE OPTIMIZATION: Smart loading strategy
        // For small mappings: instant load from cache
        // For large mappings: show modal fast, then load data
        const LARGE_MAPPING_THRESHOLD = 500 * 1024; // 500 KB

        let cachedMapping = null;
        let estimatedSize = 0;

        // Try to get mapping from cache first
        if (typeof window.cacheManager !== 'undefined' && window.cacheManager.cache) {
            cachedMapping = window.cacheManager.cache.get(targetIdentifier);
            if (cachedMapping) {
                try {
                    estimatedSize = JSON.stringify(cachedMapping).length;
                } catch {
                    estimatedSize = 0;
                }
            }
        }

        const isLargeMapping = estimatedSize > LARGE_MAPPING_THRESHOLD;

        if (isLargeMapping) {
            console.log(`📦 [Modal Performance] Large mapping detected (${(estimatedSize / 1024).toFixed(2)} KB) - using optimized loading`);
        }

        // Fetch fresh data from server (single source of truth)
        const latest = await apiFetch(`/mappings/${encodeURIComponent(targetIdentifier)}`);
        const latestMapping = latest?.mapping || latest;

        if (!latestMapping || !latestMapping.id) {
            throw new Error('Invalid mapping response from server');
        }

        console.log('🔵 [OPEN MODAL DEBUG] Loaded mapping from server:', latestMapping);

        // Populate form once with fresh data
        if (typeof window.populateEditMappingForm === 'function') {
            window.populateEditMappingForm(latestMapping);
        } else {
            console.error('populateEditMappingForm function not found!');
            return;
        }

        // Update cache if mappings are loaded
        if (window.allMappings && Array.isArray(window.allMappings)) {
            const collectCandidateIdentifiers = (mapping) => {
                if (!mapping || typeof mapping !== 'object') return [];
                return [
                    mapping.id,
                    mapping.uuid,
                    mapping.stubMappingId,
                    mapping.stubId,
                    mapping.mappingId,
                    mapping.metadata?.id
                ].map(normalizeIdentifier).filter(Boolean);
            };

            const idx = window.allMappings.findIndex((candidate) =>
                collectCandidateIdentifiers(candidate).includes(targetIdentifier)
            );

            if (idx !== -1) {
                window.allMappings[idx] = latestMapping;
                addMappingToIndex(latestMapping);
            }
        }

        console.log('🔴 [OPEN MODAL DEBUG] openEditModal completed successfully');
    } catch (e) {
        console.error('Failed to load mapping:', e);
        NotificationManager.show('Failed to load mapping: ' + e.message, NotificationManager.TYPES.ERROR);
        // Close modal on error
        if (typeof window.hideModal === 'function') {
            window.hideModal('edit-mapping-modal');
        }
    } finally {
        if (typeof window.setMappingEditorBusyState === 'function') {
            window.setMappingEditorBusyState(false);
        }
        // Reset flag to allow future modal openings
        isModalOpening = false;
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

/**
 * Clone mapping for creation (strip server-generated fields)
 * @param {Object} mapping Original mapping
 * @returns {Object} Cloned mapping ready for creation
 */
function cloneMappingForCreation(mapping) {
    if (!mapping) return null;

    // Shallow copy
    const clone = { ...mapping };

    // Remove server-generated fields
    delete clone.id;
    delete clone.uuid;
    delete clone.insertionIndex;
    delete clone.metadata;

    return clone;
}

/**
 * Ensure duplicate has unique name
 * @param {Object} clone Cloned mapping
 * @param {Object} original Original mapping
 * @returns {Object} Clone with updated name
 */
function ensureDuplicateName(clone, original) {
    // Add suffix to name
    if (clone.name) {
        clone.name = clone.name + ' (copy)';
    } else if (original.request?.urlPattern) {
        clone.name = original.request.urlPattern + ' (copy)';
    } else if (original.request?.url) {
        clone.name = original.request.url + ' (copy)';
    }

    return clone;
}

/**
 * Duplicate a mapping
 * @param {string} mappingId ID of mapping to duplicate
 * @returns {Promise} Promise resolving to created mapping
 */
window.duplicateMapping = async (mappingId) => {
    try {
        // Fetch original mapping
        const original = await window.getMappingById(mappingId);
        if (!original) {
            throw new Error('Mapping not found');
        }

        // Clone and prepare for creation
        const clone = cloneMappingForCreation(original);
        ensureDuplicateName(clone, original);

        // Create on server
        const response = await apiFetch(ENDPOINTS.MAPPINGS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clone)
        });

        NotificationManager.success('Mapping duplicated successfully');

        // Refresh mappings list
        await window.fetchAndRenderMappings();

        return response;
    } catch (error) {
        NotificationManager.error('Failed to duplicate mapping: ' + error.message);
        console.error('[Duplicate] Error:', error);
        throw error;
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

