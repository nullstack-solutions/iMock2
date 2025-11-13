// ===== EDITOR.JS - Mapping Editor Functionality =====
// Centralized editor logic for both add and edit mapping workflows with JSON mode support

// Current editor state (JSON mode only - form editor removed as dead code)
let editorState = {
    originalMapping: null,
    currentMapping: null,
    isDirty: false
};

// Initialize editor functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set up event listeners for mapping forms
    setupMappingFormListeners();
    // Set up JSON editor mode handlers (keyboard shortcuts, JSON Studio button)
    setupEditorModeHandlers();
});

/**
 * Set up event listeners for mapping forms
 */
function setupMappingFormListeners() {
    // Add mapping form (simpler form for creating new mappings)
    const addMappingForm = document.getElementById('mapping-form');
    if (addMappingForm) {
        addMappingForm.addEventListener('submit', handleAddMappingSubmit);
    }

    // Edit mapping form (more comprehensive form for editing existing mappings)
    const editMappingForm = document.getElementById('edit-mapping-form');
    if (editMappingForm) {
        editMappingForm.addEventListener('submit', handleEditMappingSubmit);
    }
}

/**
 * Set up editor mode handlers
 */
function setupEditorModeHandlers() {

    // JSON Studio button handler
    const jsonStudioBtn = document.getElementById('open-json-studio-btn');
    if (jsonStudioBtn) {
        jsonStudioBtn.addEventListener('click', () => {
            const id = editorState.currentMapping?.id;
            if (id && typeof window.editMapping === 'function') {
                hideModal('edit-mapping-modal');
                window.editMapping(id); // Opens JSON Studio in new tab
            } else {
                NotificationManager.warning('No mapping loaded');
            }
        });
    }

    // Keyboard shortcuts for edit modal
    document.addEventListener('keydown', (e) => {
        // Check if modal is open
        const modal = document.getElementById('edit-mapping-modal');
        if (!modal || modal.classList.contains('hidden')) return;

        // Ctrl/Cmd + S = Save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            updateMapping();
            return;
        }

        // Ctrl/Cmd + Enter = Save and close
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            updateMapping().then(() => {
                hideModal('edit-mapping-modal');
            });
            return;
        }

        // Esc = Close (with dirty check)
        if (e.key === 'Escape') {
            if (editorState.isDirty) {
                if (confirm('You have unsaved changes. Close anyway?')) {
                    hideModal('edit-mapping-modal');
                }
            } else {
                hideModal('edit-mapping-modal');
            }
            return;
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target.matches('[data-action="validate-json"]')) {
            validateCurrentJSON();
        }

        if (e.target.matches('[data-action="format-json"]')) {
            formatCurrentJSON();
        }

        if (e.target.matches('[data-action="minify-json"]')) {
            minifyCurrentJSON();
        }
    });

    // Auto-save on input changes with throttling for performance
    let dirtyIndicatorTimeout = null;
    document.addEventListener('input', (e) => {
        if (e.target.id === 'json-editor') {
            const wasClean = !editorState.isDirty;
            editorState.isDirty = true;

            // Only update indicator if state changed or after throttle delay
            if (wasClean) {
                updateDirtyIndicator();
            } else {
                // Throttle subsequent updates to avoid DOM thrashing
                if (dirtyIndicatorTimeout) {
                    clearTimeout(dirtyIndicatorTimeout);
                }
                dirtyIndicatorTimeout = setTimeout(() => {
                    updateDirtyIndicator();
                    dirtyIndicatorTimeout = null;
                }, 300);
            }
        }
    });
}

function setButtonLoadingState(button, isLoading, loadingLabel) {
    if (!button) return;

    const labelEl = button.querySelector('.btn-label');
    if (isLoading) {
        button.classList.add('is-loading');
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');

        if (labelEl) {
            if (!labelEl.dataset.originalText) {
                labelEl.dataset.originalText = labelEl.textContent;
            }
            if (loadingLabel) {
                labelEl.textContent = loadingLabel;
            }
        }

    } else {
        button.classList.remove('is-loading');
        button.disabled = false;
        button.removeAttribute('aria-busy');

        if (labelEl && labelEl.dataset.originalText) {
            labelEl.textContent = labelEl.dataset.originalText;
            delete labelEl.dataset.originalText;
        }

    }
}

