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
    let templateNameResolver = null;

    function getEmptyTemplateSeed() {
        const methodInput = document.getElementById('method');
        const urlInput = document.getElementById('url-pattern');
        const editorMethod = document.getElementById('editor-method');
        const editorUrl = document.getElementById('editor-url');

        const methodSource = methodInput?.value || editorMethod?.value;
        const urlSource = urlInput?.value || editorUrl?.value;

        return {
            method: (methodSource || 'GET').toUpperCase(),
            urlPath: urlSource || '/api/example'
        };
    }

    function buildEmptyMapping(seed = getEmptyTemplateSeed()) {
        const normalizedSeed = {
            method: (seed?.method || 'GET').toUpperCase(),
            urlPath: seed?.urlPath || '/api/example'
        };

        return {
            name: 'Empty mapping',
            request: {
                method: normalizedSeed.method,
                urlPath: normalizedSeed.urlPath
            },
            response: {
                status: 200
            }
        };
    }

    function getEmptyMappingContent(seed) {
        return deepClone(buildEmptyMapping(seed));
    }

    function getEmptyTemplate() {
        const seed = getEmptyTemplateSeed();
        const emptyContent = getEmptyMappingContent(seed);

        return {
            id: EMPTY_TEMPLATE_ID,
            title: 'Empty mapping',
            description: 'Create a minimal stub and fill in the request/response yourself.',
            category: 'happy-path',
            highlight: `${emptyContent.request.method} · ${emptyContent.request.urlPath}`,
            feature: {
                path: ['response', 'status'],
                label: 'response.status'
            },
            content: emptyContent
        };
    }

    function notify(message, type = 'info') {
        if (global.NotificationManager && typeof NotificationManager[type] === 'function') {
            NotificationManager[type](message);
            return;
        }
        console[type === 'error' ? 'error' : 'log'](`[TEMPLATES] ${message}`);
    }

    function deepClone(value) {
        try {
            if (typeof structuredClone === 'function') {
                return structuredClone(value);
            }
        } catch (cloneError) {
            console.warn('Failed to structuredClone, falling back to JSON:', cloneError);
        }

        try {
            return JSON.parse(JSON.stringify(value));
        } catch (jsonError) {
            console.warn('Failed to JSON clone value, returning shallow copy:', jsonError);
            if (value && typeof value === 'object') {
                return Array.isArray(value) ? [...value] : { ...value };
            }
        }

        return value;
    }

    function stripMappingIdentifiers(mapping) {
        ['id', 'uuid', 'stubMappingId', 'stubId', 'mappingId'].forEach((key) => delete mapping[key]);
        if (mapping.metadata) {
            delete mapping.metadata.id;
        }
    }

    function prepareMappingForCreation(mapping, options = {}) {
        if (!mapping || typeof mapping !== 'object') return null;

        const { source = 'ui', seed = getEmptyTemplateSeed() } = options;
        const nowIso = new Date().toISOString();
        const normalized = deepClone(mapping);

        stripMappingIdentifiers(normalized);
        normalizeRequestAndResponse(normalized, seed);

        normalized.metadata = {
            ...(normalized.metadata || {}),
            created: normalized.metadata?.created || nowIso,
            edited: nowIso,
            source: normalized.metadata?.source || source
        };

        return normalized;
    }

    async function createMappingsFromPayloads(rawPayloads, options = {}) {
        const {
            openMode = 'inline',
            source = 'ui',
            successMessageFactory,
        } = options;

        const payloadArray = Array.isArray(rawPayloads) ? rawPayloads : [rawPayloads];
        const preparedPayloads = payloadArray
            .map((payload) => prepareMappingForCreation(payload, { source }))
            .filter(Boolean);

        if (!preparedPayloads.length) {
            notify('No valid mapping payloads to create', 'warning');
            return { success: false, createdIds: [] };
        }

        const validationErrors = preparedPayloads
            .map((entry, index) => ({ index, error: validateMapping(entry) }))
            .filter((item) => Boolean(item.error));

        if (validationErrors.length) {
            const first = validationErrors[0];
            notify(`Mapping payload is missing required fields (entry ${first.index + 1}): ${first.error}`, 'error');
            return { success: false, createdIds: [] };
        }

        try {
            const createdIds = [];
            const errors = [];

            for (let i = 0; i < preparedPayloads.length; i += 1) {
                const entry = preparedPayloads[i];
                try {
                    const response = await apiFetch('/mappings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(entry)
                    });

                    const createdMapping = response?.mapping || response;
                    const createdId = createdMapping?.id;

                    if (createdId && typeof updateOptimisticCache === 'function') {
                        try {
                            updateOptimisticCache(createdMapping, 'create');
                        } catch (cacheError) {
                            console.warn('Failed to update optimistic cache after create:', cacheError);
                        }
                    }

                    if (createdId) {
                        createdIds.push(createdId);
                    }
                } catch (error) {
                    errors.push({ index: i, error });
                    break;
                }
            }

            if (errors.length) {
                const rollbackErrors = [];
                for (const id of createdIds) {
                    try {
                        await apiFetch(`/mappings/${id}`, { method: 'DELETE' });
                        if (typeof updateOptimisticCache === 'function') {
                            updateOptimisticCache({ id }, 'delete');
                        }
                    } catch (rollbackError) {
                        rollbackErrors.push(rollbackError);
                    }
                }

                const failure = errors[0];
                const rollbackNote = rollbackErrors.length
                    ? ` Rollback issues: ${rollbackErrors.length} delete${rollbackErrors.length === 1 ? '' : 's'} failed.`
                    : '';

                notify(
                    `Failed to create mapping ${failure.index + 1}/${preparedPayloads.length}: ${failure.error.message}.${rollbackNote}`,
                    'error'
                );
                console.error('Mapping create failed', { errors, rollbackErrors });
                return { success: false, createdIds: [] };
            }

            const createdCount = createdIds.length || preparedPayloads.length;
            const successMessage = typeof successMessageFactory === 'function'
                ? successMessageFactory(createdCount)
                : `Created ${createdCount} mapping${createdCount === 1 ? '' : 's'}`;

            notify(successMessage, 'success');

            const targetId = createdIds[0];
            if (targetId) {
                if (openMode === 'studio' && typeof global.editMapping === 'function') {
                    global.editMapping(targetId);
                } else if (typeof global.openEditModal === 'function') {
                    global.openEditModal(targetId);
                }
            }

            return { success: true, createdIds };
        } catch (error) {
            notify(`Failed to create mapping: ${error.message}`, 'error');
            console.error('Failed to create mapping from payloads', error);
            return { success: false, createdIds: [] };
        }
    }

    function ensureTemplateNameModal() {
        let modal = document.getElementById('template-name-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'template-name-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="template-name-title">
                <div class="modal-header">
                    <div class="modal-header-main">
                        <h3 id="template-name-title" class="modal-title">Save as template</h3>
                        <p class="modal-subtitle">Name your template to reuse it later.</p>
                    </div>
                    <button type="button" class="modal-close" aria-label="Close" data-action="close-template-name">×</button>
                </div>
                <div class="modal-body">
                    <label class="form-label" for="template-name-input">Template name</label>
                    <input id="template-name-input" class="form-control" type="text" name="template-name" placeholder="My template" />
                    <p class="form-hint">Titles help you find templates quickly in the gallery.</p>
                </div>
                <div class="modal-footer">
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" data-action="cancel-template-name">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="confirm-template-name">Save template</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                resolveTemplateName(null);
            }
        });

        const closeButtons = modal.querySelectorAll('[data-action="close-template-name"], [data-action="cancel-template-name"]');
        closeButtons.forEach((button) => button.addEventListener('click', () => resolveTemplateName(null)));

        modal.querySelector('[data-action="confirm-template-name"]').addEventListener('click', () => {
            const input = modal.querySelector('#template-name-input');
            const value = input?.value?.trim();
            resolveTemplateName(value || null);
        });

        const input = modal.querySelector('#template-name-input');
        input?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                resolveTemplateName(input.value.trim() || null);
            }
        });

        return modal;
    }

    function resolveTemplateName(value) {
        const modal = document.getElementById('template-name-modal');
        modal?.classList.add('hidden');
        if (typeof templateNameResolver === 'function') {
            templateNameResolver(value);
            templateNameResolver = null;
        }
    }

    function requestTemplateName(defaultValue = '') {
        const modal = ensureTemplateNameModal();
        const input = modal.querySelector('#template-name-input');
        if (input) {
            input.value = defaultValue || '';
            setTimeout(() => input.focus(), 0);
        }

        modal.classList.remove('hidden');

        if (templateNameResolver) {
            resolveTemplateName(null);
        }

        return new Promise((resolve) => {
            templateNameResolver = resolve;
        });
    }

    const templateCache = {
        builtIn: null,
        user: null,
        merged: null,
        mergedSignature: '',
        enriched: null,
        enrichedSignature: ''
    };

    function invalidateTemplateCache(scope = 'all') {
        if (scope === 'all' || scope === 'user') {
            templateCache.user = null;
        }
        templateCache.merged = null;
        templateCache.mergedSignature = '';
        templateCache.enriched = null;
        templateCache.enrichedSignature = '';
    }

    function getBuiltInTemplates() {
        if (templateCache.builtIn) return [...templateCache.builtIn];
        try {
            const templates = global.MonacoTemplateLibrary?.getAll?.();
            if (!Array.isArray(templates)) return [];
            templateCache.builtIn = templates.map(template => ({ ...template, source: 'built-in' }));
            return [...templateCache.builtIn];
        } catch (e) {
            console.warn('Unable to read Monaco template library:', e);
            return [];
        }
    }

    function readUserTemplates() {
        if (templateCache.user) return [...templateCache.user];
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            templateCache.user = Array.isArray(parsed) ? parsed : [];
            return [...templateCache.user];
        } catch (e) {
            console.warn('Failed to read user templates from storage:', e);
            return [];
        }
    }

    function persistUserTemplates(templates) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
            templateCache.user = [...templates];
            invalidateTemplateCache('user');
        } catch (e) {
            console.warn('Failed to persist user templates:', e);
        }
    }

    function mergeTemplates() {
        const merged = [...getBuiltInTemplates(), ...readUserTemplates()];
        const emptyTemplate = getEmptyTemplate();
        if (!merged.some((template) => template.id === emptyTemplate.id)) {
            merged.unshift(emptyTemplate);
        }
        const signature = merged.map((template) => `${template.id}:${template.source || ''}:${template.title || ''}`).join('|');

        if (templateCache.merged && templateCache.mergedSignature === signature) {
            return templateCache.merged;
        }

        templateCache.merged = merged;
        templateCache.mergedSignature = signature;
        templateCache.enriched = null;
        templateCache.enrichedSignature = '';
        return merged;
    }

    function getAllTemplates() {
        return mergeTemplates();
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
        const merged = mergeTemplates();
        if (templateCache.enriched && templateCache.enrichedSignature === templateCache.mergedSignature) {
            return templateCache.enriched;
        }

        templateCache.enriched = merged.map(enrichTemplate);
        templateCache.enrichedSignature = templateCache.mergedSignature;
        return templateCache.enriched;
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

        const payloads = Array.isArray(payload) ? payload : [payload];
        const validationErrors = payloads
            .map((entry, index) => ({ index, error: validateMapping(entry) }))
            .filter((item) => Boolean(item.error));

        if (validationErrors.length) {
            const first = validationErrors[0];
            notify(`Template is missing required fields (entry ${first.index + 1}): ${first.error}`, 'error');
            return;
        }

        try {
            await createMappingsFromPayloads(payloads, {
                openMode,
                source: 'template',
                successMessageFactory: (count) => `Created ${count} mapping${count === 1 ? '' : 's'} from template`
            });
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

    async function saveFormAsTemplate() {
        const title = (await requestTemplateName(document.getElementById('mapping-name')?.value || '')) || '';
        if (!title.trim()) {
            notify('Template name is required', 'warning');
            return;
        }

        const method = document.getElementById('method')?.value || 'GET';
        const url = document.getElementById('url-pattern')?.value || '/api/example';
        const status = parseInt(document.getElementById('response-status')?.value, 10) || 200;
        const rawBody = document.getElementById('response-body')?.value || '';

        const userTemplate = {
            id: `user-${Date.now()}`,
            title: title.trim(),
            description: 'User template saved from mapping form',
            source: 'user',
            content: {
                name: title.trim(),
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
        notify(`Template "${title.trim()}" saved`, 'success');
    }

    async function saveEditorAsTemplate() {
        const editor = document.getElementById('json-editor');
        if (!editor) {
            notify('Editor not available', 'warning');
            return;
        }

        const title = (await requestTemplateName()) || '';
        if (!title.trim()) {
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
            title: title.trim(),
            description: 'User template saved from JSON editor',
            source: 'user',
            content: parsed
        };

        const nextTemplates = readUserTemplates();
        nextTemplates.push(userTemplate);
        persistUserTemplates(nextTemplates);
        renderTemplateWizard({ force: true });
        populateSelectors();
        notify(`Template "${title.trim()}" saved`, 'success');
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
            const payload = template.content ? template.content : {};
            if (typeof payload === 'string') return payload;
            const pretty = JSON.stringify(payload, null, 2);
            const lines = pretty.split('\n').slice(0, 16);
            const preview = lines.join('\n');
            return preview.length > 896 ? `${preview.slice(0, 895)}…` : preview;
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

    function isCreationTarget(target = activeTarget) {
        return typeof target === 'string' && target.startsWith('create');
    }

    function normalizeRequestAndResponse(mapping, seed) {
        if (!mapping.request) mapping.request = {};
        if (!mapping.response) mapping.response = {};

        if (!mapping.request.method) {
            mapping.request.method = seed.method || 'ANY';
        }

        const hasPath = Boolean(
            mapping.request.url
            || mapping.request.urlPath
            || mapping.request.urlPattern
            || mapping.request.urlPathPattern
            || mapping.request.urlPathTemplate
        );

        if (!hasPath) {
            mapping.request.urlPath = seed.urlPath || seed.url || '/api/example';
        }

        if (typeof mapping.response.status !== 'number' && !('fault' in mapping.response)) {
            mapping.response.status = 200;
        }
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

        const nowIso = new Date().toISOString();
        const stripIds = (obj) => {
            ['id', 'uuid', 'stubMappingId', 'stubId', 'mappingId'].forEach((key) => delete obj[key]);
        };

        const seed = getEmptyTemplateSeed();

        if (Array.isArray(payload?.mappings)) {
            return payload.mappings.map((mapping, index) => {
                const normalized = JSON.parse(JSON.stringify(mapping || {}));
                stripIds(normalized);
                normalized.name =
                    normalized.name
                    || `${template.title || template.id || 'Scenario mapping'} #${index + 1}`;
                normalizeRequestAndResponse(normalized, seed);
                normalized.metadata = {
                    ...(normalized.metadata || {}),
                    created: normalized.metadata?.created || nowIso,
                    edited: nowIso,
                    source: normalized.metadata?.source || 'template'
                };
                return normalized;
            });
        }

        const normalized = JSON.parse(JSON.stringify(payload || {}));
        stripIds(normalized);

        if (!normalized.name) normalized.name = template.title || template.id || 'New mapping';
        normalizeRequestAndResponse(normalized, seed);

        normalized.metadata = {
            ...(normalized.metadata || {}),
            created: normalized.metadata?.created || nowIso,
            edited: nowIso,
            source: normalized.metadata?.source || 'template'
        };

        return normalized;
    }

    function validateMapping(mapping) {
        if (!mapping || typeof mapping !== 'object') return 'Mapping payload is empty';
        const request = mapping.request || {};
        const response = mapping.response || {};

        if (!request.method) return 'request.method is required';

        const hasPath = Boolean(
            request.url
            || request.urlPath
            || request.urlPattern
            || request.urlPathPattern
            || request.urlPathTemplate
        );

        if (!hasPath) return 'request URL or pattern is required';
        const hasStatus = typeof response.status === 'number';
        const hasFault = Boolean(response.fault);
        if (!hasStatus && !hasFault) return 'response.status is required';

        return null;
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
        getEmptyTemplateSeed,
        getEmptyMappingContent,
        applyTemplateToForm,
        applyTemplateToEditor,
        createMappingFromTemplate,
        createMappingsFromPayloads,
        prepareMappingForCreation,
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
