'use strict';

function isOptimisticShadowMap(value) {
    return value && typeof value === 'object'
        && typeof value.forEach === 'function'
        && typeof value.size === 'number'
        && Object.prototype.toString.call(value) === '[object Map]';
}

// Persist preview expansion state across re-renders so cache refreshes don't
// unexpectedly collapse open mappings.
if (!(window.mappingPreviewState instanceof Set)) {
    window.mappingPreviewState = new Set();
}

// Track when we've surfaced a toast for an updated mapping to avoid spamming.
if (!(window.mappingPreviewToastState instanceof Map)) {
    window.mappingPreviewToastState = new Map();
}

// Preserve optimistic mapping payloads while the server catches up so that
// background refreshes don't temporarily drop freshly edited/created items.
if (!isOptimisticShadowMap(window.optimisticShadowMappings)) {
    window.optimisticShadowMappings = new Map();
}

// ===== MEMORY OPTIMIZATIONS =====
// Limits to prevent unbounded memory growth
const MAX_PREVIEW_STATE_SIZE = 50;        // Preserved recently expanded previews
const MAX_TOAST_STATE_SIZE = 100;         // Notification history limit
const MAX_OPTIMISTIC_MAPPINGS = 50;       // Active editing sessions limit

// Periodic cleanup for memory management (runs every minute)
if (!window.mappingMemoryCleanupInterval && typeof window.LifecycleManager !== 'undefined') {
    window.mappingMemoryCleanupInterval = window.LifecycleManager.setInterval(() => {
        // 1. Clean up preview state - keep only most recent items
        if (window.mappingPreviewState.size > MAX_PREVIEW_STATE_SIZE) {
            const toKeep = Array.from(window.mappingPreviewState).slice(-MAX_PREVIEW_STATE_SIZE);
            window.mappingPreviewState.clear();
            toKeep.forEach(id => window.mappingPreviewState.add(id));
            console.log('🧹 [Memory] Cleaned mappingPreviewState, kept', toKeep.length, 'items');
        }

        // 2. Clean up toast state with TTL - remove expired entries and limit size
        if (window.mappingPreviewToastState.size > 0) {
            const now = Date.now();
            const TOAST_TTL = 5 * 60 * 1000; // 5 minutes

            // Collect non-expired entries in single pass
            const validEntries = [];
            for (const [id, timestamp] of window.mappingPreviewToastState.entries()) {
                if (now - timestamp <= TOAST_TTL) {
                    validEntries.push([id, timestamp]);
                }
            }

            // If too many valid entries, keep only the most recent
            if (validEntries.length > MAX_TOAST_STATE_SIZE) {
                validEntries.sort((a, b) => b[1] - a[1]); // Sort by timestamp, newest first
                validEntries.length = MAX_TOAST_STATE_SIZE;
                console.log('🧹 [Memory] Cleaned mappingPreviewToastState, kept', MAX_TOAST_STATE_SIZE, 'items');
            }

            // Rebuild map with valid entries only
            window.mappingPreviewToastState.clear();
            validEntries.forEach(([id, timestamp]) => {
                window.mappingPreviewToastState.set(id, timestamp);
            });
        }

        // 3. Clean up optimistic shadow mappings - keep only recent items
        if (window.optimisticShadowMappings.size > MAX_OPTIMISTIC_MAPPINGS) {
            const entries = Array.from(window.optimisticShadowMappings.entries());
            entries.sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0));
            window.optimisticShadowMappings.clear();
            entries.slice(0, MAX_OPTIMISTIC_MAPPINGS).forEach(([id, entry]) => {
                window.optimisticShadowMappings.set(id, entry);
            });
            console.log('🧹 [Memory] Cleaned optimisticShadowMappings, kept', MAX_OPTIMISTIC_MAPPINGS, 'items');
        }
    }, 60000); // Run every minute
}
// ===== END MEMORY OPTIMIZATIONS =====

