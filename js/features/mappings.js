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
                        <div class="url-line">
                            <span class="status-badge ${Utils.getStatusClass(status)}">${status}</span>
                            <span class="url-text">${Utils.escapeHtml(url)}</span>
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
        if (!items || Object.keys(items).length === 0) return '';
        const content = Object.entries(items)
            .map(([k, v]) => {
                if (v === null || v === undefined) return '';
                const val = (typeof v === 'object') ? JSON.stringify(v, null, 2) : Utils.escapeHtml(v);
                return `<div class="preview-value"><strong>${k}:</strong> <pre>${val}</pre></div>`;
            })
            .join('');
        
        return content ? `<div class="preview-section"><h4>${title}</h4>${content}</div>` : '';
    },

    setCardState(type, id, cls, active) {
        const el = document.querySelector(`.${type}-card[data-id="${id}"]`);
        if (el) el.classList.toggle(cls, !!active);
    }
};

window.sortMappings = (mappings) => {
    return [...mappings].sort((a, b) => {
        const pA = a.priority || 1, pB = b.priority || 1;
        if (pA !== pB) return pA - pB;
        return (a.request?.method || '').localeCompare(b.request?.method || '') ||
               (a.request?.url || '').localeCompare(b.request?.url || '');
    });
};

window.fetchAndRenderMappings = async (data = null, options = {}) => {
    const container = document.getElementById(SELECTORS.LISTS.MAPPINGS);
    if (!container) return false;

    try {
        if (data === null) {
            try {
                const res = await apiFetch(ENDPOINTS.MAPPINGS + (options.useCache ? '?cache=true' : ''));
                data = res.mappings || [];
            } catch (error) {
                if (window.DemoData?.isAvailable?.()) {
                    if (window.markDemoModeActive) window.markDemoModeActive('mappings-fallback');
                    data = window.DemoData.getMappingsPayload().mappings || [];
                } else { throw error; }
            }
        }

        // Apply optimistic updates from queue
        if (window.cacheManager?.optimisticQueue?.length > 0) {
            const queue = window.cacheManager.optimisticQueue;
            data = data.map(m => {
                const opt = queue.find(x => x.id === (m.id || m.uuid));
                return opt ? (opt.op === 'delete' ? null : opt.payload) : m;
            }).filter(Boolean);
            
            queue.forEach(opt => {
                if (opt.op !== 'delete' && !data.some(m => (m.id || m.uuid) === opt.id)) {
                    data.unshift(opt.payload);
                }
            });
        }

        window.originalMappings = data;
        window.allMappings = data;
        
        window.renderList(container, window.sortMappings(data), {
            renderItem: window.renderMappingCard,
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
    const id = mapping.id || mapping.uuid;
    const isExpanded = window.mappingPreviewState.has(id);
    
    const actions = [
        { class: 'secondary', handler: 'duplicateMapping', icon: 'clipboard' },
        { class: 'primary', handler: 'openEditModal', icon: 'pencil' },
        { class: 'danger', handler: 'deleteMapping', icon: 'trash' }
    ];

    const data = {
        id,
        method: mapping.request?.method || 'GET',
        url: mapping.request?.url || mapping.request?.urlPath || mapping.request?.urlPattern || 'N/A',
        status: mapping.response?.status || 200,
        name: mapping.name || `Mapping ${id.substring(0, 8)}`,
        expanded: isExpanded,
        extras: {
            preview: isExpanded ? (
                window.UIComponents.createPreviewSection('Request', {
                    'Method': mapping.request?.method,
                    'URL': mapping.request?.url || mapping.request?.urlPattern,
                    'Headers': mapping.request?.headers,
                    'Body': mapping.request?.body || mapping.request?.bodyPatterns
                }) + 
                window.UIComponents.createPreviewSection('Response', {
                    'Status': mapping.response?.status,
                    'Body': mapping.response?.jsonBody || mapping.response?.body,
                    'Headers': mapping.response?.headers
                })
            ) : ''
        }
    };

    return window.UIComponents.createCard('mapping', data, actions);
};

window.getMappingById = async (id) => {
    const cached = window.allMappings?.find(m => (m.id || m.uuid) === id);
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
    if (window.updateOptimisticCache) window.updateOptimisticCache(mapping, 'update');
};
