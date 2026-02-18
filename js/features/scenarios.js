'use strict';

// --- SCENARIOS ---

if (!Array.isArray(window.allScenarios)) {
    window.allScenarios = [];
}
let allScenarios = window.allScenarios;

let scenarioListHandlerAttached = false;

if (!window.scenarioExpansionState || typeof window.scenarioExpansionState !== 'object') {
    window.scenarioExpansionState = {};
}
let scenarioExpansionState = window.scenarioExpansionState;

if (!window.scenarioUiState || typeof window.scenarioUiState !== 'object') {
    window.scenarioUiState = {};
}
const scenarioUiState = window.scenarioUiState;
if (typeof scenarioUiState.searchTerm !== 'string') {
    scenarioUiState.searchTerm = '';
}
if (!(scenarioUiState.selected instanceof Set)) {
    scenarioUiState.selected = new Set();
}
if (typeof scenarioUiState.bulkMenuOpen !== 'boolean') {
    scenarioUiState.bulkMenuOpen = false;
}
if (!Array.isArray(scenarioUiState.lastVisibleSelectable)) {
    scenarioUiState.lastVisibleSelectable = [];
}

let scenarioToolbarHandlersAttached = false;

function renderIcon(name, options = {}) {
    return typeof window.Icons?.render === 'function' ? window.Icons.render(name, options) : '';
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeDecode(value) {
    if (window.ScenarioModel && typeof window.ScenarioModel.safeDecode === 'function') {
        return window.ScenarioModel.safeDecode(value);
    }
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeScenarioLink(link) {
    if (window.ScenarioModel && typeof window.ScenarioModel.normalizeScenarioLink === 'function') {
        return window.ScenarioModel.normalizeScenarioLink(link);
    }
    return '';
}

function normalizeScenario(scenario, index) {
    if (window.ScenarioModel && typeof window.ScenarioModel.normalizeScenario === 'function') {
        return window.ScenarioModel.normalizeScenario(scenario, index);
    }
    return scenario || null;
}

function normalizeScenarioList(list) {
    if (window.ScenarioModel && typeof window.ScenarioModel.normalizeScenarioList === 'function') {
        return window.ScenarioModel.normalizeScenarioList(list);
    }
    return Array.isArray(list) ? list.filter(Boolean) : [];
}

function getScenarioByIdentifier(identifier) {
    if (typeof identifier !== 'string') {
        return null;
    }

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
        return null;
    }

    const scenarios = Array.isArray(allScenarios) ? allScenarios : [];

    return scenarios.find((scenario) => {
        const candidates = [
            scenario?.identifier,
            scenario?.id,
            scenario?.name,
            scenario?.decodedId,
            scenario?.decodedName,
            scenario?.originalId,
            scenario?.originalName
        ];

        return candidates.some((candidate) => {
            if (typeof candidate !== 'string') return false;
            return candidate.trim() === trimmedIdentifier;
        });
    }) || null;
}

function resolveScenarioTarget(candidateIdentifier) {
    const rawCandidate = typeof candidateIdentifier === 'string' ? candidateIdentifier.trim() : '';
    const targetScenario = rawCandidate ? getScenarioByIdentifier(rawCandidate) : null;

    const rawEndpointIdentifier = targetScenario?.identifier
        || targetScenario?.decodedId
        || targetScenario?.decodedName
        || rawCandidate;
    const endpointIdentifier = safeDecode(rawEndpointIdentifier) || rawEndpointIdentifier;

    const displayName = targetScenario?.displayName
        || targetScenario?.decodedName
        || targetScenario?.name
        || targetScenario?.decodedId
        || targetScenario?.id
        || safeDecode(rawCandidate)
        || rawCandidate;

    const directStateEndpoint = typeof targetScenario?.stateEndpoint === 'string'
        ? targetScenario.stateEndpoint
        : '';

    const directResetEndpoint = typeof targetScenario?.resetEndpoint === 'string'
        ? targetScenario.resetEndpoint
        : '';

    const stateEndpointBuilder = typeof window.buildScenarioStateEndpoint === 'function'
        ? window.buildScenarioStateEndpoint
        : (name) => `${ENDPOINTS.SCENARIOS}/${encodeURIComponent(name)}/state`;

    const stateEndpoint = directStateEndpoint
        || (endpointIdentifier ? stateEndpointBuilder(endpointIdentifier) : '');

    const resetEndpoint = directResetEndpoint || stateEndpoint;
    const resetMethod = directResetEndpoint ? 'POST' : 'PUT';

    return {
        rawCandidate,
        targetScenario,
        endpointIdentifier,
        displayName,
        stateEndpoint,
        resetEndpoint,
        resetMethod,
    };
}

function setScenariosLoading(isLoading) {
    const loadingEl = document.getElementById('scenarios-loading');
    if (loadingEl) {
        loadingEl.classList.toggle('hidden', !isLoading);
    }

    if (isLoading) {
        const listEl = document.getElementById(SELECTORS.LISTS.SCENARIOS);
        if (listEl) {
            listEl.style.display = 'none';
        }
    }
}

window.loadScenarios = async () => {
    const emptyEl = document.getElementById('scenarios-empty');
    if (emptyEl) emptyEl.classList.add('hidden');

    setScenariosLoading(true);

    try {
        const data = await apiFetch(ENDPOINTS.SCENARIOS);
        const scenarios = Array.isArray(data?.scenarios) ? data.scenarios : [];
        allScenarios = normalizeScenarioList(scenarios);
        window.allScenarios = allScenarios;
    } catch (e) {
        allScenarios = [];
        window.allScenarios = allScenarios;
        Logger.error('SCENARIOS', 'Load scenarios error:', e);
        NotificationManager.error(`Failed to load scenarios: ${e.message}`);
    } finally {
        setScenariosLoading(false);
        renderScenarios();
    }
};

window.refreshScenarios = async () => {
    await TabManager.refresh('scenarios');
};

window.resetAllScenarios = async () => {
    if (!confirm('Reset all scenarios to the initial state?')) return;

    setScenariosLoading(true);

    try {
        await apiFetch(ENDPOINTS.SCENARIOS_RESET, { method: 'POST' });
        NotificationManager.success('All scenarios have been reset!');
        await loadScenarios();
    } catch (e) {
        NotificationManager.error(`Scenario reset failed: ${e.message}`);
        setScenariosLoading(false);
    }
};

function updateScenarioStateSuggestions(selectedScenarioIdentifier) {
    const stateOptionsEl = document.getElementById('scenario-state-options');
    const stateInput = document.getElementById('scenario-state');

    if (!stateOptionsEl) return;

    const scenarios = Array.isArray(allScenarios) ? allScenarios : [];
    const selectedScenario = getScenarioByIdentifier(selectedScenarioIdentifier);

    const states = new Set();

    const addState = (state) => {
        if (typeof state !== 'string') return;
        const normalized = state.trim();
        if (normalized) {
            states.add(normalized);
        }
    };

    addState('Started');

    const harvestStates = (scenario) => {
        if (!scenario) return;
        addState(scenario.state);
        (scenario.possibleStates || []).forEach(addState);
        (scenario.mappings || []).forEach((mapping) => {
            addState(mapping?.requiredScenarioState);
            addState(mapping?.newScenarioState);
        });
    };

    if (selectedScenario) {
        harvestStates(selectedScenario);
    }

    if (states.size === 0) {
        scenarios.forEach(harvestStates);
    }

    const sortedStates = Array.from(states).sort((a, b) => a.localeCompare(b));
    stateOptionsEl.innerHTML = sortedStates.map((state) => `
        <option value="${escapeHtml(state)}"></option>
    `).join('');

    if (stateInput) {
        if (sortedStates.length > 0) {
            stateInput.setAttribute('placeholder', `Enter state (e.g. ${sortedStates[0]})`);
        } else {
            stateInput.setAttribute('placeholder', 'Enter state name');
        }
    }
}

window.setScenarioState = async (scenarioIdentifier, newState, options = {}) => {
    const scenarioSelect = document.getElementById('scenario-select');
    const scenarioStateInput = document.getElementById('scenario-state');

    const inlineScenarioIdentifier = typeof scenarioIdentifier === 'string' ? scenarioIdentifier : '';
    const inlineState = typeof newState === 'string' ? newState.trim() : '';

    const normalizedOptions = options && typeof options === 'object' ? options : {};
    const refresh = normalizedOptions.refresh !== false;
    const silent = normalizedOptions.silent === true;
    const manageLoading = normalizedOptions.manageLoading !== false;
    const syncForm = normalizedOptions.syncForm !== false;

    let candidateIdentifier = inlineScenarioIdentifier;
    if (!candidateIdentifier && scenarioSelect) {
        candidateIdentifier = scenarioSelect.value || '';
    }

    const resolvedTarget = resolveScenarioTarget(candidateIdentifier);
    const endpointIdentifier = resolvedTarget.endpointIdentifier;
    const displayName = resolvedTarget.displayName;

    const resolvedState = inlineState || scenarioStateInput?.value?.trim() || '';

    if (!endpointIdentifier || !endpointIdentifier.trim() || !resolvedState) {
        if (!silent) {
            NotificationManager.warning('Please select scenario and enter state');
        }
        return false;
    }

    const stateEndpoint = resolvedTarget.stateEndpoint;

    if (!stateEndpoint) {
        if (!silent) {
            NotificationManager.error('Unable to determine the scenario state endpoint.');
        }
        return false;
    }

    if (resolvedTarget.targetScenario && Array.isArray(resolvedTarget.targetScenario.possibleStates) && resolvedTarget.targetScenario.possibleStates.length === 0) {
        if (!silent) {
            NotificationManager.warning(`Scenario "${displayName}" does not expose any states to switch to.`);
        }
        return false;
    }

    if (syncForm) {
        if (scenarioSelect) {
            const selectValue = resolvedTarget.targetScenario?.identifier
                || resolvedTarget.targetScenario?.decodedId
                || resolvedTarget.targetScenario?.decodedName
                || endpointIdentifier;
            scenarioSelect.value = selectValue;
            updateScenarioStateSuggestions(selectValue);
        } else {
            updateScenarioStateSuggestions(endpointIdentifier);
        }
    }

    if (manageLoading) {
        setScenariosLoading(true);
    }

    const scenarioExists = !!resolvedTarget.targetScenario;

    try {
        await apiFetch(stateEndpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: resolvedState })
        });

        if (!silent) {
            NotificationManager.success(`Scenario "${displayName}" switched to state "${resolvedState}"`);
        }
        if (syncForm && !inlineState && scenarioStateInput) {
            scenarioStateInput.value = '';
        }
        if (syncForm) {
            updateScenarioStateSuggestions(endpointIdentifier);
        }
        if (refresh) {
            await loadScenarios();
        } else if (manageLoading) {
            setScenariosLoading(false);
        }
        return true;
    } catch (error) {
        Logger.error('SCENARIOS', 'Change scenario state error:', error);
        const notFound = /HTTP\s+404/.test(error?.message || '');
        const notSupported = /does not support state/i.test(error?.message || '');
        if (!silent) {
            if (notFound && !scenarioExists) {
                NotificationManager.error(`Scenario "${displayName}" was not found on the server.`);
            } else if (notSupported) {
                NotificationManager.error(`Scenario "${displayName}" does not allow state changes.`);
            } else {
                NotificationManager.error(`Scenario state change failed: ${error.message}`);
            }
        }
        if (manageLoading) {
            setScenariosLoading(false);
        }
        return false;
    }
};

