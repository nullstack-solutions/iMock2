'use strict';

const recordingUiState = {
    active: false,
    lastConfig: null,
    sessions: [],
    recordedIds: new Set(),
    lastStatus: null,
};

function getRecordingIndicator() {
    return document.getElementById(SELECTORS?.RECORDING?.INDICATOR || 'recording-indicator');
}

function setRecordingStatus(message, type = 'info') {
    const statusEl = document.getElementById('recording-status');
    if (!statusEl) {
        return;
    }
    if (!message) {
        statusEl.textContent = '';
        statusEl.className = 'form-help';
        return;
    }

    const tone = type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info';
    statusEl.className = `form-help status-${tone}`;
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    statusEl.textContent = `${prefix} ${message}`;
    recordingUiState.lastStatus = { message, type };
}

function ensureRecordingContainers() {
    const list = document.getElementById('recordings-list');
    const empty = document.getElementById('recordings-empty');
    if (list && empty && !recordingUiState.renderInitialised) {
        empty.classList.remove('hidden');
        list.style.display = 'none';
        recordingUiState.renderInitialised = true;
    }
    return { list, empty };
}

function parseCommaSeparated(value = '') {
    return value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
}

function normalizeTransformers(raw) {
    const transformers = parseCommaSeparated(raw);
    if (transformers.length === 0) {
        return undefined;
    }
    return transformers;
}

function normalizeCaptureHeaders(raw) {
    const headers = parseCommaSeparated(raw);
    if (headers.length === 0) {
        return undefined;
    }
    return headers.reduce((acc, header) => {
        acc[header] = true;
        return acc;
    }, {});
}

function buildRecordingConfigFromForm() {
    const targetInput = document.getElementById('record-target-url');
    const modeSelect = document.getElementById('record-mode');
    const patternInput = document.getElementById('record-url-pattern');
    const methodSelect = document.getElementById('record-filter-method');
    const persistCheckbox = document.getElementById('record-persist');
    const scenarioCheckbox = document.getElementById('record-scenarios');
    const headerInput = document.getElementById('record-capture-headers');
    const transformerInput = document.getElementById('record-transformers');

    const targetBaseUrl = (targetInput?.value || '').trim();
    if (!targetBaseUrl) {
        throw new Error('Target URL is required before starting the recorder.');
    }

    const mode = (modeSelect?.value || 'record').toLowerCase();
    const method = (methodSelect?.value || 'ANY').toUpperCase();
    const urlPattern = (patternInput?.value || '').trim();

    const config = {
        targetBaseUrl,
        persist: persistCheckbox ? Boolean(persistCheckbox.checked) : true,
        repeatsAsScenarios: scenarioCheckbox ? Boolean(scenarioCheckbox.checked) : true,
    };

    const captureHeaders = normalizeCaptureHeaders(headerInput?.value || '');
    if (captureHeaders) {
        config.captureHeaders = captureHeaders;
    }

    const transformers = normalizeTransformers(transformerInput?.value || '');
    if (transformers) {
        config.transformers = transformers;
    }

    const filters = {};
    if (urlPattern) {
        filters.urlPattern = urlPattern;
    }
    if (method && method !== 'ANY') {
        filters.method = method;
    }
    if (Object.keys(filters).length > 0) {
        config.filters = filters;
    }

    return { config, mode };
}

