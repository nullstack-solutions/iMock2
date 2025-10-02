'use strict';

// --- NEAR MISSES FUNCTIONS ---

// Find near matches for a request
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
        return [];
    }
};

// Find near matches for a pattern
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
        return [];
    }
};

// Get near matches for unmatched requests
window.getNearMissesForUnmatched = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_UNMATCHED_NEAR_MISSES);
        return response.nearMisses || [];
    } catch (error) {
        console.error('Near misses for unmatched error:', error);
        return [];
    }
};

const nearMissSelectors = {
    status: 'near-miss-status',
    results: 'near-miss-results',
    requestInput: 'near-miss-request-input',
    patternInput: 'near-miss-pattern-input'
};

function setNearMissStatus(type = 'info', message = '') {
    const statusEl = document.getElementById(nearMissSelectors.status);
    if (!statusEl) return;
    if (!message) {
        statusEl.textContent = '';
        return;
    }
    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    statusEl.textContent = `${prefix} ${message}`;
}

function renderNearMissResults(nearMisses, { emptyMessage = 'Run an analysis to see near misses.' } = {}) {
    const container = document.getElementById(nearMissSelectors.results);
    if (!container) return;

    if (!Array.isArray(nearMisses) || nearMisses.length === 0) {
        container.innerHTML = `<div class="recordings-empty-state">${emptyMessage}</div>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    nearMisses.forEach((miss, index) => {
        const card = document.createElement('div');
        card.className = 'near-miss-result-card';

        const title = document.createElement('h5');
        const summaryParts = [];
        if (miss?.request?.method) summaryParts.push(miss.request.method);
        if (miss?.request?.url) summaryParts.push(miss.request.url);
        if (!miss?.request?.url && miss?.request?.urlPattern) summaryParts.push(miss.request.urlPattern);
        const distance = miss?.matchResult?.distance ?? miss?.distance;
        if (typeof distance === 'number') {
            summaryParts.push(`score ${distance}`);
        }
        title.textContent = summaryParts.length ? summaryParts.join(' · ') : `Near miss #${index + 1}`;
        card.appendChild(title);

        const pre = document.createElement('pre');
        try {
            pre.textContent = JSON.stringify(miss, null, 2);
        } catch (_) {
            pre.textContent = String(miss);
        }
        card.appendChild(pre);

        fragment.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

function parseNearMissInput(selectorKey) {
    const el = document.getElementById(nearMissSelectors[selectorKey]);
    if (!el) {
        throw new Error('Input field not found.');
    }
    const raw = el.value.trim();
    if (!raw) {
        throw new Error('Paste JSON to analyse.');
    }
    try {
        return JSON.parse(raw);
    } catch (error) {
        throw new Error(`Invalid JSON: ${error.message}`);
    }
}

window.analyzeUnmatchedNearMisses = async () => {
    try {
        setNearMissStatus('info', 'Fetching near misses for unmatched requests…');
        const nearMisses = await window.getNearMissesForUnmatched();
        if (nearMisses.length === 0) {
            setNearMissStatus('info', 'No near misses were reported for unmatched requests.');
            renderNearMissResults([], { emptyMessage: 'No near misses reported by WireMock.' });
        } else {
            setNearMissStatus('success', `Found ${nearMisses.length} near miss${nearMisses.length === 1 ? '' : 'es'} for unmatched requests.`);
            renderNearMissResults(nearMisses);
        }
    } catch (error) {
        console.error('Near miss analysis failed:', error);
        setNearMissStatus('error', error.message || 'Failed to fetch near misses.');
        renderNearMissResults([], { emptyMessage: 'Analysis failed.' });
    }
};

window.analyzeRequestNearMiss = async () => {
    try {
        const payload = parseNearMissInput('requestInput');
        setNearMissStatus('info', 'Analysing request against mappings…');
        const nearMisses = await window.findNearMissesForRequest(payload);
        if (nearMisses.length === 0) {
            setNearMissStatus('info', 'No near matches found for the provided request.');
            renderNearMissResults([], { emptyMessage: 'No close matches for this request.' });
        } else {
            setNearMissStatus('success', `Found ${nearMisses.length} near match${nearMisses.length === 1 ? '' : 'es'} for the request.`);
            renderNearMissResults(nearMisses);
        }
    } catch (error) {
        console.error('Near miss request analysis failed:', error);
        setNearMissStatus('error', error.message || 'Failed to analyse request.');
        renderNearMissResults([], { emptyMessage: 'Analysis failed.' });
    }
};

window.analyzePatternNearMiss = async () => {
    try {
        const payload = parseNearMissInput('patternInput');
        setNearMissStatus('info', 'Analysing pattern against request journal…');
        const nearMisses = await window.findNearMissesForPattern(payload);
        if (nearMisses.length === 0) {
            setNearMissStatus('info', 'No requests were close to this pattern.');
            renderNearMissResults([], { emptyMessage: 'No near misses for this pattern.' });
        } else {
            setNearMissStatus('success', `Found ${nearMisses.length} near miss${nearMisses.length === 1 ? '' : 'es'} for the pattern.`);
            renderNearMissResults(nearMisses);
        }
    } catch (error) {
        console.error('Near miss pattern analysis failed:', error);
        setNearMissStatus('error', error.message || 'Failed to analyse pattern.');
        renderNearMissResults([], { emptyMessage: 'Analysis failed.' });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    renderNearMissResults([], { emptyMessage: 'Run an analysis to see near misses.' });
});

