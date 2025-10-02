'use strict';

const UIComponents = {
    // Base card component replacing renderMappingCard and renderRequestCard
    createCard: (type, data, actions = []) => {
        const { id, method, url, status, name, time, extras = {} } = data;
        return `
            <div class="${type}-card" data-id="${Utils.escapeHtml(id)}">
                <div class="${type}-header" onclick="window.toggleDetails('${Utils.escapeHtml(id)}', '${type}')">
                    <div class="${type}-info">
                        <div class="${type}-top-line">
                            <span class="method-badge ${method.toLowerCase()}">
                                <span class="collapse-arrow" id="arrow-${Utils.escapeHtml(id)}">▶</span> ${method}
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
                    <div class="${type}-actions" onclick="event.stopPropagation()">
                        ${actions.map(action => `
                            <button class="btn btn-sm btn-${action.class}"
                                    onclick="${action.handler}('${Utils.escapeHtml(id)}')"
                                    title="${Utils.escapeHtml(action.title)}">
                                ${action.icon ? Icons.render(action.icon, { className: 'action-icon' }) : ''}
                                <span class="sr-only">${Utils.escapeHtml(action.title)}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div class="${type}-preview" id="preview-${Utils.escapeHtml(id)}" style="display: none;">
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
                            <button class="btn btn-secondary btn-small" onclick="toggleFullContent('${fullId}')" data-json="${Utils.escapeHtml(JSON.stringify(value))}" style="margin-top: 0.5rem; font-size: 0.8rem;">
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
                                    <button class="btn btn-secondary btn-small" onclick="toggleFullContent('${fullId}')" data-json="${Utils.escapeHtml(JSON.stringify(parsedJson))}" style="margin-top: 0.5rem; font-size: 0.8rem;">
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
        const preview = document.getElementById(`preview-${id}`);
        const arrow = document.getElementById(`arrow-${id}`);
        const willShow = preview ? preview.style.display === 'none' : false;

        if (preview) {
            preview.style.display = willShow ? 'block' : 'none';
        }

        if (arrow) {
            arrow.textContent = willShow ? '▼' : '▶';
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

                    // Start async fresh fetch for complete data (only if no optimistic updates in progress)
                    (async () => {
                        try {
                            // Wait a bit for any optimistic updates to complete
                            await new Promise(resolve => setTimeout(resolve, 200));

                            const freshData = await fetchMappingsFromServer({ force: true });
                            if (freshData && freshData.mappings) {
                                const serverMappings = freshData.mappings.filter(x => !isImockCacheMapping(x));

                                // Create a map of current optimistic mappings for preservation
                                const currentIds = new Set(window.allMappings.map(m => m.id || m.uuid));
                                const serverIds = new Set(serverMappings.map(m => m.id || m.uuid));

                                // Merge strategy: combine server data with optimistic state
                                // 1. Start with all server mappings (authoritative source)
                                // 2. Update existing ones with full server data
                                // 3. Keep optimistic creations that aren't on server yet
                                // 4. Remove optimistic deletions

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

                                // Update with merged data
                                window.allMappings = mergedMappings;
                                window.originalMappings = mergedMappings;
                                refreshMappingTabSnapshot();
                                syncCacheWithMappings(window.originalMappings);
                                rebuildMappingIndex(window.originalMappings);

                                // Re-render UI with merged complete data
                                fetchAndRenderMappings(window.allMappings, { source: 'direct' });
                            }
                        } catch (e) {
                            console.warn('🧩 [CACHE] Failed to load fresh data:', e);
                        }
                    })();

                    // Use cached slim data for immediate UI (will be replaced by fresh data)
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
            // Update data source indicator in UI
            renderSource = dataSource;
        } else {
            const sourceOverride = typeof options?.source === 'string' ? options.source : null;
            window.allMappings = Array.isArray(mappingsToRender) ? [...mappingsToRender] : [];
            window.originalMappings = [...window.allMappings];
            refreshMappingTabSnapshot();
            rebuildMappingIndex(window.originalMappings);
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
        renderList(container, sortedMappings, {
            renderItem: renderMappingMarkup,
            getKey: getMappingRenderKey,
            getSignature: getMappingRenderSignature
        });
        updateMappingsCounter();
        if (renderSource) {
            updateDataSourceIndicator(renderSource);
        }
        // Reapply mapping filters if any are active, preserving user's view
        try {
            const hasFilters = (document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value || '')
                || (document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value || '')
                || (document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value || '');
            if (hasFilters && typeof FilterManager !== 'undefined' && FilterManager.applyMappingFilters) {
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
        const incoming = data.mappings || [];
        window.originalMappings = Array.isArray(incoming) ? incoming.filter(m => !isImockCacheMapping(m)) : [];
        refreshMappingTabSnapshot();
        syncCacheWithMappings(window.originalMappings);
        window.allMappings = window.originalMappings;
        rebuildMappingIndex(window.originalMappings);
        updateDataSourceIndicator(source);
        // re-render without loading state
        fetchAndRenderMappings(window.allMappings);
    } catch (e) {
        console.warn('Background refresh failed:', e);
    }
};

// Compact mapping renderer through UIComponents (shortened from ~67 to 15 lines)
window.renderMappingCard = function(mapping) {
    if (!mapping || !mapping.id) {
        console.warn('Invalid mapping data:', mapping);
        return '';
    }
    
    const actions = [
        { class: 'secondary', handler: 'editMapping', title: 'Edit in Editor', icon: 'open-external' },
        { class: 'primary', handler: 'openEditModal', title: 'Edit', icon: 'pencil' },
        { class: 'danger', handler: 'deleteMapping', title: 'Delete', icon: 'trash' }
    ];
    
    const data = {
        id: mapping.id,
        method: mapping.request?.method || 'GET',
        url: mapping.request?.urlPath || mapping.request?.urlPathPattern || mapping.request?.urlPattern || mapping.request?.url || 'N/A',
        status: mapping.response?.status || 200,
        name: mapping.name || mapping.metadata?.name || `Mapping ${mapping.id.substring(0, 8)}`,
        extras: {
            preview: UIComponents.createPreviewSection(`${Icons.render('request-in', { className: 'icon-inline' })} Request`, {
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
            ,
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
    updateMappingTabCounts();
};

function updateMappingTabCounts() {
    const counts = window.mappingTabTotals || computeMappingTabTotals(window.originalMappings);

    const mappingCountTargets = {
        all: document.getElementById('mapping-tab-all'),
        get: document.getElementById('mapping-tab-get'),
        post: document.getElementById('mapping-tab-post'),
        put: document.getElementById('mapping-tab-put'),
        patch: document.getElementById('mapping-tab-patch'),
        delete: document.getElementById('mapping-tab-delete')
    };

    Object.entries(mappingCountTargets).forEach(([key, element]) => {
        if (element) {
            element.textContent = counts?.[key] ?? 0;
        }
    });
}

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

// Compact detail toggles via UIComponents
window.toggleMappingDetails = (mappingId) => UIComponents.toggleDetails(mappingId, 'mapping');
window.toggleRequestDetails = (requestId) => UIComponents.toggleDetails(requestId, 'request');


window.UIComponents = UIComponents;
window.updateMappingTabCounts = updateMappingTabCounts;
window.updateDataSourceIndicator = updateDataSourceIndicator;
window.updateRequestsSourceIndicator = updateRequestsSourceIndicator;
