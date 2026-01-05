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
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';

    if (!/%[0-9a-fA-F]{2}/.test(trimmed)) {
        return trimmed;
    }

    try {
        return decodeURIComponent(trimmed);
    } catch (e) {
        Logger.warn('SCENARIOS', 'safeDecode failed, returning original value', { value, error: e });
        return trimmed;
    }
}

function normalizeScenarioLink(link) {
    if (typeof link !== 'string') return '';
    let value = link.trim();
    if (!value) return '';

    if (/^https?:\/\//i.test(value)) {
        try {
            const url = new URL(value);
            value = url.pathname;
        } catch (e) {
            Logger.warn('SCENARIOS', 'normalizeScenarioLink failed to parse absolute URL', { link, error: e });
        }
    }

    const adminPrefix = '/__admin';
    if (value.startsWith(adminPrefix)) {
        value = value.slice(adminPrefix.length) || '/';
    }

    value = value.replace(/^\/+/, '');
    return value ? `/${value}` : '';
}

function normalizeScenario(scenario, index) {
    if (!scenario || typeof scenario !== 'object') return null;

    const rawId = typeof scenario.id === 'string' ? scenario.id : '';
    const rawName = typeof scenario.name === 'string' ? scenario.name : '';

    const decodedId = safeDecode(rawId);
    const decodedName = safeDecode(rawName);

    const identifier = decodedId || decodedName || rawId || rawName || '';
    const displayName = decodedName || decodedId || rawName || rawId || `Scenario ${index + 1}`;

    const normalizedState = safeDecode(scenario.state) || scenario.state || 'Started';
    const normalizedStates = Array.isArray(scenario.possibleStates)
        ? scenario.possibleStates.map((state) => safeDecode(state) || state).filter(Boolean)
        : [];

    const normalizedMappings = Array.isArray(scenario.mappings)
        ? scenario.mappings.map((mapping) => {
            if (!mapping || typeof mapping !== 'object') return mapping;
            return {
                ...mapping,
                requiredScenarioState: safeDecode(mapping.requiredScenarioState) || mapping.requiredScenarioState || '',
                newScenarioState: safeDecode(mapping.newScenarioState) || mapping.newScenarioState || ''
            };
        })
        : [];

    const explicitStateEndpoint = normalizeScenarioLink(
        scenario.stateEndpoint ||
        scenario?._links?.['update-state']?.href ||
        scenario?._links?.updateState?.href ||
        scenario?._links?.state?.href
    );

    const explicitResetEndpoint = normalizeScenarioLink(
        scenario.resetEndpoint ||
        scenario?._links?.['reset-state']?.href ||
        scenario?._links?.resetState?.href ||
        scenario?._links?.reset?.href
    );

    return {
        ...scenario,
        id: identifier || decodedId || rawId,
        name: displayName,
        displayName,
        identifier,
        originalId: rawId,
        originalName: rawName || decodedName,
        decodedId,
        decodedName,
        state: normalizedState,
        possibleStates: normalizedStates,
        mappings: normalizedMappings,
        stateEndpoint: explicitStateEndpoint,
        resetEndpoint: explicitResetEndpoint
    };
}

function normalizeScenarioList(list) {
    if (!Array.isArray(list)) return [];
    return list
        .map((scenario, index) => normalizeScenario(scenario, index))
        .filter(Boolean);
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
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
}

function scenarioMatchesSearch(scenario, term) {
    if (!term) return true;
    if (!scenario || typeof scenario !== 'object') return false;

    const haystacks = [
        scenario.displayName,
        scenario.name,
        scenario.identifier,
        scenario.id,
        scenario.state,
        scenario.description
    ]
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.toLowerCase());

    if (haystacks.some((value) => value.includes(term))) {
        return true;
    }

    const mappings = Array.isArray(scenario.mappings) ? scenario.mappings : [];
    return mappings.some((mapping) => {
        if (!mapping || typeof mapping !== 'object') return false;
        const mappingValues = [
            mapping.name,
            mapping.id,
            mapping.uuid,
            mapping.stubId,
            mapping.stubMappingId,
            mapping.requiredScenarioState,
            mapping.newScenarioState,
            mapping.request?.method,
            mapping.request?.url,
            mapping.request?.urlPattern,
            mapping.request?.urlPath,
            mapping.request?.urlPathPattern
        ]
            .filter((value) => typeof value === 'string' && value.trim())
            .map((value) => value.toLowerCase());
        return mappingValues.some((value) => value.includes(term));
    });
}

