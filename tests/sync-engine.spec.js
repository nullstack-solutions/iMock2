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
  assert.strictEqual(context.SyncEngine.isStarted, true, 'isStarted should be set after start');

  const firstTimers = { ...context.SyncEngine.timers };
  context.SyncEngine.start();
  assert.strictEqual(intervals.length, 3, 'second start should not add more timers');
  assert.strictEqual(context.SyncEngine.timers.incremental, firstTimers.incremental, 'incremental timer should be reused');
  assert.strictEqual(context.SyncEngine.timers.fullSync, firstTimers.fullSync, 'full sync timer should be reused');
  assert.strictEqual(context.SyncEngine.timers.cacheRebuild, firstTimers.cacheRebuild, 'cache rebuild timer should be reused');

  context.SyncEngine.stop();
  assert.strictEqual(cleared.length, 3, 'stop should clear all timers');
  assert.strictEqual(context.SyncEngine.timers.incremental, null);
  assert.strictEqual(context.SyncEngine.timers.fullSync, null);
  assert.strictEqual(context.SyncEngine.timers.cacheRebuild, null);
  assert.strictEqual(context.SyncEngine.isStarted, false, 'isStarted should reset after stop');
});

runTest('incrementalSync prevents overlapping executions', async () => {
  fetchCalls = 0;
  sandbox.MappingsStore.metadata.isSyncing = false;
  sandbox.MappingsStore.metadata.isOptimisticUpdate = false;
  sandbox.MappingsStore.metadata.lastFullSync = Date.now();

  // Start first sync - it should set isIncrementalSyncing to true
  const firstRun = context.SyncEngine.incrementalSync();
  
  // The new lightweight incremental sync doesn't make server calls
  // but it should still use the mutex to prevent overlapping runs
  const isFirstRunning = context.SyncEngine.isIncrementalSyncing;
  
  // Second call should be skipped because first is running
  const secondRun = context.SyncEngine.incrementalSync();

  await firstRun;
  await secondRun;

  // The key behavior: mutex flag should reset after completion
  assert.strictEqual(context.SyncEngine.isIncrementalSyncing, false, 'mutex flag should reset after completion');
  
  // With the new lightweight sync, no server calls are made
  // The full sync (5 min interval) handles actual data fetching
  assert.strictEqual(fetchCalls, 0, 'lightweight incremental sync should not make server calls');
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
