'use strict';

// === EVENT DELEGATION SYSTEM ===
// Centralizes event handling to reduce memory usage and improve performance
// Instead of 270+ inline onclick handlers, we use 1 delegated listener per container

/**
 * Event Delegation Manager
 * Handles all click events for mapping and request cards via event bubbling
 */
class EventDelegationManager {
    constructor() {
        this.initialized = false;
        this.handlers = new Map();
        // Debounce functions to prevent excessive UI updates
        this.debounceTimers = new Map();
    }

    /**
     * Debounce function to prevent excessive UI updates
     * @param {string} key - Unique key for the operation
     * @param {Function} func - Function to debounce
     * @param {number} delay - Delay in ms
     */
    debounce(key, func, delay = 100) {
        if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key));
        }

        const timerId = setTimeout(() => {
            func();
            this.debounceTimers.delete(key);
        }, delay);

        this.debounceTimers.set(key, timerId);
    }

    /**
     * Initialize event delegation for all containers
     */
    init() {
        if (this.initialized) {
        Logger.debug('EVENTS', 'EventDelegation already initialized');
            return;
        }

        // Delegate events for mappings list
        const mappingsContainer = document.getElementById(SELECTORS.LISTS.MAPPINGS);
        if (mappingsContainer) {
            mappingsContainer.addEventListener('click', (e) => this.handleMappingClick(e));
        Logger.info('EVENTS', 'Event delegation initialized for mappings');
        }

        // Delegate events for requests list
        const requestsContainer = document.getElementById(SELECTORS.LISTS.REQUESTS);
        if (requestsContainer) {
            requestsContainer.addEventListener('click', (e) => this.handleRequestClick(e));
        Logger.info('EVENTS', 'Event delegation initialized for requests');
        }

        this.initialized = true;
    }

    /**
     * Handle click events for mapping cards
     * @param {MouseEvent} e - Click event
     */
    handleMappingClick(e) {
        // Edit mapping button (modal)
        const editBtn = e.target.closest('[data-action="edit-mapping"]');
        if (editBtn) {
            e.stopPropagation();
            const mappingId = editBtn.dataset.mappingId;
            if (mappingId && typeof window.openEditModal === 'function') {
                window.openEditModal(mappingId);
            }
            return;
        }

        // Edit in external editor button
        const editExternalBtn = e.target.closest('[data-action="edit-external"]');
        if (editExternalBtn) {
            e.stopPropagation();
            const mappingId = editExternalBtn.dataset.mappingId;
            if (mappingId && typeof window.editMapping === 'function') {
                window.editMapping(mappingId);
            }
            return;
        }

        // Duplicate mapping button
        const duplicateBtn = e.target.closest('[data-action="duplicate-mapping"]');
        if (duplicateBtn) {
            e.stopPropagation();
            const mappingId = duplicateBtn.dataset.mappingId;
            if (mappingId && typeof window.duplicateMapping === 'function') {
                window.duplicateMapping(mappingId);
            }
            return;
        }

        // Delete mapping button
        const deleteBtn = e.target.closest('[data-action="delete-mapping"]');
        if (deleteBtn) {
            e.stopPropagation();
            const mappingId = deleteBtn.dataset.mappingId;
            if (mappingId && typeof window.deleteMapping === 'function') {
                window.deleteMapping(mappingId);
            }
            return;
        }

        // Show full content button (for large JSON previews)
        const showFullBtn = e.target.closest('[data-action="show-full-content"]');
        if (showFullBtn) {
            e.stopPropagation();
            const targetId = showFullBtn.dataset.targetId;
            if (targetId && typeof window.toggleFullContent === 'function') {
                window.toggleFullContent(targetId);
            }
            return;
        }

        // Stop propagation for action buttons container (to prevent toggle when clicking buttons)
        if (e.target.closest('.mapping-actions, .request-actions')) {
            e.stopPropagation();
            return;
        }

        // Toggle mapping details (expand/collapse) - only if not clicking on actions
        const toggleTarget = e.target.closest('[data-action="toggle-details"]');
        if (toggleTarget) {
            const card = e.target.closest('.mapping-card');
            if (!card) return;

            const mappingId = card.dataset.id;
            if (!mappingId) return;

            this.handleToggleDetails(mappingId, 'mapping', card);
            return;
        }
    }

    /**
     * Handle click events for request cards
     * @param {MouseEvent} e - Click event
     */
    handleRequestClick(e) {
        // Toggle request details
        const toggleTarget = e.target.closest('[data-action="toggle-details"]');
        if (toggleTarget) {
            const card = e.target.closest('.request-card');
            if (!card) return;

            const requestId = card.dataset.id;
            if (!requestId) return;

            this.handleToggleDetails(requestId, 'request', card);
            return;
        }

        // View request details
        const viewBtn = e.target.closest('[data-action="view-request"]');
        if (viewBtn) {
            const requestId = viewBtn.dataset.requestId;
            if (requestId && typeof window.viewRequestDetails === 'function') {
                window.viewRequestDetails(requestId);
            }
            return;
        }
    }

    /**
     * Handle toggle details with lazy loading
     * @param {string} id - Element ID
     * @param {string} type - 'mapping' or 'request'
     * @param {HTMLElement} card - Card element
     */
    handleToggleDetails(id, type, card) {
        // Debounce the toggle operation to prevent excessive UI updates
        const key = `toggle-${type}-${id}`;
        this.debounce(key, () => {
            const preview = document.getElementById(`preview-${id}`);
            const arrow = document.getElementById(`arrow-${id}`);

            if (!preview) return;

            const willShow = preview.style.display === 'none';

            // Toggle visibility first for immediate UI feedback
            preview.style.display = willShow ? 'block' : 'none';
            if (arrow) {
                arrow.textContent = willShow ? '▼' : '▶';
            }
            card.classList.toggle('is-expanded', willShow);

            // Lazy load preview content if not loaded yet and preview is empty
            if (willShow && !card.dataset.previewLoaded && preview.innerHTML.trim() === '') {
                // Use setTimeout to prevent blocking the UI thread
                setTimeout(() => {
                    this.loadPreviewContent(id, type, card, preview);
                    card.dataset.previewLoaded = 'true';
                }, 0);
            }

            // Update state tracking
            if (type === 'mapping') {
                if (window.mappingPreviewState instanceof Set) {
                    if (willShow) {
                        window.mappingPreviewState.add(String(id));
                    } else {
                        window.mappingPreviewState.delete(String(id));
                    }
                }
            }

            // Call legacy handlers if they exist
            if (typeof window.UIComponents?.setCardState === 'function') {
                window.UIComponents.setCardState(type, id, 'is-expanded', willShow);
            }
        }, 50); // Use a short delay for UI responsiveness
    }

    /**
     * Load preview content lazily (only when expanded)
     * @param {string} id - Element ID
     * @param {string} type - 'mapping' or 'request'
     * @param {HTMLElement} card - Card element
     * @param {HTMLElement} preview - Preview container
     */
    loadPreviewContent(id, type, card, preview) {
        // Debounce preview loading to prevent multiple simultaneous requests
        const key = `preview-${type}-${id}`;
        this.debounce(key, () => {
            const startTime = performance.now();
            try {
                if (type === 'mapping') {
                    // Get mapping from store or legacy index.
                    // NOTE: window.MappingsStore is the primary source of truth for mappings.
                    // window.mappingIndex is a legacy compatibility layer that mirrors the same data
                    // for older code paths. It is only consulted as a fallback when MappingsStore
                    // does not yet have the mapping (e.g. during incremental migration).
                    // Once all consumers are migrated to MappingsStore, this fallback can be removed.
                    const mapping = window.MappingsStore.get(id) ||
                                   window.mappingIndex?.get(id);

                    if (!mapping) {
                        preview.innerHTML = '<div class="preview-section"><p>Mapping data not found</p></div>';
                        return;
                    }

                    // Generate preview HTML using UIComponents
                    const previewHTML = this.generateMappingPreview(mapping);

                    // Batch DOM update
                    preview.innerHTML = previewHTML;

                    const duration = performance.now() - startTime;
                    Logger.debug('EVENTS', `Lazy loaded preview for mapping: ${id} (${Math.round(duration)}ms)`);

                    // Log slow operations for performance monitoring
                    if (duration > 100) {
                        Logger.warn('EVENTS', `Slow preview load for mapping: ${id} (${Math.round(duration)}ms)`);
                    }
                } else if (type === 'request') {
                    // Get request from data
                    const request = window.allRequests?.find(r =>
                        (r.id || r.requestId || r.request?.id) === id
                    );

                    if (!request) {
                        preview.innerHTML = '<div class="preview-section"><p>Request data not found</p></div>';
                        return;
                    }

                    // Generate preview HTML
                    const previewHTML = this.generateRequestPreview(request);

                    // Batch DOM update
                    preview.innerHTML = previewHTML;

                    const duration = performance.now() - startTime;
                    Logger.debug('EVENTS', `Lazy loaded preview for request: ${id} (${Math.round(duration)}ms)`);

                    // Log slow operations for performance monitoring
                    if (duration > 100) {
                        Logger.warn('EVENTS', `Slow preview load for request: ${id} (${Math.round(duration)}ms)`);
                    }
                }
            } catch (error) {
                Logger.error('EVENTS', `Failed to load preview for ${type} ${id}:`, error);
                preview.innerHTML = '<div class="preview-section"><p>Error loading preview</p></div>';
            }
        }, 50);
    }

    /**
     * Generate preview HTML for mapping with performance optimization
     * @param {Object} mapping - Mapping data
     * @returns {string} Preview HTML
     */
    generateMappingPreview(mapping) {
        if (typeof window.UIComponents?.createPreviewSection !== 'function') {
            return '<div class="preview-section"><p>Preview generator not available</p></div>';
        }

        // Request section with basic HTML to avoid complex UIComponents operations
        const requestSection = this._createSimplePreviewSection('Request', {
            'Method': mapping.request?.method || 'GET',
            'URL': mapping.request?.url || mapping.request?.urlPattern ||
                   mapping.request?.urlPath || mapping.request?.urlPathPattern,
            'Headers': mapping.request?.headers,
            'Body': mapping.request?.bodyPatterns || mapping.request?.body,
            'Query Parameters': mapping.request?.queryParameters
        });

        // Response section
        const responseSection = this._createSimplePreviewSection('Response', {
            'Status': mapping.response?.status,
            'Headers': mapping.response?.headers,
            'Body': mapping.response?.jsonBody || mapping.response?.body,
            'Delay': mapping.response?.fixedDelayMilliseconds ?
                    `${mapping.response.fixedDelayMilliseconds}ms` : null
        });

        // Overview section
        const overviewSection = this._createSimplePreviewSection('Overview', {
            'ID': mapping.id || mapping.uuid,
            'Name': mapping.name || mapping.metadata?.name,
            'Priority': mapping.priority,
            'Persistent': mapping.persistent,
            'Scenario': mapping.scenarioName,
            'Required State': mapping.requiredScenarioState,
            'New State': mapping.newScenarioState,
            'Created': (window.showMetaTimestamps !== false && mapping.metadata?.created) ?
                      new Date(mapping.metadata.created).toLocaleString() : null,
            'Edited': (window.showMetaTimestamps !== false && mapping.metadata?.edited) ?
                     new Date(mapping.metadata.edited).toLocaleString() : null,
            'Source': mapping.metadata?.source ?
                     `Edited from ${mapping.metadata.source}` : null
        });

        return `${requestSection}${responseSection}${overviewSection}`;
    }

    /**
     * Create a simple preview section without heavy UIComponents
     * @param {string} title - Section title
     * @param {Object} items - Key-value pairs to display
     * @returns {string} HTML for the preview section
     */
    _createSimplePreviewSection(title, items) {
        const validItems = Object.entries(items).filter(([key, value]) => value !== undefined && value !== null);

        if (validItems.length === 0) {
            return '';
        }

        const content = validItems.map(([key, value]) => {
            if (!value) return '';

            if (typeof value === 'object') {
                const jsonString = JSON.stringify(value);
                // For large objects, show a summary to prevent performance issues
                if (jsonString.length > 500) {
                    const preview = jsonString.substring(0, 200) + '...';
                    return `<div class="preview-value"><strong>${key}:</strong> <pre>${this._escapeHtml(preview)}</pre></div>`;
                } else {
                    return `<div class="preview-value"><strong>${key}:</strong> <pre>${this._escapeHtml(jsonString)}</pre></div>`;
                }
            } else {
                const escapedValue = this._escapeHtml(String(value));
                const formattedValue = escapedValue.includes('\n') ? `<pre>${escapedValue}</pre>` : escapedValue;
                return `<div class="preview-value"><strong>${key}:</strong> ${formattedValue}</div>`;
            }
        }).join('');

        return `<div class="preview-section"><h4>${title}</h4>${content}</div>`;
    }

    /**
     * Simple HTML escaping utility
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    _escapeHtml(str) {
        if (typeof str !== 'string') return String(str);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    /**
     * Generate preview HTML for request
     * @param {Object} request - Request data
     * @returns {string} Preview HTML
     */
    generateRequestPreview(request) {
        if (typeof window.UIComponents?.createPreviewSection !== 'function') {
            return '<div class="preview-section"><p>Preview generator not available</p></div>';
        }

        const req = request.request || {};
        const res = request.responseDefinition || {};

        const sections = [];

        // Request section
        sections.push(window.UIComponents.createPreviewSection(
            'Request Details',
            {
                'Method': req.method,
                'URL': req.url,
                'Headers': req.headers,
                'Body': req.body,
                'Logged At': req.loggedDate ? new Date(req.loggedDate).toLocaleString() : null
            }
        ));

        // Response section
        sections.push(window.UIComponents.createPreviewSection(
            'Response Details',
            {
                'Status': res.status,
                'Headers': res.headers,
                'Body': res.body || res.jsonBody,
                'Matched': request.wasMatched ? 'Yes' : 'No',
                'Mapping ID': request.stubMapping?.id || request.stubMapping?.uuid
            }
        ));

        return sections.join('');
    }

    /**
     * Cleanup - remove event listeners if needed
     */
    destroy() {
        // Event listeners are on containers that persist,
        // so we don't need explicit cleanup in most cases
        this.initialized = false;
        Logger.info('EVENTS', 'Event delegation destroyed');
    }
}

// Initialize event delegation when DOM is ready
const eventDelegation = new EventDelegationManager();

// Auto-initialize on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        eventDelegation.init();
    });
} else {
    // DOM already loaded
    eventDelegation.init();
}

// Export to window for manual control if needed
window.EventDelegation = eventDelegation;

Logger.info('EVENTS', 'Event delegation module loaded');
