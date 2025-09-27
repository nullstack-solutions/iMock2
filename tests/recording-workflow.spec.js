const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    performance: { now: () => 0 },
    AbortController,
};

sandbox.window = sandbox;
sandbox.location = { origin: 'http://localhost' };
sandbox.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
sandbox.navigator = { clipboard: { writeText: async () => {} } };
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};

const domElementStub = () => ({
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    value: '',
    innerHTML: '',
    dataset: {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
});

const elements = Object.create(null);
const bodyStub = domElementStub();
bodyStub.setAttribute = (name, value) => { bodyStub[`__attr_${name}`] = value; };
bodyStub.getAttribute = (name) => bodyStub[`__attr_${name}`] || null;

sandbox.document = {
    readyState: 'complete',
    addEventListener() {},
    removeEventListener() {},
    getElementById(id) {
        if (!elements[id]) {
            elements[id] = domElementStub();
        }
        return elements[id];
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement: domElementStub,
    body: bodyStub,
};

sandbox.localStorage = {
    _data: Object.create(null),
    getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; },
    setItem(key, value) { this._data[key] = String(value); },
    removeItem(key) { delete this._data[key]; },
    clear() { this._data = Object.create(null); },
};

const notifications = [];

sandbox.NotificationManager = {
    success(message) { notifications.push({ type: 'success', message }); },
    error(message) { notifications.push({ type: 'error', message }); },
    warning(message) { notifications.push({ type: 'warning', message }); },
    info(message) { notifications.push({ type: 'info', message }); },
    show() {},
    TYPES: { INFO: 'info', WARNING: 'warning', ERROR: 'error' },
};

sandbox.FilterManager = {
    applyMappingFilters() {},
    applyRequestFilters() {},
};

sandbox.UIComponents = {
    toggleFullContent() {},
    toggleDetails() {},
    createPreviewSection() { return ''; },
};

sandbox.Utils = {
    escapeHtml(value) { return String(value ?? ''); },
};

sandbox.updateDataSourceIndicator = () => {};
sandbox.updateMappingsCounter = () => {};
sandbox.updateRequestsCounter = () => {};
sandbox.invalidateElementCache = () => {};
sandbox.TabManager = { refresh: async () => {} };

const fetchCalls = [];

const createJsonResponse = (data) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    json: async () => data,
    text: async () => JSON.stringify(data),
});

sandbox.__mockFetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    return createJsonResponse({});
};

sandbox.fetch = async (url, options = {}) => sandbox.__mockFetch(url, options);

const context = vm.createContext(sandbox);

for (const script of ['js/core.js', 'js/features.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', script), 'utf8');
    vm.runInContext(code, context, { filename: script });
}

context.fetchAndRenderMappings = async () => {};
context.fetchAndRenderRequests = async () => {};
context.notifications = notifications;
context.fetchCalls = fetchCalls;
context.wiremockBaseUrl = 'http://localhost:8080/__admin';
context.localStorage.setItem('wiremock-settings', JSON.stringify({ requestTimeout: 2500 }));

const tests = [];

const addTest = (name, fn) => {
    tests.push({ name, fn });
};