async function resetScenarioState(scenarioIdentifier, options = {}) {
    const normalizedOptions = options && typeof options === 'object' ? options : {};
    const refresh = normalizedOptions.refresh !== false;
    const silent = normalizedOptions.silent === true;
    const manageLoading = normalizedOptions.manageLoading !== false;

    if (typeof scenarioIdentifier !== 'string' || !scenarioIdentifier.trim()) {
        if (!silent) {
            NotificationManager.warning('Unable to determine which scenario to reset.');
        }
        return false;
    }

    const resolvedTarget = resolveScenarioTarget(scenarioIdentifier);
    const resolvedEndpoint = resolvedTarget.resetEndpoint;
    const requestMethod = resolvedTarget.resetMethod;
    const displayName = resolvedTarget.displayName;

    if (!resolvedEndpoint) {
        if (!silent) {
            NotificationManager.error('Unable to determine the scenario reset endpoint.');
        }
        return false;
    }

    if (manageLoading) {
        setScenariosLoading(true);
    }

    try {
        // WireMock Admin API: empty PUT to /__admin/scenarios/<name>/state resets to Started.
        await apiFetch(resolvedEndpoint, { method: requestMethod });
        if (!silent) {
            NotificationManager.success(`Scenario "${displayName}" has been reset to its initial state.`);
        }
        if (refresh) {
            await loadScenarios();
        } else if (manageLoading) {
            setScenariosLoading(false);
        }
        return true;
    } catch (error) {
        if (requestMethod === 'PUT' && resolvedTarget.stateEndpoint) {
            try {
                await apiFetch(resolvedTarget.stateEndpoint, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ state: 'Started' }),
                });
                if (!silent) {
                    NotificationManager.success(`Scenario "${displayName}" has been reset to its initial state.`);
                }
                if (refresh) {
                    await loadScenarios();
                } else if (manageLoading) {
                    setScenariosLoading(false);
                }
                return true;
            } catch (fallbackError) {
                Logger.error('SCENARIOS', 'Reset scenario state error:', fallbackError);
                if (!silent) {
                    NotificationManager.error(`Scenario reset failed: ${fallbackError.message}`);
                }
                if (manageLoading) {
                    setScenariosLoading(false);
                }
                return false;
            }
        }

        Logger.error('SCENARIOS', 'Reset scenario state error:', error);
        if (!silent) {
            NotificationManager.error(`Scenario reset failed: ${error.message}`);
        }
        if (manageLoading) {
            setScenariosLoading(false);
        }
        return false;
    }
}