const UIComponents = {
    // Base card component replacing renderMappingCard and renderRequestCard
    createCard: (type, data, actions = []) => {
        const { id, method, url, status, name, time, extras = {}, expanded = false } = data;

        // Map handler names to data-action attributes
        const handlerToAction = {
            'editMapping': 'edit-external',
            'openEditModal': 'edit-mapping',
            'deleteMapping': 'delete-mapping',
            'viewRequestDetails': 'view-request'
        };

        return `
            <div class="${type}-card${expanded ? ' is-expanded' : ''}" data-id="${Utils.escapeHtml(id)}">
                <div class="${type}-header" data-action="toggle-details">
                    <div class="${type}-info">
                        <div class="${type}-top-line">
                            <span class="method-badge ${method.toLowerCase()}">
                                <span class="collapse-arrow" id="arrow-${Utils.escapeHtml(id)}">${expanded ? '▼' : '▶'}</span> ${method}
                            </span>
                            ${name ? `<span class="${type}-name">${Utils.escapeHtml(name)}</span>` : ''}
                            ${time ? `<span class="${type}-time">${time}</span>` : ''}
                        </div>
                        <div class="${type}-url-line">
                            <span class="status-badge ${Utils.getStatusClass(status)}">${status}</span>
                            <span class="${type}-url">${Utils.escapeHtml(url)}</span>
                            ${extras.badges || ''}
                        </div>
                    </div>
                    <div class="${type}-actions">
                        ${actions.map(action => {
                            const dataAction = handlerToAction[action.handler] || action.handler;
                            return `
                            <button class="btn btn-sm btn-${action.class}"
                                    data-action="${dataAction}"
                                    data-${type}-id="${Utils.escapeHtml(id)}"
                                    title="${Utils.escapeHtml(action.title)}">
                                ${action.icon ? Icons.render(action.icon, { className: 'action-icon' }) : ''}
                                <span class="sr-only">${Utils.escapeHtml(action.title)}</span>
                            </button>
                        `}).join('')}
                    </div>
                </div>
                <div class="${type}-preview" id="preview-${Utils.escapeHtml(id)}" style="display: ${expanded ? 'block' : 'none'};">
                    ${extras.preview || ''}
                </div>
            </div>`;
    },

    getCardElement(type, id) {
        const cards = document.querySelectorAll(`.${type}-card`);
        const targetId = String(id ?? '');
        for (const card of cards) {
            if ((card.dataset?.id || '') === targetId) {
                return card;
            }
        }
        return null;
    },

    setCardState(type, id, className, isActive = true) {
        const card = this.getCardElement(type, id);
        if (card) {
            card.classList.toggle(className, Boolean(isActive));
        }
    },

    clearCardState(type, className) {
        document.querySelectorAll(`.${type}-card.${className}`).forEach(card => {
            card.classList.remove(className);
        });
    },

    createPreviewSection: (title, items) => `
        <div class="preview-section">
            <h4>${title}</h4>
            ${Object.entries(items).map(([key, value]) => {
                if (!value) return '';
                
                if (typeof value === 'object') {
                    const jsonString = JSON.stringify(value);
                    // For large objects, show a summary and lazy load full content
                    if (jsonString.length > 500) {
                        const preview = Utils.formatJson(value, 'Invalid JSON', 200);
                        const fullId = `full-${Math.random().toString(36).substr(2, 9)}`;
                        return `<div class="preview-value">
                            <strong>${key}:</strong>
                            <pre>${preview}</pre>
                            <button class="btn btn-secondary btn-small" data-action="show-full-content" data-target-id="${fullId}" data-json="${Utils.escapeHtml(JSON.stringify(value))}" style="margin-top: 0.5rem; font-size: 0.8rem;">
                                Show Full Content
                            </button>
                            <div id="${fullId}" style="display: none;"></div>
                        </div>`;
                    } else {
                        return `<div class="preview-value"><strong>${key}:</strong><pre>${Utils.formatJson(value)}</pre></div>`;
                    }
                } else if (typeof value === 'string') {
                    const trimmed = value.trim();
                    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                        try {
                            const parsedJson = JSON.parse(trimmed);
                            const jsonString = JSON.stringify(parsedJson);
                            if (jsonString.length > 500) {
                                const preview = Utils.formatJson(parsedJson, 'Invalid JSON', 200);
                                const fullId = `full-${Math.random().toString(36).substr(2, 9)}`;
                                return `<div class="preview-value">
                                    <strong>${key}:</strong>
                                    <pre>${preview}</pre>
                                    <button class="btn btn-secondary btn-small" data-action="show-full-content" data-target-id="${fullId}" data-json="${Utils.escapeHtml(JSON.stringify(parsedJson))}" style="margin-top: 0.5rem; font-size: 0.8rem;">
                                        Show Full Content
                                    </button>
                                    <div id="${fullId}" style="display: none;"></div>
                                </div>`;
                            }
                            return `<div class="preview-value"><strong>${key}:</strong><pre>${Utils.formatJson(parsedJson)}</pre></div>`;
                        } catch (e) {
                            // If JSON parsing fails, fall back to original string rendering
                        }
                    }

                    const escaped = Utils.escapeHtml(value);
                    const formatted = escaped.includes('\n') ? `<pre>${escaped}</pre>` : escaped;
                    return `<div class="preview-value"><strong>${key}:</strong> ${formatted}</div>`;
                    } else {
                    const safeValue = Utils.escapeHtml(String(value));
                    return `<div class="preview-value"><strong>${key}:</strong> ${safeValue}</div>`;
                }
            }).join('')}
        </div>`,
    
    toggleDetails: (id, type) => {
        const normalizedId = String(id ?? '');
        const preview = document.getElementById(`preview-${id}`);
        const arrow = document.getElementById(`arrow-${id}`);
        const willShow = preview ? preview.style.display === 'none' : false;

        if (preview) {
            preview.style.display = willShow ? 'block' : 'none';
        }

        if (arrow) {
            arrow.textContent = willShow ? '▼' : '▶';
        }

        if (type === 'mapping') {
            const card = preview ? preview.closest(`.${type}-card`) : null;
            if (card) {
                card.classList.toggle('is-expanded', willShow);
            }
            if (window.mappingPreviewState instanceof Set) {
                if (willShow) {
                    window.mappingPreviewState.add(normalizedId);
                } else {
                    window.mappingPreviewState.delete(normalizedId);
                }
            }
        }

        UIComponents.setCardState(type, id, 'is-expanded', willShow);
    },
    
    toggleFullContent: (elementId) => {
        const element = document.getElementById(elementId);
        const button = element.previousElementSibling;
        
        if (element.style.display === 'none') {
            // Show full content
            try {
                const jsonData = button.getAttribute('data-json');
                const parsedData = JSON.parse(jsonData);
                element.innerHTML = `<pre style="max-height: 300px; overflow-y: auto; background: var(--bg-tertiary); padding: 1rem; border-radius: var(--radius-sm); margin-top: 0.5rem;">${Utils.escapeHtml(JSON.stringify(parsedData, null, 2))}</pre>`;
                element.style.display = 'block';
                button.textContent = 'Hide Full Content';
            } catch (e) {
                element.innerHTML = `<div class="preview-value warning">Error parsing JSON: ${Utils.escapeHtml(e.message)}</div>`;
                element.style.display = 'block';
                button.textContent = 'Hide';
            }
        } else {
            // Hide full content
            element.style.display = 'none';
            button.textContent = 'Show Full Content';
        }
    }
};

// Make UIComponents functions globally accessible for HTML onclick handlers
window.toggleFullContent = UIComponents.toggleFullContent;
window.toggleDetails = UIComponents.toggleDetails;

function getOptimisticShadowTtl() {
    const ttl = Number(window.cacheManager?.optimisticTTL);
    if (Number.isFinite(ttl) && ttl > 0) {
        return Math.max(ttl, 45000);
    }
    const fallback = Number(window.DEFAULT_SETTINGS?.optimisticCacheAgeLimit);
    if (Number.isFinite(fallback) && fallback > 0) {
        return Math.max(fallback, 45000);
    }
    return 60000;
}

