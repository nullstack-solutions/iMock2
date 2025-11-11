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
    initializeMappingTemplateSection();

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
 * Debounce helper function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Set up editor mode handlers
 */
function setupEditorModeHandlers() {
    initializeJsonEditorAutoResize();

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

    // Debounced dirty state update to reduce overhead for large documents
    const debouncedDirtyUpdate = debounce(() => {
        editorState.isDirty = true;
        updateDirtyIndicator();
    }, 300);

    // Auto-save on input changes with debouncing
    document.addEventListener('input', (e) => {
        if (e.target.matches('.editor-field') || e.target.id === 'json-editor') {
            debouncedDirtyUpdate();
        }
    });
}

const mappingTemplateCache = new Map();
const TEMPLATE_CATEGORY_LABELS = {
    basic: 'Basic',
    advanced: 'Advanced',
    testing: 'Testing',
    integration: 'Integration',
    proxy: 'Proxy'
};

function initializeMappingTemplateSection() {
    const grid = document.getElementById('mapping-template-grid');
    if (!grid) {
        return;
    }

    const emptyElement = document.getElementById('mapping-template-empty');

    grid.addEventListener('click', (event) => {
        const actionButton = event.target.closest('[data-template-action]');
        if (!actionButton) {
            return;
        }

        const card = actionButton.closest('[data-template-id]');
        const templateId = card?.dataset.templateId;
        if (!templateId) {
            return;
        }

        event.preventDefault();

        const previewElement = card.querySelector('[data-template-preview]');
        const previewButton = card.querySelector('[data-template-action="preview"]');

        switch (actionButton.dataset.templateAction) {
            case 'preview':
                toggleMappingTemplatePreview(templateId, previewElement, actionButton);
                break;
            case 'copy':
                copyTemplateJson(templateId);
                break;
            case 'create':
                createMappingFromTemplateFromModal(templateId, {
                    button: actionButton,
                    previewElement,
                    previewButton
                });
                break;
            default:
                break;
        }
    });

    const refresh = () => renderMappingTemplateGrid({ grid, emptyElement });
    const reset = () => {
        grid.querySelectorAll('[data-template-preview]').forEach((previewElement) => {
            const parentCard = previewElement.closest('[data-template-id]');
            const previewButton = parentCard?.querySelector('[data-template-action="preview"]');
            hideMappingTemplatePreview(previewElement, previewButton);
        });
    };

    refresh();
    window.refreshMappingTemplateSection = refresh;
    window.resetMappingTemplateSection = reset;
}

function getTemplateLibraryItems() {
    if (window.MonacoTemplateLibrary && typeof window.MonacoTemplateLibrary.getAll === 'function') {
        try {
            return window.MonacoTemplateLibrary.getAll().filter((item) => item && item.id && item.content);
        } catch (error) {
            console.warn('Failed to read template library:', error);
            return [];
        }
    }
    return [];
}

function renderMappingTemplateGrid({ grid, emptyElement }) {
    if (!grid) {
        return;
    }

    const templates = getTemplateLibraryItems();
    mappingTemplateCache.clear();

    templates.forEach((template) => {
        mappingTemplateCache.set(template.id, template);
    });

    grid.innerHTML = '';

    if (!templates.length) {
        emptyElement?.classList.remove('hidden');
        return;
    }

    emptyElement?.classList.add('hidden');

    const fragment = document.createDocumentFragment();
    templates.forEach((template) => {
        const card = createMappingTemplateCard(template);
        fragment.appendChild(card);
    });

    grid.appendChild(fragment);
}

