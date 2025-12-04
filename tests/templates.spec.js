const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createElementStub() {
    return {
        style: {},
        dataset: {},
        innerHTML: '',
        value: '',
        focused: false,
        classList: {
            add() {},
            remove() {},
            contains() { return false; },
            toggle() {},
        },
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        appendChild() {},
        setAttribute() {},
        removeAttribute() {},
        focus() { this.focused = true; },
    };
}

function createTemplatesTestContext() {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        Date,
        performance: { now: () => 0 },
    };

    const element = createElementStub();
    const elements = Object.create(null);
    sandbox.document = {
        readyState: 'complete',
        body: element,
        getElementById(id) {
            if (!elements[id]) {
                elements[id] = createElementStub();
            }
            return elements[id];
        },
        querySelectorAll() { return []; },
        createElement: () => createElementStub(),
        addEventListener() {},
        removeEventListener() {},
    };

    sandbox.window = sandbox;
    sandbox.location = { origin: 'http://localhost' };
    sandbox.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    sandbox.navigator = { clipboard: { writeText: async () => {} } };
    sandbox.localStorage = {
        _data: Object.create(null),
        getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; },
        setItem(key, value) { this._data[key] = String(value); },
        removeItem(key) { delete this._data[key]; },
        clear() { this._data = Object.create(null); },
    };

    sandbox.NotificationManager = {
        success() {},
        error() {},
        warning() {},
        info() {},
        show() {},
        TYPES: { INFO: 'info', WARNING: 'warning', ERROR: 'error' },
    };

    sandbox.hideModal = () => {};
    sandbox.showModal = () => {};
    sandbox.openEditModal = () => {};
    sandbox.editMapping = () => {};
    sandbox.updateOptimisticCache = () => {};
    sandbox.prompt = () => '';
    sandbox.confirm = () => true;

    sandbox.__apiCalls = [];
    sandbox.apiFetch = async (url, options = {}) => {
        const payload = options.body ? JSON.parse(options.body) : {};
        sandbox.__apiCalls.push({ url, payload });
        return { mapping: { ...payload, id: `generated-${sandbox.__apiCalls.length}` } };
    };

    const context = vm.createContext(sandbox);
    const scripts = [
        'editor/monaco-template-library.js',
        'js/features/templates.js',
    ];

    for (const script of scripts) {
        const code = fs.readFileSync(path.join(__dirname, '..', script), 'utf8');
        vm.runInContext(code, context, { filename: script });
    }

    context.__elements = elements;
    return context;
}

const tests = [];
const runTest = (name, fn) => tests.push({ name, fn });

function assertValidCreatePayload(payload) {
    assert.ok(payload, 'Payload should be defined');
    ['id', 'uuid', 'stubMappingId', 'stubId', 'mappingId'].forEach((field) => {
        assert.strictEqual(payload[field], undefined, `"${field}" must be stripped before create`);
    });

    assert.ok(payload.request, 'request is required');
    assert.ok(payload.response || payload.fault, 'response or fault is required');

    assert.ok(payload.request.method, 'request.method is required');
    const hasUrl = Boolean(
        payload.request.url
        || payload.request.urlPath
        || payload.request.urlPattern
        || payload.request.urlPathPattern
        || payload.request.urlPathTemplate
    );
    assert.ok(hasUrl, 'a request URL or pattern is required');

    const hasStatus = typeof payload.response?.status === 'number';
    const hasFault = Boolean(payload.response?.fault);
    assert.ok(hasStatus || hasFault, 'response.status or fault is required');
    assert.strictEqual(payload.metadata?.source, 'template', 'metadata.source should flag template origin');
}

runTest('all built-in templates create valid mapping payloads', async () => {
    const context = createTemplatesTestContext();
    const templates = context.TemplateManager.getTemplates();

    assert.ok(Array.isArray(templates) && templates.length > 0, 'Templates should be available');

    for (const template of templates) {
        const before = context.__apiCalls.length;
        await context.TemplateManager.createMappingFromTemplate(template, { openMode: 'inline' });
        const created = context.__apiCalls.length - before;
        assert.ok(created > 0, `Template ${template.id || template.title} should produce at least one create request`);
    }

    assert.ok(context.__apiCalls.length > 0, 'Template creation should post mappings');
    context.__apiCalls.forEach(({ url, payload }) => {
        assert.strictEqual(url, '/mappings');
        assertValidCreatePayload(payload);
    });
});

runTest('empty mapping skeleton is shared and seedable', () => {
    const context = createTemplatesTestContext();

    const defaultEmpty = context.TemplateManager.getEmptyMappingContent();
    assert.strictEqual(defaultEmpty.name, 'Empty mapping');
    assert.strictEqual(defaultEmpty.request.method, 'GET');
    assert.strictEqual(defaultEmpty.request.urlPath, '/api/example');
    assert.strictEqual(defaultEmpty.response.status, 200);

    const seededEmpty = context.TemplateManager.getEmptyMappingContent({ method: 'post', urlPath: '/seeded' });
    assert.strictEqual(seededEmpty.request.method, 'POST');
    assert.strictEqual(seededEmpty.request.urlPath, '/seeded');

    const emptyTemplate = context.TemplateManager.getTemplates().find((template) => template.id === 'empty-mapping-skeleton');
    assert.deepStrictEqual(emptyTemplate.content, defaultEmpty);
});

