'use strict';

/**
 * Virtual Scroller Integration for Mappings
 *
 * Intelligently switches between traditional rendering and virtual scrolling
 * based on the number of mappings to optimize performance.
 *
 * Threshold: 500 mappings
 * - Below 500: Traditional rendering (simpler, more reliable)
 * - 500+: Virtual scrolling (better performance)
 */

const USE_VIRTUAL_SCROLLING_THRESHOLD = 500;
const MAPPING_CARD_HEIGHT = 160; // Height of mapping card in pixels

/**
 * Initialize or update virtual scroller for mappings
 * @param {Array} mappings Array of mappings to render
 * @param {HTMLElement} container Container element
 */
window.initMappingsVirtualScroller = function(mappings, container) {
    if (!container) {
        console.warn('[MappingsVirtualScroller] Container not found');
        return;
    }

    if (!Array.isArray(mappings)) {
        console.warn('[MappingsVirtualScroller] Invalid mappings array');
        return;
    }

    const shouldUseVirtual = mappings.length >= USE_VIRTUAL_SCROLLING_THRESHOLD;

    if (shouldUseVirtual) {
        console.log(`📜 [VirtualScroller] Using virtual scrolling for ${mappings.length} mappings`);
        _initVirtualMode(mappings, container);
    } else {
        console.log(`📜 [VirtualScroller] Using traditional rendering for ${mappings.length} mappings`);
        _initTraditionalMode(mappings, container);
    }
};

/**
 * Initialize virtual scrolling mode
 * @private
 */
function _initVirtualMode(mappings, container) {
    // Destroy existing scroller if present
    if (window.mappingsVirtualScroller) {
        try {
            window.mappingsVirtualScroller.destroy();
        } catch (e) {
            console.warn('[MappingsVirtualScroller] Error destroying previous scroller:', e);
        }
        window.mappingsVirtualScroller = null;
    }

    // Create new virtual scroller
    try {
        window.mappingsVirtualScroller = new VirtualScroller({
            container: container,
            items: mappings,
            itemHeight: MAPPING_CARD_HEIGHT,
            renderItem: (mapping, index) => {
                // Use existing renderMappingCard function
                if (typeof window.renderMappingCard === 'function') {
                    return window.renderMappingCard(mapping);
                }
                console.error('[MappingsVirtualScroller] renderMappingCard not found');
                return '<div class="error">Render function not available</div>';
            },
            getItemId: (mapping) => mapping.id || mapping.uuid,
            bufferSize: 3,
            onScroll: (scrollTop, startIndex, endIndex) => {
                // Optional: Track scroll metrics
                if (window.DEBUG_VIRTUAL_SCROLLER) {
                    console.log(`[MappingsVirtualScroller] Scroll: ${scrollTop}px, showing items ${startIndex}-${endIndex}`);
                }
            }
        });

        console.log(`✅ [MappingsVirtualScroller] Initialized for ${mappings.length} items`);
    } catch (error) {
        console.error('[MappingsVirtualScroller] Failed to initialize:', error);
        // Fallback to traditional rendering
        _initTraditionalMode(mappings, container);
    }
}

/**
 * Initialize traditional rendering mode
 * @private
 */
function _initTraditionalMode(mappings, container) {
    // Destroy virtual scroller if present
    if (window.mappingsVirtualScroller) {
        try {
            window.mappingsVirtualScroller.destroy();
        } catch (e) {
            console.warn('[MappingsVirtualScroller] Error destroying scroller:', e);
        }
        window.mappingsVirtualScroller = null;
    }

    // Use existing renderList function from clean
    if (typeof window.renderList === 'function') {
        window.renderList(container, mappings, {
            renderItem: window.renderMappingMarkup || window.renderMappingCard,
            getKey: window.getMappingRenderKey,
            getSignature: window.getMappingRenderSignature,
            onItemChanged: window.handleMappingItemChanged,
            onItemRemoved: window.handleMappingItemRemoved
        });
    } else {
        // Fallback: simple rendering
        console.warn('[MappingsVirtualScroller] renderList not found, using simple rendering');
        container.innerHTML = mappings.map(m => window.renderMappingCard(m)).join('');
    }
}

/**
 * Update mappings in virtual scroller
 * @param {Array} mappings Updated mappings array
 * @param {boolean} preserveScroll Whether to maintain scroll position
 */
window.updateMappingsVirtualScroller = function(mappings, preserveScroll = true) {
    const container = document.getElementById('mappings-list');
    if (!container) {
        console.warn('[MappingsVirtualScroller] Container not found for update');
        return;
    }

    // Check if we need to switch modes
    const shouldUseVirtual = mappings.length >= USE_VIRTUAL_SCROLLING_THRESHOLD;
    const isUsingVirtual = !!window.mappingsVirtualScroller;

    if (shouldUseVirtual !== isUsingVirtual) {
        // Mode change required - reinitialize
        console.log(`📜 [MappingsVirtualScroller] Switching mode: virtual=${shouldUseVirtual}`);
        window.initMappingsVirtualScroller(mappings, container);
    } else if (isUsingVirtual) {
        // Update existing virtual scroller
        window.mappingsVirtualScroller.setItems(mappings, preserveScroll);
    } else {
        // Update traditional rendering
        _initTraditionalMode(mappings, container);
    }
};

/**
 * Scroll to specific mapping
 * @param {string} mappingId ID of mapping to scroll to
 * @param {string} behavior Scroll behavior ('auto' | 'smooth')
 */
window.scrollToMapping = function(mappingId, behavior = 'smooth') {
    if (window.mappingsVirtualScroller) {
        // Use virtual scroller's scrollToItem
        window.mappingsVirtualScroller.scrollToItem(mappingId, behavior);
    } else {
        // Fallback: find element and scroll
        const element = document.querySelector(`[data-id="${mappingId}"]`);
        if (element) {
            element.scrollIntoView({ behavior: behavior, block: 'nearest' });
        }
    }
};

/**
 * Cleanup virtual scroller (called on page unload or mode switch)
 */
window.destroyMappingsVirtualScroller = function() {
    if (window.mappingsVirtualScroller) {
        try {
            window.mappingsVirtualScroller.destroy();
            window.mappingsVirtualScroller = null;
            console.log('✅ [MappingsVirtualScroller] Destroyed');
        } catch (error) {
            console.error('[MappingsVirtualScroller] Error during destroy:', error);
        }
    }
};

// Cleanup on page unload
if (typeof window.LifecycleManager !== 'undefined') {
    window.LifecycleManager.addEventListener('beforeunload', () => {
        window.destroyMappingsVirtualScroller();
    });
}