function normalizeSearchTerm(value) {
    if (window.ScenarioModel && typeof window.ScenarioModel.normalizeSearchTerm === 'function') {
        return window.ScenarioModel.normalizeSearchTerm(value);
    }
    return '';
}

function scenarioMatchesSearch(scenario, term) {
    if (window.ScenarioModel && typeof window.ScenarioModel.scenarioMatchesSearch === 'function') {
        return window.ScenarioModel.scenarioMatchesSearch(scenario, term);
    }
    return true;
}

async function bulkResetSelectedScenarios() {
    const selection = scenarioUiState.selected instanceof Set ? Array.from(scenarioUiState.selected) : [];
    if (selection.length === 0) return;
    if (!confirm(`Reset ${selection.length} selected scenarios to their initial state?`)) return;

    setScenarioBulkMenuOpen(false);
    setScenariosLoading(true);

    const failures = [];
    for (const scenarioIdentifier of selection) {
        try {
            const resolvedTarget = resolveScenarioTarget(scenarioIdentifier);
            if (!resolvedTarget.resetEndpoint) {
                failures.push({ id: scenarioIdentifier, name: resolvedTarget.displayName || scenarioIdentifier, error: 'No reset endpoint resolved' });
                continue;
            }
            try {
                await apiFetch(resolvedTarget.resetEndpoint, { method: resolvedTarget.resetMethod });
            } catch (error) {
                if (resolvedTarget.resetMethod === 'PUT' && resolvedTarget.stateEndpoint) {
                    await apiFetch(resolvedTarget.stateEndpoint, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ state: 'Started' }),
                    });
                } else {
                    throw error;
                }
            }
        } catch (error) {
            failures.push({ id: scenarioIdentifier, name: scenarioIdentifier, error: error?.message || String(error) });
        }
    }

    if (failures.length > 0) {
        scenarioUiState.selected = new Set(failures.map((item) => item.id).filter(Boolean));
        const sample = failures.slice(0, 3).map((item) => item.name || item.id).join(', ');
        NotificationManager.warning(`Bulk reset: ${failures.length} failed${sample ? ` (e.g. ${sample})` : ''}.`);
    } else {
        scenarioUiState.selected.clear();
        NotificationManager.success('Bulk reset complete.');
    }

    await loadScenarios();
}

