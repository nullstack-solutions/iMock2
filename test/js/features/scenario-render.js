'use strict';

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
        bulkWrap.classList.toggle('is-hidden', selectionCount === 0);
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
            bulkExportBtn.addEventListener('click', () => {
                void bulkExportSelectedMappings();
            });
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
        const isExpanded = scenarioExpansionState[scenarioKey] === true;
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

        const toggleIcon = `<span class="collapse-arrow" aria-hidden="true">${isExpanded ? '▼' : '▶'}</span>`;
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

                const currentlyExpanded = scenarioExpansionState[scenarioKeyValue] === true;
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

