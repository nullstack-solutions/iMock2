const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createLoggerStub } = require('./helpers/stubs');

function createNotificationStub() {
    return {
        infoCalls: [],
        successCalls: [],
        warningCalls: [],
        errorCalls: [],
        info(message) { this.infoCalls.push(message); },
        success(message) { this.successCalls.push(message); },
        warning(message) { this.warningCalls.push(message); },
        error(message) { this.errorCalls.push(message); },
    };
}

function createStorageStub() {
    return {
        _data: Object.create(null),
        getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; },
        setItem(key, value) { this._data[key] = String(value); },
        removeItem(key) { delete this._data[key]; },
        clear() { this._data = Object.create(null); },
    };
}

function createOperationsContext() {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        Date,
        Math,
        performance: { now: () => Date.now() },
    };

    sandbox.window = sandbox;
    sandbox.Logger = createLoggerStub(sandbox.console);
    sandbox.NotificationManager = createNotificationStub();
    sandbox.localStorage = createStorageStub();
    sandbox.crypto = { randomUUID: () => 'fixed-uuid' };
    sandbox.BroadcastChannel = class MockBroadcastChannel {
        constructor(name) {
            this.name = name;
        }
        postMessage(message) {
            sandbox.__broadcastMessages.push({ channel: this.name, message });
        }
    };

    sandbox.__broadcastMessages = [];
    sandbox.__apiCalls = [];
    sandbox.apiFetch = async (url, options = {}) => {
        sandbox.__apiCalls.push({ url, options });
        if (typeof sandbox.__apiHandler === 'function') {
            return sandbox.__apiHandler(url, options);
        }
        return {};
    };

    sandbox.FilterManager = {
        applyCalls: 0,
        flushCalls: 0,
        applyMappingFilters() {
            this.applyCalls += 1;
        },
        flushMappingFilters() {
            this.flushCalls += 1;
        },
    };

    sandbox.__snapshotRefreshCount = 0;
    sandbox.refreshMappingTabSnapshot = () => {
        sandbox.__snapshotRefreshCount += 1;
    };

    const context = vm.createContext(sandbox);
    const scripts = [
        'js/features/store.js',
        'js/features/utils.js',
        'js/features/operations.js',
    ];

    for (const script of scripts) {
        const code = fs.readFileSync(path.join(__dirname, '..', script), 'utf8');
        vm.runInContext(code, context, { filename: script });
    }

    return context;
}

const toPlain = (value) => JSON.parse(JSON.stringify(value));

const tests = [];
const runTest = (name, fn) => tests.push({ name, fn });

runTest('normalizeScenarioNameValue trims and normalizes whitespace', () => {
    const context = createOperationsContext();
    const result = context.normalizeScenarioNameValue('  checkout flow  ');

    assert.strictEqual(result.original, '  checkout flow  ');
    assert.strictEqual(result.normalized, 'checkout_flow');
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.hadWhitespace, true);
    assert.strictEqual(result.cleared, false);
});

runTest('normalizeScenarioNameField clears whitespace-only scenario names', () => {
    const context = createOperationsContext();
    const mapping = { id: 'm-1', scenarioName: '   ' };
    const notifications = [];

    const result = context.normalizeScenarioNameField(mapping, {
        notify: (message) => notifications.push(message),
    });

    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.cleared, true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(mapping, 'scenarioName'), false);
    assert.strictEqual(notifications.length, 1);
});

runTest('MappingsOperations.create normalizes scenario and confirms pending entry', async () => {
    const context = createOperationsContext();

    context.__apiHandler = async (url, options) => {
        assert.strictEqual(url, '/mappings');
        assert.strictEqual(options.method, 'POST');
        const payload = JSON.parse(options.body);
        assert.strictEqual(payload.scenarioName, 'checkout_flow');
        return { id: 'srv-1', name: payload.name, scenarioName: payload.scenarioName };
    };

    const created = await context.MappingsOperations.create({
        name: 'Create mapping',
        scenarioName: 'checkout flow',
        request: { method: 'GET', url: '/orders' },
        response: { status: 200 },
    });

    assert.strictEqual(created.id, 'srv-1');
    assert.strictEqual(context.MappingsStore.pending.size, 0);
    assert.ok(context.MappingsStore.get('srv-1'));
    assert.ok(context.NotificationManager.warningCalls.length >= 1, 'normalization warning should be emitted');
    assert.ok(context.NotificationManager.successCalls.length >= 1, 'success notification should be emitted');
    assert.ok(context.FilterManager.applyCalls >= 1);
    assert.ok(context.FilterManager.flushCalls >= 1);
});

