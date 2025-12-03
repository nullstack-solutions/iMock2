'use strict';

(function initTemplateManager(global) {
    const STORAGE_KEY = 'imock-custom-templates';
    const SELECTORS = {
        FORM: 'template-selector',
        EDITOR: 'editor-template-selector'
    };
    const MODALS = {
        GALLERY: 'template-gallery-modal',
        PREVIEW: 'template-preview-modal'
    };
    const TEMPLATE_CATEGORY_LABELS = {
        basic: 'Starter',
        advanced: 'Advanced',
        integration: 'Integration',
        testing: 'Testing',
        custom: 'Custom',
        user: 'Custom'
    };
    let activeTarget = 'form';

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
        renderTemplateGallery();
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
        renderTemplateGallery();
        populateSelectors();
        notify(`Template "${title}" saved`, 'success');
    }

    function resolveTemplatePath(value, path) {
        if (!path) return undefined;
        const segments = Array.isArray(path)
            ? path
            : String(path).split('.').map((segment) => (segment.match(/^\d+$/) ? Number(segment) : segment));

        return segments.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), value);
    }

    function formatFeatureValue(value) {
        if (value === null) return 'null';
        if (typeof value === 'string') return value.length > 64 ? `${value.slice(0, 61)}…` : value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);

        try {
            const serialized = JSON.stringify(value);
            return serialized.length > 80 ? `${serialized.slice(0, 77)}…` : serialized;
        } catch (error) {
            console.warn('Failed to serialise feature value', error);
            return '';
        }
    }

    function getTemplateFeature(template) {
        if (!template || !template.feature) return null;

        const featurePath = template.feature.path || template.feature;
        const label = template.feature.label
            || (Array.isArray(featurePath) ? featurePath.join('.') : String(featurePath));
        const rawValue = resolveTemplatePath(template.content, featurePath);

        if (typeof rawValue === 'undefined') return null;

        return {
            label,
            value: formatFeatureValue(rawValue)
        };
    }

    function getTemplateHeadline(template) {
        if (!template) return '';
        if (template.highlight) return template.highlight;

        const info = [];
        if (template.content?.request?.method) info.push(template.content.request.method);
        if (template.content?.request?.url || template.content?.request?.urlPath) {
            info.push(template.content.request.url || template.content.request.urlPath);
        }
        return info.join(' · ');
    }

    function buildTemplatePreview(template) {
        try {
            const payload = template && template.content ? template.content : {};
            if (typeof payload === 'string') return payload;
            const pretty = JSON.stringify(payload, null, 2);
            const lines = pretty.split('\n').slice(0, 8);
            const preview = lines.join('\n');
            return preview.length > 320 ? `${preview.slice(0, 319)}…` : preview;
        } catch (error) {
            return '[unavailable template preview]';
        }
    }

    function copyTextToClipboard(text) {
        const safeText = typeof text === 'string' ? text : String(text ?? '');
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            return navigator.clipboard.writeText(safeText).then(() => true).catch(() => fallbackCopy(safeText));
        }
        return Promise.resolve(fallbackCopy(safeText));

        function fallbackCopy(value) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = value;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            } catch (error) {
                console.warn('Clipboard fallback failed:', error);
                return false;
            }
        }
    }

    function templateCategory(template) {
        if (template.source === 'user') return 'custom';
        if (template.source === 'built-in') return template.category || 'basic';
        return template.category || 'basic';
    }

    function applyTemplateForTarget(template, target = activeTarget) {
        if (!template) return;
        if (target === 'editor') {
            applyTemplateToEditor(template);
        } else {
            applyTemplateToForm(template);
        }
        global.hideModal?.(MODALS.GALLERY);
        global.hideModal?.(MODALS.PREVIEW);
    }

    function openTemplatePreview(template) {
        if (!template || !template.id) return;

        const modal = document.getElementById(MODALS.PREVIEW);
        if (!modal) return;

        modal.dataset.templateId = template.id;
        modal.dataset.templateTarget = activeTarget;

        const title = modal.querySelector('#template-preview-title');
        if (title) title.textContent = template.title || 'Template preview';

        const description = modal.querySelector('#template-preview-description');
        if (description) {
            description.textContent = template.description || '';
            description.style.display = template.description ? '' : 'none';
        }

        const meta = modal.querySelector('#template-preview-meta');
        if (meta) {
            const headline = getTemplateHeadline(template) || '—';
            const feature = getTemplateFeature(template);

            meta.innerHTML = '';

            const endpointRow = document.createElement('div');
            endpointRow.className = 'template-preview-meta__row';

            const endpointLabel = document.createElement('span');
            endpointLabel.className = 'template-preview-meta__label';
            endpointLabel.textContent = 'Endpoint';

            const endpointValue = document.createElement('span');
            endpointValue.className = 'template-preview-meta__value';
            endpointValue.textContent = headline;

            endpointRow.appendChild(endpointLabel);
            endpointRow.appendChild(endpointValue);
            meta.appendChild(endpointRow);

            if (feature) {
                const featureRow = document.createElement('div');
                featureRow.className = 'template-preview-meta__row';

                const featureLabel = document.createElement('span');
                featureLabel.className = 'template-preview-meta__label';
                featureLabel.textContent = 'Highlight';

                const featureCode = document.createElement('code');
                featureCode.className = 'template-preview-meta__code';
                featureCode.textContent = `${feature.label} = ${feature.value}`;

                featureRow.appendChild(featureLabel);
                featureRow.appendChild(featureCode);
                meta.appendChild(featureRow);
            }
        }

        const code = modal.querySelector('#template-preview-code');
        if (code) {
            const payload = template.content ? template.content : {};
            const json = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
            code.textContent = json;
        }

        ensurePreviewHandlers();
        global.showModal?.(MODALS.PREVIEW);
    }

    function buildTemplateCard(template) {
        const card = document.createElement('article');
        card.className = 'template-card';
        card.dataset.templateId = template.id;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');

        const header = document.createElement('div');
        header.className = 'template-header';

        const title = document.createElement('h3');
        title.textContent = template.title || template.id;
        header.appendChild(title);

        const badge = document.createElement('span');
        const badgeCategory = templateCategory(template);
        badge.className = `badge ${badgeCategory}`;
        badge.textContent = TEMPLATE_CATEGORY_LABELS[badgeCategory] || 'Template';
        header.appendChild(badge);

        const description = document.createElement('p');
        description.className = 'template-description';
        description.textContent = template.description || 'Ready-to-use WireMock template.';

        const highlight = document.createElement('span');
        highlight.className = 'template-highlight';
        highlight.textContent = getTemplateHeadline(template);

        const featuresContainer = document.createElement('div');
        featuresContainer.className = 'template-features';

        const featureData = getTemplateFeature(template);
        if (featureData) {
            const feature = document.createElement('div');
            feature.className = 'template-feature';

            const key = document.createElement('div');
            key.className = 'template-feature__key';
            key.textContent = featureData.label;

            const value = document.createElement('div');
            value.className = 'template-feature__value';
            value.textContent = featureData.value;

            feature.appendChild(key);
            feature.appendChild(value);
            featuresContainer.appendChild(feature);
        }

        const preview = document.createElement('pre');
        preview.className = 'history-preview';
        preview.textContent = buildTemplatePreview(template);

        const actions = document.createElement('div');
        actions.className = 'template-actions';

        const useButton = document.createElement('button');
        useButton.className = 'btn btn-primary btn-sm';
        useButton.type = 'button';
        useButton.textContent = 'Use template';
        useButton.addEventListener('click', (event) => {
            event.stopPropagation();
            applyTemplateForTarget(template);
        });

        const copyButton = document.createElement('button');
        copyButton.className = 'btn btn-secondary btn-sm';
        copyButton.type = 'button';
        copyButton.textContent = 'Copy JSON';
        copyButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            const json = template && template.content && typeof template.content === 'string'
                ? template.content
                : JSON.stringify(template.content, null, 2);
            const success = await copyTextToClipboard(json);
            notify(success ? `Template "${template.title}" copied` : 'Clipboard copy failed', success ? 'success' : 'error');
        });

        actions.appendChild(useButton);
        actions.appendChild(copyButton);

        card.addEventListener('click', () => openTemplatePreview(template));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openTemplatePreview(template);
            }
        });

        card.appendChild(header);
        card.appendChild(description);
        if (highlight.textContent) card.appendChild(highlight);
        if (featuresContainer.childNodes.length) card.appendChild(featuresContainer);
        card.appendChild(preview);
        card.appendChild(actions);

        return card;
    }

    function renderTemplateGallery() {
        const container = document.getElementById('template-gallery-grid');
        if (!container) return;

        const templates = getAllTemplates();
        container.innerHTML = '';

        const infoPanel = document.createElement('section');
        infoPanel.className = 'template-info';
        infoPanel.innerHTML = `
            <p class="template-info__lead">Browse ready-made WireMock snippets or treat this gallery as a quick reference:</p>
            <ul>
                <li><strong>Use template</strong> drops the JSON straight into the ${activeTarget === 'editor' ? 'editor' : 'form'}.</li>
                <li><strong>Copy JSON</strong> copies the snippet so you can adapt it manually.</li>
                <li>Each card highlights key features like matchers, templating, webhooks, or proxy settings.</li>
            </ul>
            <p>It's perfectly fine to just read through these examples—no need to apply a template if you only need guidance.</p>
        `;
        container.appendChild(infoPanel);

        if (!templates.length) {
            const empty = document.createElement('div');
            empty.className = 'history-empty';
            empty.innerHTML = '<p>No templates available</p><small>Add templates or save your own to populate this view.</small>';
            container.appendChild(empty);
            return;
        }

        templates.forEach((template) => {
            container.appendChild(buildTemplateCard(template));
        });
    }

    function ensurePreviewHandlers() {
        const modal = document.getElementById(MODALS.PREVIEW);
        if (!modal || modal.dataset.previewBound === 'true') return;

        modal.dataset.previewBound = 'true';
        const actions = modal.querySelector('#template-preview-actions');
        if (actions) {
            actions.addEventListener('click', async (event) => {
                const button = event.target instanceof HTMLElement
                    ? event.target.closest('[data-template-action]')
                    : null;
                if (!button) return;

                event.preventDefault();
                const action = button.dataset.templateAction;
                const templateId = modal.dataset.templateId;
                const template = templateId ? findTemplateById(templateId) : null;
                const target = modal.dataset.templateTarget || activeTarget;
                if (!template) return;

                if (action === 'apply') {
                    applyTemplateForTarget(template, target);
                    return;
                }

                if (action === 'copy') {
                    const json = typeof template.content === 'string'
                        ? template.content
                        : JSON.stringify(template.content, null, 2);
                    const success = await copyTextToClipboard(json);
                    notify(success ? `Template "${template.title}" copied` : 'Clipboard copy failed', success ? 'success' : 'error');
                    return;
                }

                if (action === 'close') {
                    global.hideModal?.(MODALS.PREVIEW);
                }
            });
        }
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
        renderTemplateGallery();

        document.querySelectorAll('[data-template-trigger]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                activeTarget = button.dataset.templateTarget || 'form';
                renderTemplateGallery();
                global.showModal?.(MODALS.GALLERY);
            });
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
        openGallery: renderTemplateGallery,
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
