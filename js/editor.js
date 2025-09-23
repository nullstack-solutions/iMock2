// ===== EDITOR.JS - Mapping Editor Functionality =====
// Centralized editor logic for both add and edit mapping workflows with JSON mode support

// Editor modes
const EDITOR_MODES = {
    FORM: 'form',
    JSON: 'json'
};

// Current editor state
let editorState = {
    mode: EDITOR_MODES.JSON, // Default to JSON mode
    originalMapping: null,
    currentMapping: null,
    isDirty: false
};

// Initialize editor functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Set up event listeners for both forms
    setupMappingFormListeners();
    // Set up JSON editor mode handlers
    setupEditorModeHandlers();
    
    // Ensure JSON editor is visible and form is hidden on load
    const formEditor = document.getElementById('form-editor-container');
    const jsonEditor = document.getElementById('json-editor-container');
    if (formEditor && jsonEditor) {
        formEditor.style.display = 'none';
        jsonEditor.style.display = 'block';
    }
});

/**
 * Set up event listeners for both mapping forms
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
    // Show notification about form mode being temporarily disabled
    showNotification('Form mode is temporarily disabled due to bugs. Using JSON mode only.', 'warning');
    
    // Mode switcher buttons
    document.addEventListener('click', (e) => {
        if (e.target.matches('[data-editor-mode]')) {
            // Prevent switching to form mode
            if (e.target.dataset.editorMode === EDITOR_MODES.FORM) {
                showNotification('Form mode is temporarily disabled due to bugs. Please use JSON mode.', 'warning');
                return;
            }
            const mode = e.target.dataset.editorMode;
            switchEditorMode(mode);
        }
        
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
    
    // Auto-save on input changes
    document.addEventListener('input', (e) => {
        if (e.target.matches('.editor-field') || e.target.id === 'json-editor') {
            editorState.isDirty = true;
            updateDirtyIndicator();
        }
    });
}

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
        NotificationManager.error('Форма создания маппинга не найдена');
        return;
    }
    
    const id = idElement ? idElement.value : null;
    console.log('Mapping ID:', id);
    
    // Собираем данные из формы
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
            await apiFetch(`/mappings/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mappingData)
            });
            NotificationManager.success('Маппинг обновлен!');
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
            NotificationManager.success('Маппинг создан!');

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
        
        // Применяем фильтры после обновления мапингов
        const hasActiveFilters = document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value ||
                               document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value ||
                               document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value;
        
        if (hasActiveFilters) {
            FilterManager.applyMappingFilters();
        }
        
    } catch (e) {
        console.error('Error in saveMapping:', e);
        NotificationManager.error(`Ошибка сохранения: ${e.message}`);
    }
}

/**
 * Update an existing mapping through the edit mapping form
 */
