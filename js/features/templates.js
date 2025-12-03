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
    const GOAL_GROUPS = [
        {
            id: 'happy-path',
            icon: '✓',
            title: 'Happy path',
            subtitle: 'Client flows succeed',
            color: '#10b981',
            description: 'Standard successful API responses',
        },
        {
            id: 'errors',
            icon: '⚠',
            title: 'Errors',
            subtitle: 'Client handles failures correctly',
            color: '#f59e0b',
            description: 'HTTP errors and validation cases',
        },
        {
            id: 'faults',
            icon: '⚡',
            title: 'Network issues',
            subtitle: 'Timeouts, disconnects, slow responses',
            color: '#ef4444',
            description: 'Network fault simulation',
        },
        {
            id: 'scenarios',
            icon: '↻',
            title: 'Scenarios',
            subtitle: 'Stateful steps and retries',
            color: '#8b5cf6',
            description: 'Changing service behaviour',
        },
        {
            id: 'dynamic',
            icon: '⎇',
            title: 'Dynamic response',
            subtitle: 'Response templating and conditions',
            color: '#3b82f6',
            description: 'Response depends on request',
        },
        {
            id: 'matching',
            icon: '🎯',
            title: 'Request Matching',
            subtitle: 'URL, headers, body, JSONPath',
            color: '#06b6d4',
            description: 'Advanced request matching',
        },
        {
            id: 'webhooks',
            icon: '📤',
            title: 'Webhooks',
            subtitle: 'Asynchronous callbacks',
            color: '#ec4899',
            description: 'Outgoing HTTP callbacks',
        },
        {
            id: 'proxy',
            icon: '⇄',
            title: 'Proxy & Record',
            subtitle: 'Proxying and recording',
            color: '#14b8a6',
            description: 'Working against real APIs',
        },
    ];
    const EMPTY_TEMPLATE_ID = 'empty-mapping-skeleton';
    const wizardState = {
        step: 'goals',
        goalId: null,
        selectedTemplateId: null,
        searchQuery: '',
        activeTags: [],
        showPopularOnly: false,
    };
    let activeTarget = 'form';
    let lastRenderSignature = '';

    function getEmptyTemplate() {
        return {
            id: EMPTY_TEMPLATE_ID,
            title: 'Empty mapping',
            description: 'Create a minimal stub and fill in the request/response yourself.',
            category: 'happy-path',
            highlight: 'ANY · /example',
            feature: {
                path: ['response', 'status'],
                label: 'response.status'
            },
            content: {
                request: {
                    method: 'ANY',
                    urlPath: '/example'
                },
                response: {
                    status: 200
                }
            }
        };
    }

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
        const templates = [...getBuiltInTemplates(), ...readUserTemplates()];
        const emptyTemplate = getEmptyTemplate();
        if (!templates.some((template) => template.id === emptyTemplate.id)) {
            templates.unshift(emptyTemplate);
        }
        return templates;
    }

    function findTemplateById(templateId) {
        return getAllTemplates().find(item => item.id === templateId) || null;
    }

    function deriveTemplateTags(template) {
        const tags = new Set();
        const content = template.content || {};
        const request = content.request || {};
        const response = content.response || {};
        const method = request.method || 'ANY';
        tags.add(method);
        if (content.category) tags.add(content.category);
        if (template.category) tags.add(template.category);
        if (template.source === 'user') tags.add('custom');

        if (request.bodyPatterns || request.multipartPatterns) tags.add('matching');
        if (request.headers) tags.add('headers');
        if (request.queryParameters) tags.add('query');
        if (request.cookies) tags.add('cookies');
        if (request.urlPathPattern || request.urlPattern || request.urlPathTemplate) tags.add('pattern');
        if (Array.isArray(request.bodyPatterns)) {
            const hasJsonPath = request.bodyPatterns.some(pattern => pattern.matchesJsonPath || pattern.matchesXPath);
            if (hasJsonPath) tags.add('jsonpath');
        }

        if (response.proxyBaseUrl || content.proxyBaseUrl) tags.add('proxy');
        if (response.serveEventListeners || content.serveEventListeners || response.postServeActions) tags.add('webhook');
        if (response.transformers || content.transformers) tags.add('templating');
        if (response.fixedDelayMilliseconds || response.delayDistribution || response.chunkedDribbleDelay) tags.add('delay');
        if (response.fault) tags.add('fault');
        if (content.mappings) tags.add('scenario');
        if (template.popular) tags.add('popular');

        return Array.from(tags);
    }

    function deriveOutcome(template) {
        const content = template.content || {};
        const response = content.response || {};
        if (response.proxyBaseUrl || content.proxyBaseUrl) return 'proxy';
        if (response.fault) return 'fault';
        if (response.status) return `${response.status}`;
        if (Array.isArray(content.mappings) && content.mappings.length) return 'scenario';
        return '200';
    }

    function deriveMethod(template) {
        const content = template.content || {};
        const request = content.request || {};
        if (request.method) return request.method;
        if (Array.isArray(content.mappings) && content.mappings[0]?.request?.method) {
            return content.mappings[0].request.method;
        }
        return 'ANY';
    }

    function enrichTemplate(template) {
        const method = deriveMethod(template);
        const outcome = deriveOutcome(template);
        const tags = deriveTemplateTags(template);
        const popular = Boolean(template.popular) || ['basic', 'integration', 'proxy'].includes(template.category);
        const isScenario = Array.isArray(template.content?.mappings) && template.content.mappings.length > 0;
        return {
            ...template,
            method,
            outcome,
            tags,
            popular,
            isScenario,
        };
    }

    function getTemplatesWithMeta() {
        return getAllTemplates().map(enrichTemplate);
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
        const initializer = global.monacoInitializer;

        if (initializer && (typeof initializer.applyTemplate === 'function' || typeof initializer.applyTemplateById === 'function')) {
            let applied = false;

            if (typeof initializer.applyTemplate === 'function') {
                applied = initializer.applyTemplate(template);
            } else {
                applied = initializer.applyTemplateById?.(template.id);
            }

            notify(
                applied
                    ? `Template "${template.title || template.id}" applied to editor`
                    : 'Template could not be applied',
                applied ? 'success' : 'error'
            );

            return;
        }

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

    async function createMappingFromTemplate(template, options = {}) {
        const { openMode = 'inline' } = options;

        if (!template) {
            notify('Select a template first', 'warning');
            return;
        }

        const payload = normalizeTemplatePayload(template);
        if (!payload) {
            notify('Template content is not available', 'error');
            return;
        }

        try {
            const response = await apiFetch('/mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const createdMapping = response?.mapping || response;
            const createdId = createdMapping?.id;

            if (createdId && typeof updateOptimisticCache === 'function') {
                try {
                    updateOptimisticCache(createdMapping, 'create');
                } catch (cacheError) {
                    console.warn('Failed to update optimistic cache after template create:', cacheError);
                }
            }

            notify(`Mapping "${payload.name}" created from template`, 'success');

            if (createdId) {
                if (openMode === 'studio' && typeof global.editMapping === 'function') {
                    global.editMapping(createdId);
                } else if (typeof global.openEditModal === 'function') {
                    global.openEditModal(createdId);
                }
            }
        } catch (error) {
            notify(`Failed to create mapping: ${error.message}`, 'error');
            console.error('Failed to create mapping from template', error);
        } finally {
            global.hideModal?.(MODALS.GALLERY);
            global.hideModal?.(MODALS.PREVIEW);
        }
    }

    function createEmptyMapping() {
        const template = getEmptyTemplate();
        if (isCreationTarget()) {
            const openMode = activeTarget === 'create-studio' ? 'studio' : 'inline';
            createMappingFromTemplate(template, { openMode });
            return;
        }

        applyTemplateForTarget(template, activeTarget);
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
        renderTemplateWizard({ force: true });
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
        renderTemplateWizard({ force: true });
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
        if (typeof value === 'undefined') return '';
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
            const lines = pretty.split('\n').slice(0, 16);
            const preview = lines.join('\n');
            return preview.length > 640 ? `${preview.slice(0, 639)}…` : preview;
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

    function isCreationTarget(target = activeTarget) {
        return typeof target === 'string' && target.startsWith('create');
    }

    function normalizeTemplatePayload(template) {
        if (!template) return null;

        let payload = template.content ?? {};
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            } catch (e) {
                console.warn('Failed to parse string template content:', e);
                payload = {};
            }
        }

        const normalized = JSON.parse(JSON.stringify(payload || {}));
        ['id', 'uuid', 'stubMappingId', 'stubId', 'mappingId'].forEach((key) => delete normalized[key]);

        if (!normalized.name) normalized.name = template.title || template.id || 'New mapping';
        if (!normalized.request) normalized.request = {};
        if (!normalized.response) normalized.response = {};

        const nowIso = new Date().toISOString();
        normalized.metadata = {
            ...(normalized.metadata || {}),
            created: normalized.metadata?.created || nowIso,
            edited: nowIso,
            source: normalized.metadata?.source || 'template'
        };

        return normalized;
    }

    function applyTemplateForTarget(template, target = activeTarget) {
        if (!template) return;
        if (target === 'create-inline') {
            createMappingFromTemplate(template, { openMode: 'inline' });
            return;
        }

        if (target === 'create-studio') {
            createMappingFromTemplate(template, { openMode: 'studio' });
            return;
        }

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
            const payload = template && template.content ? template.content : {};
            const json = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
            code.textContent = json;
        }

        const creationMode = isCreationTarget(modal.dataset.templateTarget);
        const applyButton = modal.querySelector('[data-template-action="apply"]');
        if (applyButton) {
            applyButton.textContent = creationMode ? 'Create & open editor' : 'Use template';
        }

        const studioButton = modal.querySelector('[data-template-action="create-studio"]');
        if (studioButton) {
            studioButton.style.display = creationMode ? '' : 'none';
        }

        ensurePreviewHandlers();
        global.showModal?.(MODALS.PREVIEW);
    }

    function buildGallerySignature(templates) {
        const ids = templates.map((template) => `${template.id}:${template.source || ''}:${template.title || ''}:${template.method}:${template.outcome}`).join('|');
        return [
            activeTarget,
            wizardState.goalId || 'none',
            wizardState.searchQuery,
            wizardState.activeTags.join(','),
            wizardState.showPopularOnly,
            ids,
        ].join('|');
    }

    function templateMatchesGoal(template, goalId) {
        if (!goalId) return true;
        if (goalId === 'happy-path') return template.outcome.startsWith('2');
        if (goalId === 'errors') return ['4', '5'].includes(template.outcome.charAt(0));
        if (goalId === 'faults') return template.tags.includes('fault') || template.tags.includes('delay');
        if (goalId === 'scenarios') return template.isScenario;
        if (goalId === 'dynamic') return template.tags.includes('templating');
        if (goalId === 'matching') return template.tags.includes('matching') || template.tags.includes('pattern') || template.tags.includes('jsonpath');
        if (goalId === 'webhooks') return template.tags.includes('webhook');
        if (goalId === 'proxy') return template.tags.includes('proxy');
        return true;
    }

    function getTemplatesByGoal(goalId) {
        return getTemplatesWithMeta().filter((template) => templateMatchesGoal(template, goalId));
    }

    function renderGoalStep(body, templates) {
        body.innerHTML = `
            <div class="template-wizard__grid template-wizard__goals"></div>
            <div class="template-wizard__actions">
                <button type="button" class="btn btn-ghost" data-action="show-all">Show all templates</button>
                <div class="template-wizard__actions-right">
                    <button type="button" class="btn btn-primary" data-action="create-empty">Create empty</button>
                </div>
            </div>
        `;

        const grid = body.querySelector('.template-wizard__grid');
        GOAL_GROUPS.forEach((goal) => {
            const count = templates.filter((template) => templateMatchesGoal(template, goal.id)).length;
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'template-goal';
            card.dataset.goalId = goal.id;
            card.innerHTML = `
                <span class="template-goal__icon" aria-hidden="true">${goal.icon}</span>
                <span class="template-goal__title">${goal.title}</span>
                <span class="template-goal__subtitle">${goal.subtitle}</span>
                <span class="template-goal__count">${count} templates</span>
            `;
            card.style.setProperty('--goal-color', goal.color);
            card.disabled = count === 0;
            card.addEventListener('click', () => {
                wizardState.goalId = goal.id;
                wizardState.step = 'templates';
                wizardState.activeTags = [];
                wizardState.searchQuery = '';
                wizardState.showPopularOnly = false;
                renderTemplateWizard({ force: true });
            });
            grid.appendChild(card);
        });

        body.querySelectorAll('[data-action="show-all"]').forEach((button) => {
            button.addEventListener('click', () => {
                wizardState.goalId = null;
                wizardState.step = 'templates';
                renderTemplateWizard({ force: true });
            });
        });

        body.querySelectorAll('[data-action="create-empty"]').forEach((button) => {
            button.addEventListener('click', () => {
                createEmptyMapping();
            });
        });
    }

    function renderTemplateCard(template, onSelect) {
        const outcomeLabel = template.outcome === 'proxy'
            ? 'proxy'
            : template.outcome === 'fault'
                ? 'fault'
                : template.outcome;
        const creationMode = isCreationTarget(activeTarget);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'template-card template-card--wizard';
        card.dataset.templateId = template.id;
        card.innerHTML = `
            <div class="template-card__header">
                <span class="badge badge-soft" data-method="${template.method}">${template.method}</span>
                <span class="badge badge-soft" data-outcome="${template.outcome}">${outcomeLabel}</span>
                ${template.isScenario ? `<span class="badge badge-soft badge-scenario">${template.content?.mappings?.length || 0} steps</span>` : ''}
                ${template.popular ? '<span class="template-card__star" aria-hidden="true">⭐</span>' : ''}
            </div>
            <div class="template-card__title">${template.title || template.name || template.id}</div>
            <div class="template-card__desc">${template.description || 'WireMock template'}</div>
            <div class="template-card__meta">${getTemplateHeadline(template)}</div>
            <div class="template-card__tags">
                ${template.tags.slice(0, 4).map(tag => `<span class="chip">${tag}</span>`).join('')}
            </div>
            <div class="template-card__actions">
                <span class="btn btn-primary btn-sm">${creationMode ? 'Create' : 'Select'}</span>
                <span class="btn btn-secondary btn-sm" aria-hidden="true">Details</span>
            </div>
        `;

        card.addEventListener('click', () => onSelect(template));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(template);
            }
        });

        return card;
    }

    function renderTemplateStep(body, templates) {
        const filteredByGoal = getTemplatesByGoal(wizardState.goalId);
        const availableTags = Array.from(new Set(filteredByGoal.flatMap(template => template.tags))).sort();
        const showingAll = !wizardState.goalId;

        let filtered = filteredByGoal.filter((template) => {
            if (wizardState.showPopularOnly && !template.popular) return false;
            if (wizardState.activeTags.length && !wizardState.activeTags.every(tag => template.tags.includes(tag))) return false;
            if (!wizardState.searchQuery) return true;
            const query = wizardState.searchQuery.toLowerCase();
            return (
                (template.title || template.id).toLowerCase().includes(query)
                || (template.description || '').toLowerCase().includes(query)
                || template.tags.some(tag => tag.toLowerCase().includes(query))
            );
        });

        body.innerHTML = `
            <div class="template-toolbar template-toolbar--wizard">
                <div class="template-toolbar__search">
                    <svg class="icon icon-16" aria-hidden="true" focusable="false"><use href="#icon-search"></use></svg>
                    <input type="search" placeholder="Search templates..." value="${wizardState.searchQuery}" aria-label="Search templates" />
                </div>
                <div class="template-toolbar__actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-action="show-all" ${showingAll ? 'disabled' : ''}>Show all</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-popular" aria-pressed="${wizardState.showPopularOnly}">⭐ Popular</button>
                    <button type="button" class="btn btn-primary btn-sm" data-action="create-empty">Create empty</button>
                </div>
            </div>
            <div class="template-tags" aria-label="Tags">
                ${availableTags.map(tag => `<button type="button" class="chip chip--toggle ${wizardState.activeTags.includes(tag) ? 'is-active' : ''}" data-tag="${tag}">${tag}</button>`).join('')}
            </div>
            <div class="template-wizard__grid template-wizard__cards" id="template-wizard-cards"></div>
            <div class="template-info template-info--inline">
                <p class="template-info__lead">Need more examples? Visit the <a href="https://library.wiremock.org/" target="_blank" rel="noopener">official WireMock Template Library</a> and import JSON via Import/Export → Import Data.</p>
            </div>
        `;

        const cardsContainer = body.querySelector('#template-wizard-cards');
        const emptyState = document.createElement('div');
        emptyState.className = 'history-empty';
        emptyState.innerHTML = '<p>No templates found</p><small>Adjust filters or import JSON from the WireMock Template Library.</small>';

        if (!filtered.length) {
            cardsContainer.replaceWith(emptyState);
        } else {
            filtered.forEach((template) => {
                cardsContainer.appendChild(renderTemplateCard(template, (selected) => {
                    wizardState.selectedTemplateId = selected.id;
                    wizardState.step = 'preview';
                    renderTemplateWizard({ force: true });
                }));
            });
        }

        const searchInput = body.querySelector('input[type="search"]');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                wizardState.searchQuery = event.target.value;
                renderTemplateWizard({ force: true });
            });
        }

        body.querySelectorAll('[data-action="toggle-popular"]').forEach((button) => {
            button.addEventListener('click', () => {
                wizardState.showPopularOnly = !wizardState.showPopularOnly;
                renderTemplateWizard({ force: true });
            });
        });

        body.querySelectorAll('[data-action="show-all"]').forEach((button) => {
            button.addEventListener('click', () => {
                wizardState.goalId = null;
                wizardState.step = 'templates';
                renderTemplateWizard({ force: true });
            });
        });

        body.querySelectorAll('[data-action="create-empty"]').forEach((button) => {
            button.addEventListener('click', () => {
                createEmptyMapping();
            });
        });

        body.querySelectorAll('[data-tag]').forEach((button) => {
            button.addEventListener('click', () => {
                const tag = button.dataset.tag;
                if (wizardState.activeTags.includes(tag)) {
                    wizardState.activeTags = wizardState.activeTags.filter((t) => t !== tag);
                } else {
                    wizardState.activeTags = [...wizardState.activeTags, tag];
                }
                renderTemplateWizard({ force: true });
            });
        });
    }

    function renderPreviewStep(body, templates) {
        const template = templates.find((item) => item.id === wizardState.selectedTemplateId);
        if (!template) {
            wizardState.step = 'templates';
            renderTemplateWizard({ force: true });
            return;
        }

        const creationMode = isCreationTarget(activeTarget);
        const headline = getTemplateHeadline(template);
        const feature = getTemplateFeature(template);
        const previewCode = buildTemplatePreview(template);
        const tags = template.tags || [];

        body.innerHTML = `
            <div class="template-preview-card">
                <div class="template-preview-card__meta">
                    <div class="template-preview-card__badges">
                        <span class="badge badge-soft" data-method="${template.method}">${template.method}</span>
                        <span class="badge badge-soft" data-outcome="${template.outcome}">${template.outcome === 'proxy' ? 'proxy' : template.outcome}</span>
                        ${template.isScenario ? `<span class="badge badge-soft badge-scenario">${template.content?.mappings?.length || 0} steps</span>` : ''}
                    </div>
                    <h4 class="template-preview-card__title">${template.title || template.name || template.id}</h4>
                    <p class="template-preview-card__desc">${template.description || ''}</p>
                    <div class="template-preview-card__summary">${headline || '—'}</div>
                    ${feature ? `<div class="template-preview-meta__row"><span class="template-preview-meta__label">${feature.label}</span><code class="template-preview-meta__code">${feature.value}</code></div>` : ''}
                    <div class="template-preview-card__tags">${tags.map(tag => `<span class="chip">${tag}</span>`).join('')}</div>
                </div>
                <pre class="template-preview-card__code" id="template-preview-code-inline"></pre>
            </div>
            <div class="template-preview-actions template-preview-actions--wizard" id="template-preview-actions">
                <div class="template-preview-actions__primary">
                    ${creationMode ? '<button class="btn btn-primary btn-sm" type="button" data-template-action="apply">Create and open editor</button>' : '<button class="btn btn-primary btn-sm" type="button" data-template-action="apply">Use template</button>'}
                    ${creationMode ? '<button class="btn btn-secondary btn-sm" type="button" data-template-action="create-studio">Create in JSON Studio</button>' : ''}
                    <button class="btn btn-secondary btn-sm" type="button" data-template-action="copy">Copy JSON</button>
                </div>
            </div>
        `;

        const codeBlock = body.querySelector('#template-preview-code-inline');
        if (codeBlock) {
            codeBlock.textContent = previewCode;
        }

        const actions = body.querySelector('#template-preview-actions');
        if (!actions) return;
        actions.addEventListener('click', async (event) => {
            const button = event.target instanceof HTMLElement ? event.target.closest('[data-template-action]') : null;
            if (!button) return;
            const action = button.dataset.templateAction;
            if (action === 'apply') {
                applyTemplateForTarget(template, activeTarget);
                return;
            }
            if (action === 'create-studio') {
                createMappingFromTemplate(template, { openMode: 'studio' });
                return;
            }
            if (action === 'copy') {
                const json = typeof template.content === 'string'
                    ? template.content
                    : JSON.stringify(template.content, null, 2);
                const success = await copyTextToClipboard(json);
                notify(success ? `Template "${template.title}" copied` : 'Clipboard copy failed', success ? 'success' : 'error');
            }
        });
    }

    function goBackFromWizard() {
        if (wizardState.step === 'preview') {
            wizardState.step = 'templates';
            return;
        }

        wizardState.step = 'goals';
        wizardState.goalId = null;
        wizardState.selectedTemplateId = null;
    }

    function renderTemplateWizard(options = {}) {
        const { force = false } = options;
        const shell = document.getElementById('template-gallery-shell');
        if (!shell) return;

        const templates = getTemplatesWithMeta();
        const signature = buildGallerySignature(templates);
        if (!force && signature === lastRenderSignature) return;
        lastRenderSignature = signature;

        const stepIndex = wizardState.step === 'goals' ? 1 : wizardState.step === 'templates' ? 2 : 3;
        const selectedGoal = GOAL_GROUPS.find(goal => goal.id === wizardState.goalId);
        const canGoBack = wizardState.step !== 'goals';

        shell.innerHTML = `
            <div class="template-wizard">
                <div class="template-wizard__header">
                    <div>
                        <p class="template-wizard__eyebrow">Step ${stepIndex}/3</p>
                        <h3 class="template-wizard__title">${wizardState.step === 'goals' ? 'Create a mapping' : selectedGoal?.title || 'Pick a template'}</h3>
                        <p class="template-wizard__subtitle">${wizardState.step === 'goals' ? 'Choose the scenario that fits your testing goal' : selectedGoal?.description || ''}</p>
                    </div>
                    <div class="template-wizard__header-actions">
                        <div class="template-wizard__progress" role="progressbar" aria-label="Wizard progress" aria-valuemin="1" aria-valuemax="3" aria-valuenow="${stepIndex}">
                            <span class="sr-only">Step ${stepIndex} of 3</span>
                            ${[1, 2, 3].map((i) => `<span class="template-wizard__dot ${i <= stepIndex ? 'is-active' : ''}" aria-current="${i === stepIndex ? 'step' : 'false'}" aria-label="Step ${i}"></span>`).join('')}
                        </div>
                        ${canGoBack ? '<button type="button" class="btn btn-ghost btn-sm" id="template-wizard-back">← Back</button>' : ''}
                    </div>
                </div>
                <div class="template-wizard__body" id="template-wizard-body"></div>
            </div>
        `;

        const body = shell.querySelector('#template-wizard-body');
        if (!body) return;

        if (!templates.length) {
            body.innerHTML = '<div class="history-empty"><p>No templates available</p><small>Add or import templates to populate this view.</small></div>';
        } else if (wizardState.step === 'goals') {
            renderGoalStep(body, templates);
        } else if (wizardState.step === 'templates') {
            renderTemplateStep(body, templates);
        } else {
            renderPreviewStep(body, templates);
        }

        const backButton = shell.querySelector('#template-wizard-back');
        if (backButton) {
            backButton.addEventListener('click', () => {
                goBackFromWizard();
                renderTemplateWizard({ force: true });
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

    function openGalleryForTarget(target = 'form') {
        activeTarget = target;
        wizardState.step = 'goals';
        wizardState.goalId = null;
        wizardState.selectedTemplateId = null;
        wizardState.searchQuery = '';
        wizardState.activeTags = [];
        wizardState.showPopularOnly = false;
        renderTemplateWizard({ force: true });
        global.showModal?.(MODALS.GALLERY);
    }

    function init() {
        populateSelectors();
        renderTemplateWizard();

        document.querySelectorAll('[data-template-trigger]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                openGalleryForTarget(button.dataset.templateTarget || 'form');
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
        openGallery: renderTemplateWizard,
        openGalleryForTarget,
        applyTemplateToForm,
        applyTemplateToEditor,
        createMappingFromTemplate,
        createEmptyMapping,
        saveFormAsTemplate,
        saveEditorAsTemplate
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : globalThis);
