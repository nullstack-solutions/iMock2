/**
 * Shared test utilities and stubs
 */

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

module.exports = {
    createLoggerStub,
};