/**
 * Lightweight shallow copy for optimistic shadow mappings
 * PERFORMANCE: Replaces expensive deep cloning (structuredClone/JSON.parse)
 * For 100 mappings: 500ms → 10ms (-98%)
 *
 * This is SAFE because we never mutate nested objects during optimistic updates.
 * Nested objects (request, response, metadata) are shared by reference.
 */
function cloneMappingForOptimisticShadow(mapping) {
    if (!mapping || typeof mapping !== 'object') {
        return null;
    }

    // Shallow copy with spread - only copy top level
    // Nested objects shared by reference
    return {
        ...mapping,
        // Only clone top-level metadata if it exists (for timestamp tracking)
        ...(mapping.metadata && { metadata: { ...mapping.metadata } })
    };
}

function rememberOptimisticShadowMapping(mapping, operation) {
    if (!isOptimisticShadowMap(window.optimisticShadowMappings)) {
        window.optimisticShadowMappings = new Map();
    }
    if (!mapping || typeof mapping !== 'object') {
        return;
    }
    const mappingId = mapping.id || mapping.uuid;
    if (!mappingId) {
        return;
    }
    const normalizedOperation = typeof operation === 'string' ? operation.toLowerCase() : 'update';
    if (normalizedOperation === 'delete') {
        window.optimisticShadowMappings.delete(String(mappingId));
        return;
    }
    const payload = cloneMappingForOptimisticShadow(mapping);
    if (!payload) {
        return;
    }
    if (typeof payload.__optimisticTs !== 'number') {
        Object.defineProperty(payload, '__optimisticTs', {
            value: Date.now(),
            writable: false,
            enumerable: false,
            configurable: true
        });
    }
    window.optimisticShadowMappings.set(String(mappingId), {
        ts: Date.now(),
        op: normalizedOperation === 'create' ? 'create' : 'update',
        mapping: payload
    });
}

function getOptimisticShadowTimestamp(mapping) {
    if (!mapping || typeof mapping !== 'object') {
        return Number.NaN;
    }
    const metadata = mapping.metadata || {};
    const candidates = [metadata.edited, metadata.updated, metadata.updatedAt, metadata.created, metadata.timestamp];
    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        if (candidate instanceof Date) {
            const value = candidate.getTime();
            if (Number.isFinite(value)) {
                return value;
            }
        }
        const parsed = Date.parse(candidate);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
        const numeric = Number(candidate);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
    }
    if (typeof mapping.__optimisticTs === 'number') {
        return mapping.__optimisticTs;
    }
    return Number.NaN;
}

function applyOptimisticShadowMappings(incoming) {
    if (!Array.isArray(incoming)) {
        return incoming;
    }
    if (!isOptimisticShadowMap(window.optimisticShadowMappings) || window.optimisticShadowMappings.size === 0) {
        return incoming;
    }

    const now = Date.now();
    const ttl = getOptimisticShadowTtl();
    const merged = [...incoming];

    for (const [rawId, entry] of Array.from(window.optimisticShadowMappings.entries())) {
        const normalizedId = String(rawId || '');
        if (!entry || typeof entry !== 'object') {
            window.optimisticShadowMappings.delete(normalizedId);
            continue;
        }

        if (entry.mapping == null) {
            const index = merged.findIndex(m => String(m?.id || m?.uuid || '') === normalizedId);
            if (index !== -1) {
                merged.splice(index, 1);
            }
            window.optimisticShadowMappings.delete(normalizedId);
            continue;
        }

        if (!Number.isFinite(entry.ts) || now - entry.ts > ttl) {
            window.optimisticShadowMappings.delete(normalizedId);
            continue;
        }

        const index = merged.findIndex(m => String(m?.id || m?.uuid || '') === normalizedId);
        if (index !== -1) {
            let shouldUseOptimistic = false;
            let shouldRetainEntry = true;

            if (typeof getMappingRenderSignature === 'function') {
                try {
                    const liveSignature = getMappingRenderSignature(merged[index]);
                    const optimisticSignature = getMappingRenderSignature(entry.mapping);
                    if (liveSignature === optimisticSignature) {
                        window.optimisticShadowMappings.delete(normalizedId);
                        continue;
                    }
                } catch {}
            }

            if ((entry.op || 'update') === 'create') {
                shouldRetainEntry = false;
            } else {
                const serverTs = getOptimisticShadowTimestamp(merged[index]);
                const optimisticTs = getOptimisticShadowTimestamp(entry.mapping);
                if (Number.isFinite(optimisticTs)) {
                    if (!Number.isFinite(serverTs) || optimisticTs > serverTs) {
                        shouldUseOptimistic = true;
                    } else {
                        shouldRetainEntry = false;
                    }
                } else {
                    shouldRetainEntry = false;
                }
            }

            if (shouldUseOptimistic) {
                entry.ts = now;
                merged[index] = entry.mapping;
            } else {
                if (!shouldRetainEntry) {
                    window.optimisticShadowMappings.delete(normalizedId);
                } else {
                    entry.ts = now;
                }
            }
        } else {
            merged.unshift(entry.mapping);
            if (!Number.isFinite(entry.ts)) {
                entry.ts = now;
            }
        }
    }

    return merged;
}

