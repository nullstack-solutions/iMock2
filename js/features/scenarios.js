'use strict';

(function(global) {
    const window = global;

    // --- STATE MANAGEMENT ---
    window.allScenarios = Array.isArray(window.allScenarios) ? window.allScenarios : [];
    window.scenarioExpansionState = window.scenarioExpansionState || {};
    
    let scenarioListHandlerAttached = false;

    // --- HELPER FUNCTIONS ---

    function safeDecode(value) {
        if (typeof value !== 'string') return '';
        const trimmed = value.trim();
        if (!trimmed) return '';
        if (!/%[0-9a-fA-F]{2}/.test(trimmed)) return trimmed;
        try { return decodeURIComponent(trimmed); } 
        catch (e) { console.warn('safeDecode failed', e); return trimmed; }
    }

    function normalizeScenarioLink(link) {
        if (typeof link !== 'string' || !link.trim()) return '';
        let value = link.trim();
        
        if (/^https?:\/\//i.test(value)) {
            try { value = new URL(value).pathname; } catch (e) {}
        }

        const adminPrefix = '/__admin';
        if (value.startsWith(adminPrefix)) {
            value = value.slice(adminPrefix.length) || '/';
        }
        return `/${value.replace(/^\/+/, '')}`;
    }

    function normalizeScenario(scenario, index) {
        if (!scenario || typeof scenario !== 'object') return null;

        const rawId = String(scenario.id || '');
        const rawName = String(scenario.name || '');
        const decodedId = safeDecode(rawId);
        const decodedName = safeDecode(rawName);

        const identifier = decodedId || decodedName || rawId || rawName || '';
        const displayName = decodedName || decodedId || rawName || rawId || `Scenario ${index + 1}`;

        const possibleStates = Array.isArray(scenario.possibleStates)
            ? scenario.possibleStates.map(s => safeDecode(s) || s).filter(Boolean)
            : [];

        const mappings = Array.isArray(scenario.mappings)
            ? scenario.mappings.map(m => ({
                ...m,
                requiredScenarioState: safeDecode(m.requiredScenarioState) || m.requiredScenarioState || '',
                newScenarioState: safeDecode(m.newScenarioState) || m.newScenarioState || ''
            }))
            : [];

        const resolveLink = (prop) => normalizeScenarioLink(
            scenario[prop] || scenario._links?.[prop === 'stateEndpoint' ? 'update-state' : 'reset-state']?.href ||
            scenario._links?.[prop === 'stateEndpoint' ? 'updateState' : 'resetState']?.href ||
            scenario._links?.[prop === 'stateEndpoint' ? 'state' : 'reset']?.href
        );

        return {
            ...scenario,
            id: identifier,
            name: displayName,
            displayName,
            identifier,
            state: safeDecode(scenario.state) || scenario.state || 'Started',
            possibleStates,
            mappings,
            stateEndpoint: resolveLink('stateEndpoint'),
            resetEndpoint: resolveLink('resetEndpoint'),
            // Keep original refs for matching
            _rawId: rawId,
            _rawName: rawName
        };
    }

    function getScenarioByIdentifier(identifier) {
        if (!identifier || typeof identifier !== 'string') return null;
        const target = identifier.trim();
        if (!target) return null;

        return window.allScenarios.find(s => 
            s.identifier === target || s.id === target || s.name === target || 
            s._rawId === target || s._rawName === target
        ) || null;
    }

    function setScenariosLoading(isLoading) {
        Utils.toggleElement(document.getElementById('scenarios-loading'), isLoading);
        const list = document.getElementById(SELECTORS.LISTS.SCENARIOS);
        if (list && isLoading) list.style.display = 'none';
    }

    // --- UI COMPONENTS ---

    const ScenarioUI = {
        renderStatePills(scenario, canTarget) {
            const states = new Set(['Started']);
            if (scenario.state) states.add(scenario.state);
            (scenario.possibleStates || []).forEach(s => states.add(s));

            const scenarioId = Utils.escapeHtml(scenario.identifier);
            
            const pills = Array.from(states).map(state => {
                const isCurrent = state === scenario.state;
                const stateEsc = Utils.escapeHtml(state);
                
                if (isCurrent) {
                    return `<span class="scenario-state-pill is-active" data-current="true">${stateEsc}</span>`;
                }
                if (!canTarget) {
                    return `<span class="scenario-state-pill">${stateEsc}</span>`;
                }
                return `<button type="button" class="scenario-state-pill" 
                    data-scenario-action="transition" data-scenario="${scenarioId}" data-state="${stateEsc}">
                    ${stateEsc}</button>`;
            }).join('');

            const resetButton = canTarget ? 
                `<button type="button" class="scenario-reset-btn" data-scenario-action="reset" data-scenario="${scenarioId}">🔄 Reset</button>` : '';

            return (pills || resetButton) ? 
                `<div class="scenario-summary-controls"><div class="scenario-state-pill-list">${pills}</div>${resetButton}</div>` : '';
        },

        renderMappingList(mappings) {
            if (!mappings.length) {
                return '<div class="scenario-mapping-empty">No stub mappings are bound to this scenario yet.</div>';
            }

            return `<ul class="scenario-mapping-list">${mappings.map(m => {
                const id = m.id || m.uuid || m.stubMappingId || '';
                const name = Utils.escapeHtml(m.name || id || 'Unnamed mapping');
                const method = Utils.escapeHtml(m.request?.method || m.method || '');
                const url = Utils.escapeHtml(m.request?.urlPattern || m.request?.urlPath || m.request?.url || '');
                
                const reqState = Utils.escapeHtml(m.requiredScenarioState || '');
                const newState = Utils.escapeHtml(m.newScenarioState || '');

                const meta = (method || url) ? 
                    `<div class="scenario-mapping-meta">${[method && `<span class="scenario-mapping-method">${method}</span>`, url && `<span class="scenario-mapping-url">${url}</span>`].filter(Boolean).join(' · ')}</div>` : '';

                const transitions = (reqState || newState) ? 
                    `<div class="scenario-mapping-states">
                        ${reqState ? `<span class="badge badge-warning">Requires: ${reqState}</span>` : ''}
                        ${newState ? `<span class="badge badge-info">→ ${newState}</span>` : ''}
                    </div>` : '';

                const editBtn = id ? 
                    `<div class="scenario-mapping-actions">
                        <button class="btn btn-sm btn-secondary" data-scenario-action="edit-mapping" data-mapping-id="${Utils.escapeHtml(id)}">📝 Edit mapping</button>
                    </div>` : '';

                return `<li class="scenario-mapping-item">
                    <div class="scenario-mapping-name">${name}</div>${meta}${transitions}${editBtn}
                </li>`;
            }).join('')}</ul>`;
        },

        renderItem(scenario, index) {
            const key = scenario.identifier || `scenario-${index}`;
            // Ensure expansion state exists
            if (window.scenarioExpansionState[key] === undefined) window.scenarioExpansionState[key] = true;
            
            const isExpanded = window.scenarioExpansionState[key];
            const canTarget = !!scenario.identifier;
            const nameEsc = Utils.escapeHtml(scenario.displayName);
            const stateEsc = Utils.escapeHtml(scenario.state || 'Started');
            const keyEsc = Utils.escapeHtml(key);

            return `
                <div class="scenario-item ${isExpanded ? 'expanded' : 'collapsed'}" data-scenario-key="${keyEsc}">
                    <div class="scenario-summary">
                        <button type="button" class="scenario-toggle-btn" data-scenario-action="toggle" data-scenario-key="${keyEsc}"
                                aria-expanded="${isExpanded}" aria-label="${isExpanded ? 'Collapse' : 'Expand'} scenario">
                            <span class="scenario-toggle-icon">${isExpanded ? '▾' : '▸'}</span>
                        </button>
                        <div class="scenario-summary-main">
                            <div class="scenario-summary-header">
                                <div class="scenario-name">${nameEsc}</div>
                                <div class="scenario-state">State: ${stateEsc}</div>
                            </div>
                            ${this.renderStatePills(scenario, canTarget)}
                        </div>
                    </div>
                    <div class="scenario-body">
                        ${scenario.description ? `<div class="scenario-info"><div class="scenario-description">${Utils.escapeHtml(scenario.description)}</div></div>` : ''}
                        <div class="scenario-mappings">
                            <div class="scenario-section-title">Stub mappings</div>
                            ${this.renderMappingList(scenario.mappings)}
                        </div>
                    </div>
                </div>
            `;
        }
    };

    // --- PUBLIC FUNCTIONS ---

    window.loadScenarios = async function() {
        Utils.hideElement(document.getElementById('scenarios-empty'));
        setScenariosLoading(true);

        try {
            const data = await apiFetch(ENDPOINTS.SCENARIOS);
            const list = Array.isArray(data?.scenarios) ? data.scenarios : [];
            window.allScenarios = list.map((s, i) => normalizeScenario(s, i)).filter(Boolean);
        } catch (e) {
            window.allScenarios = [];
            console.error('Load scenarios error:', e);
            if (window.NotificationManager) NotificationManager.error(`Failed to load scenarios: ${e.message}`);
        } finally {
            setScenariosLoading(false);
            window.renderScenarios();
        }
    };

    window.refreshScenarios = async function() {
        if (window.TabManager) await window.TabManager.refresh('scenarios');
    };

    window.resetAllScenarios = async function() {
        if (!confirm('Reset all scenarios to the initial state?')) return;
        setScenariosLoading(true);
        try {
            await apiFetch(ENDPOINTS.SCENARIOS_RESET, { method: 'POST' });
            if (window.NotificationManager) NotificationManager.success('All scenarios have been reset!');
            await window.loadScenarios();
        } catch (e) {
            if (window.NotificationManager) NotificationManager.error(`Scenario reset failed: ${e.message}`);
            setScenariosLoading(false);
        }
    };

    window.setScenarioState = async function(identifier, newState) {
        const scenario = getScenarioByIdentifier(identifier);
        const state = typeof newState === 'string' ? newState.trim() : '';

        if (!scenario || !state) {
            if (window.NotificationManager) NotificationManager.warning('Please select scenario and enter state');
            return false;
        }

        const endpoint = scenario.stateEndpoint || (window.buildScenarioStateEndpoint ? window.buildScenarioStateEndpoint(scenario.identifier) : '');
        if (!endpoint) {
            if (window.NotificationManager) NotificationManager.error('Unable to determine scenario endpoint');
            return false;
        }

        setScenariosLoading(true);
        try {
            await apiFetch(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state })
            });
            if (window.NotificationManager) NotificationManager.success(`Scenario "${scenario.displayName}" switched to "${state}"`);
            await window.loadScenarios();
            return true;
        } catch (e) {
            if (window.NotificationManager) NotificationManager.error(`State change failed: ${e.message}`);
            setScenariosLoading(false);
            return false;
        }
    };

    window.resetScenarioState = async function(identifier) {
        const scenario = getScenarioByIdentifier(identifier);
        if (!scenario) return false;

        const endpoint = scenario.resetEndpoint || scenario.stateEndpoint || '';
        if (!endpoint) return false;

        setScenariosLoading(true);
        try {
            await apiFetch(endpoint, { method: scenario.resetEndpoint ? 'POST' : 'PUT' });
            if (window.NotificationManager) NotificationManager.success(`Scenario "${scenario.displayName}" reset`);
            await window.loadScenarios();
            return true;
        } catch (e) {
            if (window.NotificationManager) NotificationManager.error(`Reset failed: ${e.message}`);
            setScenariosLoading(false);
            return false;
        }
    };

    window.renderScenarios = function() {
        const list = document.getElementById(SELECTORS.LISTS.SCENARIOS);
        if (!list) return;

        const countEl = document.getElementById('scenarios-count');
        if (countEl) countEl.textContent = window.allScenarios.length;

        if (!window.allScenarios.length) {
            list.style.display = 'none';
            Utils.showElement(document.getElementById('scenarios-empty'));
            return;
        }

        Utils.hideElement(document.getElementById('scenarios-empty'));
        list.style.display = '';
        list.innerHTML = window.allScenarios.map((s, i) => ScenarioUI.renderItem(s, i)).join('');

        if (!scenarioListHandlerAttached) {
            list.addEventListener('click', handleScenarioClick);
            scenarioListHandlerAttached = true;
        }
    };

    async function handleScenarioClick(e) {
        const btn = e.target.closest('button[data-scenario-action]');
        if (!btn) return;

        const action = btn.dataset.scenarioAction;
        const id = btn.dataset.scenario;

        if (action === 'toggle') {
            const key = btn.dataset.scenarioKey;
            window.scenarioExpansionState[key] = !window.scenarioExpansionState[key];
            window.renderScenarios();
        } else if (action === 'transition') {
            const state = btn.dataset.state;
            btn.disabled = true;
            await window.setScenarioState(id, state);
            btn.disabled = false;
        } else if (action === 'reset') {
            btn.disabled = true;
            await window.resetScenarioState(id);
            btn.disabled = false;
        } else if (action === 'edit-mapping') {
            if (window.openEditModal) window.openEditModal(btn.dataset.mappingId);
        }
    }

})(typeof window !== 'undefined' ? window : globalThis);