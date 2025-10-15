'use strict';

/**
 * Virtual Scroller Integration for Requests
 *
 * Replaces renderList with VirtualScroller for better performance with 100+ items
 */

// Store virtual scroller instance
window.requestsVirtualScroller = null;

/**
 * Initialize or update virtual scroller for requests list
 * @param {Array} requests Array of request objects
 * @param {HTMLElement} container Container element
 */
function initRequestsVirtualScroller(requests, container) {
    if (!container) {
        console.error('[VirtualScroller] Requests container not found');
        return;
    }

    // Destroy existing scroller
    if (window.requestsVirtualScroller) {
        window.requestsVirtualScroller.destroy();
        window.requestsVirtualScroller = null;
    }

    // Check if we have enough items to benefit from virtualization
    const USE_VIRTUAL_SCROLLING_THRESHOLD = 20;

    if (requests.length < USE_VIRTUAL_SCROLLING_THRESHOLD) {
        // For small lists, use traditional rendering
        console.log(`[VirtualScroller] Using traditional rendering for ${requests.length} requests`);
        renderRequestsTraditional(requests, container);
        return;
    }

    // Create virtual scroller
    console.log(`[VirtualScroller] Creating virtual scroller for ${requests.length} requests`);

    window.requestsVirtualScroller = new VirtualScroller({
        container: container,
        items: requests,
        itemHeight: 160, // Approximate height of a request card
        renderItem: window.renderRequestCard,
        getItemId: (request) => request.id || `${request.request?.loggedDate}-${request.request?.url}`,
        bufferSize: 3,
        onScroll: (scrollTop, startIndex, endIndex) => {
            // Optional: log scroll position for debugging
            // console.log(`Scroll: ${scrollTop}px, showing requests ${startIndex}-${endIndex}`);
        }
    });

    console.log(`[VirtualScroller] Initialized with ${requests.length} requests`);
}

/**
 * Traditional rendering fallback for small lists
 */
function renderRequestsTraditional(requests, container) {
    if (typeof window.renderList === 'function') {
        // Use existing renderList function
        window.renderList(container, requests, {
            renderItem: renderRequestMarkup,
            getKey: getRequestRenderKey,
            getSignature: getRequestRenderSignature
        });
    } else {
        // Fallback: simple innerHTML rendering
        const html = requests.map(r => renderRequestMarkup(r)).join('');
        container.innerHTML = html;
    }
}

/**
 * Update requests in virtual scroller
 * @param {Array} newRequests Updated requests array
 * @param {boolean} preserveScroll Whether to maintain scroll position
 */
function updateRequestsVirtualScroller(newRequests, preserveScroll = true) {
    if (window.requestsVirtualScroller) {
        window.requestsVirtualScroller.setItems(newRequests, preserveScroll);
    }
}

/**
 * Update a single request without full re-render
 * @param {string} requestId ID of request to update
 * @param {Object} newData New request data
 */
function updateSingleRequest(requestId, newData) {
    if (window.requestsVirtualScroller) {
        window.requestsVirtualScroller.updateItem(requestId, newData);
    } else {
        // Fallback: full re-render
        if (typeof window.fetchAndRenderRequests === 'function') {
            window.fetchAndRenderRequests(window.allRequests);
        }
    }
}

/**
 * Scroll to specific request
 * @param {string} requestId ID of request to scroll to
 */
function scrollToRequest(requestId) {
    if (window.requestsVirtualScroller) {
        window.requestsVirtualScroller.scrollToItem(requestId, 'smooth');
    } else {
        // Fallback: use browser's scrollIntoView
        const element = document.querySelector(`[data-id="${requestId}"]`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

// Export functions
window.initRequestsVirtualScroller = initRequestsVirtualScroller;
window.updateRequestsVirtualScroller = updateRequestsVirtualScroller;
window.updateSingleRequest = updateSingleRequest;
window.scrollToRequest = scrollToRequest;
