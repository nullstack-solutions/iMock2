'use strict';

/**
 * Virtual Scroller - Renders only visible items for optimal performance
 *
 * Handles large lists (100+ items) by rendering only what's visible in viewport.
 * Maintains scroll height with padding and updates on scroll events.
 *
 * @example
 * const scroller = new VirtualScroller({
 *     container: document.getElementById('list'),
 *     items: myLargeArray,
 *     itemHeight: 160,
 *     renderItem: (item) => `<div class="card">${item.name}</div>`,
 *     getItemId: (item) => item.id,
 *     bufferSize: 3
 * });
 *
 * // Update items
 * scroller.setItems(newItems);
 *
 * // Cleanup
 * scroller.destroy();
 */
class VirtualScroller {
    /**
     * @param {Object} options Configuration options
     * @param {HTMLElement} options.container Container element for the list
     * @param {Array} options.items Array of items to render
     * @param {number} options.itemHeight Height of each item in pixels
     * @param {Function} options.renderItem Function that returns HTML string for an item
     * @param {Function} options.getItemId Function that returns unique ID for an item
     * @param {number} options.bufferSize Number of extra items to render above/below viewport (default: 3)
     * @param {Function} options.onScroll Optional callback when scroll position changes
     */
    constructor(options) {
        this.container = options.container;
        this.items = options.items || [];
        this.itemHeight = options.itemHeight || 160;
        this.renderItem = options.renderItem;
        this.getItemId = options.getItemId || ((item) => item.id || item.uuid);
        this.bufferSize = options.bufferSize || 3;
        this.onScrollCallback = options.onScroll;

        if (!this.container) {
            console.error('[VirtualScroller] Container element is required');
            return;
        }

        if (typeof this.renderItem !== 'function') {
            console.error('[VirtualScroller] renderItem function is required');
            return;
        }

        // State
        this.startIndex = 0;
        this.endIndex = 0;
        this.visibleCount = 0;
        this.totalHeight = 0;
        this.scrollTop = 0;
        this.isScrolling = false;
        this.scrollTimeout = null;
        this.renderedItems = new Map(); // Cache rendered elements

        // Bind methods
        this._handleScroll = this._handleScroll.bind(this);
        this._handleResize = this._handleResize.bind(this);

        // Setup
        this._setupContainer();
        this._calculateVisibleCount();

        // Initialize visible range
        this.startIndex = 0;
        this.endIndex = Math.min(this.visibleCount, this.items.length);

        this._attachEvents();
        this._render();

    }

    /**
     * Setup container styles for virtual scrolling
     */
    _setupContainer() {
        // Ensure container can scroll
        if (getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative';
        }

        // Create inner wrapper for content
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'virtual-scroller-wrapper';
        this.wrapper.style.position = 'relative';
        this.wrapper.style.width = '100%';

        // Move existing content to wrapper (if any)
        while (this.container.firstChild) {
            this.wrapper.appendChild(this.container.firstChild);
        }

        this.container.appendChild(this.wrapper);

        // Calculate total height (used for scroll calculations)
        this.totalHeight = this.items.length * this.itemHeight;
        // Don't set wrapper height - padding will control it
    }

    /**
     * Calculate how many items fit in viewport
     */
    _calculateVisibleCount() {
        const containerHeight = this.container.clientHeight || window.innerHeight;
        this.visibleCount = Math.ceil(containerHeight / this.itemHeight) + (this.bufferSize * 2);
    }

    /**
     * Attach scroll and resize event listeners
     */
    _attachEvents() {
        this.container.addEventListener('scroll', this._handleScroll, { passive: true });
        window.addEventListener('resize', this._handleResize, { passive: true });
    }

