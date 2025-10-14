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
        console.warn('safeDecode failed, returning original value', { value, error: e });
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
            console.warn('normalizeScenarioLink failed to parse absolute URL', { link, error: e });
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

    const resolvedName = decodedName || rawName || '';
    const resolvedId = decodedId || rawId || '';

    const identifier = resolvedName || resolvedId || rawName || rawId || '';
    const displayName = resolvedName || resolvedId || rawName || rawId || `Scenario ${index + 1}`;

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
        endpointName: resolvedName || resolvedId || '',
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

function resolveScenarioIdentifierValue(scenario) {
    if (!scenario || typeof scenario !== 'object') {
        return '';
    }

    const candidates = [
        scenario.identifier,
        scenario.endpointName,
        scenario.decodedName,
        scenario.name,
        scenario.originalName,
        scenario.decodedId,
        scenario.id,
        scenario.originalId
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            const trimmed = candidate.trim();
            if (trimmed) {
                return trimmed;
            }
        }
    }

    return '';
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
            scenario?.endpointName,
            scenario?.decodedName,
            scenario?.name,
            scenario?.originalName,
            scenario?.decodedId,
            scenario?.id,
            scenario?.originalId
        ];

        return candidates.some((candidate) => {
            if (typeof candidate !== 'string') return false;
            return candidate.trim() === trimmedIdentifier;
        });
    }) || null;
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
        console.error('Load scenarios error:', e);
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

window.setScenarioState = async (scenarioIdentifier, newState) => {
    const scenarioSelect = document.getElementById('scenario-select');
    const scenarioStateInput = document.getElementById('scenario-state');

    const inlineScenarioIdentifier = typeof scenarioIdentifier === 'string' ? scenarioIdentifier : '';
    const inlineState = typeof newState === 'string' ? newState.trim() : '';

    let candidateIdentifier = inlineScenarioIdentifier;
    if (!candidateIdentifier && scenarioSelect) {
        candidateIdentifier = scenarioSelect.value || '';
    }

    const targetScenario = getScenarioByIdentifier(candidateIdentifier);
    const rawEndpointIdentifier = targetScenario?.identifier
        || targetScenario?.endpointName
        || targetScenario?.decodedName
        || targetScenario?.name
        || targetScenario?.decodedId
        || targetScenario?.id
        || candidateIdentifier;
    const endpointIdentifier = safeDecode(rawEndpointIdentifier) || rawEndpointIdentifier;

    const displayName = targetScenario?.displayName
        || targetScenario?.decodedName
        || targetScenario?.name
        || targetScenario?.originalName
        || targetScenario?.decodedId
        || targetScenario?.id
        || safeDecode(candidateIdentifier)
        || candidateIdentifier;

    const resolvedState = inlineState || scenarioStateInput?.value?.trim() || '';

    if (!endpointIdentifier || !endpointIdentifier.trim() || !resolvedState) {
        NotificationManager.warning('Please select scenario and enter state');
        return false;
    }

    const directStateEndpoint = typeof targetScenario?.stateEndpoint === 'string'
        ? targetScenario.stateEndpoint
        : '';

    const stateEndpointBuilder = typeof window.buildScenarioStateEndpoint === 'function'
        ? window.buildScenarioStateEndpoint
        : (name) => `${ENDPOINTS.SCENARIOS}/${encodeURIComponent(name)}/state`;

    const stateEndpoint = directStateEndpoint
        || (endpointIdentifier ? stateEndpointBuilder(endpointIdentifier) : '');

    if (!stateEndpoint) {
        NotificationManager.error('Unable to determine the scenario state endpoint.');
        return false;
    }

    if (targetScenario && Array.isArray(targetScenario.possibleStates) && targetScenario.possibleStates.length === 0) {
        NotificationManager.warning(`Scenario "${displayName}" does not expose any states to switch to.`);
        return false;
    }

    if (scenarioSelect) {
        const selectValue = targetScenario?.identifier
            || targetScenario?.endpointName
            || targetScenario?.decodedName
            || targetScenario?.name
            || targetScenario?.decodedId
            || targetScenario?.id
            || endpointIdentifier;
        scenarioSelect.value = selectValue;
        updateScenarioStateSuggestions(selectValue);
    } else {
        updateScenarioStateSuggestions(endpointIdentifier);
    }

    setScenariosLoading(true);

    const scenarioExists = !!targetScenario;

    try {
        await apiFetch(stateEndpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: resolvedState })
        });

        NotificationManager.success(`Scenario "${displayName}" switched to state "${resolvedState}"`);
        if (!inlineState && scenarioStateInput) {
            scenarioStateInput.value = '';
        }
        updateScenarioStateSuggestions(endpointIdentifier);
        await loadScenarios();
        return true;
    } catch (error) {
        console.error('Change scenario state error:', error);
        const notFound = /HTTP\s+404/.test(error?.message || '');
        const notSupported = /does not support state/i.test(error?.message || '');
        if (notFound && !scenarioExists) {
            NotificationManager.error(`Scenario "${displayName}" was not found on the server.`);
        } else if (notSupported) {
            NotificationManager.error(`Scenario "${displayName}" does not allow state changes.`);
        } else {
            NotificationManager.error(`Scenario state change failed: ${error.message}`);
        }
        setScenariosLoading(false);
        return false;
    }
};