function createMappingTemplateCard(template) {
    const card = document.createElement('article');
    card.className = 'template-card';
    card.dataset.templateId = template.id;

    const header = document.createElement('div');
    header.className = 'template-header';

    const title = document.createElement('h3');
    title.textContent = template.title || template.id;
    header.appendChild(title);

    const badgeCategory = template.category && TEMPLATE_CATEGORY_LABELS[template.category]
        ? template.category
        : 'basic';
    const badge = document.createElement('span');
    badge.className = `template-badge template-badge--${badgeCategory}`;
    badge.textContent = TEMPLATE_CATEGORY_LABELS[badgeCategory] || 'Template';
    header.appendChild(badge);

    card.appendChild(header);

    const description = document.createElement('p');
    description.className = 'template-description';
    description.textContent = template.description || 'Ready-to-use WireMock template.';
    card.appendChild(description);

    const headline = getTemplateHeadline(template);
    if (headline) {
        const highlight = document.createElement('span');
        highlight.className = 'template-highlight';
        highlight.textContent = headline;
        card.appendChild(highlight);
    }

    const featureData = getTemplateFeature(template);
    if (featureData) {
        const feature = document.createElement('div');
        feature.className = 'template-feature';

        const key = document.createElement('span');
        key.className = 'template-feature__key';
        key.textContent = featureData.label;

        const value = document.createElement('span');
        value.className = 'template-feature__value';
        value.textContent = featureData.value;

        feature.append(key, value);
        card.appendChild(feature);
    }

    const actions = document.createElement('div');
    actions.className = 'template-actions';

    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.className = 'btn btn-secondary btn-sm';
    previewButton.dataset.templateAction = 'preview';
    previewButton.textContent = 'Preview JSON';
    actions.appendChild(previewButton);

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'btn btn-secondary btn-sm';
    copyButton.dataset.templateAction = 'copy';
    copyButton.textContent = 'Copy JSON';
    actions.appendChild(copyButton);

    const createButton = document.createElement('button');
    createButton.type = 'button';
    createButton.className = 'btn btn-primary btn-sm';
    createButton.dataset.templateAction = 'create';
    const label = document.createElement('span');
    label.className = 'btn-label';
    label.textContent = 'Create & edit';
    createButton.appendChild(label);
    actions.appendChild(createButton);

    card.appendChild(actions);

    const previewElement = document.createElement('pre');
    previewElement.className = 'template-preview hidden';
    previewElement.setAttribute('data-template-preview', 'true');
    card.appendChild(previewElement);

    return card;
}

function resetPreviewButton(previewButton) {
    if (!previewButton) {
        return;
    }
    previewButton.textContent = 'Preview JSON';
    delete previewButton.dataset.previewVisible;
}

function hideMappingTemplatePreview(previewElement, previewButton) {
    if (previewElement) {
        previewElement.textContent = '';
        previewElement.classList.add('hidden');
    }
    resetPreviewButton(previewButton);
}

function toggleMappingTemplatePreview(templateId, previewElement, previewButton) {
    if (!previewElement || !previewButton) {
        return;
    }

    if (previewButton.dataset.previewVisible === 'true') {
        hideMappingTemplatePreview(previewElement, previewButton);
        return;
    }

    if (!templateId) {
        NotificationManager.error('Select a template to preview');
        return;
    }

    const template = mappingTemplateCache.get(templateId);
    if (!template) {
        NotificationManager.error('Template not found');
        return;
    }

    try {
        previewElement.textContent = JSON.stringify(template.content, null, 2);
    } catch (error) {
        console.warn('Failed to render template preview:', error);
        previewElement.textContent = 'Unable to render template preview.';
    }

    previewElement.classList.remove('hidden');
    previewButton.textContent = 'Hide preview';
    previewButton.dataset.previewVisible = 'true';
}

async function copyTemplateJson(templateId) {
    const template = mappingTemplateCache.get(templateId);
    if (!template) {
        NotificationManager.error('Template not found');
        return;
    }

    let payload;
    try {
        payload = typeof template.content === 'string'
            ? template.content
            : JSON.stringify(template.content, null, 2);
    } catch (error) {
        console.warn('Failed to serialise template for copy:', error);
        NotificationManager.error('Template content is invalid');
        return;
    }

    const copied = await copyTextToClipboard(payload);
    if (copied) {
        NotificationManager.success('Template JSON copied to clipboard');
    } else {
        NotificationManager.error('Unable to copy template JSON');
    }
}

