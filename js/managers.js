'use strict';

// === MANAGERS.JS ===
// Management systems for notifications, tabs, and filters

// --- NOTIFICATION MANAGER ---
// Enhanced notification system with queue and better UX
if (!window.NotificationManager) {
    window.NotificationManager = {
        queue: [],
        isShowing: false,
        toastContainer: null,
        
        TYPES: {
            INFO: 'info',
            SUCCESS: 'success', 
            ERROR: 'error',
            WARNING: 'warning'
        },
        
        init() {
            if (!this.toastContainer) {
                this.toastContainer = document.getElementById('toast-container');
                if (!this.toastContainer) {
                    // Create toast container if it doesn't exist
                    this.toastContainer = document.createElement('div');
                    this.toastContainer.id = 'toast-container';
                    this.toastContainer.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        z-index: 10000;
                        pointer-events: none;
                    `;
                    document.body.appendChild(this.toastContainer);
                }
            }
        },
        
        show(message, type = this.TYPES.INFO, duration = 3000) {
            this.init();
            this.queue.push({ message, type, duration });
            this.processQueue();
        },
        
        success(message, duration) {
            this.show(message, this.TYPES.SUCCESS, duration);
        },
        
        error(message, duration) {
            this.show(message, this.TYPES.ERROR, duration);
        },
        
        warning(message, duration) {
            this.show(message, this.TYPES.WARNING, duration);
        },
        
        info(message, duration) {
            this.show(message, this.TYPES.INFO, duration);
        },
        
        processQueue() {
            if (this.isShowing || this.queue.length === 0) return;
            
            const { message, type, duration } = this.queue.shift();
            this.displayToast(message, type, duration);
        },
        
        displayToast(message, type, duration = 3000) {
            this.isShowing = true;
            
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            
            this.toastContainer.appendChild(toast);
            
            // Trigger reflow to ensure the element is in the DOM before adding the show class
            toast.offsetHeight;
            
            // Add show class to trigger the animation
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
            
            // Auto-remove after duration
            setTimeout(() => {
                // Remove show class to trigger the exit animation
                toast.classList.remove('show');
                
                // After animation completes, remove the element and process next in queue
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                    this.isShowing = false;
                    this.processQueue(); // Process next in queue
                }, 300); // Should match the CSS transition duration
            }, duration);
        }
    };
}

// --- TAB MANAGER ---
// Unified tab management system
window.TabManager = {
    configs: {
        mappings: {
            name: 'Mappings',
            loadFunction: 'loadMappings',
            clearFunction: 'clearMappingFilters'
        },
        requests: {
            name: 'Requests', 
            loadFunction: 'loadRequests',
            clearFunction: 'clearRequestFilters'
        },
        scenarios: {
            name: 'Scenarios',
            loadFunction: 'loadScenarios',
            clearFunction: null
        }
    },
    
    async refresh(tabName) {
        const config = this.configs[tabName];
        if (!config) {
            console.warn(`Tab config not found: ${tabName}`);
            return;
        }
        
        try {
            const loadFn = window[config.loadFunction];
            if (typeof loadFn === 'function') {
                await loadFn();
                console.log(`✅ ${config.name} refreshed`);
            } else {
                console.warn(`Load function not found: ${config.loadFunction}`);
            }
        } catch (error) {
            console.error(`Error refreshing ${config.name}:`, error);
            NotificationManager.error(`Failed to refresh ${config.name}: ${error.message}`);
        }
    },
    
    clearFilters(tabName) {
        const config = this.configs[tabName];
        if (!config || !config.clearFunction) return;
        
        try {
            const clearFn = window[config.clearFunction];
            if (typeof clearFn === 'function') {
                clearFn();
                console.log(`🧹 ${config.name} filters cleared`);
            }
        } catch (error) {
            console.error(`Error clearing ${config.name} filters:`, error);
        }
    }
};

// --- FILTER MANAGER ---
// Centralized filter management
window.FilterManager = {
    // Save filter state to localStorage
    saveFilterState(tabName, filters) {
        try {
            const key = `imock-filters-${tabName}`;
            localStorage.setItem(key, JSON.stringify(filters));
        } catch (e) {
            console.warn('Failed to save filter state:', e);
        }
    },
    
    // Load filter state from localStorage
    loadFilterState(tabName) {
        try {
            const key = `imock-filters-${tabName}`;
            const saved = localStorage.getItem(key);
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.warn('Failed to load filter state:', e);
            return {};
        }
    },
    
    // Apply mapping filters
    applyMappingFilters() {
        const method = document.getElementById('filter-method')?.value || '';
        const url = document.getElementById('filter-url')?.value || '';
        const status = document.getElementById('filter-status')?.value || '';

        const filters = { method, url, status };
        this.saveFilterState('mappings', filters);

        // Apply filters to mappings
        if (window.originalMappings && window.originalMappings.length > 0) {
            let filtered = [...window.originalMappings];

            if (method) {
                filtered = filtered.filter(mapping =>
                    (mapping.request?.method || '').toLowerCase().includes(method.toLowerCase())
                );
            }

            if (url) {
                filtered = filtered.filter(mapping => {
                    // Search in URL fields
                    const mappingUrl = mapping.request?.url || mapping.request?.urlPattern || mapping.request?.urlPath || '';
                    const urlMatch = mappingUrl.toLowerCase().includes(url.toLowerCase());

                    // Search in mapping name
                    const mappingName = mapping.name || '';
                    const nameMatch = mappingName.toLowerCase().includes(url.toLowerCase());

                    // Return true if either URL or Name matches
                    return urlMatch || nameMatch;
                });
            }

            if (status) {
                filtered = filtered.filter(mapping =>
                    (mapping.response?.status || '').toString().includes(status)
                );
            }

            window.allMappings = filtered;

            // Re-render mappings
            const container = document.getElementById(SELECTORS.LISTS.MAPPINGS);
            if (container) {
                const sortedMappings = [...window.allMappings].sort((a, b) => {
                    const priorityA = a.priority || 1;
                    const priorityB = b.priority || 1;
                    if (priorityA !== priorityB) return priorityA - priorityB;

                    const methodOrder = { 'GET': 1, 'POST': 2, 'PUT': 3, 'PATCH': 4, 'DELETE': 5 };
                    const methodA = methodOrder[a.request?.method] || 999;
                    const methodB = methodOrder[b.request?.method] || 999;
                    if (methodA !== methodB) return methodA - methodB;

                    const urlA = a.request?.url || a.request?.urlPattern || a.request?.urlPath || '';
                    const urlB = b.request?.url || b.request?.urlPattern || b.request?.urlPath || '';
                    return urlA.localeCompare(urlB);
                });

                // В managers.js добавьте проверку перед использованием:
                if (typeof window.renderMappingCard === 'function') {
                    container.innerHTML = sortedMappings.map(mapping => window.renderMappingCard(mapping)).join('');
                }

                // Update UI elements
                const emptyState = document.getElementById('mappings-empty');
                const loadingState = document.getElementById('mappings-loading');

                if (window.allMappings.length === 0) {
                    if (emptyState) emptyState.classList.remove('hidden');
                    if (container) container.style.display = 'none';
                } else {
                    if (emptyState) emptyState.classList.add('hidden');
                    if (container) container.style.display = 'block';
                }

                if (typeof updateMappingsCounter === 'function') {
                    updateMappingsCounter();
                }
            }
        }
    },
    
    // Apply request filters
    applyRequestFilters() {
        const method = document.getElementById('req-filter-method')?.value || '';
        const status = document.getElementById('req-filter-status')?.value || '';
        const url = document.getElementById('req-filter-url')?.value || '';
        const from = document.getElementById('req-filter-from')?.value || '';
        const to = document.getElementById('req-filter-to')?.value || '';

        const filters = { method, status, url, from, to };
        this.saveFilterState('requests', filters);

        // Apply filters to requests
        if (window.originalRequests && window.originalRequests.length > 0) {
            let filtered = [...window.originalRequests];

            if (method) {
                filtered = filtered.filter(request =>
                    (request.request?.method || '').toLowerCase().includes(method.toLowerCase())
                );
            }

            if (status) {
                filtered = filtered.filter(request =>
                    (request.response?.status || '').toString().includes(status)
                );
            }

            if (url) {
                filtered = filtered.filter(request =>
                    (request.request?.url || '').toLowerCase().includes(url.toLowerCase())
                );
            }

            if (from) {
                const fromTime = new Date(from).getTime();
                filtered = filtered.filter(request => {
                    const requestTime = new Date(request.request?.loggedDate || request.loggedDate).getTime();
                    return requestTime >= fromTime;
                });
            }

            if (to) {
                const toTime = new Date(to).getTime();
                filtered = filtered.filter(request => {
                    const requestTime = new Date(request.request?.loggedDate || request.loggedDate).getTime();
                    return requestTime <= toTime;
                });
            }

            window.allRequests = filtered;

            // Re-render requests
            const container = document.getElementById(SELECTORS.LISTS.REQUESTS);
            if (container) {
                // В managers.js добавьте проверку перед использованием:
                if (typeof window.renderRequestCard === 'function') {
                    container.innerHTML = window.allRequests.map(request => window.renderRequestCard(request)).join('');
                }

                // Update UI elements
                const emptyState = document.getElementById('requests-empty');
                const loadingState = document.getElementById('requests-loading');

                if (window.allRequests.length === 0) {
                    if (emptyState) emptyState.classList.remove('hidden');
                    if (container) container.style.display = 'none';
                } else {
                    if (emptyState) emptyState.classList.add('hidden');
                    if (container) container.style.display = 'block';
                }

                if (typeof updateRequestsCounter === 'function') {
                    updateRequestsCounter();
                }

                console.log(`🔍 Filtered requests: ${window.allRequests.length} items`);
            }
        }
    },
    
    // Restore filter state on page load
    restoreFilters(tabName) {
        const filters = this.loadFilterState(tabName);
        
        if (tabName === 'mappings') {
            if (filters.method) {
                const elem = document.getElementById('filter-method');
                if (elem) elem.value = filters.method;
            }
            if (filters.url) {
                const elem = document.getElementById('filter-url');
                if (elem) elem.value = filters.url;
            }
            if (filters.status) {
                const elem = document.getElementById('filter-status');
                if (elem) elem.value = filters.status;
            }
        } else if (tabName === 'requests') {
            if (filters.method) {
                const elem = document.getElementById('req-filter-method');
                if (elem) elem.value = filters.method;
            }
            if (filters.status) {
                const elem = document.getElementById('req-filter-status');
                if (elem) elem.value = filters.status;
            }
            if (filters.url) {
                const elem = document.getElementById('req-filter-url');
                if (elem) elem.value = filters.url;
            }
            if (filters.from) {
                const elem = document.getElementById('req-filter-from');
                if (elem) elem.value = filters.from;
            }
            if (filters.to) {
                const elem = document.getElementById('req-filter-to');
                if (elem) elem.value = filters.to;
            }
        }
    }
};

console.log('✅ Managers.js loaded - NotificationManager, TabManager, FilterManager');