'use strict';

(function initTemplateManager(global) {
    const STORAGE_KEY = 'imock-custom-templates';
    const SELECTORS = {
        FORM: 'template-selector',
        EDITOR: 'editor-template-selector'
    };

    function notify(message, type = 'info') {
        if (global.NotificationManager && typeof NotificationManager[type] === 'function') {
            NotificationManager[type](message);
            return;
        }
        console[type === 'error' ? 'error' : 'log'](`[TEMPLATES] ${message}`);
    }

    function getBuiltInTemplates() {
        try {
            const templates = global.MonacoTemplateLibrary?.getAll?.();
            if (!Array.isArray(templates)) return [];
            return templates.map(template => ({ ...template, source: 'built-in' }));
        } catch (e) {
            console.warn('Unable to read Monaco template library:', e);
            return [];
        }
    }

    function readUserTemplates() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('Failed to read user templates from storage:', e);
            return [];
        }
    }

    function persistUserTemplates(templates) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
        } catch (e) {
            console.warn('Failed to persist user templates:', e);
        }
    }

    function getAllTemplates() {
        return [...getBuiltInTemplates(), ...readUserTemplates()];
    }

    function findTemplateById(templateId) {
        return getAllTemplates().find(item => item.id === templateId) || null;
    }

    function createOption(template) {
        const option = document.createElement('option');
        option.value = template.id;
        const label = template.title || template.name || template.id;
        option.textContent = template.source === 'user' ? `${label} (yours)` : label;
        option.dataset.source = template.source || 'built-in';
        return option;
    }

    function populateSelectors() {
        const templates = getAllTemplates();
        [SELECTORS.FORM, SELECTORS.EDITOR].forEach((selectorId) => {
            const select = document.getElementById(selectorId);
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = '<option value="">Select a template</option>';
            templates.forEach(template => select.appendChild(createOption(template)));

            if (currentValue && templates.some(t => t.id === currentValue)) {
                select.value = currentValue;
            }
        });
    }

    function toJsonBody(bodyValue) {
        if (bodyValue === undefined || bodyValue === null || bodyValue === '') return null;
        if (typeof bodyValue === 'object') return { jsonBody: bodyValue };
        try {
            const parsed = JSON.parse(bodyValue);
            return { jsonBody: parsed };
        } catch (e) {
            return { body: bodyValue };
        }
    }

    function applyTemplateToForm(template) {
        if (!template) {
            notify('Select a template first', 'warning');
            return;
        }

        const content = template.content || {};
        const request = content.request || {};
        const response = content.response || {};

        const nameInput = document.getElementById('mapping-name');
        const methodSelect = document.getElementById('method');
        const urlInput = document.getElementById('url-pattern');
        const statusInput = document.getElementById('response-status');
        const bodyInput = document.getElementById('response-body');

        if (nameInput) nameInput.value = content.name || template.title || template.id || '';
        if (methodSelect && request.method) methodSelect.value = request.method;
        if (urlInput) urlInput.value = request.url || request.urlPath || '';
        if (statusInput && typeof response.status !== 'undefined') statusInput.value = response.status;

        const bodyValue = response.jsonBody ?? response.body;
        if (bodyInput && typeof bodyValue !== 'undefined') {
            const normalisedBody = typeof bodyValue === 'object'
                ? JSON.stringify(bodyValue, null, 2)
                : String(bodyValue);
            bodyInput.value = normalisedBody;
        }

        notify(`Template "${template.title || template.id}" applied to form`, 'success');
    }

    function applyTemplateToEditor(template) {
        if (!template) {
            notify('Select a template first', 'warning');
            return;
        }

        const payload = template.content ?? {};
        const jsonString = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
        const editor = document.getElementById('json-editor');
        if (editor) {
            editor.value = jsonString;
            try {
                const parsed = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(JSON.stringify(payload));
                if (global.editorState) {
                    global.editorState.currentMapping = parsed;
                    global.editorState.isDirty = true;
                }
            } catch (e) {
                console.warn('Failed to parse template content into editorState:', e);
            }
            const indicator = document.getElementById('editor-dirty-indicator');
            if (indicator) indicator.style.display = 'inline';
        }

        notify(`Template "${template.title || template.id}" applied to editor`, 'success');
    }

    function saveFormAsTemplate() {
        const title = (prompt('Template name', document.getElementById('mapping-name')?.value || '') || '').trim();
        if (!title) {
            notify('Template name is required', 'warning');
            return;
        }

        const method = document.getElementById('method')?.value || 'GET';
        const url = document.getElementById('url-pattern')?.value || '/api/example';
        const status = parseInt(document.getElementById('response-status')?.value, 10) || 200;
        const rawBody = document.getElementById('response-body')?.value || '';

        const userTemplate = {
            id: `user-${Date.now()}`,
            title,
            description: 'User template saved from mapping form',
            source: 'user',
            content: {
                name: title,
                request: {
                    method,
                    urlPath: url
                },
                response: {
                    status,
                    ...(toJsonBody(rawBody) || {})
                }
            }
        };

        const nextTemplates = readUserTemplates();
        nextTemplates.push(userTemplate);
        persistUserTemplates(nextTemplates);
        populateSelectors();
        notify(`Template "${title}" saved`, 'success');
    }

    function saveEditorAsTemplate() {
        const editor = document.getElementById('json-editor');
        if (!editor) {
            notify('Editor not available', 'warning');
            return;
        }

        const title = (prompt('Template name', '') || '').trim();
        if (!title) {
            notify('Template name is required', 'warning');
            return;
        }

        let parsed;
        try {
            parsed = JSON.parse(editor.value);
        } catch (e) {
            notify('Cannot save template: current JSON is invalid', 'error');
            return;
        }

        const userTemplate = {
            id: `user-${Date.now()}`,
            title,
            description: 'User template saved from JSON editor',
            source: 'user',
            content: parsed
        };

        const nextTemplates = readUserTemplates();
        nextTemplates.push(userTemplate);
        persistUserTemplates(nextTemplates);
        populateSelectors();
        notify(`Template "${title}" saved`, 'success');
    }

    function handleTemplateApply(event, targetSelector, applyFn) {
        event?.preventDefault?.();
        const select = document.getElementById(targetSelector);
        if (!select) return;
        const template = findTemplateById(select.value);
        applyFn(template);
    }

    function init() {
        populateSelectors();

        document.getElementById('apply-template-btn')?.addEventListener('click', (event) => {
            handleTemplateApply(event, SELECTORS.FORM, applyTemplateToForm);
        });

        document.getElementById('editor-apply-template')?.addEventListener('click', (event) => {
            handleTemplateApply(event, SELECTORS.EDITOR, applyTemplateToEditor);
        });

        document.getElementById('save-template-btn')?.addEventListener('click', (event) => {
            event.preventDefault();
            saveFormAsTemplate();
        });

        document.getElementById('editor-save-template')?.addEventListener('click', (event) => {
            event.preventDefault();
            saveEditorAsTemplate();
        });
    }

    global.TemplateManager = {
        getTemplates: getAllTemplates,
        refresh: populateSelectors,
        applyTemplateToForm,
        applyTemplateToEditor,
        saveFormAsTemplate,
        saveEditorAsTemplate
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : globalThis);