async function copyTextToClipboard(text) {
    if (navigator?.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.warn('Clipboard API copy failed:', error);
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    let success = false;
    try {
        success = document.execCommand('copy');
    } catch (error) {
        console.warn('document.execCommand copy failed:', error);
        success = false;
    }

    document.body.removeChild(textarea);
    return success;
}

function resolveTemplatePath(source, path) {
    if (!source || !path) {
        return undefined;
    }

    const segments = Array.isArray(path)
        ? path
        : String(path)
            .replace(/\[(\d+)\]/g, '.$1')
            .split('.');

    return segments.reduce((acc, segment) => {
        if (acc == null) {
            return undefined;
        }

        if (Array.isArray(acc)) {
            const index = Number(segment);
            return Number.isInteger(index) ? acc[index] : undefined;
        }

        return acc[segment];
    }, source);
}

function formatFeatureValue(value) {
    if (value == null) {
        return '';
    }

    if (typeof value === 'string') {
        return value.length > 80 ? `${value.slice(0, 77)}…` : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    try {
        const serialized = JSON.stringify(value);
        return serialized.length > 80 ? `${serialized.slice(0, 77)}…` : serialized;
    } catch (error) {
        console.warn('Failed to serialise feature value', error);
        return '';
    }
}

function getTemplateFeature(template) {
    if (!template || !template.feature) {
        return null;
    }

    const featurePath = template.feature.path || template.feature;
    const label = template.feature.label
        || (Array.isArray(featurePath) ? featurePath.join('.') : String(featurePath));
    const rawValue = resolveTemplatePath(template.content, featurePath);

    if (typeof rawValue === 'undefined') {
        return null;
    }

    return {
        label,
        value: formatFeatureValue(rawValue)
    };
}

function getTemplateHeadline(template) {
    if (!template) {
        return '';
    }

    if (template.highlight) {
        return template.highlight;
    }

    const info = [];
    if (template.content?.request?.method) {
        info.push(template.content.request.method);
    }
    if (template.content?.request?.url || template.content?.request?.urlPath) {
        info.push(template.content.request.url || template.content.request.urlPath);
    }

    return info.join(' · ');
}

function prepareTemplatePayload(templateEntry) {
    if (!templateEntry || typeof templateEntry !== 'object') {
        throw new Error('Template entry is invalid');
    }

    const content = templateEntry.content;
    if (!content || typeof content !== 'object') {
        throw new Error('Template content is missing');
    }

    let payload;
    if (typeof cloneMappingForCreation === 'function') {
        payload = cloneMappingForCreation(content, { sourceTag: 'template-library' });
    } else {
        payload = typeof structuredClone === 'function'
            ? structuredClone(content)
            : JSON.parse(JSON.stringify(content));

        delete payload.id;
        delete payload.uuid;
        delete payload.stubMappingId;
        delete payload.stubId;
        delete payload.mappingId;

        if (!payload.metadata || typeof payload.metadata !== 'object') {
            payload.metadata = {};
        }

        const nowIso = new Date().toISOString();
        payload.metadata.created = nowIso;
        payload.metadata.edited = nowIso;
        payload.metadata.source = 'template-library';
    }

    if (!payload.name && templateEntry.title) {
        payload.name = templateEntry.title;
    }

    return payload;
}

async function createMappingFromTemplateFromModal(templateId, { button, previewElement, previewButton } = {}) {
    if (!templateId) {
        NotificationManager.error('Select a template to continue');
        return;
    }

    const template = mappingTemplateCache.get(templateId);
    if (!template) {
        NotificationManager.error('Template not found');
        return;
    }

    let payload;
    try {
        payload = prepareTemplatePayload(template);
    } catch (error) {
        console.warn('Failed to prepare template payload:', error);
        NotificationManager.error('Template content is invalid');
        return;
    }

    setButtonLoadingState(button, true, 'Creating…');

    try {
        const response = await apiFetch('/mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const createdMapping = response?.mapping || response;
        NotificationManager.success('Mapping created from template!');

        try {
            if (createdMapping && createdMapping.id && typeof updateOptimisticCache === 'function') {
                // WireMock already accepted the template mapping, reflect it in the cache immediately
                updateOptimisticCache(createdMapping, 'create');
            }
        } catch (cacheError) {
            console.warn('Failed to update optimistic cache after template creation:', cacheError);
        }

        hideModal('add-mapping-modal');
        hideMappingTemplatePreview(previewElement, previewButton);

        const hasActiveFilters = document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value ||
            document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value ||
            document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value;
        if (hasActiveFilters && window.FilterManager && typeof window.FilterManager.applyMappingFilters === 'function') {
            window.FilterManager.applyMappingFilters();
        }

        if (createdMapping && createdMapping.id) {
            const openInJson = confirm('Открыть новый маппинг в JSON редакторе? Нажмите Cancel, чтобы использовать встроенный редактор.');
            if (openInJson) {
                if (typeof window.editMapping === 'function') {
                    window.editMapping(createdMapping.id);
                } else {
                    NotificationManager.info('JSON editor is not available in this view.');
                }
            } else if (typeof window.openEditModal === 'function') {
                window.openEditModal(createdMapping.id);
            }
        }
    } catch (error) {
        console.error('Failed to create mapping from template:', error);
        NotificationManager.error(`Failed to create mapping from template: ${error.message}`);
    } finally {
        setButtonLoadingState(button, false);
    }
}

let jsonEditorResizeObserver = null;
let jsonEditorResizeFrame = null;
let jsonEditorWindowResizeHandler = null;

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
    if (updateButton) {
        setButtonLoadingState(updateButton, isLoading, loadingLabel);
    }

    const modalElement = document.getElementById('edit-mapping-modal');
    const modalContent = modalElement?.querySelector('.modal-content');

    if (modalElement) {
        modalElement.classList.toggle('is-loading', Boolean(isLoading));
    }

    if (modalContent) {
        if (isLoading) {
            modalContent.setAttribute('aria-busy', 'true');
        } else {
            modalContent.removeAttribute('aria-busy');
        }
    }
};

function initializeJsonEditorAutoResize() {
    const jsonEditor = document.getElementById('json-editor');
    const container = document.getElementById('json-editor-container');

    if (!jsonEditor || !container) return;

    const computedMinHeight = parseInt(window.getComputedStyle(jsonEditor).minHeight, 10);
    if (!Number.isNaN(computedMinHeight)) {
        jsonEditor.dataset.minHeight = computedMinHeight;
    }

    if (jsonEditorResizeObserver) {
        jsonEditorResizeObserver.disconnect();
        jsonEditorResizeObserver = null;
    }

    if (typeof ResizeObserver !== 'undefined') {
        jsonEditorResizeObserver = new ResizeObserver(() => adjustJsonEditorHeight());
        jsonEditorResizeObserver.observe(container);
    }

    if (jsonEditorWindowResizeHandler) {
        window.removeEventListener('resize', jsonEditorWindowResizeHandler);
    }

    jsonEditorWindowResizeHandler = () => adjustJsonEditorHeight();
    window.addEventListener('resize', jsonEditorWindowResizeHandler);

    adjustJsonEditorHeight(true);
}

function adjustJsonEditorHeight(scrollToTop = false) {
    const jsonEditor = document.getElementById('json-editor');
    const container = document.getElementById('json-editor-container');

    if (!jsonEditor || !container) return;

    if (jsonEditorResizeFrame) {
        cancelAnimationFrame(jsonEditorResizeFrame);
    }

    jsonEditorResizeFrame = requestAnimationFrame(() => {
        jsonEditorResizeFrame = null;

        const toolbar = container.querySelector('.json-editor-toolbar');
        const toolbarHeight = toolbar ? toolbar.offsetHeight : 0;
        const minHeight = parseInt(jsonEditor.dataset.minHeight || '0', 10) || 320;
        const availableHeight = Math.max(container.clientHeight - toolbarHeight, minHeight);

        jsonEditor.style.height = `${availableHeight}px`;
        jsonEditor.style.overflowY = 'auto';
        jsonEditor.style.overflowX = 'auto';

        if (scrollToTop) {
            jsonEditor.scrollTop = 0;
            jsonEditor.scrollLeft = 0;
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
    try {
        window.setMappingEditorBusyState(true, 'Updating…');

        // Save current state based on active mode
        if (editorState.mode === EDITOR_MODES.JSON) {
            saveFromJSONMode();
        } else {
            saveFromFormMode();
        }

        const mappingData = editorState.currentMapping;

        if (!mappingData?.id) {
            NotificationManager.error('Mapping ID not found');
            return;
        }

        // Update metadata (simplified)
        const nowIso = new Date().toISOString();
        mappingData.metadata = {
            ...mappingData.metadata,
            created: mappingData.metadata?.created || nowIso,
            edited: nowIso,
            source: 'ui'
        };

        // Send update to server
        const response = await apiFetch(`/mappings/${mappingData.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mappingData)
        });

        const updatedMapping = response?.mapping || response;

        NotificationManager.success('Mapping updated!');

        // Update cache and UI
        if (updatedMapping) {
            updateOptimisticCache(updatedMapping, 'update');
        }

        editorState.isDirty = false;
        updateDirtyIndicator();

        hideModal('edit-mapping-modal');

        // Reapply filters if active
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
 * Estimate the size of a mapping object in bytes
 * Uses a cache to avoid repeated stringification
 */
const mappingSizeCache = new WeakMap();

function estimateMappingSize(mapping) {
    // Check cache first
    if (mappingSizeCache.has(mapping)) {
        return mappingSizeCache.get(mapping);
    }

    try {
        const jsonStr = JSON.stringify(mapping);
        const size = new Blob([jsonStr]).size;
        mappingSizeCache.set(mapping, size);
        return size;
    } catch (e) {
        // Fallback: rough estimate by counting properties
        let estimate = 0;
        try {
            const queue = [mapping];
            let count = 0;
            const maxIterations = 10000; // Safety limit

            while (queue.length > 0 && count < maxIterations) {
                const obj = queue.shift();
                count++;

                if (obj && typeof obj === 'object') {
                    for (const key in obj) {
                        estimate += key.length + 10; // Key + overhead
                        const value = obj[key];

                        if (typeof value === 'string') {
                            estimate += value.length * 2;
                        } else if (typeof value === 'number') {
                            estimate += 8;
                        } else if (typeof value === 'boolean') {
                            estimate += 4;
                        } else if (value && typeof value === 'object') {
                            queue.push(value);
                        }
                    }
                }
            }
        } catch {}

        return estimate || 1000000; // Default to 1MB if estimation fails
    }
}

/**
 * Optimized deep clone using structuredClone or fallback
 */
function optimizedClone(obj) {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(obj);
        } catch (e) {
            console.warn('structuredClone failed, falling back to JSON method:', e);
        }
    }
    // Fallback to JSON method
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Populate the edit mapping form with data from a mapping
 */
window.populateEditMappingForm = async (mapping) => {
    console.log('🔵 [EDITOR DEBUG] populateEditMappingForm called');
    console.log('🔵 [EDITOR DEBUG] Incoming mapping ID:', mapping?.id);
    console.log('🔵 [EDITOR DEBUG] Incoming mapping name:', mapping?.name);
    console.log('🔵 [EDITOR DEBUG] Current editor mode:', editorState.mode);
    console.log('🔵 [EDITOR DEBUG] Previous currentMapping ID:', editorState.currentMapping?.id);

    // Check mapping size
    const sizeInBytes = estimateMappingSize(mapping);
    const sizeInMB = sizeInBytes / (1024 * 1024);
    console.log(`📊 [EDITOR DEBUG] Mapping size: ${sizeInMB.toFixed(2)} MB`);

    // Warn for very large mappings
    if (sizeInMB > 5) {
        const proceed = confirm(
            `⚠️ This mapping is very large (${sizeInMB.toFixed(2)} MB).\n\n` +
            `Opening it may cause the browser to freeze.\n\n` +
            `Consider:\n` +
            `• Downloading the mapping instead\n` +
            `• Editing it externally\n` +
            `• Splitting it into smaller mappings\n\n` +
            `Do you want to proceed anyway?`
        );
        if (!proceed) {
            hideModal('edit-mapping-modal');
            return;
        }
    }

    // Show loading indicator for large mappings
    const isLarge = sizeInMB > 0.5;
    if (isLarge) {
        const jsonEditor = document.getElementById('json-editor');
        if (jsonEditor) {
            jsonEditor.value = 'Loading large mapping, please wait...';
        }
    }

    // Always reset state when opening a new mapping
    editorState.originalMapping = mapping;

    // Use optimized cloning for better performance
    if (isLarge) {
        // For large mappings, defer cloning to avoid blocking UI
        await new Promise(resolve => setTimeout(resolve, 0));
        editorState.currentMapping = optimizedClone(mapping);
    } else {
        editorState.currentMapping = optimizedClone(mapping);
    }

    editorState.isDirty = false;
    updateDirtyIndicator();

    console.log('🔵 [EDITOR DEBUG] After state update - currentMapping ID:', editorState.currentMapping?.id);

    // Always populate form fields first (for consistency)
    populateFormFields(mapping);

    // Then load data based on current mode
    if (editorState.mode === EDITOR_MODES.JSON) {
        console.log('🔵 [EDITOR DEBUG] Loading JSON mode for mapping ID:', editorState.currentMapping?.id);
        if (isLarge) {
            // Load large JSON asynchronously
            await loadJSONModeAsync();
        } else {
            loadJSONMode();
        }
    }

    console.log('🔵 [EDITOR DEBUG] populateEditMappingForm completed for mapping ID:', mapping?.id);
};

/**
 * Populate form fields with mapping data
 */
function populateFormFields(mapping) {
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
    const requiredScenarioStateElement = document.getElementById('edit-required-scenario-state');
    const newScenarioStateElement = document.getElementById('edit-new-scenario-state');
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
    if (requiredScenarioStateElement) requiredScenarioStateElement.value = '';
    if (newScenarioStateElement) newScenarioStateElement.value = '';
    if (mappingNameElement) mappingNameElement.value = '';
    
    // Then populate with new mapping data
    if (idElement) idElement.value = mapping.id || '';
    if (methodElement) methodElement.value = mapping.request?.method || 'GET';
    if (urlPatternElement) urlPatternElement.value = mapping.request?.urlPattern || mapping.request?.urlPath || '';
    
    // Populate request headers with optimizations
    if (requestHeadersElement && mapping.request?.headers) {
        const headersJson = JSON.stringify(mapping.request.headers, null, 2);
        requestHeadersElement.value = headersJson.length > 5000 ? 
            headersJson.substring(0, 5000) + '\n// ... (truncated for performance - switch to JSON mode for full view)' : 
            headersJson;
    }
    
    // Populate request body with optimizations
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
    
    // Populate the response block
    if (responseStatusElement) responseStatusElement.value = mapping.response?.status || 200;
    if (responseDelayElement) responseDelayElement.value = mapping.response?.fixedDelayMilliseconds || 0;
    
    // Populate response headers with optimizations
    if (responseHeadersElement && mapping.response?.headers) {
        const headersJson = JSON.stringify(mapping.response.headers, null, 2);
        responseHeadersElement.value = headersJson.length > 5000 ? 
            headersJson.substring(0, 5000) + '\n// ... (truncated for performance - switch to JSON mode for full view)' : 
            headersJson;
    }
    
    // Populate response body with optimizations
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
    
    // Populate advanced fields
    if (priorityElement) priorityElement.value = mapping.priority || 1;
    if (scenarioElement) scenarioElement.value = mapping.scenarioName || '';
    if (requiredScenarioStateElement) {
        const requiredState = mapping.requiredScenarioState || mapping.requiredState || '';
        requiredScenarioStateElement.value = requiredState;
    }
    if (newScenarioStateElement) {
        const newState = mapping.newScenarioState || mapping.newState || '';
        newScenarioStateElement.value = newState;
    }
    if (mappingNameElement) mappingNameElement.value = mapping.name || mapping.metadata?.name || '';
}

// ===== JSON EDITOR MODE FUNCTIONS =====

/**
 * Switch editor mode
 */
function switchEditorMode() {
    try {
        editorState.mode = EDITOR_MODES.JSON;
        loadJSONMode();
        updateEditorUI();
        updateModeIndicator(EDITOR_MODES.JSON);
    } catch (error) {
        console.error('Error in editor mode:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

/**
 * Update editor UI based on mode
 */
function updateEditorUI() {
    const formContainer = document.getElementById('form-editor-container');
    const jsonContainer = document.getElementById('json-editor-container');

    if (formContainer) formContainer.style.display = 'none';
    if (jsonContainer) jsonContainer.style.display = 'block';

    document.querySelectorAll('[data-editor-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.editorMode === EDITOR_MODES.JSON);
        btn.disabled = btn.dataset.editorMode !== EDITOR_MODES.JSON;
        btn.removeAttribute('title');
    });
}

function saveFromJSONMode() {
    console.log('🟢 [SAVE DEBUG] saveFromJSONMode called');

    const jsonEditor = document.getElementById('json-editor');
    if (!jsonEditor || !jsonEditor.value.trim()) {
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
        // For large JSON, show a brief message
        if (jsonText.length > 1000000) {
            console.log('🟢 [SAVE DEBUG] Large JSON detected, parsing...');
        }

        const parsedMapping = JSON.parse(jsonText);
        console.log('🟢 [SAVE DEBUG] Parsed mapping ID:', parsedMapping?.id);
        console.log('🟢 [SAVE DEBUG] Parsed mapping name:', parsedMapping?.name);

        editorState.currentMapping = parsedMapping;
        console.log('🟢 [SAVE DEBUG] Updated currentMapping ID:', editorState.currentMapping?.id);
    } catch (error) {
        throw new Error('Invalid JSON: ' + error.message);
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
 * Load JSON mode (synchronous for small mappings)
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
    adjustJsonEditorHeight(true);

    jsonEditor.value = JSON.stringify(editorState.currentMapping, null, 2);
    adjustJsonEditorHeight(true);
}

/**
 * Load JSON mode asynchronously (for large mappings)
 */
async function loadJSONModeAsync() {
    console.log('🟡 [JSON DEBUG] loadJSONModeAsync called (chunked loading)');
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

    // Show progress indicator
    jsonEditor.value = 'Formatting JSON, please wait...';

    // Yield to browser to update UI
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
        // Stringify in chunks to avoid blocking
        const startTime = performance.now();
        let formattedJSON;

        // Use requestIdleCallback if available for better performance
        if (typeof requestIdleCallback === 'function') {
            formattedJSON = await new Promise((resolve) => {
                requestIdleCallback(() => {
                    resolve(JSON.stringify(editorState.currentMapping, null, 2));
                }, { timeout: 2000 });
            });
        } else {
            // Fallback: yield to event loop
            await new Promise(resolve => setTimeout(resolve, 0));
            formattedJSON = JSON.stringify(editorState.currentMapping, null, 2);
        }

        const endTime = performance.now();
        console.log(`🟡 [JSON DEBUG] Formatting took ${(endTime - startTime).toFixed(2)}ms`);

        // Update textarea in next frame
        await new Promise(resolve => requestAnimationFrame(resolve));
        jsonEditor.value = formattedJSON;
        adjustJsonEditorHeight(true);

        console.log('🟡 [JSON DEBUG] JSON editor populated with mapping ID:', editorState.currentMapping?.id);
        console.log('🟡 [JSON DEBUG] JSON content length:', formattedJSON.length);
    } catch (error) {
        console.error('🔴 [JSON DEBUG] Error formatting JSON:', error);
        jsonEditor.value = '// Error formatting JSON. Mapping may be too large or contain circular references.';
        NotificationManager.error('Failed to load mapping: ' + error.message);
    }
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
    
    const scenarioName = document.getElementById('edit-mapping-scenario')?.value?.trim();
    if (scenarioName) {
        mapping.scenarioName = scenarioName;
    }

    const requiredScenarioState = document.getElementById('edit-required-scenario-state')?.value?.trim();
    if (requiredScenarioState) {
        mapping.requiredScenarioState = requiredScenarioState;
    }

    const newScenarioState = document.getElementById('edit-new-scenario-state')?.value?.trim();
    if (newScenarioState) {
        mapping.newScenarioState = newScenarioState;
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
        adjustJsonEditorHeight(true);
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
        adjustJsonEditorHeight(true);
        showNotification('JSON minified', 'success');
    } catch (error) {
        showNotification('Minification failed: ' + error.message, 'error');
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