    /**
     * Handle scroll events with debouncing
     */
    _handleScroll(event) {
        // Update immediately for smooth scrolling
        this._updateScrollPosition();

        // Mark as scrolling
        if (!this.isScrolling) {
            this.isScrolling = true;
            this.container.classList.add('is-scrolling');
        }

        // Debounce scroll end
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.isScrolling = false;
            this.container.classList.remove('is-scrolling');
        }, 150);

        // Callback
        if (typeof this.onScrollCallback === 'function') {
            this.onScrollCallback(this.scrollTop, this.startIndex, this.endIndex);
        }
    }

    /**
     * Update scroll position and render if needed
     */
    _updateScrollPosition() {
        const newScrollTop = this.container.scrollTop;

        // Calculate new indices
        const newStartIndex = Math.max(0, Math.floor(newScrollTop / this.itemHeight) - this.bufferSize);
        const newEndIndex = Math.min(this.items.length, newStartIndex + this.visibleCount);

        // Only re-render if range changed significantly
        if (newStartIndex !== this.startIndex || newEndIndex !== this.endIndex) {
            this.scrollTop = newScrollTop;
            this.startIndex = newStartIndex;
            this.endIndex = newEndIndex;
            this._render();
        }
    }

    /**
     * Handle window resize
     */
    _handleResize() {
        this._calculateVisibleCount();
        this._updateScrollPosition();
    }

    /**
     * Render visible items
     */
    _render() {
        const visibleItems = this.items.slice(this.startIndex, this.endIndex);

        // Clear wrapper content
        this.wrapper.innerHTML = '';

        // Calculate padding to maintain scroll height
        const paddingTop = this.startIndex * this.itemHeight;
        const paddingBottom = (this.items.length - this.endIndex) * this.itemHeight;

        // Apply padding to maintain scrollbar position
        this.wrapper.style.paddingTop = `${paddingTop}px`;
        this.wrapper.style.paddingBottom = `${paddingBottom}px`;

        // Create document fragment for batch DOM insertion
        const fragment = document.createDocumentFragment();

        // Render visible items
        visibleItems.forEach((item, index) => {
            const actualIndex = this.startIndex + index;
            const itemId = this.getItemId(item);

            // Check cache first
            let element = this.renderedItems.get(itemId);

            if (!element) {
                // Create new element
                const html = this.renderItem(item, actualIndex);

                if (!html || typeof html !== 'string') {
                    console.warn('[VirtualScroller] renderItem returned non-string:', typeof html, item);
                    return;
                }

                const template = document.createElement('template');
                template.innerHTML = html.trim();
                element = template.content.firstElementChild;

                if (!element) {
                    console.warn('[VirtualScroller] renderItem returned invalid HTML for item:', item, 'HTML:', html.substring(0, 200));
                    return;
                }

                // Cache element
                this.renderedItems.set(itemId, element);
            }

            // Use relative positioning - keep in normal document flow
            // No need to set position/top/left - elements stack naturally

            // Add data attribute for debugging
            element.dataset.virtualIndex = actualIndex;

            fragment.appendChild(element);
        });

        // Batch insert
        this.wrapper.appendChild(fragment);

        // Cleanup cache if it's too large (keep only 2x visible items)
        if (this.renderedItems.size > this.visibleCount * 2) {
            this._cleanupCache();
        }
    }

    /**
     * Cleanup element cache to prevent memory bloat
     */
    _cleanupCache() {
        const visibleIds = new Set(
            this.items
                .slice(this.startIndex, this.endIndex)
                .map(item => this.getItemId(item))
        );

        const toDelete = [];
        this.renderedItems.forEach((element, id) => {
            if (!visibleIds.has(id)) {
                toDelete.push(id);
            }
        });

        // Keep cache size reasonable (2x visible items)
        const excessCount = Math.max(0, toDelete.length - this.visibleCount);
        toDelete.slice(0, excessCount).forEach(id => {
            this.renderedItems.delete(id);
        });

    }

    /**
     * Update items and re-render
     * @param {Array} newItems New array of items
     * @param {boolean} preserveScroll Whether to maintain scroll position (default: true)
     */
    setItems(newItems, preserveScroll = true) {
        const oldScrollTop = this.scrollTop;

        this.items = newItems || [];
        this.totalHeight = this.items.length * this.itemHeight;
        // Don't set wrapper height - padding will control it

        // Clear cache since items changed
        this.renderedItems.clear();

        // Restore scroll position if requested
        if (preserveScroll && oldScrollTop > 0) {
            this.container.scrollTop = Math.min(oldScrollTop, this.totalHeight - this.container.clientHeight);
        } else {
            this.container.scrollTop = 0;
        }

        this._updateScrollPosition();
    }

    /**
     * Update a single item without full re-render
     * @param {string|number} itemId ID of item to update
     * @param {Object} newData New item data
     */
    updateItem(itemId, newData) {
        const index = this.items.findIndex(item => this.getItemId(item) === itemId);

        if (index === -1) {
            console.warn('[VirtualScroller] Item not found:', itemId);
            return;
        }

        // Update item in array
        this.items[index] = newData;

        // If item is visible, update its element
        if (index >= this.startIndex && index < this.endIndex) {
            // Remove from cache to force re-render
            this.renderedItems.delete(itemId);
            this._render();
        }
    }

    /**
     * Scroll to specific item
     * @param {number} index Index of item to scroll to
     * @param {string} behavior Scroll behavior: 'auto' | 'smooth' (default: 'smooth')
     */
    scrollToIndex(index, behavior = 'smooth') {
        if (index < 0 || index >= this.items.length) {
            console.warn('[VirtualScroller] Invalid index:', index);
            return;
        }

        const targetScrollTop = index * this.itemHeight;
        this.container.scrollTo({
            top: targetScrollTop,
            behavior: behavior
        });
    }

    /**
     * Scroll to specific item by ID
     * @param {string|number} itemId ID of item to scroll to
     * @param {string} behavior Scroll behavior: 'auto' | 'smooth' (default: 'smooth')
     */
    scrollToItem(itemId, behavior = 'smooth') {
        const index = this.items.findIndex(item => this.getItemId(item) === itemId);
        if (index !== -1) {
            this.scrollToIndex(index, behavior);
        }
    }

    /**
     * Get currently visible items
     * @returns {Array} Array of visible items
     */
    getVisibleItems() {
        return this.items.slice(this.startIndex, this.endIndex);
    }

    /**
     * Get current scroll state
     * @returns {Object} State object
     */
    getState() {
        return {
            scrollTop: this.scrollTop,
            startIndex: this.startIndex,
            endIndex: this.endIndex,
            visibleCount: this.visibleCount,
            totalItems: this.items.length,
            isScrolling: this.isScrolling
        };
    }

    /**
     * Refresh the scroller (recalculate and re-render)
     */
    refresh() {
        this._calculateVisibleCount();
        this._updateScrollPosition();
    }

    /**
     * Destroy the scroller and cleanup
     */
    destroy() {
        // Remove event listeners
        this.container.removeEventListener('scroll', this._handleScroll);
        window.removeEventListener('resize', this._handleResize);

        // Clear timeout
        clearTimeout(this.scrollTimeout);

        // Clear cache
        this.renderedItems.clear();

        // Remove wrapper
        if (this.wrapper && this.wrapper.parentNode) {
            while (this.wrapper.firstChild) {
                this.container.appendChild(this.wrapper.firstChild);
            }
            this.wrapper.remove();
        }
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VirtualScroller;
}

// Make available globally
window.VirtualScroller = VirtualScroller;
