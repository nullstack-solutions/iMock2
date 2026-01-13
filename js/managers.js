'use strict';

(function(global) {
    const window = global;

    // --- NOTIFICATION MANAGER ---
    window.NotificationManager = {
        TYPES: { INFO: 'info', SUCCESS: 'success', ERROR: 'error', WARNING: 'warning' },
        ICONS: { info: 'ℹ️', success: '✅', warning: '⚠️', error: '⛔' },
        
        show(msg, type = 'info', duration = 4000) {
            const container = document.getElementById('toast-container') || this.createContainer();
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `
                <span class="toast-icon">${this.ICONS[type] || 'ℹ️'}</span>
                <div class="toast-content"><p class="toast-message">${msg}</p></div>
                <button class="toast-close">✕</button>
            `;
            
            container.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            
            const dismiss = () => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            };
            
            toast.querySelector('.toast-close').onclick = dismiss;
            if (duration) setTimeout(dismiss, duration);
        },

        createContainer() {
            const el = document.createElement('div');
            el.id = 'toast-container';
            document.body.appendChild(el);
            return el;
        },

        success(msg, d) { this.show(msg, 'success', d); },
        error(msg, d) { this.show(msg, 'error', d); },
        warning(msg, d) { this.show(msg, 'warning', d); },
        info(msg, d) { this.show(msg, 'info', d); }
    };

    // --- TAB MANAGER ---
    window.TabManager = {
        getCurrentTab() {
            const active = document.querySelector('.nav-item.active');
            return active ? active.textContent.toLowerCase().trim() : 'mappings';
        },

        async refresh(tab) {
            const fnMap = { mappings: 'fetchAndRenderMappings', requests: 'fetchAndRenderRequests', scenarios: 'loadScenarios' };
            const fn = window[fnMap[tab]];
            if (typeof fn === 'function') await fn();
        }
    };

    // --- FILTER MANAGER ---
    window.FilterManager = {
        applyMappingFilters: window.debounce(() => {
            const query = document.getElementById('filter-query')?.value || '';
            const filtered = window.QueryParser ? window.QueryParser.filterMappingsByQuery(window.originalMappings, query) : window.originalMappings;
            
            window.allMappings = filtered;
            if (typeof window.fetchAndRenderMappings === 'function') {
                window.fetchAndRenderMappings(filtered);
            }
        }, 200),

        applyRequestFilters: window.debounce(() => {
            const query = document.getElementById('req-filter-query')?.value || '';
            const filtered = window.QueryParser ? window.QueryParser.filterRequestsByQuery(window.originalRequests, query) : window.originalRequests;
            
            window.allRequests = filtered;
            if (typeof window.fetchAndRenderRequests === 'function') {
                window.fetchAndRenderRequests(filtered);
            }
        }, 200)
    };

    console.log('✅ Managers.js loaded');

})(typeof window !== 'undefined' ? window : globalThis);