window.setMappingEditorBusyState = (isLoading, loadingLabel) => {
    const updateButton = document.getElementById('update-mapping-btn');
    if (!updateButton) return;
    setButtonLoadingState(updateButton, isLoading, loadingLabel);
};

/**
 * Handle submission of the add mapping form
 */
async function handleAddMappingSubmit(e) {
    e.preventDefault();
    await saveMapping();
}

/**
 * Handle submission of the edit mapping form
 */
async function handleEditMappingSubmit(e) {
    e.preventDefault();
    await updateMapping();
}

/**
 * Save a new mapping or update an existing one through the add mapping form
 */
async function saveMapping() {
    console.log('saveMapping called');
    
    const form = document.getElementById('mapping-form');
    const idElement = document.getElementById('mapping-id');
    
    if (!form) {
        console.error('Form not found: mapping-form');
        NotificationManager.error('Mapping creation form not found');
        return;
    }
    
    const id = idElement ? idElement.value : null;
    console.log('Mapping ID:', id);
    
    // Collect data from the form
    const mappingData = {
        name: document.getElementById('mapping-name')?.value || 'Unnamed Mapping',
        request: {
            method: document.getElementById('method').value,
            urlPath: document.getElementById('url-pattern').value
        },
        response: {
            status: parseInt(document.getElementById('response-status').value),
            body: document.getElementById('response-body').value
        }
    };
    
    try {
        if (id) {
            // Update existing mapping
            // Ensure metadata with timestamps and source
            (function(){
                try {
                    const nowIso = new Date().toISOString();
                    if (typeof mappingData === 'object' && mappingData) {
                        // Initialize metadata object if it doesn't exist
                        if (!mappingData.metadata) {
                            mappingData.metadata = {};
                            console.log('📅 [METADATA] Initialized metadata object (update)');
                        }

                        // Set created timestamp if not exists (first save)
                        if (!mappingData.metadata.created) {
                            mappingData.metadata.created = nowIso;
                            console.log('📅 [METADATA] Set created timestamp (UI):', mappingData.metadata.created);
                        }

                        // Always update edited timestamp and source
                        mappingData.metadata.edited = nowIso;
                        mappingData.metadata.source = 'ui';

                        console.log('📅 [METADATA] Updated edited timestamp (UI):', mappingData.metadata.edited);
                        console.log('📅 [METADATA] Set source: ui');
                    }
                } catch (e) {
                    console.warn('📅 [METADATA] Failed to update metadata:', e);
                }
            })();
            const response = await apiFetch(`/mappings/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mappingData)
            });
            const updatedMapping = response?.mapping || response;

            NotificationManager.success('Mapping updated!');

            // NEW SEQUENCE: API → Cache → UI (reuse same flow as create)
            try {
                if (updatedMapping) {
                    if (typeof updateOptimisticCache === 'function') {
                        updateOptimisticCache(updatedMapping, 'update');
                    } else if (typeof window.applyOptimisticMappingUpdate === 'function') {
                        window.applyOptimisticMappingUpdate(updatedMapping);
                    }
                } else {
                    console.warn('Update response missing mapping payload, skipping optimistic updates');
                }
            } catch (e) { console.warn('optimistic updates after inline update failed:', e); }
        } else {
            // Create new mapping
            // Ensure metadata with timestamps and source
            (function(){
                try {
                    const nowIso = new Date().toISOString();
                    if (typeof mappingData === 'object' && mappingData) {
                        // Initialize metadata object if it doesn't exist
                        if (!mappingData.metadata) {
                            mappingData.metadata = {};
                            console.log('📅 [METADATA] Initialized metadata object (create)');
                        }

                        // Set created timestamp (always for new mappings)
                        mappingData.metadata.created = nowIso;
                        mappingData.metadata.edited = nowIso;
                        mappingData.metadata.source = 'ui';

                        console.log('📅 [METADATA] Set created timestamp (UI):', mappingData.metadata.created);
                        console.log('📅 [METADATA] Set source: ui');
                    }
                } catch (e) {
                    console.warn('📅 [METADATA] Failed to update metadata:', e);
                }
            })();
            const response = await apiFetch('/mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mappingData)
            });
            const createdMapping = response?.mapping || response;
            NotificationManager.success('Mapping created!');

            // NEW SEQUENCE: API → Optimistic Cache → UI
            try {
                if (createdMapping && createdMapping.id) {
                    // Update cache and UI optimistically using the unified function
                    if (typeof updateOptimisticCache === 'function') {
                        updateOptimisticCache(createdMapping, 'create');
                    } else if (typeof window.applyOptimisticMappingUpdate === 'function') {
                        // Fallback if updateOptimisticCache is not available
                        window.applyOptimisticMappingUpdate(createdMapping);
                    }
                } else {
                    console.warn('Created mapping has no id, skipping optimistic updates');
                }
            } catch (e) { console.warn('optimistic updates after create failed:', e); }
        }
        
        hideModal('add-mapping-modal');
        // Optimistic cache update already done - no need for additional cache rebuild
        
        // Reapply filters after updating mappings
        const hasActiveFilters = document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value ||
                               document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value ||
                               document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value;
        
        if (hasActiveFilters) {
            FilterManager.applyMappingFilters();
        }
        
    } catch (e) {
        console.error('Error in saveMapping:', e);
        NotificationManager.error(`Save failed: ${e.message}`);
    }
}

/**
 * Update an existing mapping through the edit mapping form
 */
window.updateMapping = async () => {
    console.log('updateMapping called');

    try {
        window.setMappingEditorBusyState(true, 'Updating…');

        // Save current JSON state FIRST
        saveFromJSONMode();

        const mappingData = editorState.currentMapping;
        const id = mappingData?.id;

        if (!id) {
            NotificationManager.error('Mapping ID not found');
            return;
        }

        // Add metadata timestamps
        if (typeof mappingData === 'object' && mappingData) {
            const nowIso = new Date().toISOString();
            if (!mappingData.metadata) mappingData.metadata = {};
            if (!mappingData.metadata.created) mappingData.metadata.created = nowIso;
            mappingData.metadata.edited = nowIso;
            mappingData.metadata.source = 'ui';
        }

        const response = await apiFetch(`/mappings/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mappingData)
        });

        const updatedMapping = response?.mapping || response;
        NotificationManager.success('Mapping updated!');

        // Update cache and UI with server response
        if (updatedMapping) {
            updateOptimisticCache(updatedMapping, 'update');
        }

        editorState.isDirty = false;
        updateDirtyIndicator();
        hideModal('edit-mapping-modal');

        // Reapply filters if any are active
        const hasActiveFilters = document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value ||
                               document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value ||
                               document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value;

        if (hasActiveFilters) {
            FilterManager.applyMappingFilters();
        }

    } catch (e) {
        console.error('Error in updateMapping:', e);
        NotificationManager.error(`Update failed: ${e.message}`);
    } finally {
        window.setMappingEditorBusyState(false);
    }
};

