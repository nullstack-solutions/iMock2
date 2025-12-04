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
    }

    /**
     * Initialize event delegation for all containers
     */
    init() {
        if (this.initialized) {
            console.log('EventDelegation already initialized');
            return;
        }

        // Delegate events for mappings list
        const mappingsContainer = document.getElementById(SELECTORS.LISTS.MAPPINGS);
        if (mappingsContainer) {
            mappingsContainer.addEventListener('click', (e) => this.handleMappingClick(e));
            console.log('✅ Event delegation initialized for mappings');
        }

        // Delegate events for requests list
        const requestsContainer = document.getElementById(SELECTORS.LISTS.REQUESTS);
        if (requestsContainer) {
            requestsContainer.addEventListener('click', (e) => this.handleRequestClick(e));
            console.log('✅ Event delegation initialized for requests');
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
        const preview = document.getElementById(`preview-${id}`);
        const arrow = document.getElementById(`arrow-${id}`);

        if (!preview) return;

        const willShow = preview.style.display === 'none';

        // Lazy load preview content if not loaded yet and preview is empty
        if (willShow && !card.dataset.previewLoaded && preview.innerHTML.trim() === '') {
            this.loadPreviewContent(id, type, card, preview);
            card.dataset.previewLoaded = 'true';
        }

        // Toggle visibility
        preview.style.display = willShow ? 'block' : 'none';
        if (arrow) {
            arrow.textContent = willShow ? '▼' : '▶';
        }
        card.classList.toggle('is-expanded', willShow);

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
    }

    /**
     * Load preview content lazily (only when expanded)
     * @param {string} id - Element ID
     * @param {string} type - 'mapping' or 'request'
     * @param {HTMLElement} card - Card element
     * @param {HTMLElement} preview - Preview container
     */
    loadPreviewContent(id, type, card, preview) {
        try {
            if (type === 'mapping') {
                // Get mapping from index
                const mapping = window.mappingIndex?.get(id) ||
                               window.allMappings?.find(m => (m.id || m.uuid) === id);

                if (!mapping) {
                    preview.innerHTML = '<div class="preview-section"><p>Mapping data not found</p></div>';
                    return;
                }

                // Generate preview HTML using UIComponents
                const previewHTML = this.generateMappingPreview(mapping);
                preview.innerHTML = previewHTML;

                console.log(`📦 Lazy loaded preview for mapping: ${id}`);
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
                preview.innerHTML = previewHTML;

                console.log(`📦 Lazy loaded preview for request: ${id}`);
            }
        } catch (error) {
            console.error(`Failed to load preview for ${type} ${id}:`, error);
            preview.innerHTML = '<div class="preview-section"><p>Error loading preview</p></div>';
        }
    }

    /**
     * Generate preview HTML for mapping
     * @param {Object} mapping - Mapping data
     * @returns {string} Preview HTML
     */
    generateMappingPreview(mapping) {
        if (typeof window.UIComponents?.createPreviewSection !== 'function') {
            return '<div class="preview-section"><p>Preview generator not available</p></div>';
        }

        const sections = [];

        // Request section
        sections.push(window.UIComponents.createPreviewSection(
            `${window.Icons?.render('request-in', { className: 'icon-inline' }) || ''} Request`,
            {
                'Method': mapping.request?.method || 'GET',
                'URL': mapping.request?.url || mapping.request?.urlPattern ||
                       mapping.request?.urlPath || mapping.request?.urlPathPattern,
                'Headers': mapping.request?.headers,
                'Body': mapping.request?.bodyPatterns || mapping.request?.body,
                'Query Parameters': mapping.request?.queryParameters
            }
        ));

        // Response section
        sections.push(window.UIComponents.createPreviewSection(
            `${window.Icons?.render('response-out', { className: 'icon-inline' }) || ''} Response`,
            {
                'Status': mapping.response?.status,
                'Headers': mapping.response?.headers,
                'Body': mapping.response?.jsonBody || mapping.response?.body,
                'Delay': mapping.response?.fixedDelayMilliseconds ?
                        `${mapping.response.fixedDelayMilliseconds}ms` : null
            }
        ));

        // Overview section
        sections.push(window.UIComponents.createPreviewSection(
            `${window.Icons?.render('info', { className: 'icon-inline' }) || ''} Overview`,
            {
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
            }
        ));

        return sections.join('');
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
        console.log('Event delegation destroyed');
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

console.log('✅ Event delegation module loaded');
