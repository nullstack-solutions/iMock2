'use strict';

(function(global) {
    const window = global;

    const NM = {
        show(msg, type = 'info', d = 4000) {
            console.log(`[${type.toUpperCase()}] ${msg}`);
            const container = document.getElementById('toast-container');
            if (!container || !container.appendChild) return;
            const t = document.createElement('div');
            t.className = `toast toast-${type}`;
            t.innerHTML = `<p>${msg}</p>`;
            container.appendChild(t);
            setTimeout(() => t.classList.add('show'), 10);
            const hide = () => { t.classList.remove('show'); if (t.parentNode) t.remove(); };
            if (d) setTimeout(hide, d);
        },
        success(m, d) { this.show(m, 'success', d); },
        error(m, d) { this.show(m, 'error', d); },
        warning(m, d) { this.show(m, 'warning', d); },
        info(m, d) { this.show(m, 'info', d); }
    };

    if (window.NotificationManager) {
        const existing = window.NotificationManager;
        ['success', 'error', 'warning', 'info'].forEach(k => {
            const orig = NM[k].bind(NM);
            const stub = existing[k];
            existing[k] = (m, d) => { orig(m, d); if (typeof stub === 'function') stub.call(existing, m, d); };
        });
        if (!existing.show) existing.show = NM.show.bind(NM);
    } else {
        window.NotificationManager = NM;
    }

    window.TabManager = {
        getCurrentTab: () => document.querySelector('.nav-item.active')?.textContent.toLowerCase().trim() || 'mappings',
        refresh: async (tab) => {
            const fn = window[{ mappings: 'fetchAndRenderMappings', requests: 'fetchAndRenderRequests', scenarios: 'loadScenarios' }[tab]];
            if (fn) await fn();
        }
    };

    window.getMappingRenderKey = (m) => m.id || m.uuid;
    window.getMappingRenderSignature = (m) => JSON.stringify(m);
    window.renderMappingMarkup = (m) => window.renderMappingCard?.(m) || '';
    window.getRequestRenderKey = (r) => r.id || r.requestId;
    window.getRequestRenderSignature = (r) => JSON.stringify(r);
    window.renderRequestMarkup = (r) => window.renderRequestCard?.(r) || '';

    window.FilterManager = {
        applyMappingFilters: window.debounce(() => {
            const q = document.getElementById('filter-query')?.value || '';
            const f = window.QueryParser ? window.QueryParser.filterMappingsByQuery(window.originalMappings, q) : window.originalMappings;
            window.allMappings = f; window.fetchAndRenderMappings?.(f);
        }),
        applyRequestFilters: window.debounce(() => {
            const q = document.getElementById('req-filter-query')?.value || '';
            const f = window.QueryParser ? window.QueryParser.filterRequestsByQuery(window.originalRequests, q) : window.originalRequests;
            window.allRequests = f; window.fetchAndRenderRequests?.(f);
        })
    };

    console.log('✅ Managers.js loaded');
})(typeof window !== 'undefined' ? window : globalThis);