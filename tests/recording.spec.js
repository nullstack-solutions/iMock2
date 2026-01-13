const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
<<<<<<< HEAD
=======
const { createLoggerStub } = require('./helpers/stubs');
>>>>>>> clean

function createNotificationStub() {
    return {
        successCalls: 0,
        errorCalls: 0,
        success(message) {
            this.successCalls += 1;
            this.lastSuccess = message;
        },
        error(message) {
            this.errorCalls += 1;
            this.lastError = message;
        },
    };
}

<<<<<<< HEAD
=======

>>>>>>> clean
function loadRecordingModule(overrides = {}) {
    const recordingsList = { innerHTML: '<li>existing</li>' };

    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        NotificationManager: createNotificationStub(),
<<<<<<< HEAD
=======
        Logger: createLoggerStub(),
>>>>>>> clean
        ENDPOINTS: {
            REQUESTS: '/requests',
            RECORDINGS_START: '/recordings/start',
            RECORDINGS_STOP: '/recordings/stop',
            RECORDINGS_STATUS: '/recordings/status',
            RECORDINGS_SNAPSHOT: '/recordings/snapshot',
        },
        document: {
            getElementById(id) {
                if (id === 'recordings-list') {
                    return recordingsList;
                }
                return null;
            },
        },
        recordedCount: 5,
        fetchAndRenderRequests: async () => { sandbox.__renderCalled = true; },
        confirm: () => true,
    };

    const calls = [];
    sandbox.apiFetch = async (url, options = {}) => {
        calls.push({ url, options });
        if (sandbox.__apiReject) {
            throw sandbox.__apiReject;
        }
        return {};
    };

    Object.assign(sandbox, overrides);
    sandbox.window = sandbox;

    const context = vm.createContext(sandbox);
    const code = fs.readFileSync(path.join(__dirname, '..', 'js/features/recording.js'), 'utf8');
    vm.runInContext(code, context, { filename: 'js/features/recording.js' });
    context.__apiCalls = calls;
    context.__recordingsList = recordingsList;
    return context;
}

(async () => {
    const tests = [
        {
            name: 'clearRecordings issues DELETE request and resets UI state',
            async run() {
                const context = loadRecordingModule();
                await context.clearRecordings();

                assert.strictEqual(context.__apiCalls.length, 1);
                const call = context.__apiCalls[0];
                assert.strictEqual(call.url, context.ENDPOINTS.REQUESTS);
                assert.strictEqual(call.options.method, 'DELETE');
                assert.strictEqual(context.recordedCount, 0);
                assert.ok(context.__renderCalled, 'fetchAndRenderRequests should be invoked');
                assert.strictEqual(context.NotificationManager.successCalls, 1);
                assert.strictEqual(context.__recordingsList.innerHTML, '');
            },
        },
        {
            name: 'clearRecordings surfaces API errors through notifications',
            async run() {
                const error = new Error('boom');
                const context = loadRecordingModule({ __apiReject: error });
                await context.clearRecordings();

                assert.strictEqual(context.NotificationManager.errorCalls, 1);
                assert.strictEqual(context.NotificationManager.successCalls, 0);
                assert.strictEqual(context.recordedCount, 5, 'recordedCount should remain unchanged on failure');
            },
        },
        {
            name: 'clearRecordings aborts when user cancels confirmation',
            async run() {
                const context = loadRecordingModule({
                    confirm: () => false,
                });
                await context.clearRecordings();

                assert.strictEqual(context.__apiCalls.length, 0);
                assert.strictEqual(context.NotificationManager.successCalls, 0);
                assert.strictEqual(context.NotificationManager.errorCalls, 0);
            },
        },
    ];

    for (const test of tests) {
        try {
            await test.run();
            console.log(`✔ ${test.name}`);
        } catch (error) {
            console.error(`✖ ${test.name}`);
            console.error(error);
            process.exitCode = 1;
        }
    }
})();