addTest('startRecording posts merged configuration and toggles state', async () => {
    notifications.length = 0;
    fetchCalls.length = 0;

    const startBodies = [];
    let refreshCalled = false;

    context.__mockFetch = async (url, options = {}) => {
        fetchCalls.push({ url, options });
        if (!url.endsWith('/recordings/start')) {
            throw new Error(`Unexpected fetch during startRecording: ${url}`);
        }
        startBodies.push(JSON.parse(options.body));
        return createJsonResponse({});
    };

    context.refreshRecordingStatus = async (options) => {
        refreshCalled = true;
        assert.strictEqual(options && options.silent, true);
        return { status: 'Recording' };
    };

    const result = await context.startRecording({
        targetBaseUrl: 'https://target.example/api',
        filters: { method: 'POST' },
        captureHeaders: { 'X-Test': {} },
        outputFormat: 'FULL',
    });

    assert.strictEqual(Array.isArray(result), true);
    assert.strictEqual(result.length, 0);
    assert.strictEqual(context.isRecording, true);
    assert.strictEqual(refreshCalled, true);
    assert.strictEqual(startBodies.length, 1);
    assert.strictEqual(startBodies[0].targetBaseUrl, 'https://target.example/api');
    assert.deepStrictEqual(startBodies[0].filters, { method: 'POST' });
    assert.deepStrictEqual(startBodies[0].captureHeaders, { 'X-Test': {} });
    assert.strictEqual(startBodies[0].persist, true);
    assert.strictEqual(startBodies[0].repeatsAsScenarios, true);

    const stored = JSON.parse(context.localStorage.getItem('wiremock-recording-config'));
    assert.strictEqual(stored.mode, 'record');
    assert.strictEqual(stored.config.targetBaseUrl, 'https://target.example/api');
});

addTest('stopRecording returns captured mappings and updates history', async () => {
    notifications.length = 0;
    fetchCalls.length = 0;

    const sampleMappings = [
        { id: '1', name: 'First mapping' },
        { id: '2', name: 'Second mapping' },
    ];

    let mappingsRefreshed = false;
    context.fetchAndRenderMappings = async () => { mappingsRefreshed = true; };

    context.__mockFetch = async (url, options = {}) => {
        fetchCalls.push({ url, options });
        if (!url.endsWith('/recordings/stop')) {
            throw new Error(`Unexpected fetch during stopRecording: ${url}`);
        }
        return createJsonResponse({ recordingResult: { mappings: sampleMappings, meta: { source: 'proxy' } } });
    };

    context.isRecording = true;
    context.recordingsHistory = [];

    const result = await context.stopRecording();

    assert.strictEqual(Array.isArray(result), true);
    assert.deepStrictEqual(result.map(({ id, name }) => ({ id, name })), sampleMappings);
    assert.strictEqual(context.isRecording, false);
    assert.strictEqual(mappingsRefreshed, true);
    assert.strictEqual(context.recordingsHistory.length > 0, true);
    assert.strictEqual(context.recordingsHistory[0].count, sampleMappings.length);
    assert.strictEqual(context.recordingsHistory[0].mode, 'record');

    const success = notifications.find((n) => n.type === 'success');
    assert(success && success.message.includes('Captured 2'));
});

addTest('takeRecordingSnapshot stores snapshot mode and renders mappings', async () => {
    notifications.length = 0;
    fetchCalls.length = 0;

    context.__mockFetch = async (url, options = {}) => {
        fetchCalls.push({ url, options });
        if (!url.endsWith('/recordings/snapshot')) {
            throw new Error(`Unexpected fetch during takeRecordingSnapshot: ${url}`);
        }
        const body = JSON.parse(options.body);
        assert.strictEqual(body.outputFormat, 'FULL');
        return createJsonResponse({ stubMappings: [{ id: 'snap-1', name: 'Snapshot mapping' }] });
    };

    const mappings = await context.takeRecordingSnapshot({ targetBaseUrl: 'https://snapshot.example' });

    assert.strictEqual(Array.isArray(mappings), true);
    assert.strictEqual(mappings.length, 1);
    assert.strictEqual(mappings[0].id, 'snap-1');

    const stored = JSON.parse(context.localStorage.getItem('wiremock-recording-config'));
    assert.strictEqual(stored.mode, 'snapshot');
    assert.strictEqual(stored.config.targetBaseUrl, 'https://snapshot.example');

    const success = notifications.find((n) => n.type === 'success');
    assert(success && success.message.includes('Snapshot captured 1 mapping'));
});

const run = async () => {
    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`✔ ${name}`);
        } catch (error) {
            console.error(`✖ ${name}`);
            console.error(error);
            process.exit(1);
        }
    }
};

run();
