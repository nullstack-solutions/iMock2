const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createLoggerStub } = require('./helpers/stubs');

function createNotificationStub() {
    return {
        infoCalls: 0,
        successCalls: 0,
        warningCalls: 0,
        errorCalls: 0,
        info(message) {
            this.infoCalls += 1;
            this.lastInfo = message;
        },
        success(message) {
            this.successCalls += 1;
            this.lastSuccess = message;
        },
        warning(message) {
            this.warningCalls += 1;
            this.lastWarning = message;
        },
        error(message) {
            this.errorCalls += 1;
            this.lastError = message;
        },
    };
}


const sandbox = {
    console,
    performance: { now: () => 0 },
    setTimeout,
    clearTimeout,
};

sandbox.window = sandbox;
sandbox.NotificationManager = createNotificationStub();
sandbox.Logger = createLoggerStub(sandbox.console);

sandbox.updateRequestTabCounts = () => { sandbox.__requestCountsCalled = true; };

const context = vm.createContext(sandbox);

for (const script of ['js/features/state.js', 'js/features/demo.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', script), 'utf8');
    vm.runInContext(code, context, { filename: script });
}

const tests = [];
const runTest = (name, fn) => tests.push({ name, fn });

runTest('computeMappingTabTotals aggregates HTTP methods', () => {
    const sample = [
        { request: { method: 'GET' } },
        { request: { method: 'POST' } },
        { request: { method: 'GET' } },
        { request: { method: 'DELETE' } },
    ];
    const totals = context.computeMappingTabTotals(sample);
    assert.strictEqual(totals.get, 2);
    assert.strictEqual(totals.post, 1);
    assert.strictEqual(totals.delete, 1);
    assert.strictEqual(totals.patch, 0);
});

runTest('refreshMappingTabSnapshot stores totals correctly', () => {
    context.originalMappings = [
        { request: { method: 'GET' } },
        { request: { method: 'POST' } },
    ];
    context.refreshMappingTabSnapshot();
    assert.strictEqual(context.mappingTabTotals.get, 1);
    assert.strictEqual(context.mappingTabTotals.post, 1);
});

runTest('computeRequestTabTotals distinguishes matched requests', () => {
    const sample = [
        { wasMatched: true },
        { wasMatched: false },
        {},
    ];
    const totals = context.computeRequestTabTotals(sample);
    assert.strictEqual(totals.matched, 2);
    assert.strictEqual(totals.unmatched, 1);
});

runTest('refreshRequestTabSnapshot updates totals and invokes counter hook', () => {
    context.originalRequests = [
        { wasMatched: true },
        { wasMatched: false },
    ];
    context.__requestCountsCalled = false;
    context.refreshRequestTabSnapshot();
    assert.strictEqual(context.requestTabTotals.matched, 1);
    assert.strictEqual(context.requestTabTotals.unmatched, 1);
    assert.ok(context.__requestCountsCalled, 'updateRequestTabCounts should be invoked');
});

runTest('markDemoModeActive toggles flags and sends notification once', () => {
    context.demoModeAnnounced = false;
    context.markDemoModeActive('test-reason');
    assert.strictEqual(context.isDemoMode, true);
    assert.strictEqual(context.demoModeReason, 'test-reason');
    assert.strictEqual(context.NotificationManager.infoCalls, 1);
    // second call should not emit another toast
    context.markDemoModeActive('second-call');
    assert.strictEqual(context.NotificationManager.infoCalls, 1);
});

runTest('Demo loader hydrates dataset via mocked renderers', async () => {
    const notifications = createNotificationStub();
    const calls = {
        reason: null,
        mappings: null,
        requests: null,
    };

    const loader = context.DemoMode.createLoader({
        markDemoModeActive: (reason) => { calls.reason = reason; },
        notificationManager: notifications,
        fetchAndRenderMappings: async (data, options) => {
            calls.mappings = { data, options };
            return true;
        },
        fetchAndRenderRequests: async (data, options) => {
            calls.requests = { data, options };
            return true;
        },
        isDatasetAvailable: () => true,
        getDataset: () => ({
            mappings: [{ id: 'mapping-1' }],
            requests: [{ id: 'request-1' }],
        }),
    });

    const result = await loader();
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(calls.reason, 'manual-trigger');
    assert.strictEqual(calls.mappings.options.source, 'demo');
    assert.strictEqual(calls.requests.options.source, 'demo');
    assert.strictEqual(notifications.successCalls, 1);
    assert.strictEqual(notifications.warningCalls, 0);
    assert.strictEqual(notifications.errorCalls, 0);
});

runTest('Demo loader reports unavailable dataset without invoking renderers', async () => {
    const notifications = createNotificationStub();
    let markCalled = false;

    const loader = context.DemoMode.createLoader({
        markDemoModeActive: () => { markCalled = true; },
        notificationManager: notifications,
        fetchAndRenderMappings: async () => {
            throw new Error('should not be called');
        },
        fetchAndRenderRequests: async () => {
            throw new Error('should not be called');
        },
        isDatasetAvailable: () => false,
        getDataset: () => null,
    });

    const result = await loader();
    assert.strictEqual(result.status, 'unavailable');
    assert.strictEqual(markCalled, false);
    assert.strictEqual(notifications.errorCalls, 1);
    assert.strictEqual(notifications.warningCalls, 0);
});

runTest('Demo loader surfaces partial failures with warnings', async () => {
    const notifications = createNotificationStub();

    const loader = context.DemoMode.createLoader({
        markDemoModeActive: () => {},
        notificationManager: notifications,
        fetchAndRenderMappings: async () => true,
        fetchAndRenderRequests: async () => {
            throw new Error('request fixture failed');
        },
        isDatasetAvailable: () => true,
        getDataset: () => ({ mappings: [], requests: [] }),
    });

    const result = await loader();
    assert.strictEqual(result.status, 'partial');
    assert.strictEqual(notifications.successCalls, 0);
    assert.strictEqual(notifications.warningCalls, 1);
    assert.strictEqual(notifications.errorCalls, 1);
    assert.strictEqual(result.errors.length, 1);
});

(async () => {
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
})();
