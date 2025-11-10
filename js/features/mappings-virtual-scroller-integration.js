'use strict';

/**
 * Virtual Scroller Integration for Mappings
 *
 * Replaces renderList with VirtualScroller for better performance with 100+ items
 */

// Store virtual scroller instance
window.mappingsVirtualScroller = null;

/**
 * Initialize or update virtual scroller for mappings list
 * @param {Array} mappings Array of mapping objects
 * @param {HTMLElement} container Container element
 */
function initMappingsVirtualScroller(mappings, container) {
    if (!container) {
        console.error('[VirtualScroller] Container not found');
        return;
    }

    // Destroy existing scroller
    if (window.mappingsVirtualScroller) {
        window.mappingsVirtualScroller.destroy();
        window.mappingsVirtualScroller = null;
    }

    // Check if we have enough items to benefit from virtualization
    // Use high threshold since dynamic card heights make virtual scrolling complex
    const USE_VIRTUAL_SCROLLING_THRESHOLD = 500;

    if (mappings.length < USE_VIRTUAL_SCROLLING_THRESHOLD) {
        // For typical lists (< 500 items), use traditional rendering with CSS optimizations
        renderMappingsTraditional(mappings, container);
        return;
    }

    // Add class for large lists to enable proper scrolling
    container.classList.add('has-many-items');

    // Create virtual scroller
    console.log(`[VirtualScroller] Creating virtual scroller for ${mappings.length} items`);

    window.mappingsVirtualScroller = new VirtualScroller({
        container: container,
        items: mappings,
        itemHeight: 160, // Approximate height of a mapping card
        renderItem: window.renderMappingCard,
        getItemId: (mapping) => mapping.id || mapping.uuid,
        bufferSize: 3,
        onScroll: (scrollTop, startIndex, endIndex) => {
            // Optional: log scroll position for debugging
            // console.log(`Scroll: ${scrollTop}px, showing items ${startIndex}-${endIndex}`);
        }
    });

    console.log(`[VirtualScroller] Initialized with ${mappings.length} mappings`);
}

/**
 * Traditional rendering fallback for small lists
 */
function renderMappingsTraditional(mappings, container) {
    if (typeof window.renderList === 'function') {
        // Use existing renderList function
        window.renderList(container, mappings, {
            renderItem: renderMappingMarkup,
            getKey: getMappingRenderKey,
            getSignature: getMappingRenderSignature,
            onItemChanged: handleMappingItemChanged,
            onItemRemoved: handleMappingItemRemoved
        });
    } else {
        // Fallback: simple innerHTML rendering
        const html = mappings.map(m => renderMappingMarkup(m)).join('');
        container.innerHTML = html;
    }
}

/**
 * Update mappings in virtual scroller
 * @param {Array} newMappings Updated mappings array
 * @param {boolean} preserveScroll Whether to maintain scroll position
 */
function updateMappingsVirtualScroller(newMappings, preserveScroll = true) {
    if (window.mappingsVirtualScroller) {
        window.mappingsVirtualScroller.setItems(newMappings, preserveScroll);
    }
}

/**
 * Update a single mapping without full re-render
 * @param {string} mappingId ID of mapping to update
 * @param {Object} newData New mapping data
 */
function updateSingleMapping(mappingId, newData) {
    if (window.mappingsVirtualScroller) {
        window.mappingsVirtualScroller.updateItem(mappingId, newData);
    } else {
        // Fallback: full re-render
        if (typeof window.fetchAndRenderMappings === 'function') {
            window.fetchAndRenderMappings(window.allMappings);
        }
    }
}

/**
 * Scroll to specific mapping
 * @param {string} mappingId ID of mapping to scroll to
 */
function scrollToMapping(mappingId) {
    if (window.mappingsVirtualScroller) {
        window.mappingsVirtualScroller.scrollToItem(mappingId, 'smooth');
    } else {
        // Fallback: use browser's scrollIntoView
        const element = document.querySelector(`[data-id="${mappingId}"]`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

// Export functions
window.initMappingsVirtualScroller = initMappingsVirtualScroller;
window.updateMappingsVirtualScroller = updateMappingsVirtualScroller;
window.updateSingleMapping = updateSingleMapping;
window.scrollToMapping = scrollToMapping;
