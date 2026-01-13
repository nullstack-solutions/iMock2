'use strict';

(function(global) {
    const window = global;

    // --- NOTIFICATION MANAGER ---
    window.NotificationManager = {
        show(msg, type = 'info', d = 4000) {
            console.log(`[${type.toUpperCase()}] ${msg}`);
            const container = document.getElementById('toast-container');
            if (!container || typeof container.appendChild !== 'function') return;
            
            const t = document.createElement('div');
            t.className = `toast toast-${type}`;
            t.innerHTML = `<p>${msg}</p>`;
            container.appendChild(t);
            
            setTimeout(() => t.classList.add('show'), 10);
            const hide = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); };
            if (d) setTimeout(hide, d);
            t.onclick = hide;
        },
        success(msg, d) { this.show(msg, 'success', d); },
        error(msg, d) { this.show(msg, 'error', d); },
        warning(msg, d) { this.show(msg, 'warning', d); },
        info(msg, d) { this.show(msg, 'info', d); }
    };

    // --- TAB MANAGER ---
    window.TabManager = {
        getCurrentTab: () => document.querySelector('.nav-item.active')?.textContent.toLowerCase().trim() || 'mappings',
        refresh: async (tab) => {
            const fn = window[{ mappings: 'fetchAndRenderMappings', requests: 'fetchAndRenderRequests', scenarios: 'loadScenarios' }[tab]];
            if (typeof fn === 'function') await fn();
        }
    };

    // --- RENDER HELPERS ---
    window.getMappingRenderKey = (m) => m.id || m.uuid;
    window.getMappingRenderSignature = (m) => JSON.stringify(m);
    window.renderMappingMarkup = (m) => window.renderMappingCard?.(m) || '';
    
    window.getRequestRenderKey = (r) => r.id || r.requestId;
    window.getRequestRenderSignature = (r) => JSON.stringify(r);
    window.renderRequestMarkup = (r) => window.renderRequestCard?.(r) || '';

    // --- FILTER MANAGER ---
    window.FilterManager = {
        applyMappingFilters: window.debounce(() => {
            const q = document.getElementById('filter-query')?.value || '';
            const f = window.QueryParser ? window.QueryParser.filterMappingsByQuery(window.originalMappings, q) : window.originalMappings;
            window.allMappings = f; 
            window.fetchAndRenderMappings?.(f);
        }),
        applyRequestFilters: window.debounce(() => {
            const q = document.getElementById('req-filter-query')?.value || '';
            const f = window.QueryParser ? window.QueryParser.filterRequestsByQuery(window.originalRequests, q) : window.originalRequests;
            window.allRequests = f; 
            window.fetchAndRenderRequests?.(f);
        })
    };

    console.log('✅ Managers.js loaded');
})(typeof window !== 'undefined' ? window : globalThis);