'use strict';

// --- SCENARIOS ---

if (!Array.isArray(window.allScenarios)) {
    window.allScenarios = [];
        window.allScenarios = allScenarios;
}
let allScenarios = window.allScenarios;

let scenarioListHandlerAttached = false;

function getScenarioByIdentifier(identifier) {
    if (typeof identifier !== 'string') {
        return null;
    }

    const scenarios = Array.isArray(allScenarios) ? allScenarios : [];

    const directMatch = scenarios.find((scenario) =>
        (typeof scenario?.id === 'string' && scenario.id === identifier) ||
        (typeof scenario?.name === 'string' && scenario.name === identifier)
    );

    if (directMatch) {
        return directMatch;
    }

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
        return null;
    }

    return scenarios.find((scenario) => {
        const scenarioId = typeof scenario?.id === 'string' ? scenario.id.trim() : '';
        const scenarioName = typeof scenario?.name === 'string' ? scenario.name.trim() : '';
        return scenarioId === trimmedIdentifier || scenarioName === trimmedIdentifier;
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
        allScenarios = Array.isArray(data?.scenarios) ? data.scenarios : [];
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
    const endpointIdentifier = typeof targetScenario?.id === 'string'
        ? targetScenario.id
        : (typeof targetScenario?.name === 'string' ? targetScenario.name : candidateIdentifier);
    const displayName = typeof targetScenario?.name === 'string'
        ? targetScenario.name
        : (typeof targetScenario?.id === 'string' ? targetScenario.id : candidateIdentifier);

    const resolvedState = inlineState || scenarioStateInput?.value?.trim() || '';

    if (!endpointIdentifier || !endpointIdentifier.trim() || !resolvedState) {
        NotificationManager.warning('Please select scenario and enter state');
        return false;
    }

    const stateEndpointBuilder = typeof window.buildScenarioStateEndpoint === 'function'
        ? window.buildScenarioStateEndpoint
        : (name) => `${ENDPOINTS.SCENARIOS}/${encodeURIComponent(name)}/state`;
    const stateEndpoint = stateEndpointBuilder(endpointIdentifier);

    if (!stateEndpoint) {
        NotificationManager.error('Unable to determine the scenario state endpoint.');
        return false;
    }

    if (targetScenario && Array.isArray(targetScenario.possibleStates) && targetScenario.possibleStates.length === 0) {
        NotificationManager.warning(`Scenario "${displayName}" does not expose any states to switch to.`);
        return false;
    }

    if (scenarioSelect) {
        const selectValue = typeof targetScenario?.id === 'string'
            ? targetScenario.id
            : (typeof targetScenario?.name === 'string' ? targetScenario.name : endpointIdentifier);
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
            .concat(normalizedScenarios.map(scenario => {
                const scenarioIdentifier = typeof scenario?.id === 'string'
                    ? scenario.id
                    : (typeof scenario?.name === 'string' ? scenario.name : '');
                const scenarioLabel = typeof scenario?.name === 'string'
                    ? scenario.name
                    : (typeof scenario?.id === 'string' ? scenario.id : 'Unnamed scenario');
                return `
                <option value="${escapeHtml(scenarioIdentifier)}">${escapeHtml(scenarioLabel)}</option>
            `;
            }));
        selectEl.innerHTML = options.join('');
        if (previousSelection) {
            const matchedScenario = getScenarioByIdentifier(previousSelection);
            if (matchedScenario) {
                selectEl.value = matchedScenario.id || matchedScenario.name || '';
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
    listEl.innerHTML = normalizedScenarios.map((scenario) => {
        const scenarioIdentifier = typeof scenario?.id === 'string'
            ? scenario.id
            : (typeof scenario?.name === 'string' ? scenario.name : '');
        const scenarioIdentifierAttr = escapeHtml(scenarioIdentifier);
        const displayLabel = typeof scenario?.name === 'string'
            ? scenario.name
            : (typeof scenario?.id === 'string' ? scenario.id : 'Unnamed scenario');
        const displayedName = escapeHtml(displayLabel);
        const displayedState = escapeHtml(scenario.state || 'Started');
        const possibleStates = Array.isArray(scenario.possibleStates) ? scenario.possibleStates.filter(Boolean) : [];

        const actionButtons = possibleStates.map((state) => {
            if (!state || state === scenario.state) return '';
            const stateAttr = escapeHtml(state);
            const displayedPossibleState = escapeHtml(state);
            return `
                <button
                    class="btn btn-sm btn-secondary"
                    data-scenario-action="transition"
                    data-scenario="${scenarioIdentifierAttr}"
                    data-state="${stateAttr}"
                >
                    → ${displayedPossibleState}
                </button>
            `;
        }).join('');

        const possibleStatesMarkup = possibleStates.length ? `
            <div class="scenario-possible-states">
                <div class="scenario-section-title">Possible states</div>
                <div class="scenario-state-badges">
                    ${possibleStates.map((state) => {
                        const isCurrent = state === scenario.state;
                        const badgeClass = isCurrent ? 'badge badge-success' : 'badge badge-secondary';
                        return `<span class="${badgeClass}">${escapeHtml(state)}</span>`;
                    }).join('')}
                </div>
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

        return `
            <div class="scenario-item">
                <div class="scenario-header">
                    <div class="scenario-name">${displayedName}</div>
                    <div class="scenario-state">${displayedState}</div>
                </div>
                ${descriptionMarkup}
                ${possibleStatesMarkup}
                <div class="scenario-mappings">
                    <div class="scenario-section-title">Stub mappings</div>
                    ${mappingListMarkup}
                </div>
                <div class="scenario-actions">
                    ${actionButtons}
                    <button
                        class="btn btn-sm btn-danger"
                        data-scenario-action="transition"
                        data-scenario="${scenarioIdentifierAttr}"
                        data-state="Started"
                    >
                        🔄 Reset
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (!scenarioListHandlerAttached) {
        listEl.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-scenario-action]');
            if (!button) return;

            const action = button.dataset.scenarioAction;

            if (action === 'transition') {
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

