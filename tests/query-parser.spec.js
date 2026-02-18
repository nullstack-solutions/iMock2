const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createLoggerStub } = require('./helpers/stubs');

const toPlain = (value) => JSON.parse(JSON.stringify(value));

function createQueryParserContext() {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
    };

    sandbox.window = sandbox;
    sandbox.Logger = createLoggerStub(sandbox.console);

    const context = vm.createContext(sandbox);
    const code = fs.readFileSync(path.join(__dirname, '..', 'js/features/queryParser.js'), 'utf8');
    vm.runInContext(code, context, { filename: 'queryParser.js' });

    return context;
}

const tests = [];
const runTest = (name, fn) => tests.push({ name, fn });

runTest('parseQuery parses keywords and free text together', () => {
    const context = createQueryParserContext();
    const parsed = context.QueryParser.parseQuery('method:GET,POST url:/api status:200 checkout');

    assert.ok(parsed, 'parsed query should exist');
    assert.deepStrictEqual(toPlain(parsed.method), ['GET', 'POST']);
    assert.strictEqual(parsed.url, '/api');
    assert.strictEqual(parsed.status, '200');
    assert.strictEqual(parsed.text, 'checkout');
});

runTest('parseQuery supports exclusions and quoted values', () => {
    const context = createQueryParserContext();
    const parsed = context.QueryParser.parseQuery('-status:404 name:"User API"');

    assert.ok(parsed, 'parsed query should exist');
    assert.deepStrictEqual(toPlain(parsed.status), { exclude: '404' });
    assert.strictEqual(parsed.name, 'User API');
});

runTest('parseQuery handles priority ranges and single values', () => {
    const context = createQueryParserContext();
    const rangeParsed = context.QueryParser.parseQuery('priority:2-5');
    const singleParsed = context.QueryParser.parseQuery('priority:3');
    const invalidParsed = context.QueryParser.parseQuery('priority:high');

    assert.deepStrictEqual(toPlain(rangeParsed.priority), { from: '2', to: '5' });
    assert.deepStrictEqual(toPlain(singleParsed.priority), { from: '3', to: '3' });
    assert.strictEqual(invalidParsed, null);
});

runTest('matchesCondition supports includes, OR arrays and excludes', () => {
    const context = createQueryParserContext();
    const { matchesCondition } = context.QueryParser;

    assert.strictEqual(matchesCondition('GET', 'ge'), true);
    assert.strictEqual(matchesCondition('PATCH', ['get', 'pat']), true);
    assert.strictEqual(matchesCondition('DELETE', { exclude: 'let' }), false);
    assert.strictEqual(matchesCondition('POST', { exclude: ['get', 'put'] }), true);
});

runTest('filterMappings applies method/url/status/priority constraints', () => {
    const context = createQueryParserContext();

    const mappings = [
        {
            id: 'm-1',
            name: 'Users list',
            request: { method: 'GET', url: '/api/users' },
            response: { status: 200 },
            priority: 2,
        },
        {
            id: 'm-2',
            name: 'Users create',
            request: { method: 'POST', url: '/api/users' },
            response: { status: 201 },
            priority: 4,
        },
        {
            id: 'm-3',
            name: 'Health',
            request: { method: 'GET', url: '/health' },
            response: { status: 200 },
        },
    ];

    const parsed = context.QueryParser.parseQuery('method:GET url:/api status:200 priority:1-3');
    const filtered = context.QueryParser.filterMappings(mappings, parsed);

    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 'm-1');
});

runTest('filterMappingsByQuery applies text search across mapping fields', () => {
    const context = createQueryParserContext();

    const mappings = [
        { id: 'a', name: 'Orders endpoint', request: { method: 'GET', url: '/orders' }, response: { status: 200 } },
        { id: 'b', name: 'Customers endpoint', request: { method: 'POST', url: '/customers' }, response: { status: 200 } },
    ];

    const filtered = context.QueryParser.filterMappingsByQuery(mappings, 'orders');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 'a');
});

runTest('filterRequestsByQuery supports matched:true and matched:false', () => {
    const context = createQueryParserContext();

    const requests = [
        { id: 'r1', wasMatched: true, request: { method: 'GET', url: '/api/users', clientIp: '10.0.0.1' } },
        { id: 'r2', wasMatched: false, request: { method: 'GET', url: '/api/users', clientIp: '10.0.0.2' } },
        { id: 'r3', request: { method: 'POST', url: '/api/orders', clientIp: '10.0.0.3' } }, // defaults to matched
    ];

    const matched = context.QueryParser.filterRequestsByQuery(requests, 'matched:true');
    const unmatched = context.QueryParser.filterRequestsByQuery(requests, 'matched:false');

    assert.deepStrictEqual(matched.map((r) => r.id).sort(), ['r1', 'r3']);
    assert.deepStrictEqual(unmatched.map((r) => r.id), ['r2']);
});

runTest('filterRequestsByQuery applies status, client and text filters', () => {
    const context = createQueryParserContext();

    const requests = [
        {
            id: 'r1',
            request: { method: 'GET', url: '/api/users', clientIp: '192.168.1.4' },
            responseDefinition: { status: 200 },
        },
        {
            id: 'r2',
            request: { method: 'POST', url: '/api/orders', clientIp: '10.2.3.4' },
            response: { status: 500 },
        },
    ];

    const statusFiltered = context.QueryParser.filterRequestsByQuery(requests, 'status:200');
    const clientFiltered = context.QueryParser.filterRequestsByQuery(requests, 'client:192.168');
    const textFiltered = context.QueryParser.filterRequestsByQuery(requests, 'orders');

    assert.deepStrictEqual(statusFiltered.map((r) => r.id), ['r1']);
    assert.deepStrictEqual(clientFiltered.map((r) => r.id), ['r1']);
    assert.deepStrictEqual(textFiltered.map((r) => r.id), ['r2']);
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

    console.log(`\n✅ QueryParser tests: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    }
})();