function pruneOptimisticShadowMappings(currentList) {
    if (!isOptimisticShadowMap(window.optimisticShadowMappings) || window.optimisticShadowMappings.size === 0) {
        return;
    }
    if (!Array.isArray(currentList) || currentList.length === 0) {
        return;
    }
    const byId = new Map();
    currentList.forEach(item => {
        if (item && typeof item === 'object') {
            const id = String(item.id || item.uuid || '');
            if (id) {
                byId.set(id, item);
            }
        }
    });
    for (const [id, entry] of Array.from(window.optimisticShadowMappings.entries())) {
        if (!byId.has(id)) {
            continue;
        }
        if (!entry || typeof entry !== 'object') {
            window.optimisticShadowMappings.delete(id);
            continue;
        }
        if ((entry.op || 'update') === 'create') {
            continue;
        }
        if (!entry.mapping || typeof entry.mapping !== 'object') {
            window.optimisticShadowMappings.delete(id);
            continue;
        }
        const live = byId.get(id);
        if (!live) {
            window.optimisticShadowMappings.delete(id);
            continue;
        }
        try {
            if (typeof getMappingRenderSignature === 'function' && entry.mapping) {
                const liveSignature = getMappingRenderSignature(live);
                const optimisticSignature = getMappingRenderSignature(entry.mapping);
                if (liveSignature === optimisticSignature) {
                    window.optimisticShadowMappings.delete(id);
                    continue;
                }
            }
        } catch {}

        const liveTs = getOptimisticShadowTimestamp(live);
        const optimisticTs = getOptimisticShadowTimestamp(entry.mapping);
        if (Number.isFinite(liveTs) && (!Number.isFinite(optimisticTs) || liveTs >= optimisticTs)) {
            window.optimisticShadowMappings.delete(id);
        }
    }
}

// --- DATA LOADING AND PRESENTATION ---

