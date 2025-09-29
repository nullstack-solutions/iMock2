'use strict';

const recordingState = {
    isRecording: false,
    lastMode: 'idle'
};

function getRecordingElement(id) {
    if (!id) return null;
    try {
        return document.getElementById(id);
    } catch (error) {
        console.warn('recording.js: unable to resolve element', id, error);
        return null;
    }
}

function updateRecordingCount(count) {
    const countEl = getRecordingElement(SELECTORS.RECORDING.COUNT);
    if (countEl) {
        countEl.textContent = count > 0
            ? `${count} captured stub${count === 1 ? '' : 's'}`
            : 'No recordings yet';
    }
    window.recordedCount = count;
}

function updateRecordingIndicator(state = 'idle', { count = window.recordedCount || 0 } = {}) {
    const indicator = getRecordingElement(SELECTORS.RECORDING.INDICATOR);
    if (!indicator) return;

    let label = 'Idle';
    let badgeClass = 'badge-secondary';

    switch (state) {
        case 'recording':
            label = 'Recording…';
            badgeClass = 'badge-success';
            break;
        case 'snapshot':
            label = 'Snapshot ready';
            badgeClass = 'badge-info';
            break;
        case 'checking':
            label = 'Checking…';
            badgeClass = 'badge-warning';
            break;
        case 'error':
            label = 'Recording error';
            badgeClass = 'badge-danger';
            break;
        default:
            label = 'Idle';
            badgeClass = 'badge-secondary';
    }

    indicator.textContent = label;
    indicator.className = `badge ${badgeClass}`;
    updateRecordingCount(count);
    recordingState.lastMode = state;
}

function setRecordingStatus(type = 'info', message = '') {
    const statusEl = getRecordingElement(SELECTORS.RECORDING.STATUS);
    if (!statusEl) return;

    if (!message) {
        statusEl.textContent = '';
        statusEl.className = 'recording-status-message';
        return;
    }

    const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    statusEl.textContent = `${prefix} ${message}`;
    statusEl.className = `recording-status-message recording-status-${type}`;
}

