'use strict';

(function initTemplateActionsModule(global) {
    if (global.TemplateActionsModule) {
        return;
    }

    function createTemplateActions(context = {}) {
        const runtime = context.runtime || global;
        const selectors = context.selectors || {};
        const getAllTemplates = typeof context.getAllTemplates === 'function'
            ? context.getAllTemplates
            : () => [];

        const createOption = (template) => {
            const option = document.createElement('option');
            option.value = template.id;
            const label = template.title || template.name || template.id;
            option.textContent = template.source === 'user' ? `${label} (yours)` : label;
            option.dataset.source = template.source || 'built-in';
            return option;
        };

        const populateSelectors = () => {
            const templates = getAllTemplates();
            [selectors.FORM, selectors.EDITOR].forEach((selectorId) => {
                const select = document.getElementById(selectorId);
                if (!select) return;

                const currentValue = select.value;
                select.innerHTML = '<option value="">Select a template</option>';
                templates.forEach((template) => select.appendChild(createOption(template)));

                if (currentValue && templates.some((template) => template.id === currentValue)) {
                    select.value = currentValue;
                }
            });
        };

        const copyTextToClipboard = (text) => {
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
                    runtime.Logger?.warn?.('TEMPLATES', 'Clipboard fallback failed:', error);
                    return false;
                }
            }
        };

        return {
            createOption,
            populateSelectors,
            copyTextToClipboard,
        };
    }

    global.TemplateActionsModule = {
        createTemplateActions
    };
})(typeof window !== 'undefined' ? window : globalThis);