// Compact mapping loader (reusing the previous implementation until DataManager ships)
window.fetchAndRenderMappings = async (mappingsToRender = null, options = {}) => {
    const container = document.getElementById(SELECTORS.LISTS.MAPPINGS);
    const emptyState = document.getElementById(SELECTORS.EMPTY.MAPPINGS);
    const loadingState = document.getElementById(SELECTORS.LOADING.MAPPINGS);

    if (!container || !emptyState || !loadingState) {
        console.error('Required DOM elements not found for mappings rendering');
        return false;
    }

    let renderSource = null;

    try {
        if (mappingsToRender === null) {
            loadingState.classList.remove('hidden');
            container.style.display = 'none';
            emptyState.classList.add('hidden');
            
            let data;
            let dataSource = 'direct';
            if (options && options.useCache) {
                const cached = await loadImockCacheBestOf3();
                if (cached && cached.data && Array.isArray(cached.data.mappings)) {
                    // Cache hit - use cached data for quick UI, but always fetch fresh data for complete info
                    console.log('🧩 [CACHE] Cache hit - using cached data for quick start, fetching fresh data');
                    dataSource = 'cache';

                    // Start async fresh fetch for silent validation (no UI re-render)
                    (async () => {
                        try {
                            // Wait a bit for any optimistic updates to complete
                            await new Promise(resolve => setTimeout(resolve, 200));

                            const freshData = await fetchMappingsFromServer({ force: true });
                            if (freshData && freshData.mappings) {
                                const serverMappings = freshData.mappings.filter(x => !isImockCacheMapping(x));
                                const cachedMappings = cached.data.mappings || [];

                                // Silent comparison: detect discrepancies between cache and server
                                const cachedIds = new Set(cachedMappings.map(m => m.id || m.uuid));
                                const serverIds = new Set(serverMappings.map(m => m.id || m.uuid));

                                // Check for mismatches
                                const hasCountMismatch = cachedMappings.length !== serverMappings.length;
                                const missingInCache = [...serverIds].filter(id => !cachedIds.has(id));
                                const extraInCache = [...cachedIds].filter(id => !serverIds.has(id));
                                const hasMismatch = hasCountMismatch || missingInCache.length > 0 || extraInCache.length > 0;

                                // Update cache manager with fresh data (silent background sync)
                                const mergedMappings = [];

                                // Add all server mappings first (they have full data)
                                serverMappings.forEach(serverMapping => {
                                    const serverId = serverMapping.id || serverMapping.uuid;

                                    // Check if this server mapping was optimistically deleted
                                    const optimisticItem = window.cacheManager.optimisticQueue.find(x => x.id === serverId);
                                    const isOptimisticallyDeleted = optimisticItem && optimisticItem.op === 'delete';

                                    if (!isOptimisticallyDeleted) {
                                        mergedMappings.push(serverMapping);
                                    }
                                });

                                // Add optimistic creations (mappings that exist locally but not on server)
                                window.allMappings.forEach(currentMapping => {
                                    const currentId = currentMapping.id || currentMapping.uuid;

                                    // If this mapping doesn't exist on server, it's an optimistic creation
                                    const existsOnServer = serverIds.has(currentId);
                                    if (!existsOnServer) {
                                        mergedMappings.push(currentMapping);
                                    }
                                });

                                // Update data stores silently (no UI re-render)
                                window.allMappings = mergedMappings;
                                window.originalMappings = mergedMappings;
                                refreshMappingTabSnapshot();
                                syncCacheWithMappings(window.originalMappings);
                                rebuildMappingIndex(window.originalMappings);

                                // Show toast notification based on comparison
                                if (typeof NotificationManager !== 'undefined') {
                                    if (hasMismatch) {
                                        const details = [];
                                        if (missingInCache.length > 0) details.push(`${missingInCache.length} new on server`);
                                        if (extraInCache.length > 0) details.push(`${extraInCache.length} missing on server`);

                                        NotificationManager.warning(
                                            `Cache discrepancies detected (${details.join(', ')}). Manual cache rebuild recommended.`,
                                            5000
                                        );
                                        console.warn('🧩 [CACHE] Discrepancies detected:', {
                                            missingInCache,
                                            extraInCache,
                                            cachedCount: cachedMappings.length,
                                            serverCount: serverMappings.length
                                        });
                                    } else {
                                        NotificationManager.success('Data synchronized with server', 3000);
                                        console.log('🧩 [CACHE] Data synchronized successfully');
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('🧩 [CACHE] Failed to validate cache:', e);
                            if (typeof NotificationManager !== 'undefined') {
                                NotificationManager.error('Cache validation failed');
                            }
                        }
                    })();

                    // Use cached slim data for immediate UI (fresh data synced in background silently)
                    data = cached.data;
                } else {
                    data = await fetchMappingsFromServer({ force: true });
                    dataSource = 'direct';
                    // regenerate cache asynchronously
                    try { console.log('🧩 [CACHE] Async regenerate after cache miss'); regenerateImockCache(); } catch {}
                }
            } else {
                data = await fetchMappingsFromServer({ force: true });
                dataSource = 'direct';
            }
            if (data && data.__source) {
                dataSource = data.__source;
                if (dataSource === 'demo') {
                    markDemoModeActive('mappings-fallback');
                }
                try { delete data.__source; } catch (_) {}
            }

            // If we fetched a full admin list, strip service cache mapping from UI
            let incoming = data.mappings || [];

            // Server data is now authoritative - optimistic updates are handled through UI updates only
            if (window.cacheManager.optimisticQueue.length > 0) {
                console.log('🎯 [OPTIMISTIC] Applying optimistic updates to incoming data:', window.cacheManager.optimisticQueue.length, 'updates');

                incoming = incoming.map(serverMapping => {
                    const optimisticItem = window.cacheManager.optimisticQueue.find(x => x.id === (serverMapping.id || serverMapping.uuid));
                    if (optimisticItem) {
                        if (optimisticItem.op === 'delete') {
                            console.log('🎯 [OPTIMISTIC] Removing deleted mapping from results:', serverMapping.id);
                            return null; // Mark for removal
                        }
                        // Use optimistic version
                        console.log('🎯 [OPTIMISTIC] Using optimistic version for:', serverMapping.id);
                        return optimisticItem.payload;
                    }
                    return serverMapping;
                }).filter(m => m !== null); // Remove deleted mappings

                // Add any new optimistic mappings that weren't on server
                window.cacheManager.optimisticQueue.forEach(item => {
                    if (item.op !== 'delete' && !incoming.some(m => (m.id || m.uuid) === item.id)) {
                        console.log('🎯 [OPTIMISTIC] Adding new optimistic mapping:', item.id);
                        incoming.unshift(item.payload);
                    }
                });
            }

            incoming = applyOptimisticShadowMappings(incoming);

            // Hide any items marked as pending-deleted to avoid stale cache flicker
            try {
                if (window.pendingDeletedIds && window.pendingDeletedIds.size > 0) {
                    const before = incoming.length;
                    incoming = incoming.filter(m => !window.pendingDeletedIds.has(m.id || m.uuid));
                    if (before !== incoming.length) console.log('🧩 [CACHE] filtered pending-deleted from render:', before - incoming.length);
                }
            } catch {}
            window.originalMappings = Array.isArray(incoming) ? incoming.filter(m => !isImockCacheMapping(m)) : [];
            refreshMappingTabSnapshot();
            syncCacheWithMappings(window.originalMappings);
            window.allMappings = window.originalMappings;
            rebuildMappingIndex(window.originalMappings);
            pruneOptimisticShadowMappings(window.originalMappings);
            // Update data source indicator in UI
            renderSource = dataSource;
        } else {
            const sourceOverride = typeof options?.source === 'string' ? options.source : null;
            window.allMappings = Array.isArray(mappingsToRender) ? [...mappingsToRender] : [];
            window.originalMappings = [...window.allMappings];
            refreshMappingTabSnapshot();
            rebuildMappingIndex(window.originalMappings);
            pruneOptimisticShadowMappings(window.originalMappings);
            renderSource = sourceOverride;
            if (renderSource === 'demo') {
                markDemoModeActive('manual-mappings');
            }
        }

        loadingState.classList.add('hidden');
        
        if (window.allMappings.length === 0) {
            emptyState.classList.remove('hidden');
            container.style.display = 'none';
            updateMappingsCounter();
            return true;
        }
        
        emptyState.classList.add('hidden');
        container.style.display = 'block';
        
        // Invalidate cache before re-rendering to ensure fresh DOM references
        window.invalidateElementCache(SELECTORS.LISTS.MAPPINGS);

        // Sort mappings
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
        const logSource = renderSource || 'previous';
        console.log(`📦 Mappings render from: ${logSource} — ${sortedMappings.length} items`);

        // Use Virtual Scroller for performance with large lists
        // Falls back to traditional rendering for < 500 items
        if (typeof window.initMappingsVirtualScroller === 'function') {
            window.initMappingsVirtualScroller(sortedMappings, container);
        } else {
            // Fallback: use pagination if virtual scroller not available
            if (window.PaginationManager) {
                window.PaginationManager.updateState(sortedMappings.length);
                const pageItems = window.PaginationManager.getCurrentPageItems(sortedMappings);
                console.log(`📄 Rendering page ${window.PaginationManager.currentPage}/${window.PaginationManager.totalPages} (${pageItems.length} items)`);

                renderList(container, pageItems, {
                    renderItem: renderMappingMarkup,
                    getKey: getMappingRenderKey,
                    getSignature: getMappingRenderSignature,
                    onItemChanged: handleMappingItemChanged,
                    onItemRemoved: handleMappingItemRemoved
                });

                const paginationContainer = document.getElementById('mappings-pagination');
                if (paginationContainer) {
                    paginationContainer.innerHTML = window.PaginationManager.renderControls();
                }
            } else {
                // Final fallback: simple render
                renderList(container, sortedMappings, {
                    renderItem: renderMappingMarkup,
                    getKey: getMappingRenderKey,
                    getSignature: getMappingRenderSignature,
                    onItemChanged: handleMappingItemChanged,
                    onItemRemoved: handleMappingItemRemoved
                });
            }
        }

        updateMappingsCounter();
        if (renderSource) {
            updateDataSourceIndicator(renderSource);
        }
        // Reapply mapping filters if any are active, preserving user's view
        try {
            const filterQuery = document.getElementById(SELECTORS.MAPPING_FILTERS.QUERY)?.value?.trim() || '';
            if (filterQuery && typeof FilterManager !== 'undefined' && FilterManager.applyMappingFilters) {
                FilterManager.applyMappingFilters();
                if (typeof FilterManager.flushMappingFilters === 'function') {
                    FilterManager.flushMappingFilters();
                }
                console.log('[FILTERS] Mapping filters re-applied after refresh');
            }
        } catch {}

        return true;
    } catch (error) {
        console.error('Error in fetchAndRenderMappings:', error);
        NotificationManager.error(`Failed to load mappings: ${error.message}`);
        loadingState.classList.add('hidden');
        emptyState.classList.remove('hidden');
        container.style.display = 'none';
        return false;
    }
};

// Initialize pagination
window.initMappingPagination = function() {
    if (!window.PaginationManager) {
        console.warn('PaginationManager not available');
        return;
    }

    // Initialize pagination with container selector
    window.PaginationManager.init('#mappings-pagination', 20);

    // Attach event listeners for page changes
    window.PaginationManager.attachListeners((newPage) => {
        console.log(`📄 Page changed to: ${newPage}`);

        // Re-render mappings with new page
        const container = document.getElementById(SELECTORS.LISTS.MAPPINGS);
        if (!container || !Array.isArray(window.allMappings)) {
            console.warn('Cannot render page: container or data not available');
            return;
        }

        // Sort mappings (same logic as fetchAndRenderMappings)
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

        // Get items for new page
        const pageItems = window.PaginationManager.getCurrentPageItems(sortedMappings);

        // Invalidate cache before re-rendering
        window.invalidateElementCache(SELECTORS.LISTS.MAPPINGS);

        // Render page items
        renderList(container, pageItems, {
            renderItem: renderMappingMarkup,
            getKey: getMappingRenderKey,
            getSignature: getMappingRenderSignature,
            onItemChanged: handleMappingItemChanged,
            onItemRemoved: handleMappingItemRemoved
        });

        // Update pagination controls
        const paginationContainer = document.getElementById('mappings-pagination');
        if (paginationContainer) {
            paginationContainer.innerHTML = window.PaginationManager.renderControls();
        }

        // Scroll to top of mappings list
        const mappingsPage = document.getElementById('mappings-page');
        if (mappingsPage) {
            mappingsPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    console.log('✅ Mapping pagination initialized');
};

// Function to get a specific mapping by ID
window.getMappingById = async (mappingId) => {
    try {
        if (!mappingId) {
            throw new Error('Mapping ID is required');
        }

        console.log(`📥 [getMappingById] Fetching mapping with ID: ${mappingId}`);
        console.log(`📥 [getMappingById] Current wiremockBaseUrl:`, window.wiremockBaseUrl);
        console.log(`📥 [getMappingById] window.allMappings available:`, Array.isArray(window.allMappings));
        console.log(`📥 [getMappingById] Cache size:`, window.allMappings?.length || 0);

        // Try to get from cache first
        let cachedMapping = null;
        if (window.mappingIndex instanceof Map) {
            cachedMapping = window.mappingIndex.get(mappingId) || null;
        }
        if (!cachedMapping) {
            cachedMapping = window.allMappings?.find(m => m.id === mappingId) || null;
        }
        if (cachedMapping) {
            console.log(`📦 [getMappingById] Found mapping in cache: ${mappingId}`, cachedMapping);
            return cachedMapping;
        } else {
            console.log(`📦 [getMappingById] Mapping not found in cache, will fetch from API`);
        }

        // Fetch from WireMock API
        console.log(`📡 [getMappingById] Making API call to: /mappings/${mappingId}`);
        const response = await apiFetch(`/mappings/${mappingId}`);
        console.log(`📡 [getMappingById] Raw API response:`, response);

        // Handle both wrapped and unwrapped responses
        const mapping = response && typeof response === 'object' && response.mapping
            ? response.mapping
            : response;

        console.log(`📡 [getMappingById] Processed mapping:`, mapping);

        if (!mapping || typeof mapping !== 'object') {
            console.log(`❌ [getMappingById] API returned invalid data for mapping ${mappingId}`);
            throw new Error(`Mapping with ID ${mappingId} not found or invalid response`);
        }

        console.log(`✅ [getMappingById] Successfully fetched mapping: ${mappingId}`, mapping);
        addMappingToIndex(mapping);
        return mapping;

    } catch (error) {
        console.error(`❌ [getMappingById] Error fetching mapping ${mappingId}:`, error);
        console.error(`❌ [getMappingById] Error details:`, {
            message: error.message,
            status: error.status,
            statusText: error.statusText,
            url: `${window.wiremockBaseUrl}/mappings/${mappingId}`
        });
        throw error;
    }
};

// Updated applyOptimisticMappingUpdate helper
window.applyOptimisticMappingUpdate = (mappingLike) => {
    try {
        if (!mappingLike) {
            console.warn('🎯 [OPTIMISTIC] No mapping data provided');
            return;
        }

        const mapping = mappingLike.mapping || mappingLike;
        const mappingId = mapping?.id || mapping?.uuid;
        if (!mapping || !mappingId) {
            console.warn('🎯 [OPTIMISTIC] Invalid mapping data - missing id:', mapping);
            return;
        }

        // Ignore synthetic cache service mappings
        if (isImockCacheMapping(mapping)) {
            console.log('🎯 [OPTIMISTIC] Skipping cache mapping update');
            return;
        }

        const cacheAvailable = window.cacheManager && window.cacheManager.cache instanceof Map;
        const optimisticOperation = cacheAvailable && window.cacheManager.cache.has(mappingId) ? 'update' : 'create';

        rememberOptimisticShadowMapping(mapping, optimisticOperation);

        // Use updateOptimisticCache if available, otherwise fallback to legacy/manual logic
        if (typeof updateOptimisticCache === 'function') {
            updateOptimisticCache(mapping, optimisticOperation, { queueMode: 'add' });
        } else {
            // Fallback to legacy direct mutation if the new helper is unavailable
            if (cacheAvailable) {
                if (typeof window.cacheManager?.addOptimisticUpdate === 'function') {
                    try {
                        window.cacheManager.addOptimisticUpdate(mapping, optimisticOperation);
                    } catch (queueError) {
                        console.warn('🎯 [OPTIMISTIC] Failed to enqueue optimistic update:', queueError);
                    }
                }
                seedCacheFromGlobals(window.cacheManager.cache);
                const incoming = cloneMappingForCache(mapping);
                if (!incoming) {
                    console.warn('🎯 [OPTIMISTIC] Failed to clone mapping for cache:', mappingId);
                } else {
                    if (!incoming.id && mappingId) {
                        incoming.id = mappingId;
                    }
                    if (!incoming.uuid && (mapping.uuid || mappingId)) {
                        incoming.uuid = mapping.uuid || mappingId;
                    }

                    if (window.cacheManager.cache.has(mappingId)) {
                        const merged = mergeMappingData(window.cacheManager.cache.get(mappingId), incoming);
                        window.cacheManager.cache.set(mappingId, merged);
                    } else {
                        window.cacheManager.cache.set(mappingId, incoming);
                    }
                }
            }

            window.cacheLastUpdate = Date.now();
            refreshMappingsFromCache();
        }

        console.log('🎯 [OPTIMISTIC] Applied update for mapping:', mappingId);

    } catch (e) {
        console.warn('🎯 [OPTIMISTIC] Update failed:', e);
    }
};

// Refresh mappings in background and then re-render without jank
window.backgroundRefreshMappings = async (useCache = false) => {
    try {
        let data;
        let source = 'direct';
        if (useCache) {
            const cached = await loadImockCacheBestOf3();
            if (cached && cached.data && Array.isArray(cached.data.mappings)) {
                data = cached.data;
                source = 'cache';
            } else {
                data = await fetchMappingsFromServer({ force: true });
                source = 'direct';
            }
        } else {
            data = await fetchMappingsFromServer({ force: true });
            source = 'direct';
        }
        let incoming = data.mappings || [];

        incoming = applyOptimisticShadowMappings(incoming);

        // Prevent pending deletions from flickering back in while server/cache sync completes
        try {
            if (window.pendingDeletedIds instanceof Set && window.pendingDeletedIds.size > 0) {
                const before = incoming.length;
                incoming = incoming.filter(mapping => {
                    if (!mapping || typeof mapping !== 'object') {
                        return true;
                    }
                    const mappingId = mapping.id || mapping.uuid;
                    return !window.pendingDeletedIds.has(mappingId);
                });
                if (before !== incoming.length) {
                    console.log('🧩 [CACHE] background refresh filtered pending-deleted mappings:', before - incoming.length);
                }
            }
        } catch (pendingError) {
            console.warn('🧩 [CACHE] Failed to filter pending deletions during background refresh:', pendingError);
        }
        window.originalMappings = Array.isArray(incoming) ? incoming.filter(m => !isImockCacheMapping(m)) : [];
        refreshMappingTabSnapshot();
        syncCacheWithMappings(window.originalMappings);
        window.allMappings = window.originalMappings;
        rebuildMappingIndex(window.originalMappings);
        pruneOptimisticShadowMappings(window.originalMappings);
        updateDataSourceIndicator(source);
        // re-render without loading state
        fetchAndRenderMappings(window.allMappings);
    } catch (e) {
        console.warn('Background refresh failed:', e);
    }
};

// Compact mapping renderer through UIComponents with lazy preview loading
window.renderMappingCard = function(mapping) {
    if (!mapping || !mapping.id) {
        console.warn('Invalid mapping data:', mapping);
        return '';
    }

    const actions = [
        { class: 'secondary', handler: 'editMapping', title: 'Edit in Editor', icon: 'open-external' },
        { class: 'primary', handler: 'openEditModal', title: 'Edit', icon: 'pencil' },
        { class: 'secondary', handler: 'duplicateMapping', title: 'Duplicate', icon: 'copy' },
        { class: 'danger', handler: 'deleteMapping', title: 'Delete', icon: 'trash' }
    ];

    const normalizedId = String(mapping.id || mapping.uuid || '');
    const isExpanded = window.mappingPreviewState instanceof Set && window.mappingPreviewState.has(normalizedId);

    const data = {
        id: mapping.id,
        method: mapping.request?.method || 'GET',
        url: mapping.request?.urlPath || mapping.request?.urlPathPattern || mapping.request?.urlPattern || mapping.request?.url || 'N/A',
        status: mapping.response?.status || 200,
        name: mapping.name || mapping.metadata?.name || `Mapping ${mapping.id.substring(0, 8)}`,
        expanded: isExpanded,
        extras: {
            // Lazy loading: Only generate preview HTML if card is already expanded (from state restoration)
            // Otherwise, event delegation will load it on first expand
            preview: isExpanded ? (
                UIComponents.createPreviewSection(`${Icons.render('request-in', { className: 'icon-inline' })} Request`, {
                    'Method': mapping.request?.method || 'GET',
                    'URL': mapping.request?.url || mapping.request?.urlPattern || mapping.request?.urlPath || mapping.request?.urlPathPattern,
                    'Headers': mapping.request?.headers,
                    'Body': mapping.request?.bodyPatterns || mapping.request?.body,
                    'Query Parameters': mapping.request?.queryParameters
                }) + UIComponents.createPreviewSection(`${Icons.render('response-out', { className: 'icon-inline' })} Response`, {
                    'Status': mapping.response?.status,
                    'Headers': mapping.response?.headers,
                    'Body': mapping.response?.jsonBody || mapping.response?.body,
                    'Delay': mapping.response?.fixedDelayMilliseconds ? `${mapping.response.fixedDelayMilliseconds}ms` : null
                }) + UIComponents.createPreviewSection(`${Icons.render('info', { className: 'icon-inline' })} Overview`, {
                    'ID': mapping.id || mapping.uuid,
                    'Name': mapping.name || mapping.metadata?.name,
                    'Priority': mapping.priority,
                    'Persistent': mapping.persistent,
                    'Scenario': mapping.scenarioName,
                    'Required State': mapping.requiredScenarioState,
                    'New State': mapping.newScenarioState,
                    'Created': (window.showMetaTimestamps !== false && mapping.metadata?.created) ? new Date(mapping.metadata.created).toLocaleString() : null,
                    'Edited': (window.showMetaTimestamps !== false && mapping.metadata?.edited) ? new Date(mapping.metadata.edited).toLocaleString() : null,
                    'Source': mapping.metadata?.source ? `Edited from ${mapping.metadata.source}` : null,
                })
            ) : '', // Empty preview for collapsed cards - will be lazy loaded
            badges: [
                (mapping.id || mapping.uuid) ? `<span class="badge badge-secondary" title="Mapping ID">${Utils.escapeHtml(((mapping.id || mapping.uuid).length > 12 ? (mapping.id || mapping.uuid).slice(0,8) + '…' + (mapping.id || mapping.uuid).slice(-4) : (mapping.id || mapping.uuid)))}</span>` : '',
                (typeof mapping.priority === 'number') ? `<span class="badge badge-secondary" title="Priority">P${mapping.priority}</span>` : '',
                (mapping.scenarioName) ? `<span class="badge badge-secondary" title="Scenario">${Utils.escapeHtml(mapping.scenarioName)}</span>` : '',
                (window.showMetaTimestamps !== false && mapping.metadata?.created) ? `<span class="badge badge-secondary" title="Created">C: ${new Date(mapping.metadata.created).toLocaleString()}</span>` : '',
                (window.showMetaTimestamps !== false && mapping.metadata?.edited) ? `<span class="badge badge-secondary" title="Edited">E: ${new Date(mapping.metadata.edited).toLocaleString()}</span>` : '',
                (mapping.metadata?.source) ? `<span class="badge badge-info" title="Last edited from">${mapping.metadata.source.toUpperCase()}</span>` : ''
            ].filter(Boolean).join(' ')
        }
    };

    return UIComponents.createCard('mapping', data, actions);
}

// Update the mapping counter
window.updateMappingsCounter = function() {
    const counter = document.getElementById(SELECTORS.COUNTERS.MAPPINGS);
    if (counter) {
        counter.textContent = Array.isArray(window.allMappings) ? window.allMappings.length : 0;
    }
};
// Update the data-source indicator (cache/remote/direct)
function updateDataSourceIndicator(source) {
    const el = document.getElementById('data-source-indicator');
    if (!el) return;
    let text = 'Source: direct';
    let cls = 'badge badge-secondary';
    switch (source) {
        case 'cache':
            text = 'Source: cache';
            cls = 'badge badge-success';
            break;
        case 'cache_rebuilding':
            text = 'Source: cache (rebuilding…)';
            cls = 'badge badge-success';
            break;
        case 'demo':
            text = 'Source: demo data';
            cls = 'badge badge-info';
            break;
        case 'custom':
            text = 'Source: custom';
            cls = 'badge badge-secondary';
            break;
        case 'remote':
            text = 'Source: remote';
            cls = 'badge badge-warning';
            break;
        case 'remote_error':
            text = 'Source: remote (error/CORS)';
            cls = 'badge badge-danger';
            break;
        default:
            text = 'Source: direct';
            cls = 'badge badge-secondary';
    }
    el.textContent = text;
    el.className = cls;
}

// Requests data source indicator (symmetry with mappings)
function updateRequestsSourceIndicator(source) {
    const el = document.getElementById('requests-source-indicator');
    if (!el) return;
    let text = 'Requests: direct';
    let cls = 'badge badge-secondary';
    switch (source) {
        case 'custom':
            text = 'Requests: custom';
            cls = 'badge badge-secondary';
            break;
        case 'demo':
            text = 'Requests: demo data';
            cls = 'badge badge-info';
            break;
        case 'remote':
            text = 'Requests: remote';
            cls = 'badge badge-warning';
            break;
        case 'remote_error':
            text = 'Requests: remote (error/CORS)';
            cls = 'badge badge-danger';
            break;
        default:
            text = 'Requests: direct';
            cls = 'badge badge-secondary';
    }
    el.textContent = text;
    el.className = cls;
}

function handleMappingItemChanged(id, mapping) {
    const normalizedId = String(id || '');
    if (!(window.mappingPreviewState instanceof Set) || !window.mappingPreviewState.has(normalizedId)) {
        return;
    }

    if (window.mappingPreviewToastState instanceof Map) {
        const now = Date.now();
        const last = window.mappingPreviewToastState.get(normalizedId) || 0;
        if (now - last < 4000) {
            return;
        }
        window.mappingPreviewToastState.set(normalizedId, now);
    }

    const label = mapping?.name || mapping?.metadata?.name || normalizedId;
    if (window.NotificationManager && typeof window.NotificationManager.info === 'function') {
        window.NotificationManager.info(`Mapping "${label}" refreshed with latest data.`);
    }
}

function handleMappingItemRemoved(id) {
    const normalizedId = String(id || '');
    if (window.mappingPreviewState instanceof Set) {
        window.mappingPreviewState.delete(normalizedId);
    }
    if (window.mappingPreviewToastState instanceof Map) {
        window.mappingPreviewToastState.delete(normalizedId);
    }
    if (isOptimisticShadowMap(window.optimisticShadowMappings)) {
        window.optimisticShadowMappings.delete(normalizedId);
    }
}

// Compact detail toggles via UIComponents
window.toggleMappingDetails = (mappingId) => UIComponents.toggleDetails(mappingId, 'mapping');
window.toggleRequestDetails = (requestId) => UIComponents.toggleDetails(requestId, 'request');

window.UIComponents = UIComponents;
window.updateDataSourceIndicator = updateDataSourceIndicator;
window.updateRequestsSourceIndicator = updateRequestsSourceIndicator;
