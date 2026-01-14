'use strict';

// === PAGINATION SYSTEM ===
// Implements client-side pagination to reduce DOM nodes and improve performance

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
     * @param {number} itemsPerPage - Items per page (default: 20)
     */
    init(containerSelector, itemsPerPage = 20) {
        this.containerSelector = containerSelector;
        this.itemsPerPage = itemsPerPage;
        this.currentPage = 1;
        Logger.info('PAGINATION', 'Pagination initialized:', { itemsPerPage, containerSelector });
    }

    /**
     * Update pagination state for new dataset
     * @param {number} totalItems - Total number of items
     */
    updateState(totalItems) {
        this.totalItems = totalItems;
        this.totalPages = Math.ceil(totalItems / this.itemsPerPage);

        // Reset to page 1 if current page is out of bounds
        if (this.currentPage > this.totalPages) {
            this.currentPage = 1;
        }

        Logger.debug('PAGINATION', 'Pagination state updated:', {
            totalItems,
            totalPages: this.totalPages,
            currentPage: this.currentPage,
            itemsPerPage: this.itemsPerPage
        });
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
     */
    goToPage(pageNumber) {
        if (pageNumber < 1 || pageNumber > this.totalPages) {
            Logger.warn('PAGINATION', 'Invalid page number:', pageNumber);
            return false;
        }

        this.currentPage = pageNumber;
        Logger.debug('PAGINATION', `Navigated to page ${pageNumber}/${this.totalPages}`);
        return true;
    }

    /**
     * Navigate to next page
     */
    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            return true;
        }
        return false;
    }

    /**
     * Navigate to previous page
     */
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            return true;
        }
        return false;
    }

    /**
     * Render pagination controls
     * @returns {string} HTML for pagination controls
     */
    renderControls() {
        if (this.totalPages <= 1) {
            return ''; // No pagination needed
        }

        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);

        // Generate page numbers to show (max 7: ... 3 4 [5] 6 7 ...)
        const pageNumbers = this.generatePageNumbers();

        return `
            <div class="pagination-controls">
                <div class="pagination-info">
                    Showing ${startItem}-${endItem} of ${this.totalItems}
                </div>
                <div class="pagination-buttons">
                    <button class="pagination-btn"
                            data-action="prev-page"
                            ${this.currentPage === 1 ? 'disabled' : ''}
                            title="Previous page">
                        ‹
                    </button>
                    ${pageNumbers.map(page => {
                        if (page === '...') {
                            return '<span class="pagination-ellipsis">...</span>';
                        }
                        return `<button class="pagination-btn ${page === this.currentPage ? 'active' : ''}"
                                        data-action="goto-page"
                                        data-page="${page}"
                                        ${page === this.currentPage ? 'disabled' : ''}>${page}</button>`;
                    }).join('')}
                    <button class="pagination-btn"
                            data-action="next-page"
                            ${this.currentPage === this.totalPages ? 'disabled' : ''}
                            title="Next page">
                        ›
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Generate smart page numbers (show current, neighbors, and boundaries)
     * @returns {Array} Array of page numbers and ellipsis
     */
    generatePageNumbers() {
        const pages = [];
        const delta = 2; // Show 2 pages on each side of current

        if (this.totalPages <= 7) {
            // Show all pages if total is small
            for (let i = 1; i <= this.totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Smart pagination: 1 ... 4 5 [6] 7 8 ... 10
            pages.push(1);

            const start = Math.max(2, this.currentPage - delta);
            const end = Math.min(this.totalPages - 1, this.currentPage + delta);

            if (start > 2) {
                pages.push('...');
            }

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (end < this.totalPages - 1) {
                pages.push('...');
            }

            pages.push(this.totalPages);
        }

        return pages;
    }

    /**
     * Attach event listeners to pagination controls
     * @param {Function} onPageChange - Callback when page changes
     */
    attachListeners(onPageChange) {
        if (!this.containerSelector) {
            Logger.warn('PAGINATION', 'Pagination container not set');
            return;
        }

        const container = document.querySelector(this.containerSelector);
        if (!container) {
            Logger.warn('PAGINATION', 'Pagination container not found:', this.containerSelector);
            return;
        }

        // Use event delegation for pagination buttons
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            let changed = false;

            if (action === 'prev-page') {
                changed = this.prevPage();
            } else if (action === 'next-page') {
                changed = this.nextPage();
            } else if (action === 'goto-page') {
                const page = parseInt(btn.dataset.page, 10);
                changed = this.goToPage(page);
            }

            if (changed && typeof onPageChange === 'function') {
                onPageChange(this.currentPage);
            }
        });

        Logger.info('PAGINATION', 'Pagination event listeners attached');
    }
}

// Export global instance
window.PaginationManager = new PaginationManager();

Logger.info('PAGINATION', 'Pagination module loaded');