function renderRecordingResults(mappings, { emptyMessage = 'No captured stubs yet.' } = {}) {
    const container = getRecordingElement(SELECTORS.RECORDING.LIST);
    if (!container) {
        return;
    }

    if (!Array.isArray(mappings) || mappings.length === 0) {
        container.innerHTML = `<div class="recordings-empty-state">${emptyMessage}</div>`;
        updateRecordingCount(0);
        return;
    }

    const fragment = document.createDocumentFragment();
    mappings.forEach((mapping, index) => {
        const card = document.createElement('div');
        card.className = 'recording-result-card';

        const title = document.createElement('h5');
        const name = mapping?.name || mapping?.request?.url || mapping?.request?.urlPath || `Mapping ${index + 1}`;
        title.textContent = name;
        card.appendChild(title);

        const meta = document.createElement('p');
        meta.className = 'form-help';
        const method = mapping?.request?.method || 'ANY';
        const url = mapping?.request?.url || mapping?.request?.urlPath || mapping?.request?.urlPattern || 'N/A';
        meta.textContent = `${method} · ${url}`;
        card.appendChild(meta);

        const pre = document.createElement('pre');
        try {
            pre.textContent = JSON.stringify(mapping, null, 2);
        } catch (_) {
            pre.textContent = String(mapping);
        }
        card.appendChild(pre);

        fragment.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
    updateRecordingCount(mappings.length);
}

function parseHeaderList(rawValue = '') {
    return rawValue
        .split(',')
        .map(header => header.trim())
        .filter(Boolean)
        .reduce((acc, header) => {
            acc[header] = {};
            return acc;
        }, {});
}

function readRecordingForm() {
    const targetInput = getRecordingElement(SELECTORS.RECORDING.TARGET);
    const modeInput = getRecordingElement(SELECTORS.RECORDING.MODE);
    const methodInput = getRecordingElement(SELECTORS.RECORDING.METHOD);
    const includeInput = getRecordingElement(SELECTORS.RECORDING.INCLUDE_PATTERN);
    const excludeInput = getRecordingElement(SELECTORS.RECORDING.EXCLUDE_PATTERN);
    const headersInput = getRecordingElement(SELECTORS.RECORDING.HEADERS);
    const captureBodyInput = getRecordingElement(SELECTORS.RECORDING.CAPTURE_BODY);
    const persistInput = getRecordingElement(SELECTORS.RECORDING.PERSIST);

    const targetBaseUrl = targetInput?.value?.trim();
    if (!targetBaseUrl) {
        throw new Error('Target URL is required to start recording.');
    }

    return {
        targetBaseUrl,
        mode: modeInput?.value || 'record',
        method: methodInput?.value || 'ANY',
        includePattern: includeInput?.value?.trim() || '',
        excludePattern: excludeInput?.value?.trim() || '',
        headers: parseHeaderList(headersInput?.value || ''),
        captureBody: Boolean(captureBodyInput?.checked),
        persist: persistInput?.checked !== false
    };
}

function buildRecordingPayload(formState) {
    const payload = {
        targetBaseUrl: formState.targetBaseUrl,
        persist: formState.persist
    };

    const filters = {};
    if (formState.includePattern) {
        filters.urlPattern = formState.includePattern;
    }
    if (formState.excludePattern) {
        filters.urlExcludePattern = formState.excludePattern;
    }
    if (formState.method && formState.method !== 'ANY') {
        filters.method = formState.method;
    }
    if (Object.keys(filters).length > 0) {
        payload.filters = filters;
    }

    if (Object.keys(formState.headers).length > 0) {
        payload.captureHeaders = formState.headers;
    }

    if (formState.captureBody) {
        payload.captureBody = { binary: false };
    }

    return payload;
}

function buildSnapshotPayload(formState) {
    const snapshotPayload = buildRecordingPayload(formState);
    delete snapshotPayload.persist;
    return snapshotPayload;
}

async function executeSnapshot(formState) {
    updateRecordingIndicator('checking');
    setRecordingStatus('info', 'Creating snapshot from the request journal…');

    const payload = buildSnapshotPayload(formState);
    const response = await apiFetch(ENDPOINTS.RECORDINGS_SNAPSHOT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const mappings = Array.isArray(response?.mappings) ? response.mappings : [];
    renderRecordingResults(mappings, { emptyMessage: 'Snapshot completed but no stubs were generated.' });

    const count = mappings.length;
    updateRecordingIndicator('snapshot', { count });
    if (count > 0) {
        NotificationManager.success(`Snapshot captured ${count} stub${count === 1 ? '' : 's'}.`);
        setRecordingStatus('success', `Snapshot captured ${count} stub${count === 1 ? '' : 's'}.`);
    } else {
        NotificationManager.info('Snapshot completed but produced no new stubs.');
        setRecordingStatus('info', 'Snapshot completed but produced no new stubs.');
    }

    if (typeof fetchAndRenderMappings === 'function' && count > 0) {
        try {
            await fetchAndRenderMappings();
        } catch (refreshError) {
            console.warn('Failed to refresh mappings after snapshot:', refreshError);
        }
    }

    return mappings;
}

window.startRecording = async () => {
    try {
        const formState = readRecordingForm();

        if (formState.mode === 'snapshot') {
            return await executeSnapshot(formState);
        }

        updateRecordingIndicator('recording');
        setRecordingStatus('info', 'Starting recording session…');

        const payload = buildRecordingPayload(formState);
        await apiFetch(ENDPOINTS.RECORDINGS_START, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        window.isRecording = true;
        recordingState.isRecording = true;
        NotificationManager.success('Recording started.');
        setRecordingStatus('success', 'Recording in progress. Use Stop to capture stubs.');
        renderRecordingResults([], { emptyMessage: 'Recording in progress – stop to fetch captured stubs.' });
        return payload;
    } catch (error) {
        console.error('Start recording error:', error);
        updateRecordingIndicator('error');
        setRecordingStatus('error', error.message || 'Failed to start recording.');
        NotificationManager.error(`Failed to start recording: ${error.message}`);
        throw error;
    }
};

window.stopRecording = async () => {
    try {
        updateRecordingIndicator('checking');
        setRecordingStatus('info', 'Stopping recording and retrieving captured stubs…');

        const response = await apiFetch(ENDPOINTS.RECORDINGS_STOP, { method: 'POST' });
        const mappings = Array.isArray(response?.mappings) ? response.mappings : [];

        window.isRecording = false;
        recordingState.isRecording = false;

        renderRecordingResults(mappings, { emptyMessage: 'Recording stopped but no stubs were returned.' });
        const count = mappings.length;
        updateRecordingIndicator('snapshot', { count });

        NotificationManager.success(`Recording stopped. Captured ${count} stub${count === 1 ? '' : 's'}.`);
        setRecordingStatus('success', `Recording stopped. Captured ${count} stub${count === 1 ? '' : 's'}.`);

        if (typeof fetchAndRenderMappings === 'function' && count > 0) {
            try {
                await fetchAndRenderMappings();
            } catch (refreshError) {
                console.warn('Failed to refresh mappings after recording stop:', refreshError);
            }
        }

        return mappings;
    } catch (error) {
        console.error('Stop recording error:', error);
        updateRecordingIndicator('error');
        setRecordingStatus('error', error.message || 'Failed to stop recording.');
        NotificationManager.error(`Failed to stop recording: ${error.message}`);
        return [];
    }
};

window.getRecordingStatus = async () => {
    const response = await apiFetch(ENDPOINTS.RECORDINGS_STATUS);
    return response?.status || 'Unknown';
};

window.refreshRecordingStatus = async () => {
    try {
        updateRecordingIndicator('checking');
        const status = await window.getRecordingStatus();
        const normalized = typeof status === 'string' ? status.toLowerCase() : 'unknown';

        if (normalized.includes('recording') || normalized.includes('started')) {
            updateRecordingIndicator('recording');
            setRecordingStatus('info', 'WireMock reports an active recording session.');
            window.isRecording = true;
            recordingState.isRecording = true;
        } else {
            updateRecordingIndicator('idle');
            setRecordingStatus('info', `Recorder status: ${status}`);
            window.isRecording = false;
            recordingState.isRecording = false;
        }

        return status;
    } catch (error) {
        updateRecordingIndicator('error');
        setRecordingStatus('error', `Unable to fetch recorder status: ${error.message}`);
        NotificationManager.error(`Unable to fetch recorder status: ${error.message}`);
        return 'Unknown';
    }
};

window.takeRecordingSnapshot = async (config = {}) => {
    try {
        updateRecordingIndicator('checking');
        setRecordingStatus('info', 'Creating snapshot from provided configuration…');

        const response = await apiFetch(ENDPOINTS.RECORDINGS_SNAPSHOT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const mappings = Array.isArray(response?.mappings) ? response.mappings : [];
        renderRecordingResults(mappings, { emptyMessage: 'Snapshot completed but no stubs were generated.' });

        const count = mappings.length;
        updateRecordingIndicator('snapshot', { count });
        if (count > 0) {
            setRecordingStatus('success', `Snapshot captured ${count} stub${count === 1 ? '' : 's'}.`);
        } else {
            setRecordingStatus('info', 'Snapshot completed but produced no new stubs.');
        }

        return mappings;
    } catch (error) {
        console.error('Recording snapshot error:', error);
        updateRecordingIndicator('error');
        setRecordingStatus('error', error.message || 'Snapshot failed.');
        NotificationManager.error(`Snapshot failed: ${error.message}`);
        return [];
    }
};

window.handleRecordingSnapshot = async () => {
    try {
        const formState = readRecordingForm();
        formState.mode = 'snapshot';
        return await executeSnapshot(formState);
    } catch (error) {
        updateRecordingIndicator('error');
        setRecordingStatus('error', error.message || 'Snapshot failed.');
        NotificationManager.error(`Snapshot failed: ${error.message}`);
        return [];
    }
};

window.clearRecordings = async () => {
    if (!confirm('Delete all captured recordings from WireMock?')) {
        return;
    }

    try {
        updateRecordingIndicator('checking');
        setRecordingStatus('info', 'Clearing captured stubs…');

        await apiFetch(ENDPOINTS.RECORDINGS_DELETE, { method: 'DELETE' });
        renderRecordingResults([], { emptyMessage: 'No captured stubs yet.' });
        updateRecordingIndicator('idle', { count: 0 });
        NotificationManager.success('Recorded stubs removed.');
        setRecordingStatus('success', 'Recorded stubs removed.');

        if (typeof fetchAndRenderMappings === 'function') {
            try {
                await fetchAndRenderMappings();
            } catch (refreshError) {
                console.warn('Failed to refresh mappings after clearing recordings:', refreshError);
            }
        }
    } catch (error) {
        console.warn('Clear recordings error:', error);

        if (/HTTP\s404/i.test(error?.message || '')) {
            setRecordingStatus('info', 'Recordings endpoint unavailable – clearing the request log instead.');
            try {
                await apiFetch(ENDPOINTS.REQUESTS, { method: 'DELETE' });
                renderRecordingResults([], { emptyMessage: 'Request journal cleared.' });
                updateRecordingIndicator('idle', { count: 0 });
                NotificationManager.warning('Recording endpoint missing. Cleared the request log instead.');
                return;
            } catch (fallbackError) {
                console.error('Fallback clear recordings error:', fallbackError);
                setRecordingStatus('error', `Failed to clear request log: ${fallbackError.message}`);
                NotificationManager.error(`Failed to clear request log: ${fallbackError.message}`);
                return;
            }
        }

        updateRecordingIndicator('error');
        setRecordingStatus('error', `Failed to clear recordings: ${error.message}`);
        NotificationManager.error(`Failed to clear recordings: ${error.message}`);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    try {
        updateRecordingIndicator('idle', { count: window.recordedCount || 0 });
        renderRecordingResults([], { emptyMessage: 'No captured stubs yet.' });
    } catch (error) {
        console.warn('recording.js: failed to initialise UI state', error);
    }
});