runTest('MappingsOperations.create rolls back optimistic mapping on API error', async () => {
    const context = createOperationsContext();
    context.__apiHandler = async () => {
        throw new Error('create failed');
    };

    let thrown;
    try {
        await context.MappingsOperations.create({
            name: 'Broken mapping',
            request: { method: 'GET', url: '/broken' },
            response: { status: 500 },
        });
    } catch (error) {
        thrown = error;
    }

    assert.ok(thrown, 'create should throw');
    assert.strictEqual(thrown.message, 'create failed');
    assert.strictEqual(context.MappingsStore.pending.size, 0);
    assert.strictEqual(context.MappingsStore.getAll().length, 0);
    assert.ok(context.NotificationManager.errorCalls.length >= 1, 'error notification should be emitted');
});

runTest('MappingsOperations.update rejects missing mappings', async () => {
    const context = createOperationsContext();

    await assert.rejects(
        () => context.MappingsOperations.update('missing-id', { name: 'new-name' }),
        /not found/
    );
});

runTest('MappingsOperations.update sends cleaned payload and stores server result', async () => {
    const context = createOperationsContext();
    context.MappingsStore.setFromServer([
        {
            id: 'm-1',
            name: 'Original',
            scenarioName: 'legacy',
            request: { method: 'GET', url: '/users' },
            response: { status: 200 },
            metadata: { created: 1000 },
        },
    ]);

    context.__apiHandler = async (url, options) => {
        assert.strictEqual(url, '/mappings/m-1');
        assert.strictEqual(options.method, 'PUT');
        const payload = JSON.parse(options.body);
        assert.strictEqual(payload.name, 'Updated');
        assert.strictEqual(payload.scenarioName, 'new_flow');
        assert.strictEqual(Object.prototype.hasOwnProperty.call(payload, '_pending'), false);
        assert.strictEqual(Object.prototype.hasOwnProperty.call(payload, '_operation'), false);
        return { ...payload, id: 'm-1' };
    };

    const updated = await context.MappingsOperations.update('m-1', {
        name: 'Updated',
        scenarioName: 'new flow',
    });

    assert.strictEqual(updated.id, 'm-1');
    assert.strictEqual(context.MappingsStore.pending.size, 0);
    assert.strictEqual(context.MappingsStore.get('m-1').name, 'Updated');
    assert.ok(context.NotificationManager.warningCalls.length >= 1, 'normalization warning should be emitted');
});

runTest('MappingsOperations.delete skips unknown mappings without API call', async () => {
    const context = createOperationsContext();

    await context.MappingsOperations.delete('missing-id');

    assert.strictEqual(context.__apiCalls.length, 0);
    assert.strictEqual(context.MappingsStore.pending.size, 0);
});

runTest('MappingsOperations.delete removes mapping and confirms operation', async () => {
    const context = createOperationsContext();
    context.MappingsStore.setFromServer([
        {
            id: 'm-2',
            name: 'To delete',
            request: { method: 'DELETE', url: '/obsolete' },
            response: { status: 204 },
        },
    ]);

    context.__apiHandler = async (url, options) => {
        assert.strictEqual(url, '/mappings/m-2');
        assert.strictEqual(options.method, 'DELETE');
        return {};
    };

    await context.MappingsOperations.delete('m-2');

    assert.strictEqual(context.MappingsStore.get('m-2'), null);
    assert.strictEqual(context.MappingsStore.pending.size, 0);
    assert.ok(context.NotificationManager.successCalls.length >= 1);
});

runTest('MappingsOperations.batchDelete returns success/failed breakdown', async () => {
    const context = createOperationsContext();
    context.MappingsStore.setFromServer([
        { id: 'a', name: 'A', request: { method: 'GET', url: '/a' }, response: { status: 200 } },
        { id: 'b', name: 'B', request: { method: 'GET', url: '/b' }, response: { status: 200 } },
    ]);

    context.__apiHandler = async (url) => {
        if (url.endsWith('/b')) {
            throw new Error('cannot delete b');
        }
        return {};
    };

    const result = await context.MappingsOperations.batchDelete(['a', 'b']);

    assert.deepStrictEqual(toPlain(result.success), ['a']);
    assert.strictEqual(result.failed.length, 1);
    assert.strictEqual(result.failed[0].id, 'b');
    assert.ok(context.NotificationManager.warningCalls.length >= 1, 'partial failure warning should be emitted');
});

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

    console.log(`\n✅ Operations tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
})();
