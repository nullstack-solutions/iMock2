'use strict';

/**
 * Event Delegation System
 *
 * Replaces inline onclick handlers with a single delegated event listener
 * Prevents memory leaks from 100+ inline handlers
 */

// Track if delegation is initialized
let mappingsDelegationInitialized = false;
let requestsDelegationInitialized = false;

/**
 * Initialize event delegation for mappings list
 */
function initMappingsEventDelegation() {
    if (mappingsDelegationInitialized) {
        return;
    }

    const container = document.getElementById('mappings-list');
    if (!container) {
        console.warn('[EventDelegation] Mappings container not found');
        return;
    }

    // Single click listener for all mapping card interactions
    container.addEventListener('click', handleMappingsClick, { passive: false });

    mappingsDelegationInitialized = true;
    console.log('[EventDelegation] Initialized for mappings list');
}

/**
 * Handle all clicks within mappings list
 */
function handleMappingsClick(event) {
    const target = event.target;

    // Find closest button with data-action
    const actionButton = target.closest('[data-action]');
    if (actionButton) {
        event.stopPropagation();
        const action = actionButton.dataset.action;
        const card = actionButton.closest('[data-id]');

        if (!card) {
            console.warn('[EventDelegation] No card found for action button');
            return;
        }

        const id = card.dataset.id;
        handleMappingAction(action, id);
        return;
    }

    // Handle card header clicks (toggle details)
    const cardHeader = target.closest('.mapping-header');
    if (cardHeader) {
        const card = cardHeader.closest('[data-id]');
        if (card) {
            const id = card.dataset.id;
            if (typeof window.toggleDetails === 'function') {
                window.toggleDetails(id, 'mapping');
            }
        }
        return;
    }

    // Handle "Show Full Content" buttons
    const fullContentButton = target.closest('[data-toggle-full]');
    if (fullContentButton) {
        const elementId = fullContentButton.dataset.toggleFull;
        if (typeof window.toggleFullContent === 'function') {
            window.toggleFullContent(elementId);
        }
        return;
    }
}

/**
 * Handle mapping card actions
 */
function handleMappingAction(action, id) {
    console.log(`[EventDelegation] Action: ${action}, ID: ${id}`);

    switch (action) {
        case 'edit':
            if (typeof window.editMapping === 'function') {
                window.editMapping(id);
            }
            break;

        case 'edit-modal':
            if (typeof window.openEditModal === 'function') {
                window.openEditModal(id);
            }
            break;

        case 'delete':
            if (typeof window.deleteMapping === 'function') {
                window.deleteMapping(id);
            }
            break;

        case 'duplicate':
            if (typeof window.duplicateMapping === 'function') {
                window.duplicateMapping(id);
            }
            break;

        case 'view':
            if (typeof window.viewMappingDetails === 'function') {
                window.viewMappingDetails(id);
            }
            break;

        default:
            console.warn(`[EventDelegation] Unknown action: ${action}`);
    }
}

/**
 * Initialize event delegation for requests list
 */
function initRequestsEventDelegation() {
    if (requestsDelegationInitialized) {
        return;
    }

    const container = document.getElementById('requests-list');
    if (!container) {
        console.warn('[EventDelegation] Requests container not found');
        return;
    }

    // Single click listener for all request card interactions
    container.addEventListener('click', handleRequestsClick, { passive: false });

    requestsDelegationInitialized = true;
    console.log('[EventDelegation] Initialized for requests list');
}

/**
 * Handle all clicks within requests list
 */
function handleRequestsClick(event) {
    const target = event.target;

    // Find closest button with data-action
    const actionButton = target.closest('[data-action]');
    if (actionButton) {
        event.stopPropagation();
        const action = actionButton.dataset.action;
        const card = actionButton.closest('[data-id]');

        if (!card) {
            console.warn('[EventDelegation] No card found for action button');
            return;
        }

        const id = card.dataset.id;
        handleRequestAction(action, id);
        return;
    }

    // Handle card header clicks (toggle details)
    const cardHeader = target.closest('.request-header');
    if (cardHeader) {
        const card = cardHeader.closest('[data-id]');
        if (card) {
            const id = card.dataset.id;
            if (typeof window.toggleDetails === 'function') {
                window.toggleDetails(id, 'request');
            }
        }
        return;
    }
}

/**
 * Handle request card actions
 */
function handleRequestAction(action, id) {
    console.log(`[EventDelegation] Request Action: ${action}, ID: ${id}`);

    switch (action) {
        case 'view':
            if (typeof window.viewRequestDetails === 'function') {
                window.viewRequestDetails(id);
            }
            break;

        case 'create-mapping':
            if (typeof window.createMappingFromRequest === 'function') {
                window.createMappingFromRequest(id);
            }
            break;

        default:
            console.warn(`[EventDelegation] Unknown request action: ${action}`);
    }
}

/**
 * Initialize all event delegation on page load
 */
function initAllEventDelegation() {
    initMappingsEventDelegation();
    initRequestsEventDelegation();
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllEventDelegation);
} else {
    // DOM already loaded
    setTimeout(initAllEventDelegation, 100);
}

// Export functions
window.initMappingsEventDelegation = initMappingsEventDelegation;
window.initRequestsEventDelegation = initRequestsEventDelegation;
window.initAllEventDelegation = initAllEventDelegation;
window.handleMappingAction = handleMappingAction;
window.handleRequestAction = handleRequestAction;