function setScenarioBulkMenuOpen(isOpen) {
    scenarioUiState.bulkMenuOpen = Boolean(isOpen);
    const menuEl = document.getElementById('scenario-bulk-menu');
    if (menuEl) {
        menuEl.classList.toggle('is-open', scenarioUiState.bulkMenuOpen);
        menuEl.setAttribute('aria-hidden', scenarioUiState.bulkMenuOpen ? 'false' : 'true');
    }
}

function updateScenarioHeaderUI(visibleScenarios, totalScenarios) {
    const statsEl = document.getElementById('scenario-stats');
    if (statsEl) {
        const totalMappings = Array.isArray(visibleScenarios)
            ? visibleScenarios.reduce((acc, scenario) => acc + (Array.isArray(scenario?.mappings) ? scenario.mappings.length : 0), 0)
            : 0;
        const visibleCount = Array.isArray(visibleScenarios) ? visibleScenarios.length : 0;
        statsEl.textContent = `${visibleCount}/${totalScenarios} scenarios • ${totalMappings} mappings`;
    }

    const selectAllRow = document.getElementById('scenario-select-all-row');
    const selectAllBtn = document.getElementById('scenario-select-all-btn');

    const visibleSelectable = Array.isArray(visibleScenarios)
        ? visibleScenarios
            .map((scenario) => {
                const scenarioIdentifier = typeof scenario?.identifier === 'string'
                    ? scenario.identifier
                    : (typeof scenario?.decodedId === 'string' ? scenario.decodedId : (typeof scenario?.id === 'string' ? scenario.id : ''));
                const normalized = typeof scenarioIdentifier === 'string' ? scenarioIdentifier.trim() : '';
                return normalized || '';
            })
            .filter(Boolean)
        : [];

    scenarioUiState.lastVisibleSelectable = visibleSelectable;

    const selectionCount = scenarioUiState.selected instanceof Set ? scenarioUiState.selected.size : 0;
    const bulkWrap = document.getElementById('scenario-bulk-wrap');
    const bulkCount = document.getElementById('scenario-bulk-count');

    if (bulkCount) {
        bulkCount.textContent = String(selectionCount);
    }

    if (bulkWrap) {
        bulkWrap.style.display = selectionCount > 0 ? '' : 'none';
    }

    if (selectAllRow) {
        selectAllRow.style.display = visibleSelectable.length > 0 ? '' : 'none';
    }

    if (selectAllBtn) {
        const allSelected = visibleSelectable.length > 0 && visibleSelectable.every((id) => scenarioUiState.selected.has(id));
        selectAllBtn.classList.toggle('is-selected', allSelected);
        selectAllBtn.setAttribute('aria-checked', allSelected ? 'true' : 'false');
    }

    if (selectionCount === 0 && scenarioUiState.bulkMenuOpen) {
        setScenarioBulkMenuOpen(false);
    }
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

function bulkExportSelectedScenarios() {
    const selection = scenarioUiState.selected instanceof Set ? Array.from(scenarioUiState.selected) : [];
    if (selection.length === 0) return;

    setScenarioBulkMenuOpen(false);

    const scenarios = selection.map((identifier) => {
        const scenario = getScenarioByIdentifier(identifier);
        if (!scenario) {
            return { identifier };
        }

        const mappingSummaries = Array.isArray(scenario.mappings) ? scenario.mappings : [];
        const exportMappings = mappingSummaries.map((mapping) => {
            const mappingId = mapping?.id || mapping?.uuid || mapping?.stubMappingId || mapping?.stubId || mapping?.mappingId || '';
            const method = mapping?.request?.method || mapping?.method || mapping?.requestMethod || '';
            const url = mapping?.request?.urlPattern || mapping?.request?.urlPath || mapping?.request?.url || mapping?.url || mapping?.requestUrl || '';
            return {
                id: mappingId || undefined,
                name: mapping?.name || undefined,
                request: {
                    method: method || undefined,
                    url: url || undefined,
                },
                requiredScenarioState: mapping?.requiredScenarioState || mapping?.requiredState || undefined,
                newScenarioState: mapping?.newScenarioState || mapping?.newState || undefined,
            };
        });

        return {
            identifier: scenario.identifier || scenario.id || scenario.name,
            name: scenario.displayName || scenario.name,
            state: scenario.state,
            possibleStates: Array.isArray(scenario.possibleStates) ? scenario.possibleStates : [],
            mappings: exportMappings,
        };
    });

    const payload = {
        exportedAt: new Date().toISOString(),
        scenarios,
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `scenario-mappings-${stamp}.json`;
    downloadFile(filename, `${JSON.stringify(payload, null, 2)}\n`, 'application/json');

    NotificationManager.success(`Exported ${scenarios.length} scenario(s).`);
}

function clearScenarioSelection() {
    if (scenarioUiState.selected instanceof Set) {
        scenarioUiState.selected.clear();
    }
    setScenarioBulkMenuOpen(false);
    renderScenarios();
}

function toggleSelectAllVisibleScenarios() {
    const visible = Array.isArray(scenarioUiState.lastVisibleSelectable) ? scenarioUiState.lastVisibleSelectable : [];
    if (!(scenarioUiState.selected instanceof Set)) {
        scenarioUiState.selected = new Set();
    }

    const hasAll = visible.length > 0 && visible.every((id) => scenarioUiState.selected.has(id));
    if (hasAll) {
        visible.forEach((id) => scenarioUiState.selected.delete(id));
    } else {
        visible.forEach((id) => scenarioUiState.selected.add(id));
    }

    renderScenarios();
}

window.renderScenarios = () => {
    const listEl = document.getElementById(SELECTORS.LISTS.SCENARIOS);
    const emptyEl = document.getElementById('scenarios-empty');
    const countEl = document.getElementById('scenarios-count');
    const selectEl = document.getElementById('scenario-select');
    const stateOptionsEl = document.getElementById('scenario-state-options');
    const searchInput = document.getElementById('scenario-search');
    const bulkBtn = document.getElementById('scenario-bulk-btn');
    const bulkResetBtn = document.getElementById('scenario-bulk-reset');
    const bulkSetStateBtn = document.getElementById('scenario-bulk-set-state');
    const bulkExportBtn = document.getElementById('scenario-bulk-export');
    const bulkClearBtn = document.getElementById('scenario-bulk-clear');
    const selectAllBtn = document.getElementById('scenario-select-all-btn');

    if (!listEl) return;

    if (countEl) {
        countEl.textContent = Array.isArray(allScenarios) ? allScenarios.length : 0;
    }

    const normalizedScenarios = Array.isArray(allScenarios) ? allScenarios : [];

    if (normalizedScenarios.length === 0) {
        listEl.innerHTML = '';
        listEl.style.display = 'none';
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (selectEl) {
            selectEl.innerHTML = '<option value="">Select Scenario</option>';
        }
        if (stateOptionsEl) {
            stateOptionsEl.innerHTML = '';
        }
        updateScenarioStateSuggestions('');
        updateScenarioHeaderUI([], 0);
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    if (scenarioUiState.selected instanceof Set && scenarioUiState.selected.size > 0) {
        const knownIdentifiers = new Set(
            normalizedScenarios
                .map((scenario) => {
                    const scenarioIdentifier = typeof scenario?.identifier === 'string'
                        ? scenario.identifier
                        : (typeof scenario?.decodedId === 'string' ? scenario.decodedId : (typeof scenario?.id === 'string' ? scenario.id : ''));
                    return typeof scenarioIdentifier === 'string' ? scenarioIdentifier.trim() : '';
                })
                .filter(Boolean)
        );
        for (const selectedId of Array.from(scenarioUiState.selected)) {
            if (!knownIdentifiers.has(selectedId)) {
                scenarioUiState.selected.delete(selectedId);
            }
        }
    }

    if (searchInput) {
        const currentValue = searchInput.value || '';
        if (currentValue !== scenarioUiState.searchTerm) {
            searchInput.value = scenarioUiState.searchTerm;
        }
    }

    if (!scenarioToolbarHandlersAttached) {
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                scenarioUiState.searchTerm = typeof event.target?.value === 'string' ? event.target.value : '';
                renderScenarios();
            });
        }

        if (bulkBtn) {
            bulkBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                setScenarioBulkMenuOpen(!scenarioUiState.bulkMenuOpen);
            });
        }

        if (bulkResetBtn) {
            bulkResetBtn.addEventListener('click', () => {
                void bulkResetSelectedScenarios();
            });
        }

        if (bulkSetStateBtn) {
            bulkSetStateBtn.addEventListener('click', () => {
                void bulkSetScenarioState();
            });
        }

        if (bulkExportBtn) {
            bulkExportBtn.addEventListener('click', bulkExportSelectedScenarios);
        }

        if (bulkClearBtn) {
            bulkClearBtn.addEventListener('click', clearScenarioSelection);
        }

        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', toggleSelectAllVisibleScenarios);
        }

        document.addEventListener('click', (event) => {
            const bulkWrap = document.getElementById('scenario-bulk-wrap');
            if (!bulkWrap) return;
            if (!scenarioUiState.bulkMenuOpen) return;
            if (typeof bulkWrap.contains === 'function' && bulkWrap.contains(event.target)) return;
            setScenarioBulkMenuOpen(false);
        });

        document.addEventListener('keydown', (event) => {
            if (!scenarioUiState.bulkMenuOpen) return;
            if (event.key === 'Escape') {
                setScenarioBulkMenuOpen(false);
            }
        });

        scenarioToolbarHandlersAttached = true;
    }

    const previousSelection = selectEl?.value || '';
    if (selectEl) {
        const options = ['<option value="">Select Scenario</option>']
            .concat(normalizedScenarios.map((scenario) => {
                const scenarioIdentifier = typeof scenario?.identifier === 'string'
                    ? scenario.identifier
                    : (typeof scenario?.decodedId === 'string' ? scenario.decodedId : (typeof scenario?.id === 'string' ? scenario.id : ''));
                const scenarioLabel = typeof scenario?.displayName === 'string'
                    ? scenario.displayName
                    : (typeof scenario?.name === 'string' ? scenario.name : (typeof scenario?.decodedName === 'string' ? scenario.decodedName : 'Unnamed scenario'));
                return `
                <option value="${escapeHtml(scenarioIdentifier)}">${escapeHtml(scenarioLabel)}</option>
            `;
            }));
        selectEl.innerHTML = options.join('');
        if (previousSelection) {
            const matchedScenario = getScenarioByIdentifier(previousSelection);
            if (matchedScenario) {
                selectEl.value = matchedScenario.identifier
                    || matchedScenario.decodedId
                    || matchedScenario.decodedName
                    || matchedScenario.id
                    || matchedScenario.name
                    || '';
            }
        }
    }

    if (stateOptionsEl) {
        updateScenarioStateSuggestions(selectEl?.value || previousSelection || '');
    }

    if (selectEl && !selectEl.dataset.scenarioHandlerAttached) {
        selectEl.addEventListener('change', (event) => {
            updateScenarioStateSuggestions(event.target.value);
        });
        selectEl.dataset.scenarioHandlerAttached = '1';
    }

    listEl.style.display = '';

    const term = normalizeSearchTerm(scenarioUiState.searchTerm);
    const filteredScenarios = normalizedScenarios.filter((scenario) => scenarioMatchesSearch(scenario, term));

    if (filteredScenarios.length === 0) {
        listEl.innerHTML = '';
        listEl.style.display = 'none';
        if (emptyEl) {
            emptyEl.classList.remove('hidden');
            const titleEl = typeof emptyEl.querySelector === 'function' ? emptyEl.querySelector('h3') : null;
            const bodyEl = typeof emptyEl.querySelector === 'function' ? emptyEl.querySelector('p') : null;
            if (titleEl) titleEl.textContent = 'No scenarios match your filter';
            if (bodyEl) bodyEl.textContent = 'Try clearing the filter or searching by mapping URL/state.';
        }
        updateScenarioHeaderUI([], normalizedScenarios.length);
        return;
    }

    if (emptyEl) {
        const titleEl = typeof emptyEl.querySelector === 'function' ? emptyEl.querySelector('h3') : null;
        const bodyEl = typeof emptyEl.querySelector === 'function' ? emptyEl.querySelector('p') : null;
        if (titleEl) titleEl.textContent = 'No scenarios found';
        if (bodyEl) bodyEl.textContent = 'Create mappings with scenarios to manage state here.';
        emptyEl.classList.add('hidden');
    }

    updateScenarioHeaderUI(filteredScenarios, normalizedScenarios.length);

    listEl.innerHTML = filteredScenarios.map((scenario, index) => {
        const scenarioIdentifier = typeof scenario?.identifier === 'string'
            ? scenario.identifier
            : (typeof scenario?.decodedId === 'string' ? scenario.decodedId : (typeof scenario?.id === 'string' ? scenario.id : ''));
        const scenarioIdentifierAttr = escapeHtml(scenarioIdentifier);
        const displayLabel = typeof scenario?.displayName === 'string'
            ? scenario.displayName
            : (typeof scenario?.name === 'string' ? scenario.name : (typeof scenario?.decodedName === 'string' ? scenario.decodedName : 'Unnamed scenario'));
        const displayedName = escapeHtml(displayLabel);
        const displayedState = escapeHtml(scenario.state || 'Started');
        const possibleStates = Array.isArray(scenario.possibleStates) ? scenario.possibleStates.filter(Boolean) : [];

        const rawScenarioKey = scenarioIdentifier
            || scenario?.decodedId
            || scenario?.decodedName
            || scenario?.id
            || scenario?.name
            || `scenario-${index}`;
        const scenarioKey = typeof rawScenarioKey === 'string' && rawScenarioKey.trim()
            ? rawScenarioKey.trim()
            : `scenario-${index}`;
        if (!Object.prototype.hasOwnProperty.call(scenarioExpansionState, scenarioKey)) {
            scenarioExpansionState[scenarioKey] = true;
        }
        const isExpanded = scenarioExpansionState[scenarioKey] !== false;
        const scenarioKeyAttr = escapeHtml(scenarioKey);

        const canTargetScenario = typeof scenarioIdentifier === 'string' && scenarioIdentifier.trim().length > 0;
        const selectionKey = canTargetScenario ? scenarioIdentifier.trim() : '';
        const isSelected = selectionKey && scenarioUiState.selected instanceof Set
            ? scenarioUiState.selected.has(selectionKey)
            : false;

        const selectButtonMarkup = canTargetScenario ? `
            <button
                type="button"
                class="scenario-select-btn${isSelected ? ' is-selected' : ''}"
                data-scenario-action="select"
                data-scenario="${scenarioIdentifierAttr}"
                role="checkbox"
                aria-checked="${isSelected ? 'true' : 'false'}"
                aria-label="Select scenario ${displayedName}"
                title="Select"
            >
                <span class="scenario-select-box" aria-hidden="true"></span>
            </button>
        ` : `
            <span style="width:18px;height:18px;display:inline-block;"></span>
        `;

        const seenStates = new Set();
        const displayStates = [];
        const pushDisplayState = (state) => {
            if (typeof state !== 'string') return;
            const normalized = state.trim();
            if (!normalized || seenStates.has(normalized)) return;
            seenStates.add(normalized);
            displayStates.push(normalized);
        };

        pushDisplayState(scenario.state || '');
        possibleStates.forEach(pushDisplayState);

        const statePillsMarkup = displayStates.map((state) => {
            const stateAttr = escapeHtml(state);
            const isCurrent = state === scenario.state;
            const baseClass = 'scenario-state-pill';
            if (isCurrent) {
                return `<span class="${baseClass} is-active" data-current="true">${stateAttr}</span>`;
            }
            if (!canTargetScenario) {
                return `<span class="${baseClass}">${stateAttr}</span>`;
            }
            return `
                <button
                    type="button"
                    class="${baseClass}"
                    data-scenario-action="transition"
                    data-scenario="${scenarioIdentifierAttr}"
                    data-state="${stateAttr}"
                >
                    ${stateAttr}
                </button>
            `;
        }).join('');

        const resetButtonMarkup = canTargetScenario ? `
            <button
                type="button"
                class="scenario-reset-btn"
                data-scenario-action="reset"
                data-scenario="${scenarioIdentifierAttr}"
            >
                ${renderIcon('refresh', { className: 'icon-inline' })} Reset
            </button>
        ` : '';

        const summaryControlsMarkup = (statePillsMarkup || resetButtonMarkup) ? `
            <div class="scenario-summary-controls">
                <div class="scenario-state-pill-list">${statePillsMarkup}</div>
                ${resetButtonMarkup}
            </div>
        ` : '';

        const descriptionMarkup = scenario.description ? `
            <div class="scenario-info">
                <div class="scenario-description">${escapeHtml(scenario.description)}</div>
            </div>
        ` : '';

        const mappingSummaries = Array.isArray(scenario.mappings) ? scenario.mappings : [];
        const mappingListMarkup = mappingSummaries.length ? `
            <ul class="scenario-mapping-list">
                ${mappingSummaries.map((mapping) => {
                    const mappingId = mapping?.id || mapping?.uuid || mapping?.stubMappingId || mapping?.stubId || mapping?.mappingId || '';
                    const mappingIdAttr = mappingId ? escapeHtml(mappingId) : '';
                    const mappingName = escapeHtml(mapping?.name || mappingId || 'Unnamed mapping');
                    const method = mapping?.request?.method || mapping?.method || mapping?.requestMethod || '';
                    const url = mapping?.request?.urlPattern || mapping?.request?.urlPath || mapping?.request?.url || mapping?.url || mapping?.requestUrl || '';
                    const methodLabel = method ? `<span class="scenario-mapping-method">${escapeHtml(method)}</span>` : '';
                    const urlLabel = url ? `<span class="scenario-mapping-url">${escapeHtml(url)}</span>` : '';
                    const metaLabel = methodLabel || urlLabel ? `
                        <div class="scenario-mapping-meta">
                            ${[methodLabel, urlLabel].filter(Boolean).join(' · ')}
                        </div>
                    ` : '';
                    const requiredState = mapping?.requiredScenarioState || mapping?.requiredState || '';
                    const newState = mapping?.newScenarioState || mapping?.newState || '';
                    const transitionMarkup = [
                        requiredState ? `<span class="badge badge-warning" title="Required scenario state">Requires: ${escapeHtml(requiredState)}</span>` : '',
                        newState ? `<span class="badge badge-info" title="Next scenario state">→ ${escapeHtml(newState)}</span>` : ''
                    ].filter(Boolean).join(' ');
                    const transitions = transitionMarkup ? `
                        <div class="scenario-mapping-states">${transitionMarkup}</div>
                    ` : '';
                    const editIcon = renderIcon('pencil', { className: 'action-icon' });
                    const duplicateIcon = renderIcon('clipboard', { className: 'action-icon' });
                    const deleteIcon = renderIcon('trash', { className: 'action-icon' });

                    const actionsMarkup = mappingId ? `
                        <div class="scenario-mapping-actions">
                            <button
                                class="btn btn-sm btn-secondary"
                                data-scenario-action="edit-mapping"
                                data-mapping-id="${mappingIdAttr}"
                                title="Edit mapping"
                            >
                                ${editIcon || ''}<span>Edit</span>
                            </button>
                            <button
                                class="btn btn-sm btn-secondary"
                                data-scenario-action="duplicate-mapping"
                                data-mapping-id="${mappingIdAttr}"
                                title="Duplicate mapping"
                            >
                                ${duplicateIcon || ''}<span>Duplicate</span>
                            </button>
                            <button
                                class="btn btn-sm btn-danger"
                                data-scenario-action="delete-mapping"
                                data-mapping-id="${mappingIdAttr}"
                                title="Delete mapping"
                            >
                                ${deleteIcon || ''}<span>Delete</span>
                            </button>
                        </div>
                    ` : '';

                    return `
                        <li class="scenario-mapping-item">
                            <div class="scenario-mapping-name">${mappingName}</div>
                            ${metaLabel}
                            ${transitions}
                            ${actionsMarkup}
                        </li>
                    `;
                }).join('')}
            </ul>
        ` : `
            <div class="scenario-mapping-empty">No stub mappings are bound to this scenario yet.</div>
        `;

        const toggleIcon = renderIcon(isExpanded ? 'sidebar-collapse' : 'sidebar-expand', { className: 'scenario-toggle-icon' }) || (isExpanded ? '▾' : '▸');
        const toggleAriaLabel = `${isExpanded ? 'Collapse' : 'Expand'} scenario ${displayLabel}`;

        return `
            <div class="scenario-item ${isExpanded ? 'expanded' : 'collapsed'}${isSelected ? ' is-selected' : ''}" data-scenario="${scenarioIdentifierAttr}" data-scenario-key="${scenarioKeyAttr}">
                <div class="scenario-summary">
                    ${selectButtonMarkup}
                    <button
                        type="button"
                        class="scenario-toggle-btn"
                        data-scenario-action="toggle"
                        data-scenario-key="${scenarioKeyAttr}"
                        aria-expanded="${isExpanded ? 'true' : 'false'}"
                        aria-label="${escapeHtml(toggleAriaLabel)}"
                    >
                        ${toggleIcon}
                    </button>
                    <div class="scenario-summary-main">
                        <div class="scenario-summary-header">
                            <div class="scenario-name">${displayedName}</div>
                            <div class="scenario-state">State: ${displayedState}</div>
                        </div>
                        ${summaryControlsMarkup}
                    </div>
                </div>
                <div class="scenario-body">
                    ${descriptionMarkup}
                    <div class="scenario-mappings">
                        <div class="scenario-section-title">Stub mappings</div>
                        ${mappingListMarkup}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (!scenarioListHandlerAttached) {
        listEl.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-scenario-action]');
            if (!button) return;
            if (typeof listEl.contains === 'function' && !listEl.contains(button)) return;

            const action = button.dataset.scenarioAction;

            if (action === 'toggle') {
                event.preventDefault();
                const scenarioKeyValue = button.dataset.scenarioKey || button.dataset.scenario || '';
                if (!scenarioKeyValue.trim()) {
                    return;
                }

                const currentlyExpanded = scenarioExpansionState[scenarioKeyValue] !== false;
                scenarioExpansionState[scenarioKeyValue] = !currentlyExpanded;
                renderScenarios();
            } else if (action === 'select') {
                event.preventDefault();
                const scenarioIdentifierValue = button.dataset.scenario || '';
                const normalized = typeof scenarioIdentifierValue === 'string' ? scenarioIdentifierValue.trim() : '';
                if (!normalized) return;

                if (!(scenarioUiState.selected instanceof Set)) {
                    scenarioUiState.selected = new Set();
                }

                if (scenarioUiState.selected.has(normalized)) {
                    scenarioUiState.selected.delete(normalized);
                } else {
                    scenarioUiState.selected.add(normalized);
                }

                renderScenarios();
            } else if (action === 'transition') {
                const scenarioIdentifierValue = button.dataset.scenario || '';
                const targetState = button.dataset.state || '';
                if (!scenarioIdentifierValue.trim() || !targetState.trim()) {
                    return;
                }

                button.disabled = true;
                try {
                    await setScenarioState(scenarioIdentifierValue, targetState);
                } finally {
                    button.disabled = false;
                }
            } else if (action === 'reset') {
                const scenarioIdentifierValue = button.dataset.scenario || '';
                if (!scenarioIdentifierValue.trim()) {
                    return;
                }

                button.disabled = true;
                try {
                    await resetScenarioState(scenarioIdentifierValue);
                } finally {
                    button.disabled = false;
                }
            } else if (action === 'edit-mapping') {
                const mappingIdValue = button.dataset.mappingId;
                if (mappingIdValue && typeof window.openEditModal === 'function') {
                    window.openEditModal(mappingIdValue);
                }
            } else if (action === 'duplicate-mapping') {
                const mappingIdValue = button.dataset.mappingId;
                if (mappingIdValue && typeof window.duplicateMapping === 'function') {
                    button.disabled = true;
                    try {
                        await window.duplicateMapping(mappingIdValue);
                        await loadScenarios();
                    } finally {
                        button.disabled = false;
                    }
                }
            } else if (action === 'delete-mapping') {
                const mappingIdValue = button.dataset.mappingId;
                if (mappingIdValue && typeof window.deleteMapping === 'function') {
                    button.disabled = true;
                    try {
                        await window.deleteMapping(mappingIdValue);
                        await loadScenarios();
                    } finally {
                        button.disabled = false;
                    }
                }
            }
        });
        scenarioListHandlerAttached = true;
    }
};
