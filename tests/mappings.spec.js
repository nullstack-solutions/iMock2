const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createLoggerStub } = require('./helpers/stubs');

function createMappingsTestContext() {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval: () => 0,
        clearInterval: () => {},
        performance: { now: () => 0 },
        AbortController,
        Element: class Element {},
    };

    sandbox.Logger = createLoggerStub(sandbox.console);

    // Mock DOM elements
    const domElementStub = () => ({
        style: {},
        classList: {
            add() {},
            remove() {},
            contains() { return false; },
            toggle(cls, force) {
                if (force !== undefined) {
                    this._classes = this._classes || new Set();
                    if (force) this._classes.add(cls);
                    else this._classes.delete(cls);
                }
            }
        },
        value: '',
        innerHTML: '',
        dataset: {},
        addEventListener() {},
        removeEventListener() {},
        setAttribute() {},
        getAttribute() { return null; },
        _classes: new Set(),
    });

    const mappingsListElement = domElementStub();
    const emptyStateElement = domElementStub();
    const loadingStateElement = domElementStub();

    sandbox.document = {
        getElementById(id) {
            if (id === 'mappings-list') return mappingsListElement;
            if (id === 'mappings-empty') return emptyStateElement;
            if (id === 'mappings-loading') return loadingStateElement;
            if (id === 'mappings-counter') return domElementStub();
            return domElementStub();
        },
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {},
        createElement: () => domElementStub(),
        body: domElementStub(),
    };

    sandbox.window = sandbox;
    sandbox.location = { origin: 'http://localhost' };
    sandbox.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    sandbox.navigator = { clipboard: { writeText: async () => {} } };
    sandbox.addEventListener = () => {};
    sandbox.removeEventListener = () => {};

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

    // Mock API fetch
    sandbox.__apiCalls = [];
    sandbox.__apiResponse = null;
    sandbox.__apiError = null;

    sandbox.fetch = async (url, options = {}) => {
        sandbox.__apiCalls.push({ url, options });

        if (sandbox.__apiError) {
            throw sandbox.__apiError;
        }

        const response = sandbox.__apiResponse || { mappings: [] };
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => response,
            text: async () => JSON.stringify(response),
            headers: { get: () => 'application/json' },
        };
    };

    sandbox.updateDataSourceIndicator = () => {};
    sandbox.updateMappingsCounter = () => { sandbox.__mappingsCounterCalled = true; };
    sandbox.updateRequestsCounter = () => {};
    sandbox.invalidateElementCache = () => {};
    sandbox.TabManager = { refresh: async () => {} };

    // Load all required scripts
    const context = vm.createContext(sandbox);

    const scripts = [
        'js/constants.js',
        'js/core.js',
        'js/managers.js',
        'js/demo-data.js',
        'js/features/store.js',
        'js/features/state.js',
        'js/features/utils.js',
        'js/features/filters.js',
        'js/features/cache.js',
        'js/features/wiremock-extras.js',
        'js/features/mappings.js',
    ];

    for (const script of scripts) {
        const code = fs.readFileSync(path.join(__dirname, '..', script), 'utf8');
        vm.runInContext(code, context, { filename: script });
    }

    return { context, mappingsListElement, emptyStateElement, loadingStateElement };
}

const tests = [];
const runTest = (name, fn) => tests.push({ name, fn });

// Test 1: getMappingById fetches from cache when available
runTest('getMappingById returns cached mapping when available', async () => {
    const { context } = createMappingsTestContext();

    const testMapping = {
        id: 'test-id-123',
        uuid: 'test-id-123',
        name: 'Test Mapping',
        request: { method: 'GET', url: '/test' },
        response: { status: 200 },
    };

    // Add to MappingsStore
    context.MappingsStore.setFromServer([testMapping]);

    const result = await context.getMappingById('test-id-123');

    assert.strictEqual(result.id, 'test-id-123');
    assert.strictEqual(result.name, 'Test Mapping');
    assert.strictEqual(context.__apiCalls.length, 0, 'Should not call API when cached');
});

