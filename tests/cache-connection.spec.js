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
    sandbox.SyncEngine = { stop() {}, coldStart: async () => {}, start() {} };
    sandbox.loadScenarios = async () => {};
    sandbox.startHealthCheck = () => {};
    sandbox.stopUptime = () => {};

    let hideOnboardingCalls = 0;
    let restoreCalls = 0;
    let applyCalls = 0;
    let flushCalls = 0;
    sandbox.hideOnboardingOverlay = () => { hideOnboardingCalls += 1; };
    sandbox.FilterManager = {
        restoreFilters() { restoreCalls += 1; return { query: 'WEB DO' }; },
        applyMappingFilters() { applyCalls += 1; },
        flushMappingFilters() { flushCalls += 1; }
    };

    const context = vm.createContext(sandbox);
    const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'cache.js'), 'utf8');
    vm.runInContext(code, context, { filename: 'js/features/cache.js' });

    await context.connectToWireMock();

    assert.strictEqual(hideOnboardingCalls, 1, 'should hide onboarding after successful connection');
    assert.strictEqual(restoreCalls, 1, 'should restore mappings filter after successful connection');
    assert.strictEqual(applyCalls, 1, 'should re-apply mappings filter when query exists');
    assert.strictEqual(flushCalls, 1, 'should flush mapping filter debounce after re-applying');
}

run()
    .then(() => console.log('✅ connectToWireMock hides onboarding and restores mappings filter'))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
