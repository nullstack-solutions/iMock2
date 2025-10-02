'use strict';

// --- API LAYER ---

window.findNearMissesForRequest = async (request) => {
    try {
        const response = await apiFetch(ENDPOINTS.NEAR_MISSES_REQUEST, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for request error:', error);
        throw error;
    }
};

window.findNearMissesForPattern = async (pattern) => {
    try {
        const response = await apiFetch(ENDPOINTS.NEAR_MISSES_PATTERN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pattern)
        });
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for pattern error:', error);
        throw error;
    }
};

window.getNearMissesForUnmatched = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_UNMATCHED_NEAR_MISSES);
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for unmatched error:', error);
        throw error;
    }
};

// --- UI STATE & HELPERS ---

const nearMissUiState = {
    isLoading: false,
    results: [],
    source: '',
};

function setNearMissStatus(message, type = 'info') {
    const statusEl = document.getElementById('near-miss-status');
    if (!statusEl) {
        return;
    }

    if (!message) {
        statusEl.textContent = '';
        statusEl.className = 'form-help';
        return;
    }

    const tone = type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info';
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    statusEl.textContent = `${prefix} ${message}`;
    statusEl.className = `form-help status-${tone}`;
}

function toggleNearMissLoading(isLoading) {
    nearMissUiState.isLoading = Boolean(isLoading);
    const card = document.getElementById('near-miss-card');
    if (!card) {
        return;
    }

    const buttons = card.querySelectorAll('button');
    buttons.forEach(button => {
        button.disabled = isLoading;
        button.classList.toggle('is-loading', isLoading);
    });
}

function getNearMissContainers() {
    const results = document.getElementById('near-miss-results');
    const empty = document.getElementById('near-miss-empty');
    return { results, empty };
}

function normaliseNearMiss(nearMiss) {
    const stub = nearMiss?.stubMapping || {};
    const request = nearMiss?.request?.request || nearMiss?.request || {};
    const match = nearMiss?.matchResult || {};

    const requestUrl = request.url || request.urlPath || request.urlPattern || 'Unknown URL';
    const requestMethod = request.method || 'ANY';

    const stubRequest = stub.request || {};
    const stubUrl = stubRequest.url || stubRequest.urlPath || stubRequest.urlPattern || 'Unknown mapping URL';
    const stubMethod = stubRequest.method || 'ANY';

    let score = match.distance;
    if (typeof score !== 'number') {
        score = typeof nearMiss.distance === 'number' ? nearMiss.distance : null;
    }

    const mismatches = [];
    if (Array.isArray(nearMiss?.mismatchDescriptions)) {
        mismatches.push(...nearMiss.mismatchDescriptions);
    }
    if (Array.isArray(match?.mismatches)) {
        mismatches.push(...match.mismatches.map(item => item?.description || item?.field || JSON.stringify(item)));
    }

    if (!mismatches.length && nearMiss?.diff) {
        try {
            mismatches.push(JSON.stringify(nearMiss.diff, null, 2));
        } catch (_) {
            mismatches.push(String(nearMiss.diff));
        }
    }

    return {
        stubId: stub.id || stub.uuid,
        stubName: stub.name || 'Recorded mapping',
        stubUrl,
        stubMethod,
        requestUrl,
        requestMethod,
        score,
        mismatches,
    };
}

function renderNearMissResults(nearMisses = [], sourceLabel = '') {
    const { results, empty } = getNearMissContainers();
    if (!results || !empty) {
        return;
    }

    results.innerHTML = '';

    if (!nearMisses.length) {
        empty.classList.remove('hidden');
        setNearMissStatus('No near misses found for the current analysis.', 'info');
        return;
    }

    empty.classList.add('hidden');

    const fragments = nearMisses.map(item => {
        const normalized = normaliseNearMiss(item);
        const scoreBadge = typeof normalized.score === 'number'
            ? `<span class="badge badge-secondary" title="Distance score">Score: ${normalized.score.toFixed(2)}</span>`
            : '';

        const mismatchMarkup = normalized.mismatches.length
            ? `<pre class="near-miss-diff">${Utils.escapeHtml(normalized.mismatches.join('\n\n'))}</pre>`
            : '<p class="form-help">No mismatch details provided by WireMock.</p>';

        return `
            <div class="card card-static near-miss-entry">
                <div class="card-header">
                    <h4 class="card-title">${Utils.escapeHtml(normalized.stubName)}</h4>
                    <div style="display:flex; gap: var(--space-2); flex-wrap: wrap; align-items: center;">
                        ${scoreBadge}
                        <span class="badge badge-secondary" title="Mapping method">${Utils.escapeHtml(normalized.stubMethod)}</span>
                    </div>
                </div>
                <div class="card-body">
                    <p class="form-help">Closest mapping: <strong>${Utils.escapeHtml(normalized.stubMethod)}</strong> ${Utils.escapeHtml(normalized.stubUrl)}</p>
                    <p class="form-help">Analysed request: <strong>${Utils.escapeHtml(normalized.requestMethod)}</strong> ${Utils.escapeHtml(normalized.requestUrl)}</p>
                    <div class="near-miss-mismatches">
                        <h5 style="margin-top: var(--space-3);">Mismatch summary</h5>
                        ${mismatchMarkup}
                    </div>
                </div>
            </div>`;
    });

    results.insertAdjacentHTML('beforeend', fragments.join('\n'));
    setNearMissStatus(`Loaded ${nearMisses.length} near miss${nearMisses.length === 1 ? '' : 'es'} from ${sourceLabel}.`, 'success');
}