/**
 * Populate the JSON editor with mapping data
 */
window.populateEditMappingForm = (mapping) => {
    console.log('🔵 [EDITOR DEBUG] populateEditMappingForm called');
    console.log('🔵 [EDITOR DEBUG] Incoming mapping ID:', mapping?.id);
    console.log('🔵 [EDITOR DEBUG] Incoming mapping name:', mapping?.name);

    // Always reset state when opening a new mapping
    editorState.originalMapping = mapping;
    editorState.currentMapping = mapping;
    editorState.isDirty = false;
    updateDirtyIndicator();

    console.log('🔵 [EDITOR DEBUG] After state update - currentMapping ID:', editorState.currentMapping?.id);

    // Load JSON mode (form editor removed as dead code)
    console.log('🔵 [EDITOR DEBUG] Loading JSON mode for mapping ID:', editorState.currentMapping?.id);
    loadJSONMode();

    console.log('🔵 [EDITOR DEBUG] populateEditMappingForm completed for mapping ID:', mapping?.id);
};

// ===== JSON EDITOR MODE FUNCTIONS =====

function saveFromJSONMode() {
    const jsonEditor = document.getElementById('json-editor');
    if (!jsonEditor) return;

    const jsonText = jsonEditor.value.trim();
    if (!jsonText) return;

    try {
        editorState.currentMapping = JSON.parse(jsonText);
    } catch (error) {
        throw new Error('Invalid JSON: ' + error.message);
    }
}

