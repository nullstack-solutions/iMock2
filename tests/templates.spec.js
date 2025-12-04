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
    sandbox.document = {
        readyState: 'complete',
        body: element,
        getElementById() { return createElementStub(); },
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
    sandbox.openEditModal = () => {};
    sandbox.editMapping = () => {};
    sandbox.updateOptimisticCache = () => {};

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
        await context.TemplateManager.createMappingFromTemplate(template, { openMode: 'inline' });
    }

    assert.ok(context.__apiCalls.length > 0, 'Template creation should post mappings');
    context.__apiCalls.forEach(({ url, payload }) => {
        assert.strictEqual(url, '/mappings');
        assertValidCreatePayload(payload);
    });
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
