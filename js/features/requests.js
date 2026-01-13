'use strict';

window.fetchAndRenderRequests = async (data = null, options = {}) => {
    const container = document.getElementById(SELECTORS.LISTS.REQUESTS);
    if (!container) return false;

    try {
        let reqSource = options.source || 'direct';
        if (data === null) {
            try {
                const res = await apiFetch(ENDPOINTS.REQUESTS);
                data = res.requests || [];
            } catch (error) {
                if (window.DemoData?.isAvailable?.()) {
                    console.warn('⚠️ Falling back to demo requests.', error);
                    if (window.markDemoModeActive) window.markDemoModeActive('requests-fallback');
                    data = window.DemoData.getRequestsPayload().requests || [];
                    reqSource = 'demo';
                } else { throw error; }
            }
        }

        window.originalRequests = data;
        window.allRequests = data;

        window.renderList(container, data, {
            renderItem: window.renderRequestMarkup,
            getKey: window.getRequestRenderKey,
            getSignature: window.getRequestRenderSignature
        });

        if (typeof updateRequestsCounter === 'function') updateRequestsCounter();
        return true;
    } catch (e) {
        console.error('Fetch requests failed', e);
        return false;
    }
};

window.renderRequestCard = (r) => {
    if (!r) return '';
    const matched = r.wasMatched !== false;
    const data = {
        id: r.id || '',
        method: r.request?.method || 'GET',
        url: r.request?.url || 'N/A',
        status: r.responseDefinition?.status || (matched ? 200 : 404),
        time: Utils.parseRequestTime(r.request?.loggedDate),
        extras: {
            badges: matched ? '<span class="badge badge-success">Matched</span>' : '<span class="badge badge-danger">Unmatched</span>',
            preview: UIComponents.createPreviewSection('Request', r.request)
        }
    };
    return UIComponents.createCard('request', data, []);
};

window.updateRequestsCounter = () => {
    const el = document.getElementById(SELECTORS.COUNTERS.REQUESTS);
    if (el) el.textContent = window.allRequests?.length || 0;
};

window.clearRequests = async () => {
    if (!confirm('Clear requests?')) return;
    try {
        await apiFetch('/requests', { method: 'DELETE' });
        NotificationManager.success('Cleared');
        window.fetchAndRenderRequests();
    } catch (e) { NotificationManager.error('Clear failed'); }
};
