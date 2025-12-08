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

// Minimal sandbox for MappingsStore
const sandbox = {
    console,
    Map,
    Set,
    Date,
    Object,
    Array,
    performance: { now: () => Date.now() },
};

sandbox.window = sandbox;
sandbox.Logger = createLoggerStub(sandbox.console);

const context = vm.createContext(sandbox);

// Load only the MappingsStore
const storeCode = fs.readFileSync(path.join(__dirname, '..', 'js/features/store.js'), 'utf8');
vm.runInContext(storeCode, context, { filename: 'store.js' });

const queuedTests = [];
const runTest = (name, fn) => {
    queuedTests.push({ name, fn });
};

// Test 1: MappingsStore initialization
runTest('MappingsStore initializes with empty state', () => {
    context.MappingsStore.init();

    assert.strictEqual(context.MappingsStore.items.size, 0, 'items should be empty');
    assert.strictEqual(context.MappingsStore.pending.size, 0, 'pending should be empty');
    assert.strictEqual(context.MappingsStore.stats.totalMappings, 0, 'stats should show 0 mappings');
});

// Test 2: Adding mappings to store
runTest('MappingsStore.setFromServer adds mappings', () => {
    context.MappingsStore.init();

    const mappings = [
        { id: 'a', name: 'Mapping A', priority: 1 },
        { id: 'b', name: 'Mapping B', priority: 2 },
    ];

    context.MappingsStore.setFromServer(mappings);

    assert.strictEqual(context.MappingsStore.items.size, 2, 'should have 2 mappings');
    assert.strictEqual(context.MappingsStore.items.get('a').name, 'Mapping A');
    assert.strictEqual(context.MappingsStore.items.get('b').name, 'Mapping B');
});

// Test 3: getAll returns all mappings
runTest('MappingsStore.getAll returns all non-deleted mappings', () => {
    context.MappingsStore.init();

    const mappings = [
        { id: 'x', name: 'X' },
        { id: 'y', name: 'Y' },
    ];

    context.MappingsStore.setFromServer(mappings);
    const all = context.MappingsStore.getAll();

    assert.strictEqual(all.length, 2);
    assert.strictEqual(all[0].id, 'x');
    assert.strictEqual(all[1].id, 'y');
});

// Test 4: Pending create operation
runTest('addPending tracks optimistic create operations', () => {
    context.MappingsStore.init();

    const newMapping = { id: 'temp-123', name: 'New Mapping', priority: 5 };
    context.MappingsStore.addPending({
        id: 'temp-123',
        type: 'create',
        payload: null,
        optimisticMapping: newMapping,
    });

    assert.strictEqual(context.MappingsStore.pending.size, 1);
    const pending = context.MappingsStore.pending.get('temp-123');
    assert.strictEqual(pending.type, 'create');
    assert.strictEqual(pending.optimisticMapping.name, 'New Mapping');
});

// Test 5: getAll includes optimistic creates
runTest('getAll includes optimistic create operations', () => {
    context.MappingsStore.init();

    context.MappingsStore.setFromServer([
        { id: 'a', name: 'A' },
    ]);

    context.MappingsStore.addPending({
        id: 'temp-b',
        type: 'create',
        payload: null,
        optimisticMapping: { id: 'temp-b', name: 'B (optimistic)' },
    });

    const all = context.MappingsStore.getAll();
    assert.strictEqual(all.length, 2);
    assert.strictEqual(all.some(m => m.id === 'a'), true);
    assert.strictEqual(all.some(m => m.id === 'temp-b'), true);
});

// Test 6: Pending delete hides mapping from getAll
runTest('Pending delete operations hide mappings from getAll', () => {
    context.MappingsStore.init();

    context.MappingsStore.setFromServer([
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
    ]);

    context.MappingsStore.addPending({
        id: 'a',
        type: 'delete',
        payload: null,
        optimisticMapping: null,
    });

    const all = context.MappingsStore.getAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, 'b');
});

// Test 7: confirmPending removes pending operation
runTest('confirmPending removes confirmed operation from pending', () => {
    context.MappingsStore.init();

    context.MappingsStore.addPending({
        id: 'temp-x',
        type: 'create',
        payload: null,
        optimisticMapping: { id: 'temp-x', name: 'X' },
    });

    assert.strictEqual(context.MappingsStore.pending.size, 1);

    // Server confirms with real ID
    context.MappingsStore.confirmPending('temp-x', { id: 'real-x', name: 'X' });

    assert.strictEqual(context.MappingsStore.pending.size, 0);
    assert.strictEqual(context.MappingsStore.items.has('real-x'), true);
});

// Run all queued tests
(async () => {
    let passed = 0;
    let failed = 0;

    for (const { name, fn } of queuedTests) {
        try {
            await fn();
            console.log(`✔ ${name}`);
            passed++;
        } catch (err) {
            console.error(`❌ ${name}`);
            console.error(err.message);
            if (err.stack) {
                console.error(err.stack);
            }
            failed++;
        }
    }

    if (failed > 0) {
        console.error(`\n❌ MappingsStore tests: ${passed} passed, ${failed} failed`);
        process.exit(1);
    }

    console.log(`\n✅ MappingsStore tests: ${passed} passed, 0 failed`);
})();