window.updateMapping = async () => {
    console.log('updateMapping called');
    
    try {
        // Save current state based on active mode FIRST
        if (editorState.mode === EDITOR_MODES.JSON) {
            saveFromJSONMode();
        } else {
            saveFromFormMode();
        }

        const mappingData = editorState.currentMapping;
        const id = mappingData?.id;

        if (!id) {
            NotificationManager.error('ID маппинга не найден');
            return;
        }

        console.log('Sending mapping update:', mappingData);

        // Ensure metadata with timestamps and source AFTER getting final mappingData
        (function(){
            try {
                const nowIso = new Date().toISOString();
                if (typeof mappingData === 'object' && mappingData) {
                    // Initialize metadata object if it doesn't exist
                    if (!mappingData.metadata) {
                        mappingData.metadata = {};
                        console.log('📅 [METADATA] Initialized metadata object');
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

        // Use server response for optimistic updates - it contains the authoritative data
        const updatedMapping = response?.mapping || response;
        console.log('Mapping updated successfully, using server response for optimistic updates:', updatedMapping);

        NotificationManager.success('Маппинг обновлен!');

        // Update cache and UI with server response
        try {
            if (updatedMapping) {
                updateOptimisticCache(updatedMapping, 'update');
            }
        } catch (e) { console.warn('optimistic updates after edit failed:', e); }

        editorState.isDirty = false;
        updateDirtyIndicator();

        console.log('Hiding modal...');
        hideModal('edit-mapping-modal');

        // No more immediate cache rebuild - optimistic cache handles it
        
        // Применяем фильтры после обновления мапингов
        const hasActiveFilters = document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value ||
                               document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value ||
                               document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value;
        
        if (hasActiveFilters) {
            FilterManager.applyMappingFilters();
        }
        
        console.log('updateMapping completed successfully');
        
    } catch (e) {
        console.error('Error in updateMapping:', e);
        NotificationManager.error(`Ошибка обновления: ${e.message}`);
    }
};

/**
 * Populate the edit mapping form with data from a mapping
 */
window.populateEditMappingForm = (mapping) => {
    console.log('🔵 [EDITOR DEBUG] populateEditMappingForm called');
    console.log('🔵 [EDITOR DEBUG] Incoming mapping ID:', mapping?.id);
    console.log('🔵 [EDITOR DEBUG] Incoming mapping name:', mapping?.name);
    console.log('🔵 [EDITOR DEBUG] Current editor mode:', editorState.mode);
    console.log('🔵 [EDITOR DEBUG] Previous currentMapping ID:', editorState.currentMapping?.id);
    console.log('🔵 [EDITOR DEBUG] Full incoming mapping:', mapping);
    
    // Always reset state when opening a new mapping
    editorState.originalMapping = mapping;
    editorState.currentMapping = JSON.parse(JSON.stringify(mapping)); // Deep clone
    editorState.isDirty = false;
    updateDirtyIndicator();
    
    console.log('🔵 [EDITOR DEBUG] After state update - currentMapping ID:', editorState.currentMapping?.id);
    
    // Always populate form fields first (for consistency)
    populateFormFields(mapping);
    
    // Then load data based on current mode
    if (editorState.mode === EDITOR_MODES.JSON) {
        console.log('🔵 [EDITOR DEBUG] Loading JSON mode for mapping ID:', editorState.currentMapping?.id);
        loadJSONMode();
    }
    
    console.log('🔵 [EDITOR DEBUG] populateEditMappingForm completed for mapping ID:', mapping?.id);
};

/**
 * Populate form fields with mapping data
 */
function populateFormFields(mapping) {
    console.log('🟣 [FORM DEBUG] populateFormFields called');
    console.log('🟣 [FORM DEBUG] Mapping ID to populate:', mapping?.id);
    console.log('🟣 [FORM DEBUG] Mapping name to populate:', mapping?.name);
    
    // Always populate form fields regardless of mode (needed for both modes)
    const idElement = document.getElementById('edit-mapping-id');
    const methodElement = document.getElementById('edit-method');
    const urlPatternElement = document.getElementById('edit-url-pattern');
    const responseStatusElement = document.getElementById('edit-response-status');
    const responseDelayElement = document.getElementById('edit-response-delay');
    const requestHeadersElement = document.getElementById('edit-request-headers');
    const requestBodyElement = document.getElementById('edit-request-body');
    const responseHeadersElement = document.getElementById('edit-response-headers');
    const responseBodyElement = document.getElementById('edit-response-body');
    const priorityElement = document.getElementById('edit-mapping-priority');
    const scenarioElement = document.getElementById('edit-mapping-scenario');
    const mappingNameElement = document.getElementById('edit-mapping-name');
    
    // Clear all fields first
    if (idElement) idElement.value = '';
    if (methodElement) methodElement.value = 'GET';
    if (urlPatternElement) urlPatternElement.value = '';
    if (responseStatusElement) responseStatusElement.value = '200';
    if (responseDelayElement) responseDelayElement.value = '0';
    if (requestHeadersElement) requestHeadersElement.value = '';
    if (requestBodyElement) requestBodyElement.value = '';
    if (responseHeadersElement) responseHeadersElement.value = '';
    if (responseBodyElement) responseBodyElement.value = '';
    if (priorityElement) priorityElement.value = '1';
    if (scenarioElement) scenarioElement.value = '';
    if (mappingNameElement) mappingNameElement.value = '';
    
    // Then populate with new mapping data
    if (idElement) idElement.value = mapping.id || '';
    if (methodElement) methodElement.value = mapping.request?.method || 'GET';
    if (urlPatternElement) urlPatternElement.value = mapping.request?.urlPattern || mapping.request?.urlPath || '';
    
    // Заполняем заголовки запроса с оптимизацией
    if (requestHeadersElement && mapping.request?.headers) {
        const headersJson = JSON.stringify(mapping.request.headers, null, 2);
        requestHeadersElement.value = headersJson.length > 5000 ? 
            headersJson.substring(0, 5000) + '\n// ... (truncated for performance - switch to JSON mode for full view)' : 
            headersJson;
    }
    
    // Заполняем тело запроса с оптимизацией
    if (requestBodyElement && mapping.request?.bodyPatterns) {
        const bodyJson = JSON.stringify(mapping.request.bodyPatterns, null, 2);
        requestBodyElement.value = bodyJson.length > 5000 ? 
            bodyJson.substring(0, 5000) + '\n// ... (truncated for performance - switch to JSON mode for full view)' : 
            bodyJson;
    } else if (requestBodyElement && mapping.request?.body) {
        const body = mapping.request.body;
        requestBodyElement.value = typeof body === 'string' && body.length > 5000 ? 
            body.substring(0, 5000) + '\n// ... (truncated for performance - switch to JSON mode for full view)' : 
            body;
    }
    
    // Заполняем ответ
    if (responseStatusElement) responseStatusElement.value = mapping.response?.status || 200;
    if (responseDelayElement) responseDelayElement.value = mapping.response?.fixedDelayMilliseconds || 0;
    
    // Заполняем заголовки ответа с оптимизацией
    if (responseHeadersElement && mapping.response?.headers) {
        const headersJson = JSON.stringify(mapping.response.headers, null, 2);
        responseHeadersElement.value = headersJson.length > 5000 ? 
            headersJson.substring(0, 5000) + '\n// ... (truncated for performance - switch to JSON mode for full view)' : 
            headersJson;
    }
    
    // Заполняем тело ответа с оптимизацией
    if (responseBodyElement) {
        if (mapping.response?.body) {
            const body = mapping.response.body;
            responseBodyElement.value = typeof body === 'string' && body.length > 5000 ? 
                body.substring(0, 5000) + '\n// ... (truncated for performance - switch to JSON mode for full view)' : 
                body;
        } else if (mapping.response?.jsonBody) {
            const bodyJson = JSON.stringify(mapping.response.jsonBody, null, 2);
            responseBodyElement.value = bodyJson.length > 5000 ? 
                bodyJson.substring(0, 5000) + '\n// ... (truncated for performance - switch to JSON mode for full view)' : 
                bodyJson;
        }
    }
    
    // Заполняем расширенные поля
    if (priorityElement) priorityElement.value = mapping.priority || 1;
    if (scenarioElement) scenarioElement.value = mapping.scenarioName || '';
    if (mappingNameElement) mappingNameElement.value = mapping.name || mapping.metadata?.name || '';
}

// ===== JSON EDITOR MODE FUNCTIONS =====

/**
 * Switch editor mode
 */
function switchEditorMode(mode) {
    console.log('🟠 [MODE DEBUG] switchEditorMode called');
    console.log('🟠 [MODE DEBUG] Previous mode:', editorState.mode);
    console.log('🟠 [MODE DEBUG] New mode:', mode);
    console.log('🟠 [MODE DEBUG] Current mapping ID before switch:', editorState.currentMapping?.id);
    
    const previousMode = editorState.mode;
    
    try {
        // Always load JSON mode
        loadJSONMode();
        
        // Update UI
        updateEditorUI(mode);
        
        // Update mode indicator
        updateModeIndicator(mode);
        
        // Show notification about form mode being disabled
        showNotification('Form mode is temporarily disabled. Using JSON mode only.', 'warning');
        
    } catch (error) {
        console.error('Error in editor mode:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

/**
 * Update editor UI based on mode
 */
function updateEditorUI(mode) {
    const formContainer = document.getElementById('form-editor-container');
    const jsonContainer = document.getElementById('json-editor-container');
    
    // Hide all containers
    if (formContainer) formContainer.style.display = 'none';
    if (jsonContainer) jsonContainer.style.display = 'none';
    
    // Show relevant container
    switch (mode) {
        case EDITOR_MODES.FORM:
            if (formContainer) formContainer.style.display = 'block';
            break;
        case EDITOR_MODES.JSON:
            if (jsonContainer) jsonContainer.style.display = 'block';
            break;
    }
    
    // Update mode buttons
    document.querySelectorAll('[data-editor-mode]').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.editorMode === mode) {
            btn.classList.add('active');
        }
        // Disable form mode button
        if (btn.dataset.editorMode === EDITOR_MODES.FORM) {
            btn.disabled = true;
            btn.title = 'Form mode is temporarily disabled due to bugs';
        }
    });
}

function saveFromJSONMode() {
    console.log('🟢 [SAVE DEBUG] saveFromJSONMode called');
    
    const jsonEditor = document.getElementById('json-editor');
    if (!jsonEditor) {
        console.log('🔴 [SAVE DEBUG] JSON editor element not found!');
        return;
    }
    
    const jsonText = jsonEditor.value;
    if (!jsonText.trim()) {
        console.log('🟢 [SAVE DEBUG] JSON editor is empty, nothing to save');
        return;
    }
    
    console.log('🟢 [SAVE DEBUG] JSON text length:', jsonText.length);
    console.log('🟢 [SAVE DEBUG] Previous currentMapping ID:', editorState.currentMapping?.id);
    
    try {
        const parsedMapping = JSON.parse(jsonText);
        console.log('🟢 [SAVE DEBUG] Parsed mapping ID:', parsedMapping?.id);
        console.log('🟢 [SAVE DEBUG] Parsed mapping name:', parsedMapping?.name);
        
        editorState.currentMapping = parsedMapping;
        console.log('🟢 [SAVE DEBUG] Updated currentMapping ID:', editorState.currentMapping?.id);
    } catch (error) {
        console.log('🔴 [SAVE DEBUG] JSON parse error:', error.message);
        throw new Error('Некорректный JSON: ' + error.message);
    }
}

/**
 * Save data from form mode
 */
function saveFromFormMode() {
    const mapping = collectFormData();
    editorState.currentMapping = mapping;
}

/**
 * Load JSON mode
 */
function loadJSONMode() {
    console.log('🟡 [JSON DEBUG] loadJSONMode called');
    console.log('🟡 [JSON DEBUG] currentMapping ID:', editorState.currentMapping?.id);
    console.log('🟡 [JSON DEBUG] currentMapping name:', editorState.currentMapping?.name);
    
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
 * Load form mode
 */
function loadFormMode() {
    if (!editorState.currentMapping) return;
    populateEditMappingForm(editorState.currentMapping);
}

/**
 * Collect form data into mapping object
 */
function collectFormData() {
    const mapping = {
        id: document.getElementById('edit-mapping-id')?.value || '',
        name: document.getElementById('edit-mapping-name')?.value || '',
        request: {
            method: document.getElementById('edit-method')?.value || 'GET',
            urlPattern: document.getElementById('edit-url-pattern')?.value || ''
        },
        response: {
            status: parseInt(document.getElementById('edit-response-status')?.value) || 200
        }
    };

    // Preserve existing metadata if present
    if (editorState.currentMapping?.metadata) {
        mapping.metadata = { ...editorState.currentMapping.metadata };
        console.log('📅 [METADATA] Preserved existing metadata in collectFormData');
    }
    
    // Add optional fields
    const responseDelay = parseInt(document.getElementById('edit-response-delay')?.value) || 0;
    if (responseDelay > 0) {
        mapping.response.fixedDelayMilliseconds = responseDelay;
    }
    
    const priority = parseInt(document.getElementById('edit-mapping-priority')?.value) || 1;
    if (priority !== 1) {
        mapping.priority = priority;
    }
    
    const scenarioName = document.getElementById('edit-mapping-scenario')?.value;
    if (scenarioName) {
        mapping.scenarioName = scenarioName;
    }
    
    // Parse headers and bodies
    const requestHeaders = parseJSONField('edit-request-headers');
    if (requestHeaders) {
        mapping.request.headers = requestHeaders;
    }
    
    const responseHeaders = parseJSONField('edit-response-headers');
    if (responseHeaders) {
        mapping.response.headers = responseHeaders;
    }
    
    const requestBody = parseBodyField('edit-request-body');
    if (requestBody.value) {
        if (requestBody.isJSON) {
            mapping.request.bodyPatterns = [{ equalToJson: JSON.stringify(requestBody.value) }];
        } else {
            mapping.request.body = requestBody.value;
        }
    }
    
    const responseBody = parseBodyField('edit-response-body');
    if (responseBody.value) {
        if (responseBody.isJSON) {
            mapping.response.jsonBody = responseBody.value;
        } else {
            mapping.response.body = responseBody.value;
        }
    }
    
    return mapping;
}

/**
 * Parse JSON field with error handling
 */
function parseJSONField(fieldId) {
    const element = document.getElementById(fieldId);
    if (!element || !element.value.trim()) return null;
    
    try {
        return JSON.parse(element.value);
    } catch (e) {
        console.warn(`Failed to parse JSON in field ${fieldId}:`, e);
        return null;
    }
}

/**
 * Parse body field - detects if it's JSON or text
 */
function parseBodyField(fieldId) {
    const element = document.getElementById(fieldId);
    if (!element || !element.value.trim()) {
        return { value: null, isJSON: false };
    }
    
    const value = element.value.trim();
    
    try {
        const parsed = JSON.parse(value);
        return { value: parsed, isJSON: true };
    } catch (e) {
        return { value: value, isJSON: false };
    }
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
        validationResult.innerHTML = '<div class="validation-warning">JSON пуст</div>';
        return;
    }
    
    try {
        JSON.parse(jsonText);
        validationResult.innerHTML = '<div class="validation-success">✓ JSON корректен</div>';
    } catch (error) {
        validationResult.innerHTML = `<div class="validation-error">✗ Ошибка JSON: ${error.message}</div>`;
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
        showNotification('JSON отформатирован', 'success');
    } catch (error) {
        showNotification('Ошибка форматирования: ' + error.message, 'error');
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
        showNotification('JSON минимизирован', 'success');
    } catch (error) {
        showNotification('Ошибка минимизации: ' + error.message, 'error');
    }
}

/**
 * Update mode indicator
 */
function updateModeIndicator(mode) {
    const indicator = document.getElementById('editor-mode-indicator');
    if (indicator) {
        indicator.textContent = `Mode: ${mode === EDITOR_MODES.FORM ? 'Form' : 'JSON'}`;
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