/**
 * Load JSON mode
 */
function loadJSONMode() {
    const jsonEditor = document.getElementById('json-editor');
    if (!jsonEditor) {
        console.log('🔴 [JSON DEBUG] JSON editor element not found!');
        return;
    }
    
    if (!editorState.currentMapping) {
        console.log('🔴 [JSON DEBUG] No currentMapping in editorState!');
        return;
    }
    
    const formattedJSON = JSON.stringify(editorState.currentMapping, null, 2);
    jsonEditor.value = formattedJSON;

    console.log('🟡 [JSON DEBUG] JSON editor populated with mapping ID:', editorState.currentMapping?.id);
    console.log('🟡 [JSON DEBUG] JSON content length:', formattedJSON.length);
}

/**
 * Validate current JSON
 */
function validateCurrentJSON() {
    const jsonEditor = document.getElementById('json-editor');
    const validationResult = document.getElementById('json-validation-result');
    
    if (!jsonEditor || !validationResult) return;
    
    const jsonText = jsonEditor.value;
    
    if (!jsonText.trim()) {
        validationResult.innerHTML = '<div class="validation-warning">JSON is empty</div>';
        return;
    }
    
    try {
        JSON.parse(jsonText);
        validationResult.innerHTML = '<div class="validation-success">✓ JSON is valid</div>';
    } catch (error) {
        validationResult.innerHTML = `<div class="validation-error">✗ JSON error: ${error.message}</div>`;
    }
}

/**
 * Format current JSON
 */
function formatCurrentJSON() {
    const jsonEditor = document.getElementById('json-editor');
    if (!jsonEditor) return;
    
    try {
        const parsed = JSON.parse(jsonEditor.value);
        jsonEditor.value = JSON.stringify(parsed, null, 2);
        showNotification('JSON formatted', 'success');
    } catch (error) {
        showNotification('Formatting failed: ' + error.message, 'error');
    }
}

/**
 * Minify current JSON
 */
function minifyCurrentJSON() {
    const jsonEditor = document.getElementById('json-editor');
    if (!jsonEditor) return;
    
    try {
        const parsed = JSON.parse(jsonEditor.value);
        jsonEditor.value = JSON.stringify(parsed);
        showNotification('JSON minified', 'success');
    } catch (error) {
        showNotification('Minification failed: ' + error.message, 'error');
    }
}

/**
 * Update dirty indicator
 */
function updateDirtyIndicator() {
    const indicator = document.getElementById('editor-dirty-indicator');
    if (indicator) {
        indicator.style.display = editorState.isDirty ? 'inline' : 'none';
    }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Try to use existing NotificationManager if available
    if (typeof NotificationManager !== 'undefined') {
        if (type === 'success') {
            NotificationManager.success(message);
        } else if (type === 'error') {
            NotificationManager.error(message);
        } else {
            NotificationManager.info(message);
        }
        return;
    }
    
    // Fallback to console log
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Wrapper function for HTML onclick handler
window.saveMappingWrapper = () => {
    saveMapping().catch(error => {
        NotificationManager.error('Save failed: ' + error.message);
    });
};