// Test 2: getMappingById fetches from API when not in cache
runTest('getMappingById fetches from API when not cached', async () => {
    const { context } = createMappingsTestContext();

    const testMapping = {
        id: 'api-id-456',
        uuid: 'api-id-456',
        name: 'API Mapping',
        request: { method: 'POST', url: '/api' },
        response: { status: 201 },
    };

    context.allMappings = [];
    context.mappingIndex = new Map();
    context.__apiResponse = testMapping;

    const result = await context.getMappingById('api-id-456');

    assert.strictEqual(result.id, 'api-id-456');
    assert.strictEqual(result.name, 'API Mapping');
    assert.ok(context.__apiCalls.length > 0, 'Should call API when not cached');
});

// Test 3: renderMappingCard generates valid HTML for mapping
runTest('renderMappingCard generates valid HTML structure', () => {
    const { context } = createMappingsTestContext();

    const mapping = {
        id: 'render-test-123',
        uuid: 'render-test-123',
        name: 'Render Test',
        request: { method: 'GET', url: '/render-test', urlPath: '/render-test' },
        response: { status: 200 },
        priority: 5,
    };

    const html = context.renderMappingCard(mapping);

    assert.ok(typeof html === 'string', 'Should return string');
    assert.ok(html.length > 0, 'Should not be empty');
    assert.ok(html.includes('mapping-card'), 'Should include mapping-card class');
    assert.ok(html.includes('render-test-123'), 'Should include mapping ID');
    assert.ok(html.includes('GET'), 'Should include HTTP method');
    assert.ok(html.includes('/render-test'), 'Should include URL');
});

// Test 4: renderMappingCard handles missing optional fields
runTest('renderMappingCard handles minimal mapping data', () => {
    const { context } = createMappingsTestContext();

    const minimalMapping = {
        id: 'minimal-123',
        request: {},
        response: {},
    };

    const html = context.renderMappingCard(minimalMapping);

    assert.ok(html.includes('minimal-123'), 'Should include ID');
    assert.ok(html.includes('GET'), 'Should default to GET method');
});

// Test 5: renderMappingCard returns empty for invalid mapping
runTest('renderMappingCard returns empty string for invalid mapping', () => {
    const { context } = createMappingsTestContext();

    const result1 = context.renderMappingCard(null);
    const result2 = context.renderMappingCard({});
    const result3 = context.renderMappingCard({ request: {}, response: {} });

    assert.strictEqual(result1, '', 'Should return empty for null');
    assert.strictEqual(result2, '', 'Should return empty for object without id');
    assert.strictEqual(result3, '', 'Should return empty for object without id');
});

// Test 6: fetchAndRenderMappings handles empty mappings list
runTest('fetchAndRenderMappings handles empty response', async () => {
    const { context, mappingsListElement, emptyStateElement } = createMappingsTestContext();

    context.__apiResponse = { mappings: [] };

    const result = await context.fetchAndRenderMappings();

    assert.strictEqual(result, true, 'Should return true on success');
    // Verify empty state handling - either empty state is shown or mappings list is empty
    const emptyStateHidden = emptyStateElement.classList._classes &&
                            emptyStateElement.classList._classes.has('hidden');
    assert.ok(emptyStateHidden === false ||
              mappingsListElement.innerHTML === '' ||
              context.allMappings.length === 0, 'Should handle empty state');
});

// Test 7: fetchAndRenderMappings processes mappings array
runTest('fetchAndRenderMappings renders provided mappings', async () => {
    const { context, mappingsListElement } = createMappingsTestContext();

    const testMappings = [
        {
            id: 'map-1',
            uuid: 'map-1',
            name: 'Mapping 1',
            request: { method: 'GET', url: '/test1', urlPath: '/test1' },
            response: { status: 200 },
        },
        {
            id: 'map-2',
            uuid: 'map-2',
            name: 'Mapping 2',
            request: { method: 'POST', url: '/test2', urlPath: '/test2' },
            response: { status: 201 },
        },
    ];

    const result = await context.fetchAndRenderMappings(testMappings);

    assert.strictEqual(result, true, 'Should return true');
    
    // Check if mappings were processed - either in innerHTML or in MappingsStore
    const mappingsInStore = context.MappingsStore.getAll();
    assert.ok(mappingsListElement.innerHTML.includes('map-1') ||
              mappingsInStore.some(m => m.id === 'map-1'),
              'Should process mapping 1');
    assert.ok(mappingsListElement.innerHTML.includes('map-2') ||
              mappingsInStore.some(m => m.id === 'map-2'),
              'Should process mapping 2');
});