function buildRecordedMappingCard(mapping, context = {}) {
    if (!mapping || typeof mapping !== 'object') {
        return '';
    }

    const mappingId = mapping.id || mapping.uuid || `recording-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const method = mapping.request?.method || 'GET';
    const url = mapping.request?.url || mapping.request?.urlPath || mapping.request?.urlPattern || mapping.request?.urlPathPattern || 'N/A';
    const status = mapping.response?.status || 200;
    const name = mapping.name || mapping.metadata?.name || `Recorded mapping ${mappingId.substring(0, 8)}`;

    const preview = UIComponents?.createPreviewSection
        ? UIComponents.createPreviewSection(`${Icons.render('request-in', { className: 'icon-inline' })} Request`, {
            'Method': mapping.request?.method,
            'URL': url,
            'Headers': mapping.request?.headers,
            'Body Patterns': mapping.request?.bodyPatterns,
            'Body': mapping.request?.body,
            'Query Parameters': mapping.request?.queryParameters,
        }) + UIComponents.createPreviewSection(`${Icons.render('response-out', { className: 'icon-inline' })} Response`, {
            'Status': mapping.response?.status,
            'Headers': mapping.response?.headers,
            'Body': mapping.response?.jsonBody || mapping.response?.body,
            'Delay': mapping.response?.fixedDelayMilliseconds ? `${mapping.response.fixedDelayMilliseconds}ms` : null,
        }) + UIComponents.createPreviewSection(`${Icons.render('info', { className: 'icon-inline' })} Overview`, {
            'ID': mappingId,
            'Priority': mapping.priority,
            'Persistent': mapping.persistent,
            'Scenario': mapping.scenarioName,
            'Source': context.sourceLabel || 'Recorder',
        })
        : '';

    const badges = [
        `<span class="badge badge-info" title="Created by WireMock recorder">Recorded</span>`
    ];

    if (mapping.priority !== undefined) {
        badges.push(`<span class="badge badge-secondary" title="Priority">P${mapping.priority}</span>`);
    }
    if (context.sourceLabel) {
        badges.push(`<span class="badge badge-secondary" title="Capture source">${Utils.escapeHtml(context.sourceLabel)}</span>`);
    }

    if (UIComponents?.createCard) {
        return UIComponents.createCard('mapping', {
            id: mappingId,
            method,
            url,
            status,
            name,
            extras: {
                preview,
                badges: badges.join(' ')
            }
        }, [
            { class: 'secondary', handler: 'editMapping', title: 'Edit in Editor', icon: 'open-external' },
            { class: 'primary', handler: 'openEditModal', title: 'Edit', icon: 'pencil' },
            { class: 'danger', handler: 'deleteMapping', title: 'Delete', icon: 'trash' }
        ]);
    }

    return `
        <div class="mapping-card" data-id="${Utils.escapeHtml(mappingId)}">
            <div class="mapping-header">
                <div class="mapping-info">
                    <div class="mapping-top-line">
                        <span class="method-badge ${method.toLowerCase()}">${method}</span>
                        <span class="mapping-name">${Utils.escapeHtml(name)}</span>
                    </div>
                    <div class="mapping-url-line">
                        <span class="status-badge ${Utils.getStatusClass(status)}">${status}</span>
                        <span class="mapping-url">${Utils.escapeHtml(url)}</span>
                        ${badges.join(' ')}
                    </div>
                </div>
            </div>
        </div>`;
}

function renderRecordedMappings(mappings = [], options = {}) {
    const { list, empty } = ensureRecordingContainers();
    if (!list || !empty) {
        return;
    }

    if (!options.append) {
        list.innerHTML = '';
        recordingUiState.sessions = [];
        recordingUiState.recordedIds.clear();
    }

    const safeMappings = Array.isArray(mappings) ? mappings : [];
    if (safeMappings.length === 0 && list.children.length === 0) {
        empty.classList.remove('hidden');
        list.style.display = 'none';
        return;
    }

    const fragments = [];
    for (const mapping of safeMappings) {
        const html = buildRecordedMappingCard(mapping, { sourceLabel: options.sourceLabel });
        if (html) {
            const mappingId = mapping.id || mapping.uuid;
            if (mappingId) {
                recordingUiState.recordedIds.add(mappingId);
            }
            recordingUiState.sessions.push({ mapping });
            fragments.push(html);
        }
    }

    if (fragments.length > 0) {
        list.insertAdjacentHTML('beforeend', fragments.join('\n'));
    }

    if (list.children.length > 0) {
        empty.classList.add('hidden');
        list.style.display = 'block';
    } else {
        empty.classList.remove('hidden');
        list.style.display = 'none';
    }
}

function recordIndicator(active) {
    const indicator = getRecordingIndicator();
    if (!indicator) {
        return;
    }
    indicator.style.display = active ? 'block' : 'none';
}

// --- API HELPERS ---

window.startRecording = async (config = {}) => {
    const defaultConfig = {
        targetBaseUrl: 'https://example.com',
        filters: {},
        persist: true,
        repeatsAsScenarios: true,
    };

    const recordingConfig = { ...defaultConfig, ...config };

    try {
        await apiFetch(ENDPOINTS.RECORDINGS_START, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recordingConfig)
        });

        recordingUiState.active = true;
        recordIndicator(true);
        setRecordingStatus(`Recording started for ${recordingConfig.targetBaseUrl}`, 'success');
        NotificationManager.success('Recording started!');
    } catch (error) {
        recordingUiState.active = false;
        recordIndicator(false);
        setRecordingStatus(`Failed to start recording: ${error.message}`, 'error');
        console.error('Start recording error:', error);
        NotificationManager.error(`Failed to start recording: ${error.message}`);
        throw error;
    }
};

window.stopRecording = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_STOP, {
            method: 'POST'
        });

        recordingUiState.active = false;
        recordIndicator(false);

        const capturedMappings = response.mappings || [];
        const count = capturedMappings.length;
        renderRecordedMappings(capturedMappings, { sourceLabel: 'stop' });

        setRecordingStatus(`Recording stopped – captured ${count} mapping${count === 1 ? '' : 's'}.`, 'success');
        NotificationManager.success(`Recording stopped! Captured ${count} mappings`);

        if (typeof fetchAndRenderMappings === 'function') {
            await fetchAndRenderMappings();
        }

        return capturedMappings;
    } catch (error) {
        console.error('Stop recording error:', error);
        setRecordingStatus(`Failed to stop recording: ${error.message}`, 'error');
        NotificationManager.error(`Failed to stop recording: ${error.message}`);
        return [];
    }
};

window.getRecordingStatus = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_STATUS);
        return response.status || 'Unknown';
    } catch (error) {
        console.error('Recording status error:', error);
        setRecordingStatus(`Unable to read recording status: ${error.message}`, 'error');
        return 'Unknown';
    }
};

window.takeRecordingSnapshot = async (config = {}) => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_SNAPSHOT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const capturedMappings = response.mappings || [];
        const count = capturedMappings.length;
        renderRecordedMappings(capturedMappings, { append: true, sourceLabel: 'snapshot' });

        setRecordingStatus(`Snapshot created – ${count} mapping${count === 1 ? '' : 's'} added to the list.`, 'success');
        NotificationManager.success(`Snapshot created! Captured ${count} mappings`);

        if (typeof fetchAndRenderMappings === 'function') {
            await fetchAndRenderMappings();
        }

        return capturedMappings;
    } catch (error) {
        console.error('Recording snapshot error:', error);
        setRecordingStatus(`Snapshot failed: ${error.message}`, 'error');
        NotificationManager.error(`Snapshot failed: ${error.message}`);
        return [];
    }
};

async function deleteRecordedMappingsFromServer(ids = []) {
    const failures = [];
    for (const id of ids) {
        if (!id) continue;
        try {
            await apiFetch(`/mappings/${id}`, { method: 'DELETE' });
            if (typeof updateOptimisticCache === 'function') {
                updateOptimisticCache({ id }, 'delete');
            }
        } catch (error) {
            console.warn('Failed to delete recorded mapping', id, error);
            failures.push({ id, error });
        }
    }
    if (failures.length) {
        const detail = failures.map(item => item.id).join(', ');
        NotificationManager.warning(`Some recorded mappings could not be deleted: ${detail}`);
    }
    return failures.length === 0;
}

// --- UI HOOKS ---

window.startRecordingFromUi = async () => {
    try {
        const { config, mode } = buildRecordingConfigFromForm();
        recordingUiState.lastConfig = config;

        if (mode === 'snapshot') {
            setRecordingStatus('Taking snapshot…');
            await takeRecordingSnapshot(config);
            return;
        }

        setRecordingStatus('Starting recorder…');
        await startRecording(config);
    } catch (error) {
        setRecordingStatus(error.message, 'error');
    }
};

window.stopRecordingFromUi = async () => {
    setRecordingStatus('Stopping recorder…');
    await stopRecording();
};

window.takeSnapshotFromUi = async () => {
    try {
        const { config } = buildRecordingConfigFromForm();
        setRecordingStatus('Capturing snapshot…');
        await takeRecordingSnapshot(config);
    } catch (error) {
        setRecordingStatus(error.message, 'error');
    }
};

window.refreshRecordingStatus = async () => {
    try {
        const status = await getRecordingStatus();
        const message = `Recorder status: ${status}`;
        setRecordingStatus(message, status && status.toLowerCase() === 'recording' ? 'success' : 'info');
    } catch (error) {
        setRecordingStatus(error.message, 'error');
    }
};

window.clearRecordedMappings = async () => {
    const ids = Array.from(recordingUiState.recordedIds);
    if (ids.length === 0) {
        NotificationManager.info('There are no recorded mappings to clear.');
        return;
    }

    if (!confirm('Delete all recorded mappings from WireMock and clear the list?')) {
        return;
    }

    setRecordingStatus('Removing recorded mappings…');
    const success = await deleteRecordedMappingsFromServer(ids);
    if (success) {
        NotificationManager.success('Recorded mappings deleted.');
    }

    renderRecordedMappings([], { append: false });
    setRecordingStatus('Recorded mappings cleared from the dashboard.', 'success');

    if (typeof fetchAndRenderMappings === 'function') {
        await fetchAndRenderMappings();
    }
};

// Legacy compatibility shim
window.clearRecordings = window.clearRecordedMappings;

// Restore last status after DOM reload (e.g., navigation between tabs)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && recordingUiState.lastStatus) {
        setRecordingStatus(recordingUiState.lastStatus.message, recordingUiState.lastStatus.type);
    }
});

