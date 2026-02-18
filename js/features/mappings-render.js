'use strict';

const UIComponents = {
    // Base card component replacing renderMappingCard and renderRequestCard
    createCard: (type, data, actions = []) => {
        const { id, method, url, status, name, time, extras = {}, expanded = false } = data;

        // Map handler names to data-action attributes
        const handlerToAction = {
            'editMapping': 'edit-external',
            'openEditModal': 'edit-mapping',
            'deleteMapping': 'delete-mapping',
            'duplicateMapping': 'duplicate-mapping',
            'viewRequestDetails': 'view-request'
        };

        return `
            <div class="${type}-card${expanded ? ' is-expanded' : ''}" data-id="${Utils.escapeHtml(id)}">
                <div class="${type}-header" data-action="toggle-details">
                    <div class="${type}-info">
                        <div class="${type}-top-line">
                            <span class="method-badge ${method.toLowerCase()}">
                                <span class="collapse-arrow" id="arrow-${Utils.escapeHtml(id)}">${expanded ? '▼' : '▶'}</span> ${method}
                            </span>
                            ${name ? `<span class="${type}-name">${Utils.escapeHtml(name)}</span>` : ''}
                            ${time ? `<span class="${type}-time">${time}</span>` : ''}
                        </div>
                        <div class="${type}-url-line">
                            <span class="status-badge ${Utils.getStatusClass(status)}">${status}</span>
                            <span class="${type}-url">${Utils.escapeHtml(url)}</span>
                            ${extras.badges || ''}
                        </div>
                    </div>
                    <div class="${type}-actions">
                        ${actions.map(action => {
                            const dataAction = handlerToAction[action.handler] || action.handler;
                            return `
                            <button class="btn btn-sm btn-${action.class}"
                                    data-action="${dataAction}"
                                    data-${type}-id="${Utils.escapeHtml(id)}"
                                    title="${Utils.escapeHtml(action.title)}">
                                ${action.icon ? Icons.render(action.icon, { className: 'action-icon' }) : ''}
                                <span class="sr-only">${Utils.escapeHtml(action.title)}</span>
                            </button>
                        `}).join('')}
                    </div>
                </div>
                <div class="${type}-preview" id="preview-${Utils.escapeHtml(id)}" style="display: ${expanded ? 'block' : 'none'};">
                    ${extras.preview || ''}
                </div>
            </div>`;
    },

    getCardElement(type, id) {
        const cards = document.querySelectorAll(`.${type}-card`);
        const targetId = String(id ?? '');
        for (const card of cards) {
            if ((card.dataset?.id || '') === targetId) {
                return card;
            }
        }
        return null;
    },

    setCardState(type, id, className, isActive = true) {
        const card = this.getCardElement(type, id);
        if (card) {
            card.classList.toggle(className, Boolean(isActive));
        }
    },

    clearCardState(type, className) {
        document.querySelectorAll(`.${type}-card.${className}`).forEach(card => {
            card.classList.remove(className);
        });
    },

    createPreviewSection: (title, items) => `
        <div class="preview-section">
            <h4>${title}</h4>
            ${Object.entries(items).map(([key, value]) => {
                if (!value) return '';
                
                if (typeof value === 'object') {
                    const jsonString = JSON.stringify(value);
                    // For large objects, show a summary and lazy load full content
                    if (jsonString.length > 500) {
                        const preview = Utils.formatJson(value, 'Invalid JSON', 200);
                        const fullId = `full-${Math.random().toString(36).substr(2, 9)}`;
                        return `<div class="preview-value">
                            <strong>${key}:</strong>
                            <pre>${preview}</pre>
                            <button class="btn btn-secondary btn-small" data-action="show-full-content" data-target-id="${fullId}" data-json="${Utils.escapeHtml(JSON.stringify(value))}" style="margin-top: 0.5rem; font-size: 0.8rem;">
                                Show Full Content
                            </button>
                            <div id="${fullId}" style="display: none;"></div>
                        </div>`;
                    } else {
                        return `<div class="preview-value"><strong>${key}:</strong><pre>${Utils.formatJson(value)}</pre></div>`;
                    }
                } else if (typeof value === 'string') {
                    const trimmed = value.trim();
                    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                        try {
                            const parsedJson = JSON.parse(trimmed);
                            const jsonString = JSON.stringify(parsedJson);
                            if (jsonString.length > 500) {
                                const preview = Utils.formatJson(parsedJson, 'Invalid JSON', 200);
                                const fullId = `full-${Math.random().toString(36).substr(2, 9)}`;
                                return `<div class="preview-value">
                                    <strong>${key}:</strong>
                                    <pre>${preview}</pre>
                                    <button class="btn btn-secondary btn-small" data-action="show-full-content" data-target-id="${fullId}" data-json="${Utils.escapeHtml(JSON.stringify(parsedJson))}" style="margin-top: 0.5rem; font-size: 0.8rem;">
                                        Show Full Content
                                    </button>
                                    <div id="${fullId}" style="display: none;"></div>
                                </div>`;
                            }
                            return `<div class="preview-value"><strong>${key}:</strong><pre>${Utils.formatJson(parsedJson)}</pre></div>`;
                        } catch {
                            // If JSON parsing fails, fall back to original string rendering
                        }
                    }

                    const escaped = Utils.escapeHtml(value);
                    const formatted = escaped.includes('\n') ? `<pre>${escaped}</pre>` : escaped;
                    return `<div class="preview-value"><strong>${key}:</strong> ${formatted}</div>`;
                    } else {
                    const safeValue = Utils.escapeHtml(String(value));
                    return `<div class="preview-value"><strong>${key}:</strong> ${safeValue}</div>`;
                }
            }).join('')}
        </div>`,
    
    toggleDetails: (id, type) => {
        const normalizedId = String(id ?? '');
        const preview = document.getElementById(`preview-${id}`);
        const arrow = document.getElementById(`arrow-${id}`);
        const willShow = preview ? preview.style.display === 'none' : false;

        if (preview) {
            preview.style.display = willShow ? 'block' : 'none';
        }

        if (arrow) {
            arrow.textContent = willShow ? '▼' : '▶';
        }

        if (type === 'mapping') {
            const card = preview ? preview.closest(`.${type}-card`) : null;
            if (card) {
                card.classList.toggle('is-expanded', willShow);
            }
            if (window.mappingPreviewState instanceof Set) {
                if (willShow) {
                    window.mappingPreviewState.add(normalizedId);
                } else {
                    window.mappingPreviewState.delete(normalizedId);
                }
            }
        }

        UIComponents.setCardState(type, id, 'is-expanded', willShow);
    },
    
    toggleFullContent: (elementId) => {
        const element = document.getElementById(elementId);
        const button = element.previousElementSibling;
        
        if (element.style.display === 'none') {
            // Show full content
            try {
                const jsonData = button.getAttribute('data-json');
                const parsedData = JSON.parse(jsonData);
                element.innerHTML = `<pre style="max-height: 300px; overflow-y: auto; background: var(--bg-tertiary); padding: 1rem; border-radius: var(--radius-sm); margin-top: 0.5rem;">${Utils.escapeHtml(JSON.stringify(parsedData, null, 2))}</pre>`;
                element.style.display = 'block';
                button.textContent = 'Hide Full Content';
            } catch (e) {
                element.innerHTML = `<div class="preview-value warning">Error parsing JSON: ${Utils.escapeHtml(e.message)}</div>`;
                element.style.display = 'block';
                button.textContent = 'Hide';
            }
        } else {
            // Hide full content
            element.style.display = 'none';
            button.textContent = 'Show Full Content';
        }
    }
};

