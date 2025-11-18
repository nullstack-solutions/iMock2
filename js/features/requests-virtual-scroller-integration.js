'use strict';

/**
 * Virtual Scroller Integration for Requests
 *
 * Intelligently switches between traditional rendering and virtual scrolling
 * based on the number of requests to optimize performance.
 *
 * Threshold: 500 requests
 * - Below 500: Traditional rendering (simpler, more reliable)
 * - 500+: Virtual scrolling (better performance)
 */

const USE_VIRTUAL_SCROLLING_THRESHOLD_REQUESTS = 500;
const REQUEST_CARD_HEIGHT = 140; // Height of request card in pixels

/**
 * Initialize or update virtual scroller for requests
 * @param {Array} requests Array of requests to render
 * @param {HTMLElement} container Container element
 */
window.initRequestsVirtualScroller = function(requests, container) {
    if (!container) {
        console.warn('[RequestsVirtualScroller] Container not found');
        return;
    }

    if (!Array.isArray(requests)) {
        console.warn('[RequestsVirtualScroller] Invalid requests array');
        return;
    }

    const shouldUseVirtual = requests.length >= USE_VIRTUAL_SCROLLING_THRESHOLD_REQUESTS;

    if (shouldUseVirtual) {
        console.log(`📜 [VirtualScroller] Using virtual scrolling for ${requests.length} requests`);
        _initVirtualModeRequests(requests, container);
    } else {
        console.log(`📜 [VirtualScroller] Using traditional rendering for ${requests.length} requests`);
        _initTraditionalModeRequests(requests, container);
    }
};

/**
 * Initialize virtual scrolling mode for requests
 * @private
 */
function _initVirtualModeRequests(requests, container) {
    // Destroy existing scroller if present
    if (window.requestsVirtualScroller) {
        try {
            window.requestsVirtualScroller.destroy();
        } catch (e) {
            console.warn('[RequestsVirtualScroller] Error destroying previous scroller:', e);
        }
        window.requestsVirtualScroller = null;
    }

    // Create new virtual scroller
    try {
        window.requestsVirtualScroller = new VirtualScroller({
            container: container,
            items: requests,
            itemHeight: REQUEST_CARD_HEIGHT,
            renderItem: (request, index) => {
                // Use existing renderRequestCard function
                if (typeof window.renderRequestCard === 'function') {
                    return window.renderRequestCard(request);
                }
                console.error('[RequestsVirtualScroller] renderRequestCard not found');
                return '<div class="error">Render function not available</div>';
            },
            getItemId: (request) => request.id || request.uuid,
            bufferSize: 3,
            onScroll: (scrollTop, startIndex, endIndex) => {
                // Optional: Track scroll metrics
                if (window.DEBUG_VIRTUAL_SCROLLER) {
                    console.log(`[RequestsVirtualScroller] Scroll: ${scrollTop}px, showing items ${startIndex}-${endIndex}`);
                }
            }
        });

        console.log(`✅ [RequestsVirtualScroller] Initialized for ${requests.length} items`);
    } catch (error) {
        console.error('[RequestsVirtualScroller] Failed to initialize:', error);
        // Fallback to traditional rendering
        _initTraditionalModeRequests(requests, container);
    }
}

/**
 * Initialize traditional rendering mode for requests
 * @private
 */
function _initTraditionalModeRequests(requests, container) {
    // Destroy virtual scroller if present
    if (window.requestsVirtualScroller) {
        try {
            window.requestsVirtualScroller.destroy();
        } catch (e) {
            console.warn('[RequestsVirtualScroller] Error destroying scroller:', e);
        }
        window.requestsVirtualScroller = null;
    }

    // Use existing renderList function from clean
    if (typeof window.renderList === 'function') {
        window.renderList(container, requests, {
            renderItem: window.renderRequestMarkup || window.renderRequestCard,
            getKey: window.getRequestRenderKey,
            getSignature: window.getRequestRenderSignature,
            onItemChanged: window.handleRequestItemChanged,
            onItemRemoved: window.handleRequestItemRemoved
        });
    } else {
        // Fallback: simple rendering
        console.warn('[RequestsVirtualScroller] renderList not found, using simple rendering');
        container.innerHTML = requests.map(r => window.renderRequestCard(r)).join('');
    }
}

/**
 * Update requests in virtual scroller
 * @param {Array} requests Updated requests array
 * @param {boolean} preserveScroll Whether to maintain scroll position
 */
window.updateRequestsVirtualScroller = function(requests, preserveScroll = true) {
    const container = document.getElementById('requests-list');
    if (!container) {
        console.warn('[RequestsVirtualScroller] Container not found for update');
        return;
    }

    // Check if we need to switch modes
    const shouldUseVirtual = requests.length >= USE_VIRTUAL_SCROLLING_THRESHOLD_REQUESTS;
    const isUsingVirtual = !!window.requestsVirtualScroller;

    if (shouldUseVirtual !== isUsingVirtual) {
        // Mode change required - reinitialize
        console.log(`📜 [RequestsVirtualScroller] Switching mode: virtual=${shouldUseVirtual}`);
        window.initRequestsVirtualScroller(requests, container);
    } else if (isUsingVirtual) {
        // Update existing virtual scroller
        window.requestsVirtualScroller.setItems(requests, preserveScroll);
    } else {
        // Update traditional rendering
        _initTraditionalModeRequests(requests, container);
    }
};

/**
 * Scroll to specific request
 * @param {string} requestId ID of request to scroll to
 * @param {string} behavior Scroll behavior ('auto' | 'smooth')
 */
window.scrollToRequest = function(requestId, behavior = 'smooth') {
    if (window.requestsVirtualScroller) {
        // Use virtual scroller's scrollToItem
        window.requestsVirtualScroller.scrollToItem(requestId, behavior);
    } else {
        // Fallback: find element and scroll
        const element = document.querySelector(`[data-id="${requestId}"]`);
        if (element) {
            element.scrollIntoView({ behavior: behavior, block: 'nearest' });
        }
    }
};

/**
 * Cleanup virtual scroller (called on page unload or mode switch)
 */
window.destroyRequestsVirtualScroller = function() {
    if (window.requestsVirtualScroller) {
        try {
            window.requestsVirtualScroller.destroy();
            window.requestsVirtualScroller = null;
            console.log('✅ [RequestsVirtualScroller] Destroyed');
        } catch (error) {
            console.error('[RequestsVirtualScroller] Error during destroy:', error);
        }
    }
};

// Cleanup on page unload
if (typeof window.LifecycleManager !== 'undefined') {
    window.LifecycleManager.addEventListener('beforeunload', () => {
        window.destroyRequestsVirtualScroller();
    });
}
