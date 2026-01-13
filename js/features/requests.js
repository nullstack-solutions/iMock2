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
        loadingState.classList.remove('hidden');
        container.style.display = 'none';
        emptyState.classList.add('hidden');

        if (requestsToRender === null) {
            let data;
            try {
                data = await apiFetch(ENDPOINTS.REQUESTS);
            } catch (error) {
                if (window.DemoData?.isAvailable?.() && window.DemoData?.getRequestsPayload) {
                    console.warn('⚠️ Falling back to demo requests.', error);
                    window.demoModeLastError = error;
                    markDemoModeActive('requests-fallback');
                    data = window.DemoData.getRequestsPayload();
                } else {
                    throw error;
                }
            }

            if (data && data.__source) {
                reqSource = data.__source;
                if (reqSource === 'demo') markDemoModeActive('requests-fallback');
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
            if (reqSource === 'demo') markDemoModeActive('manual-requests');
        }

        loadingState.classList.add('hidden');

        if (window.allRequests.length === 0) {
            emptyState.classList.remove('hidden');
            updateRequestsCounter();
            return true;
        }
        
        container.style.display = 'block';
        window.invalidateElementCache(SELECTORS.LISTS.REQUESTS);

        renderList(container, window.allRequests, {
            renderItem: window.renderRequestCard,
            getKey: getRequestRenderKey,
            getSignature: getRequestRenderSignature
        });
        
        updateRequestsCounter();
        if (typeof updateRequestsSourceIndicator === 'function') updateRequestsSourceIndicator(reqSource);
        console.log(`📦 Requests render from: ${reqSource} — ${window.allRequests.length} items`);

        return true;
    } catch (error) {
        console.error('Error in fetchAndRenderRequests:', error);
        NotificationManager.error(`Failed to load requests: ${error.message}`);
        loadingState.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return false;
    }
};

window.renderRequestCard = function(request) {
    if (!request) return '';
    
    const matched = request.wasMatched !== false;
    const clientIp = request.request?.clientIp || 'Unknown';
    
    const data = {
        id: request.id || '',
        method: request.request?.method || 'GET',
        url: request.request?.url || request.request?.urlPath || 'N/A',
        status: request.responseDefinition?.status || (matched ? 200 : 404),
        time: `${Utils.parseRequestTime(request.request.loggedDate)} <span class="request-ip">IP: ${Utils.escapeHtml(clientIp)}</span>`,
        extras: {
            badges: matched
                ? `<span class="badge badge-success">${Icons.render('check-circle', { className: 'badge-icon' })}<span>Matched</span></span>`
                : `<span class="badge badge-danger">${Icons.render('x-circle', { className: 'badge-icon' })}<span>Unmatched</span></span>`,
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
};

window.updateRequestsCounter = function() {
    const counter = document.getElementById(SELECTORS.COUNTERS.REQUESTS);
    if (counter) {
        counter.textContent = Array.isArray(window.allRequests) ? window.allRequests.length : 0;
    }
    updateRequestTabCounts();
};

function updateRequestTabCounts() {
    const counts = window.requestTabTotals || computeRequestTabTotals(window.originalRequests);
    const targets = {
        all: document.getElementById('requests-tab-all'),
        matched: document.getElementById('requests-tab-matched'),
        unmatched: document.getElementById('requests-tab-unmatched')
    };
    Object.entries(targets).forEach(([key, element]) => {
        if (element) element.textContent = counts?.[key] ?? 0;
    });
}

function setActiveFilterTab(button) {
    if (!button) return;
    const group = button.dataset.filterGroup;
    if (!group) return;
    document.querySelectorAll(`.filter-tab[data-filter-group="${group}"]`).forEach(tab => {
        tab.classList.toggle('active', tab === button);
    });
}

window.syncFilterTabsFromSelect = function(group, value) {
    const normalizedValue = (value || '').toString().toLowerCase();
    const tabs = document.querySelectorAll(`.filter-tab[data-filter-group="${group}"]`);
    let activated = false;
    tabs.forEach(tab => {
        const tabValue = (tab.dataset.filterValue || '').toLowerCase();
        const isMatch = tabValue === normalizedValue || (!tabValue && !normalizedValue);
        tab.classList.toggle('active', isMatch);
        if (isMatch) activated = true;
    });
    if (!activated && tabs.length > 0) tabs[0].classList.add('active');
};

window.handleRequestTabClick = (button, status) => {
    setActiveFilterTab(button);
    const select = document.getElementById('req-filter-status');
    if (select) {
        select.value = status || '';
        if (typeof applyRequestFilters === 'function') applyRequestFilters();
    }
};

window.initializeFilterTabs = () => {
    const mappingSelect = document.getElementById('filter-method');
    if (mappingSelect) {
        mappingSelect.addEventListener('change', () => syncFilterTabsFromSelect('mapping', mappingSelect.value));
        syncFilterTabsFromSelect('mapping', mappingSelect.value);
    }
    const requestStatusSelect = document.getElementById('req-filter-status');
    if (requestStatusSelect) {
        requestStatusSelect.addEventListener('change', () => syncFilterTabsFromSelect('requests', requestStatusSelect.value));
        syncFilterTabsFromSelect('requests', requestStatusSelect.value);
    }
    updateRequestTabCounts();
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