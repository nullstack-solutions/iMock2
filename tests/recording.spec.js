const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createNotificationStub() {
    return {
        successCalls: 0,
        errorCalls: 0,
        infoCalls: 0,
        warningCalls: 0,
        success(message) {
            this.successCalls += 1;
            this.lastSuccess = message;
        },
        error(message) {
            this.errorCalls += 1;
            this.lastError = message;
        },
        info(message) {
            this.infoCalls += 1;
            this.lastInfo = message;
        },
        warning(message) {
            this.warningCalls += 1;
            this.lastWarning = message;
        },
    };
}

function loadRecordingModule(overrides = {}) {
    let listHtml = '<li>existing</li>';
    let childCount = 1;
    const recordingsList = {
        style: { display: 'block' },
        insertAdjacentHTML(_position, html) {
            listHtml += html;
            childCount += 1;
        }
    };
    Object.defineProperty(recordingsList, 'innerHTML', {
        get() { return listHtml; },
        set(value) {
            listHtml = value;
            childCount = value ? 1 : 0;
        }
    });
    Object.defineProperty(recordingsList, 'children', {
        get() {
            return { length: childCount };
        }
    });
    const recordingsEmpty = {
        classList: {
            _set: new Set(),
            add(cls) { this._set.add(cls); },
            remove(cls) { this._set.delete(cls); }
        }
    };
    const statusEl = { textContent: '', className: 'form-help' };
    const indicatorEl = { style: { display: 'none' } };

    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        NotificationManager: createNotificationStub(),
        ENDPOINTS: {
            RECORDINGS_START: '/recordings/start',
            RECORDINGS_STOP: '/recordings/stop',
            RECORDINGS_STATUS: '/recordings/status',
            RECORDINGS_SNAPSHOT: '/recordings/snapshot',
        },
        SELECTORS: {
            RECORDING: {
                INDICATOR: 'recording-indicator'
            }
        },
        document: {
            getElementById(id) {
                if (id === 'recordings-list') {
                    return recordingsList;
                }
                if (id === 'recordings-empty') {
                    return recordingsEmpty;
                }
                if (id === 'recording-status') {
                    return statusEl;
                }
                if (id === 'recording-indicator') {
                    return indicatorEl;
                }
                return null;
            },
            addEventListener() {}
        },
        fetchAndRenderMappings: async () => { sandbox.__mappingsRendered = true; },
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
    context.__apiCalls = calls;
    context.__recordingsList = recordingsList;
    context.__recordingsEmpty = recordingsEmpty;
    context.__statusEl = statusEl;
    context.__indicatorEl = indicatorEl;
    return context;
}

(async () => {
    const tests = [
        {
            name: 'clearRecordedMappings deletes recorded ids and refreshes mappings',
            async run() {
                const context = loadRecordingModule({
                    updateOptimisticCache: () => {},
                });
                vm.runInContext("recordingUiState.recordedIds.add('abc'); recordingUiState.recordedIds.add('def');", context);

                await context.clearRecordedMappings();

                assert.strictEqual(context.__apiCalls.length, 2);
                const [first, second] = context.__apiCalls;
                assert.strictEqual(first.url, '/mappings/abc');
                assert.strictEqual(second.url, '/mappings/def');
                assert.strictEqual(first.options.method, 'DELETE');
                assert.strictEqual(second.options.method, 'DELETE');
                assert.strictEqual(context.NotificationManager.successCalls, 1);
                assert.ok(context.__mappingsRendered, 'fetchAndRenderMappings should be invoked');
                assert.strictEqual(context.__recordingsList.innerHTML, '');
                assert.strictEqual(context.NotificationManager.warningCalls, 0);
            },
        },
        {
            name: 'clearRecordedMappings surfaces API errors through notifications',
            async run() {
                const error = new Error('boom');
                const context = loadRecordingModule({
                    __apiReject: error,
                    updateOptimisticCache: () => {},
                });
                vm.runInContext("recordingUiState.recordedIds.add('abc');", context);

                await context.clearRecordedMappings();

                assert.strictEqual(context.NotificationManager.warningCalls, 1);
                assert.strictEqual(context.NotificationManager.successCalls, 0);
                assert.strictEqual(context.__apiCalls.length, 1);
                assert.strictEqual(context.__recordingsList.innerHTML, '');
            },
        },
        {
            name: 'clearRecordedMappings aborts when user cancels confirmation',
            async run() {
                const context = loadRecordingModule({
                    confirm: () => false,
                    updateOptimisticCache: () => {},
                });
                vm.runInContext("recordingUiState.recordedIds.add('abc');", context);
                await context.clearRecordedMappings();

                assert.strictEqual(context.__apiCalls.length, 0);
                assert.strictEqual(context.NotificationManager.successCalls, 0);
                assert.strictEqual(context.NotificationManager.infoCalls, 0);
            },
        },
        {
            name: 'clearRecordedMappings informs when nothing to clear',
            async run() {
                const context = loadRecordingModule({
                    updateOptimisticCache: () => {},
                });

                await context.clearRecordedMappings();

                assert.strictEqual(context.__apiCalls.length, 0);
                assert.strictEqual(context.NotificationManager.infoCalls, 1);
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