function resolveSelectedRequest() {
    const select = document.getElementById('near-miss-request-select');
    if (!select) {
        return null;
    }
    const requestId = select.value;
    if (!requestId) {
        return null;
    }

    const request = (window.allRequests || []).find(item => (item.id || item.request?.id) === requestId || item.id === requestId);
    return request || null;
}

// --- UI ACTIONS ---

window.populateNearMissRequestOptions = (requests = []) => {
    const select = document.getElementById('near-miss-request-select');
    if (!select) {
        return;
    }

    const unmatched = Array.isArray(requests)
        ? requests.filter(item => item.wasMatched === false)
        : [];

    const previouslySelected = select.value;
    select.innerHTML = '<option value="">Select unmatched request</option>';

    unmatched.forEach(request => {
        const id = request.id || request.request?.id || request.uuid;
        const method = request.request?.method || 'ANY';
        const url = request.request?.url || request.request?.urlPath || 'Unknown URL';
        const option = document.createElement('option');
        option.value = id || '';
        option.textContent = `${method} • ${url}`;
        select.appendChild(option);
    });

    select.disabled = unmatched.length === 0;
    if (previouslySelected && unmatched.some(request => (request.id || request.request?.id) === previouslySelected)) {
        select.value = previouslySelected;
    }

    if (unmatched.length === 0) {
        setNearMissStatus('No unmatched requests available – trigger traffic or refresh the request log.', 'info');
    }
};

window.analyzeNearMissForSelectedRequest = async () => {
    const request = resolveSelectedRequest();
    if (!request) {
        setNearMissStatus('Select an unmatched request to analyse.', 'error');
        return;
    }

    toggleNearMissLoading(true);
    setNearMissStatus('Analysing request against existing mappings…');

    try {
        const results = await findNearMissesForRequest(request);
        nearMissUiState.results = results;
        nearMissUiState.source = 'request analysis';
        renderNearMissResults(results, 'request analysis');
    } catch (error) {
        console.error('Near miss analysis failed:', error);
        setNearMissStatus(`Failed to analyse request: ${error.message}`, 'error');
    } finally {
        toggleNearMissLoading(false);
    }
};

window.runNearMissPatternAnalysis = async () => {
    const patternInput = document.getElementById('near-miss-pattern');
    const methodSelect = document.getElementById('near-miss-pattern-method');

    const urlPattern = (patternInput?.value || '').trim();
    const method = (methodSelect?.value || '').trim();

    if (!urlPattern && !method) {
        setNearMissStatus('Provide at least a URL pattern or method to analyse.', 'error');
        return;
    }

    const payload = {};
    if (urlPattern) {
        payload.urlPattern = urlPattern;
    }
    if (method) {
        payload.method = method.toUpperCase();
    }

    toggleNearMissLoading(true);
    setNearMissStatus('Searching for near matches with the provided pattern…');

    try {
        const results = await findNearMissesForPattern(payload);
        nearMissUiState.results = results;
        nearMissUiState.source = 'pattern analysis';
        renderNearMissResults(results, 'pattern analysis');
    } catch (error) {
        console.error('Pattern analysis failed:', error);
        setNearMissStatus(`Pattern analysis failed: ${error.message}`, 'error');
    } finally {
        toggleNearMissLoading(false);
    }
};

window.loadUnmatchedNearMisses = async () => {
    toggleNearMissLoading(true);
    setNearMissStatus('Fetching near misses for all unmatched requests…');

    try {
        const results = await getNearMissesForUnmatched();
        nearMissUiState.results = results;
        nearMissUiState.source = 'unmatched requests';
        renderNearMissResults(results, 'unmatched requests');
    } catch (error) {
        console.error('Failed to load unmatched near misses:', error);
        setNearMissStatus(`Failed to load near misses: ${error.message}`, 'error');
    } finally {
        toggleNearMissLoading(false);
    }
};

window.clearNearMissResults = () => {
    const { results, empty } = getNearMissContainers();
    if (results) {
        results.innerHTML = '';
    }
    if (empty) {
        empty.classList.remove('hidden');
    }
    nearMissUiState.results = [];
    nearMissUiState.source = '';
    setNearMissStatus('Cleared previous analysis results.');
};

