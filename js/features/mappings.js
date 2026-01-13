'use strict';

function isOptimisticShadowMap(value) {
    return value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Map]';
}

if (!(window.mappingPreviewState instanceof Set)) window.mappingPreviewState = new Set();
if (!isOptimisticShadowMap(window.optimisticShadowMappings)) window.optimisticShadowMappings = new Map();

window.UIComponents = {
    createCard(type, data, actions = []) {
        const { id, method, url, status, name, expanded = false, extras = {} } = data;
        const handlerToAction = {
            'editMapping': 'edit-external',
            'openEditModal': 'edit-mapping',
            'deleteMapping': 'delete-mapping',
            'duplicateMapping': 'duplicate-mapping'
        };

        return `
            <div class="${type}-card${expanded ? ' is-expanded' : ''}" data-id="${Utils.escapeHtml(id)}">
                <div class="${type}-header" data-action="toggle-details">
                    <div class="${type}-info">
                        <div class="${type}-top-line">
                            <span class="method-badge ${method.toLowerCase()}">
                                <span class="collapse-arrow">${expanded ? '▼' : '▶'}</span> ${method}
                            </span>
                            ${name ? `<span class="${type}-name">${Utils.escapeHtml(name)}</span>` : ''}
                        </div>
                        <div class="${type}-url-line">
                            <span class="status-badge ${Utils.getStatusClass(status)}">${status}</span>
                            <span class="${type}-url">${Utils.escapeHtml(url)}</span>
                            ${extras.badges || ''}
                        </div>
                    </div>
                    <div class="${type}-actions">
                        ${actions.map(a => `
                            <button class="btn btn-sm btn-${a.class}" data-action="${handlerToAction[a.handler] || a.handler}" data-mapping-id="${Utils.escapeHtml(id)}">
                                ${a.icon ? Icons.render(a.icon) : ''}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div class="${type}-preview" id="preview-${Utils.escapeHtml(id)}" style="display: ${expanded ? 'block' : 'none'};">
                    ${extras.preview || ''}
                </div>
            </div>`;
    },

    createPreviewSection(title, items) {
        return `
        <div class="preview-section">
            <h4>${title}</h4>
            ${Object.entries(items).map(([k, v]) => v ? `<div class="preview-value"><strong>${k}:</strong> <pre>${typeof v === 'object' ? JSON.stringify(v, null, 2) : Utils.escapeHtml(v)}</pre></div>` : '').join('')}
        </div>`;
    },

    setCardState(type, id, cls, active) {
        const el = document.querySelector(`.${type}-card[data-id="${id}"]`);
        if (el) el.classList.toggle(cls, !!active);
    }
};

window.sortMappings = (mappings) => {
    return [...mappings].sort((a, b) => (a.priority || 1) - (b.priority || 1) || (a.request?.method || '').localeCompare(b.request?.method || ''));
};

window.fetchAndRenderMappings = async (data = null, options = {}) => {
    const container = document.getElementById(SELECTORS.LISTS.MAPPINGS);
    if (!container) return false;

    try {
        if (data === null) {
            try {
                const res = await fetchMappingsFromServer({ force: true });
                data = res.mappings || [];
            } catch (error) {
                if (window.DemoData?.isAvailable?.()) {
                    if (window.markDemoModeActive) window.markDemoModeActive('mappings-fallback');
                    data = window.DemoData.getMappingsPayload().mappings || [];
                } else { throw error; }
            }
        }

        window.originalMappings = data;
        window.allMappings = data;
        
        window.renderList(container, window.sortMappings(data), {
            renderItem: window.renderMappingMarkup,
            getKey: window.getMappingRenderKey,
            getSignature: window.getMappingRenderSignature
        });

        if (typeof updateMappingsCounter === 'function') updateMappingsCounter();
        return true;
    } catch (e) {
        console.error('Fetch mappings failed', e);
        return false;
    }
};

window.renderMappingCard = (mapping) => {
    if (!mapping || !mapping.id) return '';
    const normalizedId = String(mapping.id || mapping.uuid || '');
    const isExpanded = window.mappingPreviewState.has(normalizedId);
    
    const actions = [
        { class: 'secondary', handler: 'duplicateMapping', icon: 'clipboard' },
        { class: 'primary', handler: 'openEditModal', icon: 'pencil' },
        { class: 'danger', handler: 'deleteMapping', icon: 'trash' }
    ];

    const data = {
        id: mapping.id,
        method: mapping.request?.method || 'GET',
        url: mapping.request?.url || 'N/A',
        status: mapping.response?.status || 200,
        name: mapping.name || `Mapping ${mapping.id.substring(0, 8)}`,
        expanded: isExpanded,
        extras: {
            preview: isExpanded ? UIComponents.createPreviewSection('Request', mapping.request) : ''
        }
    };

    return UIComponents.createCard('mapping', data, actions);
};

window.getMappingById = async (id) => {
    const cached = window.allMappings?.find(m => m.id === id);
    if (cached) return cached;
    return await apiFetch(`/mappings/${id}`);
};

window.openEditModal = async (id) => {
    try {
        const data = await window.getMappingById(id);
        if (window.populateEditMappingForm) window.populateEditMappingForm(data);
        window.showModal('edit-mapping-modal');
    } catch (e) { NotificationManager.error('Load failed'); }
};

window.deleteMapping = async (id) => {
    if (!confirm('Delete mapping?')) return;
    try {
        await apiFetch(`/mappings/${id}`, { method: 'DELETE' });
        if (window.updateOptimisticCache) window.updateOptimisticCache({ id }, 'delete');
        NotificationManager.success('Deleted');
    } catch (e) { NotificationManager.error('Delete failed'); }
};

window.applyOptimisticMappingUpdate = (mapping) => {
    if (!mapping || !window.updateOptimisticCache) return;
    const id = mapping.id || mapping.uuid;
    if (!id) return;
    
    const op = window.cacheManager?.cache?.has(id) === true ? 'update' : 'create';
    
    // Remember optimistic shadow for survival across refreshes
    if (!window.optimisticShadowMappings) window.optimisticShadowMappings = new Map();
    window.optimisticShadowMappings.set(String(id), { ts: Date.now(), op, mapping });
    
    window.updateOptimisticCache(mapping, op, { queueMode: 'add' });
};

window.backgroundRefreshMappings = async (useCache = false) => {
    try {
        const res = await fetchMappingsFromServer({ force: !useCache });
        let mappings = res.mappings || [];
        
        // Filter out pending deletions
        if (window.pendingDeletedIds && window.pendingDeletedIds.size > 0) {
            mappings = mappings.filter(m => {
                const id = m.id || m.uuid;
                return !window.pendingDeletedIds.has(id);
            });
        }
        
        // Apply optimistic shadows: overlay optimistic mappings onto server data
        if (window.optimisticShadowMappings && window.optimisticShadowMappings.size > 0) {
            // Use Map for O(1) lookups
            const serverMap = new Map(mappings.map(m => [m.id || m.uuid, m]));
            const result = [...mappings]; // Start with all server mappings
            
            window.optimisticShadowMappings.forEach((shadow, id) => {
                if (!serverMap.has(id)) {
                    // Optimistic mapping not yet on server - keep it
                    result.push(shadow.mapping);
                } else {
                    // Mapping now on server - merge optimistic changes, then remove from shadow
                    const idx = result.findIndex(m => (m.id || m.uuid) === id);
                    if (idx !== -1 && shadow && shadow.mapping) {
                        // Shallow-merge: server mapping first, then optimistic fields override
                        result[idx] = Object.assign({}, result[idx], shadow.mapping);
                    }
                    window.optimisticShadowMappings.delete(id);
                }
            });
            
            mappings = result;
        }
        
        window.originalMappings = mappings;
        window.allMappings = mappings;
        if (window.refreshMappingTabSnapshot) window.refreshMappingTabSnapshot();
        if (window.syncCacheWithMappings) window.syncCacheWithMappings(mappings);
        if (window.rebuildMappingIndex) window.rebuildMappingIndex(mappings);
        if (window.fetchAndRenderMappings) window.fetchAndRenderMappings(mappings);
    } catch (e) {
        console.warn('Background refresh failed:', e);
    }
};