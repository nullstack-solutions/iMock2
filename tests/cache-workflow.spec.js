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

const bodyStub = (() => {
    const stub = domElementStub();
    stub.classList = { add() {}, remove() {}, contains() { return false; } };
    return stub;
})();

sandbox.document = {
    getElementById: () => domElementStub(),
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    createElement: () => domElementStub(),
    body: bodyStub,
};

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

sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({}),
    text: async () => '',
    headers: { get: () => 'application/json' },
});

const context = vm.createContext(sandbox);

for (const script of ['js/core.js', 'js/managers.js', 'js/demo-data.js', 'js/features/state.js', 'js/features/utils.js', 'js/features/filters.js', 'js/features/cache.js', 'js/features/mappings.js', 'js/features/requests.js', 'js/features/scenarios.js', 'js/features/recording.js', 'js/features/management.js', 'js/features/request-api.js', 'js/features/near-misses.js', 'js/features/wiremock-extras.js', 'js/features.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', script), 'utf8');
    vm.runInContext(code, context, { filename: script });
}

context.fetchAndRenderMappings = (data) => {
    context.__lastRender = data;
};

const baseMapping = (id, extra = {}) => ({
    id,
    uuid: id,
    name: `Mapping ${id}`,
    request: { method: 'GET', url: `/test/${id}` },
    response: { status: 200 },
    metadata: { created: '2024-01-01T00:00:00Z', edited: '2024-01-01T00:00:00Z', source: 'test' },
    ...extra,
});

const getRenderedIds = () => (context.__lastRender || []).map((m) => m.id);

const runTest = (name, fn) => {
    try {
        fn();
        console.log(`✔ ${name}`);
    } catch (error) {
        console.error(`✖ ${name}`);
        console.error(error);
        process.exit(1);
    }
};

runTest('create hydrates cache from globals before inserting new mapping', () => {
    context.__lastRender = null;
    context.cacheManager.cache.clear();

    const existingA = baseMapping('a');
    const existingB = baseMapping('b');
    context.originalMappings = [existingA, existingB];
    context.allMappings = [existingA, existingB];

    const created = baseMapping('c');
    context.updateOptimisticCache(created, 'create');

    const keys = Array.from(context.cacheManager.cache.keys()).sort();
    assert.strictEqual(keys.join(','), 'a,b,c');
    const cachedCreated = context.cacheManager.cache.get('c');
    assert.strictEqual(cachedCreated.id, 'c');
    assert.strictEqual(cachedCreated.uuid, 'c');
    assert.strictEqual(getRenderedIds().slice().sort().join(','), 'a,b,c');
});

runTest('update merges existing mapping and refreshes UI from cache snapshot', () => {
    context.__lastRender = null;
    context.cacheManager.cache.clear();

    const original = baseMapping('x', { response: { status: 200, body: 'ok' } });
    context.originalMappings = [original];
    context.allMappings = [original];

    const updated = baseMapping('x', {
        response: { status: 418, body: 'teapot' },
        metadata: { created: original.metadata.created, edited: '2024-02-02T00:00:00Z', source: 'ui' },
    });

    context.updateOptimisticCache(updated, 'update');

    const stored = context.cacheManager.cache.get('x');
    assert.strictEqual(stored.response.status, 418);
    assert.strictEqual(stored.response.body, 'teapot');
    assert.strictEqual(stored.metadata.edited, '2024-02-02T00:00:00Z');
    assert.strictEqual(getRenderedIds().join(','), 'x');
    assert.strictEqual(context.allMappings[0].response.status, 418);
});

runTest('delete hydrates cache then removes mapping and updates UI', () => {
    context.__lastRender = null;
    context.cacheManager.cache.clear();

    const m1 = baseMapping('d');
    const m2 = baseMapping('e');
    context.originalMappings = [m1, m2];
    context.allMappings = [m1, m2];

    context.updateOptimisticCache({ id: 'd' }, 'delete');

    assert.strictEqual(context.cacheManager.cache.has('d'), false);
    assert.strictEqual(context.cacheManager.cache.has('e'), true);
    assert.strictEqual(getRenderedIds().join(','), 'e');
    assert.strictEqual(context.allMappings.map((m) => m.id).join(','), 'e');
});

runTest('applyOptimisticMappingUpdate seeds cache from globals before writing', () => {
    context.__lastRender = null;
    context.cacheManager.cache.clear();
    context.cacheManager.optimisticQueue.length = 0;

    const base = baseMapping('p');
    context.originalMappings = [base];
    context.allMappings = [base];

    const optimistic = baseMapping('q');
    context.applyOptimisticMappingUpdate(optimistic);

    const keys = Array.from(context.cacheManager.cache.keys()).sort();
    assert.strictEqual(keys.join(','), 'p,q');
    assert.strictEqual(getRenderedIds().slice().sort().join(','), 'p,q');
    assert.strictEqual(context.cacheManager.optimisticQueue.length, 1);
    const queued = context.cacheManager.optimisticQueue[0];
    assert.strictEqual(queued.id, 'q');
    assert.strictEqual(queued.op, 'create');
});

runTest('updateOptimisticCache confirms queue entries by default', () => {
    context.__lastRender = null;
    context.cacheManager.cache.clear();
    context.cacheManager.optimisticQueue.length = 0;

    const existing = baseMapping('z');
    const updated = baseMapping('z', { response: { status: 204 } });

    context.cacheManager.cache.set('z', existing);
    context.cacheManager.addOptimisticUpdate(updated, 'update');

    context.updateOptimisticCache(updated, 'update');

    assert.strictEqual(context.cacheManager.optimisticQueue.length, 0);
    const stored = context.cacheManager.cache.get('z');
    assert.strictEqual(stored.response.status, 204);
});

console.log('✅ Cache workflow pipeline tests passed');
process.exit(0);
