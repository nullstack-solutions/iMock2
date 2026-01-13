'use strict';

// === EVENT DELEGATION SYSTEM ===
// Centralizes event handling to reduce memory usage and improve performance

(function(global) {
    const window = global;

    class EventDelegationManager {
        constructor() {
            this.initialized = false;
            
            // Action dispatchers
            this.mappingActions = {
                'edit-mapping': (btn) => window.openEditModal?.(btn.dataset.mappingId),
                'edit-external': (btn) => window.editMapping?.(btn.dataset.mappingId),
                'duplicate-mapping': (btn) => window.duplicateMapping?.(btn.dataset.mappingId),
                'delete-mapping': (btn) => window.deleteMapping?.(btn.dataset.mappingId),
                'show-full-content': (btn) => window.toggleFullContent?.(btn.dataset.targetId),
                'toggle-details': (btn, card) => this.toggleDetails(card?.dataset.id, 'mapping', card)
            };

            this.requestActions = {
                'view-request': (btn) => window.viewRequestDetails?.(btn.dataset.requestId),
                'toggle-details': (btn, card) => this.toggleDetails(card?.dataset.id, 'request', card)
            };
        }

        init() {
            if (this.initialized) return;

            this.attachListener(SELECTORS.LISTS.MAPPINGS, this.handleMappingClick.bind(this));
            this.attachListener(SELECTORS.LISTS.REQUESTS, this.handleRequestClick.bind(this));

            this.initialized = true;
            console.log('✅ Event delegation initialized');
        }

        attachListener(id, handler) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', handler);
        }

        handleMappingClick(e) {
            this.handleEvent(e, this.mappingActions, '.mapping-card');
        }

        handleRequestClick(e) {
            this.handleEvent(e, this.requestActions, '.request-card');
        }

        handleEvent(e, actions, cardSelector) {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const handler = actions[action];

            if (handler) {
                // Prevent toggle when clicking inner actions, but allow it for the toggle button itself
                if (action !== 'toggle-details' && e.target.closest('.mapping-actions, .request-actions')) {
                    e.stopPropagation();
                }
                
                const card = btn.closest(cardSelector);
                handler(btn, card);
                
                if (action !== 'toggle-details') {
                    e.stopPropagation();
                }
            }
        }

        toggleDetails(id, type, card) {
            if (!id || !card) return;

            const preview = document.getElementById(`preview-${id}`);
            const arrow = document.getElementById(`arrow-${id}`);
            if (!preview) return;

            const willShow = preview.style.display === 'none';

            if (willShow && !card.dataset.previewLoaded && !preview.innerHTML.trim()) {
                this.loadPreviewContent(id, type, preview);
                card.dataset.previewLoaded = 'true';
            }

            preview.style.display = willShow ? 'block' : 'none';
            if (arrow) arrow.textContent = willShow ? '▼' : '▶';
            card.classList.toggle('is-expanded', willShow);

            if (type === 'mapping' && window.mappingPreviewState instanceof Set) {
                if (willShow) window.mappingPreviewState.add(String(id));
                else window.mappingPreviewState.delete(String(id));
            }

            // Sync with legacy UI state if needed
            if (window.UIComponents?.setCardState) {
                window.UIComponents.setCardState(type, id, 'is-expanded', willShow);
            }
        }

        loadPreviewContent(id, type, previewContainer) {
            try {
                let content = '';
                if (type === 'mapping') {
                    const item = window.mappingIndex?.get(id) || window.allMappings?.find(m => (m.id || m.uuid) === id);
                    content = item ? this.generateMappingPreview(item) : '<div class="preview-section"><p>Mapping data not found</p></div>';
                } else if (type === 'request') {
                    const item = window.allRequests?.find(r => (r.id || r.requestId) === id);
                    content = item ? this.generateRequestPreview(item) : '<div class="preview-section"><p>Request data not found</p></div>';
                }
                previewContainer.innerHTML = content;
            } catch (e) {
                console.error(`Error loading preview for ${type} ${id}:`, e);
                previewContainer.innerHTML = '<div class="preview-section"><p>Error loading preview</p></div>';
            }
        }

        generateMappingPreview(mapping) {
            if (!window.UIComponents?.createPreviewSection) return '';
            const sections = [
                window.UIComponents.createPreviewSection(
                    `${window.Icons?.render('request-in', { className: 'icon-inline' }) || ''} Request`,
                    {
                        'Method': mapping.request?.method || 'GET',
                        'URL': mapping.request?.url || mapping.request?.urlPattern || mapping.request?.urlPath || mapping.request?.urlPathPattern,
                        'Headers': mapping.request?.headers,
                        'Body': mapping.request?.bodyPatterns || mapping.request?.body,
                        'Query Parameters': mapping.request?.queryParameters
                    }
                ),
                window.UIComponents.createPreviewSection(
                    `${window.Icons?.render('response-out', { className: 'icon-inline' }) || ''} Response`,
                    {
                        'Status': mapping.response?.status,
                        'Headers': mapping.response?.headers,
                        'Body': mapping.response?.jsonBody || mapping.response?.body,
                        'Delay': mapping.response?.fixedDelayMilliseconds ? `${mapping.response.fixedDelayMilliseconds}ms` : null
                    }
                ),
                window.UIComponents.createPreviewSection(
                    `${window.Icons?.render('info', { className: 'icon-inline' }) || ''} Overview`,
                    {
                        'ID': mapping.id || mapping.uuid,
                        'Name': mapping.name || mapping.metadata?.name,
                        'Priority': mapping.priority,
                        'Scenario': mapping.scenarioName,
                        'State': mapping.requiredScenarioState ? `Requires: ${mapping.requiredScenarioState}` : null,
                        'New State': mapping.newScenarioState ? `→ ${mapping.newScenarioState}` : null
                    }
                )
            ];
            return sections.join('');
        }

        generateRequestPreview(request) {
            if (!window.UIComponents?.createPreviewSection) return '';
            const req = request.request || {};
            const res = request.responseDefinition || {};
            
            return [
                window.UIComponents.createPreviewSection('Request Details', {
                    'Method': req.method,
                    'URL': req.url,
                    'Headers': req.headers,
                    'Body': req.body,
                    'Logged At': req.loggedDate ? new Date(req.loggedDate).toLocaleString() : null
                }),
                window.UIComponents.createPreviewSection('Response Details', {
                    'Status': res.status,
                    'Headers': res.headers,
                    'Body': res.body || res.jsonBody,
                    'Matched': request.wasMatched ? 'Yes' : 'No'
                })
            ].join('');
        }
    }

    const instance = new EventDelegationManager();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => instance.init());
    } else {
        instance.init();
    }
    window.EventDelegation = instance;

})(typeof window !== 'undefined' ? window : globalThis);