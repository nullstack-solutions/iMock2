'use strict';

(function initTemplateRepoModule(global) {
    if (global.TemplateRepoModule) {
        return;
    }

    function createTemplateRepo(context = {}) {
        const runtime = context.runtime || global;
        const storageKey = context.storageKey || 'imock-custom-templates';
        const getEmptyTemplate = typeof context.getEmptyTemplate === 'function'
            ? context.getEmptyTemplate
            : () => null;

        const templateCache = {
            builtIn: null,
            user: null,
            userSignature: '',
            merged: null,
            mergedSignature: '',
            enriched: null,
            enrichedSignature: ''
        };

        const warn = (...args) => {
            if (runtime.Logger && typeof runtime.Logger.warn === 'function') {
                runtime.Logger.warn(...args);
                return;
            }
            try {
                // eslint-disable-next-line no-console
                console.warn(...args);
            } catch (_) {}
        };

        const normalizeUserTemplate = (template) => ({
            category: 'custom',
            source: 'user',
            ...template,
            category: template?.category || 'custom',
            source: template?.source || 'user'
        });

        const invalidateTemplateCache = (scope = 'all') => {
            if (scope === 'all' || scope === 'user') {
                templateCache.user = null;
            }
            templateCache.merged = null;
            templateCache.mergedSignature = '';
            templateCache.enriched = null;
            templateCache.enrichedSignature = '';
        };

        const getBuiltInTemplates = () => {
            if (templateCache.builtIn) return [...templateCache.builtIn];
            try {
                const templates = runtime.MonacoTemplateLibrary?.getAll?.();
                if (!Array.isArray(templates)) return [];
                templateCache.builtIn = templates.map((template) => ({ ...template, source: 'built-in' }));
                return [...templateCache.builtIn];
            } catch (error) {
                warn('TEMPLATES', 'Unable to read Monaco template library:', error);
                return [];
            }
        };

        const readUserTemplates = () => {
            const raw = localStorage.getItem(storageKey);
            if (templateCache.user && templateCache.userSignature === raw) return [...templateCache.user];
            try {
                const parsed = raw ? JSON.parse(raw) : [];
                templateCache.user = Array.isArray(parsed)
                    ? parsed.map((template) => normalizeUserTemplate(template))
                    : [];
                templateCache.userSignature = raw || '';
                return [...templateCache.user];
            } catch (error) {
                warn('TEMPLATES', 'Failed to read user templates from storage:', error);
                return [];
            }
        };

        const persistUserTemplates = (templates) => {
            try {
                const sanitized = (templates || []).filter(Boolean).map((template) => normalizeUserTemplate(template));
                const serialized = JSON.stringify(sanitized);
                localStorage.setItem(storageKey, serialized);
                templateCache.user = [...sanitized];
                templateCache.userSignature = serialized;
                invalidateTemplateCache('user');
            } catch (error) {
                warn('TEMPLATES', 'Failed to persist user templates:', error);
            }
        };

        const mergeTemplates = () => {
            const merged = [...getBuiltInTemplates(), ...readUserTemplates()];
            const emptyTemplate = getEmptyTemplate();
            if (emptyTemplate && !merged.some((template) => template.id === emptyTemplate.id)) {
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
        };

        const getAllTemplates = () => mergeTemplates();
        const findTemplateById = (templateId) => getAllTemplates().find((item) => item.id === templateId) || null;

        const deriveTemplateTags = (template) => {
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
                const hasJsonPath = request.bodyPatterns.some((pattern) => pattern.matchesJsonPath || pattern.matchesXPath);
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
        };

        const deriveOutcome = (template) => {
            const content = template.content || {};
            const response = content.response || {};
            if (response.proxyBaseUrl || content.proxyBaseUrl) return 'proxy';
            if (response.fault) return 'fault';
            if (response.status) return `${response.status}`;
            if (Array.isArray(content.mappings) && content.mappings.length) return 'scenario';
            return '200';
        };

        const deriveMethod = (template) => {
            const content = template.content || {};
            const request = content.request || {};
            if (request.method) return request.method;
            if (Array.isArray(content.mappings) && content.mappings[0]?.request?.method) {
                return content.mappings[0].request.method;
            }
            return 'ANY';
        };

        const enrichTemplate = (template) => {
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
        };

        const getTemplatesWithMeta = () => {
            const merged = mergeTemplates();
            if (templateCache.enriched && templateCache.enrichedSignature === templateCache.mergedSignature) {
                return templateCache.enriched;
            }

            templateCache.enriched = merged.map(enrichTemplate);
            templateCache.enrichedSignature = templateCache.mergedSignature;
            return templateCache.enriched;
        };

        const toJsonBody = (bodyValue) => {
            if (bodyValue === undefined || bodyValue === null || bodyValue === '') return null;
            if (typeof bodyValue === 'object') return { jsonBody: bodyValue };
            try {
                const parsed = JSON.parse(bodyValue);
                return { jsonBody: parsed };
            } catch (error) {
                return { body: bodyValue };
            }
        };

        const resolveTemplatePath = (value, path) => {
            if (!path) return undefined;
            const segments = Array.isArray(path)
                ? path
                : String(path).split('.').map((segment) => (segment.match(/^\d+$/) ? Number(segment) : segment));

            return segments.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), value);
        };

        const formatFeatureValue = (value) => {
            if (value === null) return 'null';
            if (typeof value === 'undefined') return '';
            if (typeof value === 'string') return value.length > 64 ? `${value.slice(0, 61)}…` : value;
            if (typeof value === 'number' || typeof value === 'boolean') return String(value);

            try {
                const serialized = JSON.stringify(value);
                return serialized.length > 80 ? `${serialized.slice(0, 77)}…` : serialized;
            } catch (error) {
                warn('TEMPLATES', 'Failed to serialise feature value', error);
                return '';
            }
        };

        const getTemplateFeature = (template) => {
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
        };

        const getTemplateHeadline = (template) => {
            if (!template) return '';
            if (template.highlight) return template.highlight;

            const info = [];
            if (template.content?.request?.method) info.push(template.content.request.method);
            if (template.content?.request?.url || template.content?.request?.urlPath) {
                info.push(template.content.request.url || template.content.request.urlPath);
            }
            return info.join(' · ');
        };

        const buildTemplatePreview = (template) => {
            try {
                const payload = template.content ? template.content : {};
                if (typeof payload === 'string') return payload;
                const pretty = JSON.stringify(payload, null, 2);
                const lines = pretty.split('\n').slice(0, 24);
                const preview = lines.join('\n');
                return preview.length > 1280 ? `${preview.slice(0, 1279)}…` : preview;
            } catch (error) {
                return '[unavailable template preview]';
            }
        };

        return {
            normalizeUserTemplate,
            invalidateTemplateCache,
            getBuiltInTemplates,
            readUserTemplates,
            persistUserTemplates,
            getAllTemplates,
            findTemplateById,
            getTemplatesWithMeta,
            toJsonBody,
            resolveTemplatePath,
            formatFeatureValue,
            getTemplateFeature,
            getTemplateHeadline,
            buildTemplatePreview,
        };
    }

    global.TemplateRepoModule = {
        createTemplateRepo
    };
})(typeof window !== 'undefined' ? window : globalThis);
