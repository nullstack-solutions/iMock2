'use strict';

/**
 * Auto-hide filters panel on scroll for better viewport utilization
 */

(function() {
    let lastScrollTop = 0;
    const scrollThreshold = 50; // Hide after scrolling 50px down

    // Auto-hide for mappings list
    const mappingsList = document.getElementById('mappings-list');
    const searchFilters = document.getElementById('search-filters');

    if (mappingsList && searchFilters) {
        mappingsList.addEventListener('scroll', function() {
            const scrollTop = mappingsList.scrollTop;

            // Scrolling down - hide filters
            if (scrollTop > lastScrollTop && scrollTop > scrollThreshold) {
                searchFilters.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                searchFilters.style.transform = 'translateY(-20px)';
                searchFilters.style.opacity = '0';
                searchFilters.style.pointerEvents = 'none';
                searchFilters.style.marginBottom = '0';
            }
            // Scrolling up - show filters
            else if (scrollTop < lastScrollTop || scrollTop <= scrollThreshold) {
                searchFilters.style.transform = 'translateY(0)';
                searchFilters.style.opacity = '1';
                searchFilters.style.pointerEvents = 'auto';
                searchFilters.style.marginBottom = 'var(--space-6)';
            }

            lastScrollTop = scrollTop;
        });
    }

    // Auto-hide for requests list (similar pattern)
    const requestsList = document.getElementById('requests-list');
    const requestFilters = document.querySelector('#requests-page .search-filters');
    let lastRequestScrollTop = 0;

    if (requestsList && requestFilters) {
        requestsList.addEventListener('scroll', function() {
            const scrollTop = requestsList.scrollTop;

            // Scrolling down - hide filters
            if (scrollTop > lastRequestScrollTop && scrollTop > scrollThreshold) {
                requestFilters.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                requestFilters.style.transform = 'translateY(-20px)';
                requestFilters.style.opacity = '0';
                requestFilters.style.pointerEvents = 'none';
                requestFilters.style.marginBottom = '0';
            }
            // Scrolling up - show filters
            else if (scrollTop < lastRequestScrollTop || scrollTop <= scrollThreshold) {
                requestFilters.style.transform = 'translateY(0)';
                requestFilters.style.opacity = '1';
                requestFilters.style.pointerEvents = 'auto';
                requestFilters.style.marginBottom = 'var(--space-6)';
            }

            lastRequestScrollTop = scrollTop;
        });
    }
})();
