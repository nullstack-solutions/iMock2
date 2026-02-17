const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createLoggerStub } = require('./helpers/stubs');

function createElementStub() {
    return {
        style: {},
        value: '',
        textContent: '',
        className: '',
        classList: {
            add() {},
            remove() {},
            contains() { return false; },
        }
    };
}

async function run() {
    const sandbox = {
        console,
        setTimeout: () => 0,
        clearTimeout: () => {},
        performance: { now: () => 0 },
        Logger: createLoggerStub(console),
        NotificationManager: { success() {}, warning() {} },
        SELECTORS: {
            CONNECTION: { HOST: 'wiremock-host', PORT: 'wiremock-port', STATUS_DOT: 'status-dot', STATUS_TEXT: 'status-text', SETUP: 'setup' },
            LOADING: { MAPPINGS: 'mappings-loading' },
            BUTTONS: { ADD_MAPPING: 'add-mapping' },
            UI: { STATS: 'stats', SEARCH_FILTERS: 'search-filters' },
            HEALTH: { INDICATOR: 'health-indicator' }
        },
        ENDPOINTS: { HEALTH: '/health', MAPPINGS: '/mappings' },
        window: null,
    };

    const elements = Object.create(null);
    sandbox.document = {
        getElementById(id) {
            if (!elements[id]) elements[id] = createElementStub();
            return elements[id];
        }
    };

    sandbox.window = sandbox;
    sandbox.readWiremockSettings = () => ({ host: 'localhost', port: '8080', autoConnect: true });
    sandbox.normalizeWiremockBaseUrl = (host, port) => `http://${host}:${port}/__admin`;
    sandbox.apiFetch = async () => ({ status: 'UP' });
    sandbox.LifecycleManager = { setNamedInterval: () => 0, clearInterval() {} };
    sandbox.updateUptime = () => {};
    sandbox.applyHealthUI = () => {};
    let coldStartArgs = null;
    sandbox.SyncEngine = {
        stop() {},
        coldStart: async (args) => { coldStartArgs = args; },
        start() {}
    };
    sandbox.loadScenarios = async () => {};
    sandbox.startHealthCheck = () => {};
    sandbox.stopUptime = () => {};

    let hideOnboardingCallCount = 0;
    let restoreFiltersCallCount = 0;
    let applyFiltersCallCount = 0;
    let flushFiltersCallCount = 0;
    sandbox.hideOnboardingOverlay = () => { hideOnboardingCallCount += 1; };
    sandbox.FilterManager = {
        restoreFilters() { restoreFiltersCallCount += 1; return { query: 'WEB DO' }; },
        applyMappingFilters() { applyFiltersCallCount += 1; },
        flushMappingFilters() { flushFiltersCallCount += 1; }
    };

    const context = vm.createContext(sandbox);
    const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'cache.js'), 'utf8');
    vm.runInContext(code, context, { filename: 'js/features/cache.js' });

    await context.connectToWireMock();

    assert.strictEqual(hideOnboardingCallCount, 1, 'should hide onboarding after successful connection');
    assert.strictEqual(restoreFiltersCallCount, 1, 'should restore mappings filter after successful connection');
    assert.strictEqual(applyFiltersCallCount, 1, 'should re-apply mappings filter when query exists');
    assert.strictEqual(flushFiltersCallCount, 1, 'should flush mapping filter debounce after re-applying');
    assert.ok(coldStartArgs && typeof coldStartArgs === 'object', 'should pass coldStart options object');
    assert.strictEqual(coldStartArgs.useCache, true, 'should pass cache mode explicitly to SyncEngine.coldStart');
}

run()
    .then(() => console.log('✅ connectToWireMock hides onboarding and restores mappings filter'))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
