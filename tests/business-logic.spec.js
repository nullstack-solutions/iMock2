const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {
    console,
    performance: { now: () => 0 },
    setTimeout,
    clearTimeout,
};

sandbox.window = sandbox;
sandbox.NotificationManager = {
    infoCalls: 0,
    info() { this.infoCalls += 1; },
};

sandbox.updateMappingTabCounts = () => { sandbox.__mappingCountsCalled = true; };
sandbox.updateRequestTabCounts = () => { sandbox.__requestCountsCalled = true; };

const context = vm.createContext(sandbox);

for (const script of ['js/features/state.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', script), 'utf8');
    vm.runInContext(code, context, { filename: script });
}

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

runTest('refreshMappingTabSnapshot stores totals and triggers counter update', () => {
    context.originalMappings = [
        { request: { method: 'GET' } },
        { request: { method: 'POST' } },
    ];
    context.__mappingCountsCalled = false;
    context.refreshMappingTabSnapshot();
    assert.strictEqual(context.mappingTabTotals.get, 1);
    assert.strictEqual(context.mappingTabTotals.post, 1);
    assert.ok(context.__mappingCountsCalled, 'updateMappingTabCounts should be invoked');
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