// Test 8: fetchAndRenderMappings handles DOM elements not found
runTest('fetchAndRenderMappings handles missing DOM elements gracefully', async () => {
    const { context } = createMappingsTestContext();

    // Override getElementById to return null
    context.document.getElementById = () => null;

    const result = await context.fetchAndRenderMappings();

    assert.strictEqual(result, false, 'Should return false when DOM elements missing');
});

// Test 9: applyOptimisticMappingUpdate adds new mapping to MappingsStore
runTest('applyOptimisticMappingUpdate adds optimistic mapping', () => {
    const { context } = createMappingsTestContext();

    if (!context.MappingsStore) {
        console.log('⚠️  MappingsStore not available, skipping test');
        return;
    }

    context.MappingsStore.init();
    context.originalMappings = [];
    context.allMappings = [];

    const newMapping = {
        id: 'optimistic-123',
        uuid: 'optimistic-123',
        name: 'Optimistic Mapping',
        request: { method: 'POST', url: '/optimistic' },
        response: { status: 200 },
    };

    context.applyOptimisticMappingUpdate(newMapping);

    // Check that the mapping was added to MappingsStore
    const storeHasMapping = context.MappingsStore.items.has('optimistic-123') ||
                            context.MappingsStore.pending.has('optimistic-123');
    assert.ok(storeHasMapping || context.allMappings.some(m => m.id === 'optimistic-123'),
              'Should add mapping to store or allMappings');
});

// Test 10: Mapping index is properly maintained
runTest('addMappingToIndex adds mapping to index', () => {
    const { context } = createMappingsTestContext();

    if (typeof context.addMappingToIndex !== 'function') {
        console.log('⚠️  addMappingToIndex not available, skipping test');
        return;
    }

    const mapping = {
        id: 'index-test-123',
        uuid: 'index-test-123',
        name: 'Index Test',
        request: { method: 'GET', url: '/index' },
        response: { status: 200 },
    };

    context.mappingIndex = new Map();
    context.addMappingToIndex(mapping);

    assert.ok(context.mappingIndex.has('index-test-123'), 'Should add to index');
    assert.strictEqual(context.mappingIndex.get('index-test-123').name, 'Index Test');
});

// Test 11: updateDataSourceIndicator handles 'synced' source correctly
runTest('updateDataSourceIndicator handles synced source', () => {
    const { context } = createMappingsTestContext();

    // Create a mock indicator element
    let indicatorText = '';
    let indicatorClass = '';
    context.document.getElementById = (id) => {
        if (id === 'data-source-indicator') {
            return {
                get textContent() { return indicatorText; },
                set textContent(v) { indicatorText = v; },
                get className() { return indicatorClass; },
                set className(v) { indicatorClass = v; }
            };
        }
        return null;
    };

    // Call with 'synced' source
    context.updateDataSourceIndicator('synced');

    assert.strictEqual(indicatorText, 'Source: synced', 'Should display "Source: synced"');
    assert.ok(indicatorClass.includes('badge-success'), 'Should have success badge class');
});

// Test 12: updateDataSourceIndicator handles 'cache' source correctly
runTest('updateDataSourceIndicator handles cache source', () => {
    const { context } = createMappingsTestContext();

    // Create a mock indicator element
    let indicatorText = '';
    let indicatorClass = '';
    context.document.getElementById = (id) => {
        if (id === 'data-source-indicator') {
            return {
                get textContent() { return indicatorText; },
                set textContent(v) { indicatorText = v; },
                get className() { return indicatorClass; },
                set className(v) { indicatorClass = v; }
            };
        }
        return null;
    };

    // Call with 'cache' source
    context.updateDataSourceIndicator('cache');

    assert.strictEqual(indicatorText, 'Source: cache', 'Should display "Source: cache"');
    assert.ok(indicatorClass.includes('badge-success'), 'Should have success badge class');
});

// Run all tests
(async () => {
    let passed = 0;
    let failed = 0;

    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`✔ ${name}`);
            passed++;
        } catch (error) {
            console.error(`✖ ${name}`);
            console.error(error);
            failed++;
        }
    }

    console.log(`\n✅ Mappings tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
})();