// Make UIComponents functions globally accessible for HTML onclick handlers
window.toggleFullContent = UIComponents.toggleFullContent;
window.toggleDetails = UIComponents.toggleDetails;

// Compact mapping renderer through UIComponents with lazy preview loading
window.renderMappingCard = function(mapping) {
    if (!mapping || !mapping.id) {
        Logger.warn('CACHE', 'Invalid mapping data:', mapping);
        return '';
    }

    const actions = [
        { class: 'secondary', handler: 'duplicateMapping', title: 'Duplicate', icon: 'clipboard' },
        { class: 'secondary', handler: 'editMapping', title: 'Edit in Editor', icon: 'open-external' },
        { class: 'primary', handler: 'openEditModal', title: 'Edit', icon: 'pencil' },
        { class: 'danger', handler: 'deleteMapping', title: 'Delete', icon: 'trash' }
    ];

    const normalizedId = String(mapping.id || mapping.uuid || '');
    const isExpanded = window.mappingPreviewState instanceof Set && window.mappingPreviewState.has(normalizedId);

    const data = {
        id: mapping.id,
        method: mapping.request?.method || 'GET',
        url: mapping.request?.urlPath || mapping.request?.urlPathPattern || mapping.request?.urlPattern || mapping.request?.url || 'N/A',
        status: mapping.response?.status || 200,
        name: mapping.name || mapping.metadata?.name || `Mapping ${mapping.id.substring(0, 8)}`,
        expanded: isExpanded,
        extras: {
            // Lazy loading: Only generate preview HTML if card is already expanded (from state restoration)
            // Otherwise, event delegation will load it on first expand
            preview: isExpanded ? (
                UIComponents.createPreviewSection(`${Icons.render('request-in', { className: 'icon-inline' })} Request`, {
                    'Method': mapping.request?.method || 'GET',
                    'URL': mapping.request?.url || mapping.request?.urlPattern || mapping.request?.urlPath || mapping.request?.urlPathPattern,
                    'Headers': mapping.request?.headers,
                    'Body': mapping.request?.bodyPatterns || mapping.request?.body,
                    'Query Parameters': mapping.request?.queryParameters
                }) + UIComponents.createPreviewSection(`${Icons.render('response-out', { className: 'icon-inline' })} Response`, {
                    'Status': mapping.response?.status,
                    'Headers': mapping.response?.headers,
                    'Body': mapping.response?.jsonBody || mapping.response?.body,
                    'Delay': mapping.response?.fixedDelayMilliseconds ? `${mapping.response.fixedDelayMilliseconds}ms` : null
                }) + UIComponents.createPreviewSection(`${Icons.render('info', { className: 'icon-inline' })} Overview`, {
                    'ID': mapping.id || mapping.uuid,
                    'Name': mapping.name || mapping.metadata?.name,
                    'Priority': mapping.priority,
                    'Persistent': mapping.persistent,
                    'Scenario': mapping.scenarioName,
                    'Required State': mapping.requiredScenarioState,
                    'New State': mapping.newScenarioState,
                    'Created': (window.showMetaTimestamps !== false && mapping.metadata?.created) ? new Date(mapping.metadata.created).toLocaleString() : null,
                    'Edited': (window.showMetaTimestamps !== false && mapping.metadata?.edited) ? new Date(mapping.metadata.edited).toLocaleString() : null,
                    'Source': mapping.metadata?.source ? `Edited from ${mapping.metadata.source}` : null,
                })
            ) : '', // Empty preview for collapsed cards - will be lazy loaded
            badges: [
                (mapping.id || mapping.uuid) ? `<span class="badge badge-secondary" title="Mapping ID">${Utils.escapeHtml(((mapping.id || mapping.uuid).length > 12 ? (mapping.id || mapping.uuid).slice(0,8) + '…' + (mapping.id || mapping.uuid).slice(-4) : (mapping.id || mapping.uuid)))}</span>` : '',
                (typeof mapping.priority === 'number') ? `<span class="badge badge-secondary" title="Priority">P${mapping.priority}</span>` : '',
                (mapping.scenarioName) ? `<span class="badge badge-secondary" title="Scenario">${Utils.escapeHtml(mapping.scenarioName)}</span>` : '',
                (window.showMetaTimestamps !== false && mapping.metadata?.created) ? `<span class="badge badge-secondary" title="Created">C: ${new Date(mapping.metadata.created).toLocaleString()}</span>` : '',
                (window.showMetaTimestamps !== false && mapping.metadata?.edited) ? `<span class="badge badge-secondary" title="Edited">E: ${new Date(mapping.metadata.edited).toLocaleString()}</span>` : '',
                (mapping.metadata?.source) ? `<span class="badge badge-info" title="Last edited from">${mapping.metadata.source.toUpperCase()}</span>` : ''
            ].filter(Boolean).join(' ')
        }
    };

    return UIComponents.createCard('mapping', data, actions);
};

// Compact detail toggles via UIComponents
window.toggleMappingDetails = (mappingId) => UIComponents.toggleDetails(mappingId, 'mapping');
window.toggleRequestDetails = (requestId) => UIComponents.toggleDetails(requestId, 'request');

window.UIComponents = UIComponents;
