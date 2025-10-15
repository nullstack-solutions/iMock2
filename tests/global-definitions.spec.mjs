import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const elementStub = () => ({
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    dataset: {},
    innerHTML: '',
    appendChild() {},
    remove() {},
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
    removeEventListener() {},
});

globalThis.window = globalThis;
window.console = console;
window.performance = { now: () => 0 };
window.setTimeout = setTimeout;
window.clearTimeout = clearTimeout;
window.setInterval = setInterval;
window.clearInterval = clearInterval;
window.addEventListener = () => {};
window.removeEventListener = () => {};

window.document = {
    getElementById: () => elementStub(),
    createElement: () => elementStub(),
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    body: {
        appendChild() {},
        classList: { add() {}, remove() {}, contains() { return false; } },
    },
};

window.localStorage = {
    _data: Object.create(null),
    getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; },
    setItem(key, value) { this._data[key] = String(value); },
    removeItem(key) { delete this._data[key]; },
    clear() { this._data = Object.create(null); },
};

window.SELECTORS = {
    LISTS: { MAPPINGS: 'mappings-list', REQUESTS: 'requests-list' },
    EMPTY: { MAPPINGS: 'mappings-empty', REQUESTS: 'requests-empty' },
    LOADING: { MAPPINGS: 'mappings-loading', REQUESTS: 'requests-loading' },
};

window.renderList = () => {};
window.renderMappingCard = (mapping) => `mapping:${mapping?.id ?? ''}`;
window.renderRequestCard = (request) => `request:${request?.id ?? ''}`;
window.debounce = (fn) => {
    const debounced = (...args) => fn.apply(this, args);
    debounced.flush = () => fn();
    return debounced;
};

const fixedIdUrl = '/mappings/00000000-0000-0000-0000-00000000cace';
const apiCalls = [];

window.ENDPOINTS = new Proxy({}, {
    get: (target, prop) => String(prop),
});

window.apiFetch = async (url, options) => {
    apiCalls.push({ url, options });
    if (url === fixedIdUrl) {
        return {
            id: '00000000-0000-0000-0000-00000000cace',
            response: { jsonBody: { mappings: [{ id: 'cached-entry' }] } },
        };
    }
    if (url === 'MAPPINGS_FIND_BY_METADATA') {
        return { mappings: [] };
    }
    throw new Error(`Unexpected apiFetch call for ${url}`);
};

window.isCacheEnabled = () => true;

const managersPath = pathToFileURL(path.join(__dirname, '..', 'js', 'managers.js'));
await import(managersPath);

const extrasPath = pathToFileURL(path.join(__dirname, '..', 'js', 'features', 'wiremock-extras.js'));
await import(extrasPath);

assert.equal(typeof window.renderMappingMarkup, 'function', 'renderMappingMarkup should be attached to window');
assert.equal(typeof window.renderRequestMarkup, 'function', 'renderRequestMarkup should be attached to window');

assert.equal(window.renderMappingMarkup({ id: 'mapping-1' }), 'mapping:mapping-1');
assert.equal(window.renderRequestMarkup({ id: 'request-1' }), 'request:request-1');

assert.equal(typeof window.isImockCacheMapping, 'function', 'isImockCacheMapping should be attached to window');
assert.equal(typeof window.loadImockCacheBestOf3, 'function', 'loadImockCacheBestOf3 should be attached to window');

const cacheMapping = { id: '00000000-0000-0000-0000-00000000cace' };
const normalMapping = { id: 'abc-123', metadata: { imock: { type: 'regular' } } };

assert.equal(window.isImockCacheMapping(cacheMapping), true);
assert.equal(window.isImockCacheMapping(normalMapping), false);

const cacheResult = await window.loadImockCacheBestOf3();
assert.deepEqual(cacheResult, { source: 'cache', data: { mappings: [{ id: 'cached-entry' }] } });
assert.equal(apiCalls.length, 1, 'Only fixed ID lookup should be used when it returns data');

assert.equal(typeof window.syncCacheWithMappings, 'function', 'syncCacheWithMappings should be attached to window');

const cache = new Map();
window.cacheManager = { cache, optimisticQueue: [] };

cache.set('legacy', {
    id: 'legacy',
    request: { method: 'GET', url: '/legacy' },
    response: { status: 200 },
    metadata: { foo: 'bar' },
});

cache.set('stale', {
    id: 'stale',
    request: { method: 'DELETE', url: '/stale' },
    response: { status: 410 },
});

window.syncCacheWithMappings([
    {
        id: 'legacy',
        request: { url: '/updated' },
        response: { body: 'hello' },
        metadata: { baz: 'qux' },
    },
    {
        id: 'new',
        request: { method: 'POST', url: '/new' },
        response: { status: 201 },
        metadata: { fresh: true },
    },
]);

const legacy = cache.get('legacy');
assert.deepEqual(legacy.request, { method: 'GET', url: '/updated' }, 'Existing requests should merge nested properties');
assert.deepEqual(legacy.response, { status: 200, body: 'hello' }, 'Existing responses should merge nested properties');
assert.deepEqual(legacy.metadata, { foo: 'bar', baz: 'qux' }, 'Metadata should merge without loss');

const newest = cache.get('new');
assert.equal(newest.request.method, 'POST');
assert.equal(newest.response.status, 201);
assert.equal(cache.has('stale'), false, 'Entries missing from the sync payload should be pruned');
assert.equal(typeof window.cacheLastUpdate, 'number', 'Successful sync should timestamp the update');

console.log('✅ global definitions test passed');
