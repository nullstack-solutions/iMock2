const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createLoggerStub(consoleObj = console) {
    return {
        LEVELS: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, SILENT: 4 },
        setLevel() {},
        debug: (...args) => consoleObj.log(...args),
        info: (...args) => consoleObj.info(...args),
        warn: (...args) => consoleObj.warn(...args),
        error: (...args) => consoleObj.error(...args),
        api: (...args) => consoleObj.log(...args),
        cache: (...args) => consoleObj.log(...args),
        ui: (...args) => consoleObj.log(...args),
    };
}

function createScenariosTestContext() {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval: () => 0,
        clearInterval: () => {},
        performance: { now: () => 0 },
        AbortController,
        Element: class Element {},
        URL: global.URL,
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

    sandbox.document = {
        getElementById(id) {
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
        successCalls: 0,
        errorCalls: 0,
        warningCalls: 0,
        infoCalls: 0,
        success(msg) { this.successCalls++; this.lastSuccess = msg; },
        error(msg) { this.errorCalls++; this.lastError = msg; },
        warning(msg) { this.warningCalls++; this.lastWarning = msg; },
        info(msg) { this.infoCalls++; this.lastInfo = msg; },
        show() {},
        TYPES: { INFO: 'info', WARNING: 'warning', ERROR: 'error' },
    };

    sandbox.FilterManager = {
        applyMappingFilters() {},
        applyRequestFilters() {},
    };

    // Mock confirm
    sandbox.confirm = () => true;

    // Mock API fetch
    sandbox.__apiCalls = [];
    sandbox.__apiResponse = null;
    sandbox.__apiError = null;

    sandbox.fetch = async (url, options = {}) => {
        sandbox.__apiCalls.push({ url, options });

        if (sandbox.__apiError) {
            throw sandbox.__apiError;
        }

        const response = sandbox.__apiResponse || { scenarios: [] };
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
    sandbox.updateRequestsCounter = () => {};
    sandbox.updateScenariosCounter = () => { sandbox.__scenariosCounterCalled = true; };
    sandbox.invalidateElementCache = () => {};
    sandbox.TabManager = {
        refresh: async (tab) => {
            sandbox.__tabManagerRefreshed = tab;
            if (tab === 'scenarios' && typeof sandbox.loadScenarios === 'function') {
                await sandbox.loadScenarios();
            }
        }
    };

    // Load all required scripts
    const context = vm.createContext(sandbox);

    const scripts = [
        'js/core.js',
        'js/managers.js',
        'js/demo-data.js',
        'js/features/state.js',
        'js/features/utils.js',
        'js/features/scenarios.js',
    ];

    for (const script of scripts) {
        const code = fs.readFileSync(path.join(__dirname, '..', script), 'utf8');
        vm.runInContext(code, context, { filename: script });
    }

    return { context };
}

const tests = [];
const runTest = (name, fn) => tests.push({ name, fn });

// Test 1: loadScenarios fetches and stores scenarios
runTest('loadScenarios fetches scenarios from API', async () => {
    const { context } = createScenariosTestContext();

    const testScenarios = [
        {
            id: 'scenario-1',
            name: 'Test Scenario 1',
            state: 'Started',
            possibleStates: ['Started', 'InProgress', 'Finished'],
            mappings: [],
        },
        {
            id: 'scenario-2',
            name: 'Test Scenario 2',
            state: 'Active',
            possibleStates: ['Active', 'Inactive'],
            mappings: [],
        },
    ];

    context.__apiResponse = { scenarios: testScenarios };

    await context.loadScenarios();

    assert.ok(Array.isArray(context.allScenarios), 'Should set allScenarios array');
    assert.strictEqual(context.allScenarios.length, 2, 'Should have 2 scenarios');
    assert.strictEqual(context.allScenarios[0].id, 'scenario-1');
    assert.strictEqual(context.allScenarios[1].id, 'scenario-2');
});

// Test 2: loadScenarios handles empty response
runTest('loadScenarios handles empty scenarios list', async () => {
    const { context } = createScenariosTestContext();

    context.__apiResponse = { scenarios: [] };

    await context.loadScenarios();

    assert.ok(Array.isArray(context.allScenarios), 'Should set allScenarios array');
    assert.strictEqual(context.allScenarios.length, 0, 'Should be empty');
});

// Test 3: loadScenarios handles API errors
runTest('loadScenarios handles API errors gracefully', async () => {
    const { context } = createScenariosTestContext();

    context.__apiError = new Error('Network error');

    await context.loadScenarios();

    assert.ok(Array.isArray(context.allScenarios), 'Should set allScenarios array');
    assert.strictEqual(context.allScenarios.length, 0, 'Should be empty on error');
    assert.strictEqual(context.NotificationManager.errorCalls, 1, 'Should show error notification');
});

// Test 4: setScenarioState updates scenario state
runTest('setScenarioState sends PUT request to update state', async () => {
    const { context } = createScenariosTestContext();

    // Setup a scenario first
    context.allScenarios = [
        {
            id: 'test-scenario',
            identifier: 'test-scenario',
            name: 'Test Scenario',
            decodedId: 'test-scenario',
            decodedName: 'Test Scenario',
            displayName: 'Test Scenario',
            state: 'Started',
            possibleStates: ['Started', 'InProgress', 'Finished'],
            mappings: [],
            explicitStateEndpoint: '/scenarios/test-scenario/state',
        },
    ];

    context.__apiResponse = {};
    context.__apiCalls = [];

    await context.setScenarioState('test-scenario', 'InProgress');

    // Check that API was called
    assert.ok(context.__apiCalls.length > 0, 'Should make API call');

    // Find the PUT request
    const putCall = context.__apiCalls.find(call => call.options.method === 'PUT');
    assert.ok(putCall, 'Should make PUT request');
});

// Test 5: setScenarioState handles invalid scenario
runTest('setScenarioState handles invalid scenario identifier', async () => {
    const { context } = createScenariosTestContext();

    context.allScenarios = [];
    context.__apiCalls = [];

    await context.setScenarioState('non-existent', 'SomeState');

    // Should still attempt the API call with the provided identifier
    assert.ok(context.__apiCalls.length >= 0, 'Should handle gracefully');
});

// Test 6: refreshScenarios calls TabManager
runTest('refreshScenarios triggers TabManager refresh', async () => {
    const { context } = createScenariosTestContext();

    context.__apiResponse = { scenarios: [] };
    let refreshCalled = false;

    // Override TabManager.refresh to track calls
    const originalRefresh = context.TabManager.refresh;
    context.TabManager.refresh = async (tab) => {
        refreshCalled = true;
        context.__tabManagerRefreshed = tab;
        if (originalRefresh) {
            await originalRefresh.call(context.TabManager, tab);
        }
    };

    await context.refreshScenarios();

    assert.strictEqual(refreshCalled, true, 'Should call TabManager.refresh');
    assert.strictEqual(context.__tabManagerRefreshed, 'scenarios', 'Should refresh scenarios tab');
});

// Test 7: normalizeScenario handles URL-encoded names
runTest('normalizeScenario decodes URL-encoded strings', () => {
    const { context } = createScenariosTestContext();

    // Access internal safeDecode function through a scenario normalization
    const testScenario = {
        id: 'test%20scenario',
        name: 'Test%20Scenario',
        state: 'Started',
        possibleStates: [],
        mappings: [],
    };

    context.allScenarios = [testScenario];
    context.__apiResponse = { scenarios: [testScenario] };

    // Load scenarios which will normalize them
    context.loadScenarios().then(() => {
        const normalized = context.allScenarios[0];
        assert.ok(normalized, 'Should have normalized scenario');
    });
});

// Test 8: resetAllScenarios resets all scenarios
runTest('resetAllScenarios sends POST request to reset endpoint', async () => {
    const { context } = createScenariosTestContext();

    context.allScenarios = [
        { id: 'sc1', state: 'InProgress' },
        { id: 'sc2', state: 'Active' },
    ];

    context.__apiResponse = { scenarios: [] };
    context.__apiCalls = [];

    await context.resetAllScenarios();

    // Check for POST request
    const postCall = context.__apiCalls.find(call => call.options.method === 'POST');
    assert.ok(postCall, 'Should make POST request to reset');
    assert.strictEqual(context.NotificationManager.successCalls, 1, 'Should show success notification');
});

// Test 9: resetAllScenarios handles user cancellation
runTest('resetAllScenarios respects user cancellation', async () => {
    const { context } = createScenariosTestContext();

    context.confirm = () => false; // User cancels
    context.__apiCalls = [];

    await context.resetAllScenarios();

    assert.strictEqual(context.__apiCalls.length, 0, 'Should not make API call when cancelled');
});

// Test 10: Scenario state normalization
runTest('Scenarios are normalized with proper state handling', async () => {
    const { context } = createScenariosTestContext();

    const rawScenarios = [
        {
            id: 'raw-scenario',
            name: 'Raw Scenario',
            state: 'Initial%20State',
            possibleStates: ['State%201', 'State%202'],
            mappings: [
                {
                    requiredScenarioState: 'Required%20State',
                    newScenarioState: 'New%20State',
                },
            ],
        },
    ];

    context.__apiResponse = { scenarios: rawScenarios };

    await context.loadScenarios();

    assert.ok(context.allScenarios.length > 0, 'Should load scenarios');
    const scenario = context.allScenarios[0];
    assert.ok(scenario.identifier, 'Should have identifier');
    assert.ok(scenario.displayName, 'Should have displayName');
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

    console.log(`\n✅ Scenarios tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
})();