async function bulkSetScenarioState() {
    const selection = scenarioUiState.selected instanceof Set ? Array.from(scenarioUiState.selected) : [];
    if (selection.length === 0) return;

    const suggested = selection.length === 1 ? (getScenarioByIdentifier(selection[0])?.state || 'Started') : 'Started';
    const target = prompt(`Set state for ${selection.length} selected scenarios:`, suggested);
    if (!target || !target.trim()) return;

    setScenarioBulkMenuOpen(false);
    setScenariosLoading(true);

    const failures = [];
    const resolvedState = target.trim();

    for (const scenarioIdentifier of selection) {
        try {
            const resolvedTarget = resolveScenarioTarget(scenarioIdentifier);
            if (!resolvedTarget.stateEndpoint) {
                failures.push({ id: scenarioIdentifier, name: resolvedTarget.displayName || scenarioIdentifier, error: 'No state endpoint resolved' });
                continue;
            }
            await apiFetch(resolvedTarget.stateEndpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state: resolvedState }),
            });
        } catch (error) {
            failures.push({ id: scenarioIdentifier, name: scenarioIdentifier, error: error?.message || String(error) });
        }
    }

    if (failures.length > 0) {
        scenarioUiState.selected = new Set(failures.map((item) => item.id).filter(Boolean));
        const sample = failures.slice(0, 3).map((item) => item.name || item.id).join(', ');
        NotificationManager.warning(`Bulk state update: ${failures.length} failed${sample ? ` (e.g. ${sample})` : ''}.`);
    } else {
        scenarioUiState.selected.clear();
        NotificationManager.success(`Bulk state updated: "${resolvedState}"`);
    }

    await loadScenarios();
}