runTest('user templates are categorized and maintainable', async () => {
    const context = createTemplatesTestContext();
    const userTemplate = {
        id: 'user-test',
        title: 'Custom template',
        description: 'Mine',
        content: {
            request: {
                method: 'GET',
                urlPath: '/mine'
            },
            response: {
                status: 200
            }
        }
    };

    context.localStorage.setItem('imock-custom-templates', JSON.stringify([userTemplate]));

    let templates = context.TemplateManager.getTemplatesWithMeta();
    const custom = templates.find((template) => template.id === 'user-test');
    assert.strictEqual(custom.category, 'custom');
    assert.ok(custom.tags.includes('custom'));

    const updated = context.TemplateManager.updateUserTemplate('user-test', {
        title: 'Updated custom',
        description: 'Updated description',
        content: {
            request: {
                method: 'POST',
                urlPath: '/updated'
            },
            response: {
                status: 201
            }
        }
    });

    assert.ok(updated);

    templates = context.TemplateManager.getTemplatesWithMeta();
    const afterUpdate = templates.find((template) => template.id === 'user-test');
    assert.strictEqual(afterUpdate.title, 'Updated custom');
    assert.strictEqual(afterUpdate.content.request.method, 'POST');
    assert.strictEqual(afterUpdate.content.response.status, 201);

    const deleted = context.TemplateManager.deleteUserTemplate('user-test', { skipConfirm: true });
    assert.ok(deleted);
    assert.ok(!context.TemplateManager.getTemplates().some((template) => template.id === 'user-test'));
});

runTest('editing a user template opens the editor modal and populates JSON', async () => {
    const context = createTemplatesTestContext();
    const userTemplate = {
        id: 'user-editable',
        title: 'Editable template',
        description: 'Editable',
        content: {
            request: { method: 'POST', urlPath: '/editable' },
            response: { status: 202 }
        }
    };

    context.localStorage.setItem('imock-custom-templates', JSON.stringify([userTemplate]));

    let openedModalId = null;
    context.showModal = (id) => { openedModalId = id; };

    const editor = context.document.getElementById('json-editor');
    editor.value = '';

    await context.TemplateManager.editUserTemplate('user-editable');

    assert.strictEqual(openedModalId, 'edit-mapping-modal');
    assert.ok(editor.value.includes('/editable'), 'Editor should receive template content');
});

runTest('editing a user template reuses existing editors', async () => {
    const context = createTemplatesTestContext();
    const userTemplate = {
        id: 'user-edit',
        title: 'Editable template',
        description: 'Original',
        content: {
            request: {
                method: 'GET',
                urlPath: '/editable'
            },
            response: { status: 200 }
        }
    };

    context.localStorage.setItem('imock-custom-templates', JSON.stringify([userTemplate]));

    const editor = context.document.getElementById('json-editor');
    editor.value = JSON.stringify(userTemplate.content);
    const loaded = await context.TemplateManager.editUserTemplate('user-edit');
    assert.ok(loaded, 'Template should load for editing');
    const updateButton = context.document.getElementById('update-mapping-btn');
    assert.ok(updateButton.focused, 'Edit flow should focus the primary save control when present');

    const updatedContent = {
        request: {
            method: 'POST',
            urlPath: '/editable'
        },
        response: { status: 201 }
    };
    editor.value = JSON.stringify(updatedContent);

    await context.TemplateManager.saveEditorAsTemplate();

    const templates = context.TemplateManager.getTemplatesWithMeta();
    const updated = templates.find((template) => template.id === 'user-edit');
    assert.strictEqual(updated.content.request.method, 'POST');
    assert.strictEqual(updated.content.response.status, 201);
});

runTest('editing a template repurposes the update action to save the template', async () => {
    const context = createTemplatesTestContext();
    const userTemplate = {
        id: 'user-custom',
        title: 'Custom template',
        description: 'Editable',
        content: {
            request: { method: 'GET', urlPath: '/custom' },
            response: { status: 200 }
        }
    };

    context.localStorage.setItem('imock-custom-templates', JSON.stringify([userTemplate]));

    const updateButton = context.document.getElementById('update-mapping-btn');
    const label = context.document.createElement('span');
    label.textContent = 'Update Mapping';
    updateButton.querySelector = (selector) => (selector === '.btn-label' ? label : null);
    context.updateMapping = () => { context.__updateCalled = true; };
    updateButton.onclick = context.updateMapping;

    await context.TemplateManager.editUserTemplate('user-custom');

    assert.strictEqual(label.textContent, 'Save template', 'Update control should indicate template save');

    const editor = context.document.getElementById('json-editor');
    editor.value = JSON.stringify({
        request: { method: 'POST', urlPath: '/custom' },
        response: { status: 204 }
    });

    await updateButton.onclick({ preventDefault() {} });

    const templates = context.TemplateManager.getTemplatesWithMeta();
    const saved = templates.find((template) => template.id === 'user-custom');

    assert.ok(saved, 'Edited template should remain persisted');
    assert.strictEqual(saved.title, 'Custom template');
    assert.strictEqual(saved.content.response.status, 204);
    assert.ok(!context.__updateCalled, 'Template edit should not trigger mapping update');
    assert.strictEqual(label.textContent, 'Update Mapping', 'Update control should reset after save');
});

async function run() {
    let failures = 0;
    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`✅ ${name}`);
        } catch (error) {
            failures += 1;
            console.error(`❌ ${name}`);
            console.error(error);
        }
    }

    if (failures > 0) {
        console.error(`\n❌ ${failures} test(s) failed`);
        process.exit(1);
    }

    console.log(`\n✅ All ${tests.length} template tests passed.`);
}

run();
