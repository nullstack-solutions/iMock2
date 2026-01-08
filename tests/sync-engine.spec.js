'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createLoggerStub } = require('./helpers/stubs');

const intervals = [];
const cleared = [];
let fetchCalls = 0;
let resolveFetch;

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};

sandbox.window = sandbox;
sandbox.Logger = createLoggerStub({ log: () => {}, info: () => {}, warn: () => {}, error: () => {} });
sandbox.LifecycleManager = {
  setInterval(fn, delay) {
    const id = `interval-${intervals.length + 1}`;
    intervals.push({ id, delay, fn });
    return id;
  },
  clearInterval(id) {
    cleared.push(id);
  },
};

sandbox.MappingsStore = {
  metadata: {
    isSyncing: false,
    isOptimisticUpdate: false,
    lastFullSync: true,
    syncStartTime: null,
  },
  stats: {},
  items: new Map(),
  applyChanges: () => [],
  getAll: () => [],
};

sandbox.NotificationManager = {
  info: () => {},
  warning: () => {},
};

sandbox.fetchAndRenderMappings = () => {};
sandbox.fetchMappingsFromServer = () => {
  fetchCalls += 1;
  return new Promise(resolve => { resolveFetch = resolve; });
};

const context = vm.createContext(sandbox);
const syncEngineCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'features', 'sync-engine.js'), 'utf8');
vm.runInContext(syncEngineCode, context, { filename: 'js/features/sync-engine.js' });

const tests = [];
const runTest = (name, fn) => tests.push({ name, fn });

runTest('start is idempotent and stop clears timers', () => {
  intervals.length = 0;
  cleared.length = 0;

  context.SyncEngine.start();
  assert.strictEqual(intervals.length, 3, 'initial start should schedule three timers');

  const firstTimers = { ...context.SyncEngine.timers };
  context.SyncEngine.start();
  assert.strictEqual(intervals.length, 3, 'second start should not add more timers');
  assert.strictEqual(context.SyncEngine.timers.incremental, firstTimers.incremental, 'incremental timer should be reused');
  assert.strictEqual(context.SyncEngine.timers.fullSync, firstTimers.fullSync, 'full sync timer should be reused');
  assert.strictEqual(context.SyncEngine.timers.cacheRebuild, firstTimers.cacheRebuild, 'cache rebuild timer should be reused');

  context.SyncEngine.stop();
  assert.strictEqual(cleared.length, 3, 'stop should clear all timers');
  assert.strictEqual(context.SyncEngine.timers.incremental, null);
});

runTest('incrementalSync prevents overlapping executions', async () => {
  fetchCalls = 0;
  sandbox.MappingsStore.metadata.isSyncing = false;
  sandbox.MappingsStore.metadata.isOptimisticUpdate = false;
  sandbox.MappingsStore.metadata.lastFullSync = true;

  const firstRun = context.SyncEngine.incrementalSync();
  const secondRun = context.SyncEngine.incrementalSync();

  assert.strictEqual(fetchCalls, 1, 'second incrementalSync call should be skipped while first is running');

  resolveFetch({ mappings: [], meta: {} });
  await firstRun;
  await secondRun;

  assert.strictEqual(context.SyncEngine.isIncrementalSyncing, false, 'mutex flag should reset after completion');
  assert.strictEqual(sandbox.MappingsStore.metadata.isSyncing, false, 'store syncing flag should reset after completion');
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