async function fetchFullMappingById(mappingId) {
    const normalizedId = (mappingId ?? '').toString().trim();
    if (!normalizedId) return null;

    if (typeof window.getMappingById === 'function') {
        try {
            const mapping = await window.getMappingById(normalizedId);
            if (mapping && typeof mapping === 'object') {
                return mapping;
            }
        } catch (error) {
            Logger.warn('SCENARIOS', 'getMappingById failed, falling back to direct fetch', { mappingId: normalizedId, error });
        }
    }

    const endpoint = `/mappings/${encodeURIComponent(normalizedId)}`;
    const response = await apiFetch(endpoint);
    const mapping = response && typeof response === 'object' && response.mapping ? response.mapping : response;
    return mapping && typeof mapping === 'object' ? mapping : null;
}

async function bulkExportSelectedMappings() {
    const selection = scenarioUiState.selected instanceof Set ? Array.from(scenarioUiState.selected) : [];
    if (selection.length === 0) return;

    setScenarioBulkMenuOpen(false);

    const mappingIds = [];
    const seen = new Set();

    selection.forEach((identifier) => {
        const scenario = getScenarioByIdentifier(identifier);
        const mappingSummaries = Array.isArray(scenario?.mappings) ? scenario.mappings : [];
        mappingSummaries.forEach((mapping) => {
            const mappingId = (mapping?.id || mapping?.uuid || mapping?.stubMappingId || mapping?.stubId || mapping?.mappingId || '').toString().trim();
            if (!mappingId || seen.has(mappingId)) return;
            seen.add(mappingId);
            mappingIds.push(mappingId);
        });
    });

    if (mappingIds.length === 0) {
        NotificationManager.warning('No mappings found for selected scenarios.');
        return;
    }

    setScenariosLoading(true);

    const mappings = [];
    const failures = [];

    for (const mappingId of mappingIds) {
        try {
            const mapping = await fetchFullMappingById(mappingId);
            if (!mapping) {
                failures.push({ id: mappingId, error: 'Empty mapping payload' });
                continue;
            }
            mappings.push(mapping);
        } catch (error) {
            failures.push({ id: mappingId, error: error?.message || String(error) });
        }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `wiremock-mappings-${timestamp}.json`;
    downloadFile(filename, `${JSON.stringify({ mappings }, null, 2)}\n`, 'application/json');

    if (failures.length > 0) {
        const sample = failures.slice(0, 3).map((item) => item.id).join(', ');
        NotificationManager.warning(`Exported ${mappings.length}/${mappingIds.length} mapping(s). Failed: ${failures.length}${sample ? ` (e.g. ${sample})` : ''}.`);
    } else {
        NotificationManager.success(`Exported ${mappings.length} mapping(s).`);
    }

    setScenariosLoading(false);
}

