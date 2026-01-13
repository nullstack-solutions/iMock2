'use strict';

// === PAGINATION SYSTEM ===
// Implements client-side pagination to reduce DOM nodes and improve performance

(function(global) {
    /**
     * Pagination Manager
     * Handles pagination state and UI controls for large lists
     */
    class PaginationManager {
        constructor() {
            this.itemsPerPage = 20; // Best practice for large lists
            this.currentPage = 1;
            this.totalItems = 0;
            this.totalPages = 1;
            this.containerSelector = null;
        }

        /**
         * Initialize pagination for a container
         * @param {string} containerSelector - Selector for pagination controls container
         * @param {number} [itemsPerPage=20] - Items per page
         */
        init(containerSelector, itemsPerPage = 20) {
            this.containerSelector = containerSelector;
            this.itemsPerPage = itemsPerPage;
            this.currentPage = 1;
        }

        /**
         * Update pagination state for new dataset
         * @param {number} totalItems - Total number of items
         */
        updateState(totalItems) {
            this.totalItems = totalItems;
            this.totalPages = Math.ceil(totalItems / this.itemsPerPage) || 1;

            if (this.currentPage > this.totalPages) {
                this.currentPage = 1;
            }
        }

        /**
         * Get current page data slice
         * @param {Array} items - Full dataset
         * @returns {Array} Items for current page
         */
        getCurrentPageItems(items) {
            if (!Array.isArray(items)) return [];

            const startIndex = (this.currentPage - 1) * this.itemsPerPage;
            const endIndex = startIndex + this.itemsPerPage;

            return items.slice(startIndex, endIndex);
        }

        /**
         * Navigate to specific page
         * @param {number} pageNumber - Page to navigate to
         * @returns {boolean} True if page changed
         */
        goToPage(pageNumber) {
            if (pageNumber < 1 || pageNumber > this.totalPages || pageNumber === this.currentPage) {
                return false;
            }

            this.currentPage = pageNumber;
            return true;
        }

        /**
         * Navigate to next page
         * @returns {boolean} True if page changed
         */
        nextPage() {
            return this.goToPage(this.currentPage + 1);
        }

        /**
         * Navigate to previous page
         * @returns {boolean} True if page changed
         */
        prevPage() {
            return this.goToPage(this.currentPage - 1);
        }

        /**
         * Render pagination controls
         * @returns {string} HTML for pagination controls
         */
        renderControls() {
            if (this.totalPages <= 1) return '';

            const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
            const endItem = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);
            const pageNumbers = this.generatePageNumbers();

            return `
                <div class="pagination-controls">
                    <div class="pagination-info">
                        Showing ${startItem}-${endItem} of ${this.totalItems}
                    </div>
                    <div class="pagination-buttons">
                        <button class="pagination-btn" data-action="prev-page" 
                                ${this.currentPage === 1 ? 'disabled' : ''} title="Previous page">‹</button>
                        
                        ${pageNumbers.map(page => {
                            if (page === '...') return '<span class="pagination-ellipsis">...</span>';
                            return `
                                <button class="pagination-btn ${page === this.currentPage ? 'active' : ''}"
                                        data-action="goto-page" data-page="${page}"
                                        ${page === this.currentPage ? 'disabled' : ''}>
                                    ${page}
                                </button>
                            `;
                        }).join('')}

                        <button class="pagination-btn" data-action="next-page" 
                                ${this.currentPage === this.totalPages ? 'disabled' : ''} title="Next page">›</button>
                    </div>
                </div>
            `;
        }

        /**
         * Generate smart page numbers (show current, neighbors, and boundaries)
         * @returns {Array<(number|string)>} Array of page numbers and ellipsis
         */
        generatePageNumbers() {
            if (this.totalPages <= 7) {
                return Array.from({ length: this.totalPages }, (_, i) => i + 1);
            }

            const pages = [1];
            const delta = 2;
            const leftBound = Math.max(2, this.currentPage - delta);
            const rightBound = Math.min(this.totalPages - 1, this.currentPage + delta);

            if (leftBound > 2) pages.push('...');
            
            for (let i = leftBound; i <= rightBound; i++) {
                pages.push(i);
            }

            if (rightBound < this.totalPages - 1) pages.push('...');
            
            pages.push(this.totalPages);
            return pages;
        }

        /**
         * Attach event listeners to pagination controls
         * @param {Function} onPageChange - Callback when page changes
         */
        attachListeners(onPageChange) {
            if (!this.containerSelector) return;

            const container = document.querySelector(this.containerSelector);
            if (!container) return;

            // Remove existing listener if any (not easily possible with anonymous functions without tracking)
            // But we can rely on re-rendering or assuming init is called once per container logic

            container.onclick = (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;

                const action = btn.dataset.action;
                let changed = false;

                if (action === 'prev-page') changed = this.prevPage();
                else if (action === 'next-page') changed = this.nextPage();
                else if (action === 'goto-page') changed = this.goToPage(parseInt(btn.dataset.page, 10));

                if (changed && typeof onPageChange === 'function') {
                    onPageChange(this.currentPage);
                }
            };
        }
    }

    // Export global instance
    global.PaginationManager = new PaginationManager();

    console.log('✅ Pagination module loaded');

})(typeof window !== 'undefined' ? window : globalThis);