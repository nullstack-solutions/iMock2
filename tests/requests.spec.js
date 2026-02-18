const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createLoggerStub } = require('./helpers/stubs');

function createRequestsTestContext() {
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
                this._classes = this._classes || new Set();
                if (force !== undefined) {
                    if (force) this._classes.add(cls);
                    else this._classes.delete(cls);
                }
            },
            _classes: new Set(),
        },
        value: '',
        innerHTML: '',
        dataset: {},
        addEventListener() {},
        removeEventListener() {},
        setAttribute() {},
        getAttribute() { return null; },
    });

    const requestsListElement = domElementStub();
    const emptyStateElement = domElementStub();
    const loadingStateElement = domElementStub();

    sandbox.document = {
        getElementById(id) {
            if (id === 'requests-list') return requestsListElement;
            if (id === 'requests-empty') return emptyStateElement;
            if (id === 'requests-loading') return loadingStateElement;
            if (id === 'requests-counter') return domElementStub();
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

        const response = sandbox.__apiResponse || { requests: [] };
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
    sandbox.updateMappingsCounter = () => {};
    sandbox.updateRequestsCounter = () => { sandbox.__requestsCounterCalled = true; };
    sandbox.invalidateElementCache = () => {};
    sandbox.TabManager = { refresh: async () => {} };

    // Load all required scripts
    const context = vm.createContext(sandbox);

    const scripts = [
        'js/constants.js',
        'js/core.js',
        'js/managers.js',
        'js/filter-state-manager.js',
        'js/filter-presets-manager.js',
        'js/demo-data.js',
        'js/features/store.js',
        'js/features/state.js',
        'js/features/utils.js',
        'js/features/render-helpers.js',
        'js/features/filters.js',
        'js/features/cache.js',
        'js/features/demo.js',
        'js/features/wiremock-extras.js',
        'js/features/mappings.js',
        'js/features/requests.js',
    ];

    for (const script of scripts) {
        const code = fs.readFileSync(path.join(__dirname, '..', script), 'utf8');
        vm.runInContext(code, context, { filename: script });
    }

    return { context, requestsListElement, emptyStateElement, loadingStateElement };
}

const tests = [];
const runTest = (name, fn) => tests.push({ name, fn });

// Test 1: fetchAndRenderRequests handles empty requests list
runTest('fetchAndRenderRequests handles empty response', async () => {
    const { context } = createRequestsTestContext();

    context.__apiResponse = { requests: [] };

    const result = await context.fetchAndRenderRequests();

    assert.strictEqual(result, true, 'Should return true on success');
    assert.ok(Array.isArray(context.allRequests), 'Should set allRequests array');
    assert.strictEqual(context.allRequests.length, 0, 'Should be empty');
});

// Test 2: fetchAndRenderRequests processes requests array
runTest('fetchAndRenderRequests renders provided requests', async () => {
    const { context, requestsListElement } = createRequestsTestContext();

    const testRequests = [
        {
            id: 'req-1',
            request: { method: 'GET', url: '/test1' },
            response: { status: 200 },
            wasMatched: true,
        },
        {
            id: 'req-2',
            request: { method: 'POST', url: '/test2' },
            response: { status: 404 },
            wasMatched: false,
        },
    ];

    const result = await context.fetchAndRenderRequests(testRequests);

    assert.strictEqual(result, true, 'Should return true');
    assert.ok(context.allRequests.length === 2, 'Should have 2 requests');
    assert.ok(context.allRequests.some(r => r.id === 'req-1'), 'Should process request 1');
    assert.ok(context.allRequests.some(r => r.id === 'req-2'), 'Should process request 2');
});

// Test 3: fetchAndRenderRequests handles missing DOM elements
runTest('fetchAndRenderRequests handles missing DOM elements gracefully', async () => {
    const { context } = createRequestsTestContext();

    // Override getElementById to return null
    context.document.getElementById = () => null;

    const result = await context.fetchAndRenderRequests();

    assert.strictEqual(result, false, 'Should return false when DOM elements missing');
});

// Test 4: renderRequestCard generates valid HTML for request
runTest('renderRequestCard generates valid HTML structure', () => {
    const { context } = createRequestsTestContext();

    const request = {
        id: 'render-test-123',
        request: { method: 'GET', url: '/render-test' },
        response: { status: 200 },
        responseTime: 150,
        wasMatched: true,
    };

    const html = context.renderRequestCard(request);

    assert.ok(typeof html === 'string', 'Should return string');
    assert.ok(html.length > 0, 'Should not be empty');
    assert.ok(html.includes('request-card'), 'Should include request-card class');
    assert.ok(html.includes('GET'), 'Should include HTTP method');
    assert.ok(html.includes('/render-test'), 'Should include URL');
});

// Test 5: renderRequestCard handles matched vs unmatched requests
runTest('renderRequestCard distinguishes matched and unmatched requests', () => {
    const { context } = createRequestsTestContext();

    const matchedRequest = {
        id: 'matched-1',
        request: { method: 'GET', url: '/matched' },
        response: { status: 200 },
        wasMatched: true,
    };

    const unmatchedRequest = {
        id: 'unmatched-1',
        request: { method: 'GET', url: '/unmatched' },
        response: { status: 404 },
        wasMatched: false,
    };

    const matchedHtml = context.renderRequestCard(matchedRequest);
    const unmatchedHtml = context.renderRequestCard(unmatchedRequest);

    assert.ok(matchedHtml.length > 0, 'Should render matched request');
    assert.ok(unmatchedHtml.length > 0, 'Should render unmatched request');
    // Both should render differently based on wasMatched status
    assert.notStrictEqual(matchedHtml, unmatchedHtml, 'Should render differently');
});

// Test 6: updateRequestsCounter is called after rendering
runTest('fetchAndRenderRequests calls updateRequestsCounter', async () => {
    const { context } = createRequestsTestContext();

    context.__apiResponse = { requests: [] };
    context.__requestsCounterCalled = false;

    // Override updateRequestsCounter after scripts are loaded
    context.updateRequestsCounter = () => { context.__requestsCounterCalled = true; };

    await context.fetchAndRenderRequests();

    assert.strictEqual(context.__requestsCounterCalled, true, 'Should call updateRequestsCounter');
});

// Test 7: Request tab totals computation
runTest('computeRequestTabTotals distinguishes matched requests', () => {
    const { context } = createRequestsTestContext();

    const sample = [
        { wasMatched: true },
        { wasMatched: false },
        { wasMatched: true },
        {},
    ];

    const totals = context.computeRequestTabTotals(sample);

    assert.strictEqual(totals.matched, 3, 'Should count matched + missing field as matched');
    assert.strictEqual(totals.unmatched, 1, 'Should count only explicitly false as unmatched');
});

// Test 8: Request snapshot refresh
runTest('refreshRequestTabSnapshot updates totals', () => {
    const { context } = createRequestsTestContext();

    const testRequests = [
        { id: 'req-1', wasMatched: true },
        { id: 'req-2', wasMatched: false },
        { id: 'req-3', wasMatched: true },
    ];
    
    // Initialize MappingsStore with test data
    context.MappingsStore.setRequests(testRequests);

    context.__requestCountsCalled = false;
    context.updateRequestTabCounts = () => { context.__requestCountsCalled = true; };

    context.refreshRequestTabSnapshot();

    assert.strictEqual(context.requestTabTotals.matched, 2);
    assert.strictEqual(context.requestTabTotals.unmatched, 1);
    assert.ok(context.__requestCountsCalled, 'Should update request counts');
});

// Test 9: Requests should not auto-fallback to demo mode
runTest('fetchAndRenderRequests returns false on API error without enabling demo mode', async () => {
    const { context } = createRequestsTestContext();

    // Simulate API error
    context.__apiError = new Error('Network error');

    const result = await context.fetchAndRenderRequests();

    assert.strictEqual(result, false, 'Should return false when requests API fails');
    assert.strictEqual(context.isDemoMode, false, 'Should not auto-enable demo mode');
});

// Test 10: Filtering requests by method
runTest('Requests can be filtered by HTTP method', async () => {
    const { context } = createRequestsTestContext();

    const testRequests = [
        { id: 'r1', request: { method: 'GET', url: '/get' }, response: { status: 200 } },
        { id: 'r2', request: { method: 'POST', url: '/post' }, response: { status: 201 } },
        { id: 'r3', request: { method: 'GET', url: '/get2' }, response: { status: 200 } },
    ];

    await context.fetchAndRenderRequests(testRequests);

    // Filter GET requests
    const getRequests = context.allRequests.filter(r => r.request.method === 'GET');
    const postRequests = context.allRequests.filter(r => r.request.method === 'POST');

    assert.strictEqual(getRequests.length, 2, 'Should have 2 GET requests');
    assert.strictEqual(postRequests.length, 1, 'Should have 1 POST request');
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

    console.log(`\n✅ Requests tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
})();
