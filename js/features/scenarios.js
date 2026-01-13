'use strict';

window.allScenarios = window.allScenarios || [];
window.scenarioExpansionState = window.scenarioExpansionState || {};

function safeDecode(val) {
    if (typeof val !== 'string' || !val.trim()) return '';
    try { return decodeURIComponent(val); } catch (e) { return val; }
}

function normalizeScenario(s, i) {
    if (!s) return null;
    const identifier = String(s.id || s.name || '');
    return {
        ...s,
        id: identifier,
        identifier,
        name: s.name || `Scenario ${i + 1}`,
        displayName: s.name || `Scenario ${i + 1}`,
        state: safeDecode(s.state) || s.state || 'Started',
        possibleStates: (s.possibleStates || []).map(safeDecode),
        mappings: (s.mappings || []).map(m => ({
            ...m,
            requiredScenarioState: safeDecode(m.requiredScenarioState),
            newScenarioState: safeDecode(m.newScenarioState)
        }))
    };
}

window.ScenarioUI = {
    renderItem(s, i) {
        const id = s.id;
        const isExpanded = window.scenarioExpansionState[id] !== false;
        return `
            <div class="scenario-item ${isExpanded ? 'expanded' : 'collapsed'}">
                <div class="scenario-summary">
                    <button class="scenario-toggle-btn" onclick="window.toggleScenario('${id}')">
                        ${isExpanded ? '▼' : '▶'}
                    </button>
                    <div class="scenario-name">${Utils.escapeHtml(s.name)}</div>
                    <div class="scenario-state">${Utils.escapeHtml(s.state)}</div>
                </div>
                <div class="scenario-body" style="display: ${isExpanded ? 'block' : 'none'}">
                    <p>${s.description || ''}</p>
                </div>
            </div>`;
    }
};

window.loadScenarios = async () => {
    try {
        const data = await apiFetch(ENDPOINTS.SCENARIOS);
        window.allScenarios = (data.scenarios || []).map(normalizeScenario);
        window.renderScenarios();
    } catch (e) { NotificationManager.error('Load scenarios failed'); }
};

window.renderScenarios = () => {
    const container = document.getElementById(SELECTORS.LISTS.SCENARIOS);
    if (!container) return;
    container.innerHTML = window.allScenarios.map((s, i) => window.ScenarioUI.renderItem(s, i)).join('');
};

window.toggleScenario = (id) => {
    window.scenarioExpansionState[id] = !window.scenarioExpansionState[id];
    window.renderScenarios();
};

window.setScenarioState = async (id, state) => {
    try {
        await apiFetch(`${ENDPOINTS.SCENARIOS}/${encodeURIComponent(id)}/state`, {
            method: 'PUT',
            body: JSON.stringify({ state })
        });
        NotificationManager.success('State updated');
        await window.loadScenarios();
    } catch (e) { NotificationManager.error('Update failed'); }
};

window.resetScenarioState = async (id) => {
    try {
        await apiFetch(`${ENDPOINTS.SCENARIOS}/${encodeURIComponent(id)}/state`, { method: 'DELETE' });
        NotificationManager.success('Reset');
        await window.loadScenarios();
    } catch (e) { NotificationManager.error('Reset failed'); }
};

window.refreshScenarios = async () => {
    if (window.TabManager) await window.TabManager.refresh('scenarios');
};

window.resetAllScenarios = async () => {
    if (!confirm('Reset all scenarios?')) return;
    try {
        await apiFetch(ENDPOINTS.SCENARIOS_RESET, { method: 'POST' });
        NotificationManager.success('All scenarios have been reset!');
        await window.loadScenarios();
    } catch (e) { NotificationManager.error('Reset failed'); }
};