async function resetScenarioState(scenarioIdentifier) {
    if (typeof scenarioIdentifier !== 'string' || !scenarioIdentifier.trim()) {
        NotificationManager.warning('Unable to determine which scenario to reset.');
        return false;
    }

    const candidateIdentifier = scenarioIdentifier.trim();
    const targetScenario = getScenarioByIdentifier(candidateIdentifier);

    if (!targetScenario) {
        NotificationManager.error('Scenario not found. Please refresh the list.');
        return false;
    }

    const rawEndpointIdentifier = targetScenario?.identifier
        || targetScenario?.endpointName
        || targetScenario?.decodedName
        || targetScenario?.name
        || targetScenario?.decodedId
        || targetScenario?.id
        || candidateIdentifier;
    const endpointIdentifier = safeDecode(rawEndpointIdentifier) || rawEndpointIdentifier;

    const displayName = targetScenario?.displayName
        || targetScenario?.decodedName
        || targetScenario?.name
        || targetScenario?.originalName
        || targetScenario?.decodedId
        || targetScenario?.id
        || safeDecode(candidateIdentifier)
        || candidateIdentifier;

    const directResetEndpoint = typeof targetScenario?.resetEndpoint === 'string'
        ? targetScenario.resetEndpoint
        : '';

    const resetEndpointBuilder = typeof window.buildScenarioResetEndpoint === 'function'
        ? window.buildScenarioResetEndpoint
        : (name) => `${ENDPOINTS.SCENARIOS}/${encodeURIComponent(name)}/reset`;

    const resetEndpoint = directResetEndpoint
        || (endpointIdentifier ? resetEndpointBuilder(endpointIdentifier) : '');

    if (!resetEndpoint) {
        NotificationManager.error('Unable to determine the scenario reset endpoint.');
        return false;
    }

    setScenariosLoading(true);

    try {
        await apiFetch(resetEndpoint, { method: 'POST' });
        NotificationManager.success(`Scenario "${displayName}" has been reset.`);
        await loadScenarios();
        return true;
    } catch (error) {
        console.error('Reset scenario state error:', error);
        NotificationManager.error(`Scenario reset failed: ${error.message}`);
        setScenariosLoading(false);
        return false;
    }
}

window.renderScenarios = () => {
    const listEl = document.getElementById(SELECTORS.LISTS.SCENARIOS);
    const emptyEl = document.getElementById('scenarios-empty');
    const countEl = document.getElementById('scenarios-count');
    const selectEl = document.getElementById('scenario-select');
    const stateOptionsEl = document.getElementById('scenario-state-options');

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
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    const previousSelection = selectEl?.value || '';
    if (selectEl) {
        const options = ['<option value="">Select Scenario</option>']
            .concat(normalizedScenarios.map((scenario) => {
                const scenarioIdentifier = resolveScenarioIdentifierValue(scenario);
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
                selectEl.value = resolveScenarioIdentifierValue(matchedScenario) || '';
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
    listEl.innerHTML = normalizedScenarios.map((scenario, index) => {
        const scenarioIdentifier = resolveScenarioIdentifierValue(scenario);
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
                🔄 Reset
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
                    const editButton = mappingId ? `
                        <div class="scenario-mapping-actions">
                            <button
                                class="btn btn-sm btn-secondary"
                                data-scenario-action="edit-mapping"
                                data-mapping-id="${mappingIdAttr}"
                            >
                                📝 Edit mapping
                            </button>
                        </div>
                    ` : '';

                    return `
                        <li class="scenario-mapping-item">
                            <div class="scenario-mapping-name">${mappingName}</div>
                            ${metaLabel}
                            ${transitions}
                            ${editButton}
                        </li>
                    `;
                }).join('')}
            </ul>
        ` : `
            <div class="scenario-mapping-empty">No stub mappings are bound to this scenario yet.</div>
        `;

        const toggleIcon = isExpanded ? '▾' : '▸';
        const toggleAriaLabel = `${isExpanded ? 'Collapse' : 'Expand'} scenario ${displayLabel}`;

        return `
            <div class="scenario-item ${isExpanded ? 'expanded' : 'collapsed'}" data-scenario="${scenarioIdentifierAttr}" data-scenario-key="${scenarioKeyAttr}">
                <div class="scenario-summary">
                    <button
                        type="button"
                        class="scenario-toggle-btn"
                        data-scenario-action="toggle"
                        data-scenario-key="${scenarioKeyAttr}"
                        aria-expanded="${isExpanded ? 'true' : 'false'}"
                        aria-label="${escapeHtml(toggleAriaLabel)}"
                    >
                        <span class="scenario-toggle-icon">${toggleIcon}</span>
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
            const button = event.target.closest('button[data-scenario-action]');
            if (!button) return;

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
            }
        });
        scenarioListHandlerAttached = true;
    }
};
