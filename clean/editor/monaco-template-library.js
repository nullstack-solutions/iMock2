'use strict';

(function initTemplateLibrary(global) {
    const templates = [
        {
            id: 'happy-get-resource',
            title: 'GET Resource',
            description: 'Return a resource by id with templated fields.',
            category: 'happy-path',
            highlight: 'GET · /api/resources/{id}',
            feature: {
                path: ['response', 'jsonBody', 'id'],
                label: 'response.jsonBody.id'
            },
            content: {
                request: {
                    method: 'GET',
                    urlPathPattern: '/api/resources/[a-f0-9-]+'
                },
                response: {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                    jsonBody: {
                        id: '{{request.pathSegments.[2]}}',
                        name: 'Example Resource',
                        createdAt: '{{now}}'
                    },
                    transformers: ['response-template']
                }
            }
        },
        {
            id: 'happy-post-create',
            title: 'POST Create (201)',
            description: 'Create a new resource with Location header.',
            category: 'happy-path',
            highlight: 'POST · /api/resources',
            feature: {
                path: ['response', 'headers', 'Location'],
                label: 'response.headers.Location'
            },
            popular: true,
            content: {
                request: {
                    method: 'POST',
                    urlPath: '/api/resources',
                    headers: { 'Content-Type': { equalTo: 'application/json' } }
                },
                response: {
                    status: 201,
                    headers: {
                        'Content-Type': 'application/json',
                        'Location': "/api/resources/{{randomValue type='UUID'}}"
                    },
                    jsonBody: {
                        id: "{{randomValue type='UUID'}}",
                        message: 'Resource created'
                    },
                    transformers: ['response-template']
                }
            }
        },
        {
            id: 'error-400-validation',
            title: '400 Bad Request',
            description: 'Validation error example for POST payloads.',
            category: 'errors',
            highlight: 'POST · /api/resources · 400',
            content: {
                request: {
                    method: 'POST',
                    urlPath: '/api/resources',
                    bodyPatterns: [{ matchesJsonPath: '$[?(!@.name)]' }]
                },
                response: {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        details: [{ field: 'name', error: 'required' }]
                    }
                }
            }
        },
        {
            id: 'error-401-unauthorized',
            title: '401 Unauthorized',
            description: 'Missing or invalid auth header.',
            category: 'errors',
            highlight: 'ANY · /api/* · 401',
            content: {
                request: {
                    method: 'ANY',
                    urlPathPattern: '/api/.*',
                    headers: { Authorization: { absent: true } }
                },
                response: {
                    status: 401,
                    headers: { 'WWW-Authenticate': 'Bearer realm="api"' },
                    jsonBody: { error: 'Unauthorized' }
                }
            }
        },
        {
            id: 'error-404-not-found',
            title: '404 Not Found',
            description: 'Simple not-found stub for missing resources.',
            category: 'errors',
            highlight: 'GET · /api/resources/non-existent',
            content: {
                request: {
                    method: 'GET',
                    urlPath: '/api/resources/non-existent'
                },
                response: {
                    status: 404,
                    jsonBody: { error: 'Not Found' }
                }
            }
        },
        {
            id: 'error-429-rate-limit',
            title: '429 Rate Limit',
            description: 'Throttle response with retry guidance.',
            category: 'errors',
            highlight: 'ANY · 429 Too Many Requests',
            popular: true,
            content: {
                request: { method: 'ANY', urlPattern: '/api/.*' },
                response: {
                    status: 429,
                    headers: {
                        'Retry-After': '60',
                        'X-RateLimit-Remaining': '0'
                    },
                    jsonBody: { error: 'Too Many Requests' }
                }
            }
        },
        {
            id: 'fault-fixed-delay',
            title: 'Fixed Delay',
            description: 'Deterministic slow response.',
            category: 'faults',
            highlight: 'GET · /api/slow · delay',
            feature: { path: ['response', 'fixedDelayMilliseconds'], label: 'response.fixedDelayMilliseconds' },
            content: {
                request: { method: 'GET', urlPath: '/api/slow' },
                response: {
                    status: 200,
                    fixedDelayMilliseconds: 5000,
                    jsonBody: { message: 'Delayed' }
                }
            }
        },
        {
            id: 'fault-random-delay-uniform',
            title: 'Random Delay (Uniform)',
            description: 'Variable latency within bounds.',
            category: 'faults',
            highlight: 'ANY · delayDistribution.uniform',
            content: {
                request: { method: 'GET', urlPath: '/api/variable-latency' },
                response: {
                    status: 200,
                    delayDistribution: {
                        type: 'uniform',
                        lower: 500,
                        upper: 2000
                    }
                }
            }
        },
        {
            id: 'fault-random-delay-lognormal',
            title: 'Random Delay (Lognormal)',
            description: 'Realistic latency distribution.',
            category: 'faults',
            highlight: 'ANY · delayDistribution.lognormal',
            content: {
                request: { method: 'GET', urlPath: '/api/realistic-latency' },
                response: {
                    status: 200,
                    delayDistribution: {
                        type: 'lognormal',
                        median: 100,
                        sigma: 0.4
                    }
                }
            }
        },
        {
            id: 'fault-chunked-dribble',
            title: 'Chunked Dribble',
            description: 'Slow streaming response.',
            category: 'faults',
            highlight: 'GET · /api/slow-download',
            content: {
                request: { method: 'GET', urlPath: '/api/slow-download' },
                response: {
                    status: 200,
                    body: 'Slow response...',
                    chunkedDribbleDelay: {
                        numberOfChunks: 10,
                        totalDuration: 5000
                    }
                }
            }
        },
        {
            id: 'fault-connection-reset',
            title: 'Connection Reset',
            description: 'Simulate TCP reset failure.',
            category: 'faults',
            highlight: 'GET · /api/reset · fault',
            popular: true,
            content: {
                request: { method: 'GET', urlPath: '/api/reset' },
                response: { fault: 'CONNECTION_RESET_BY_PEER' }
            }
        },
        {
            id: 'fault-empty-response',
            title: 'Empty Response',
            description: 'Return no body to mimic dropped payloads.',
            category: 'faults',
            highlight: 'ANY · fault: EMPTY_RESPONSE',
            content: {
                request: { method: 'GET', urlPath: '/api/empty' },
                response: { status: 200, fault: 'EMPTY_RESPONSE' }
            }
        },
        {
            id: 'fault-malformed-response',
            title: 'Malformed Response',
            description: 'Corrupted chunk fault.',
            category: 'faults',
            highlight: 'ANY · fault: MALFORMED_RESPONSE_CHUNK',
            content: {
                request: { method: 'GET', urlPath: '/api/corrupt' },
                response: { status: 200, fault: 'MALFORMED_RESPONSE_CHUNK' }
            }
        },
        {
            id: 'scenario-retry-500-200',
            title: 'Retry: 500 → 200',
            description: 'First call fails, retry succeeds.',
            category: 'scenarios',
            highlight: 'Scenario · /api/flaky',
            popular: true,
            content: {
                mappings: [
                    {
                        scenarioName: 'Retry Scenario',
                        requiredScenarioState: 'Started',
                        newScenarioState: 'Recovered',
                        request: { method: 'GET', urlPath: '/api/flaky' },
                        response: { status: 500, jsonBody: { error: 'Temporary failure' } }
                    },
                    {
                        scenarioName: 'Retry Scenario',
                        requiredScenarioState: 'Recovered',
                        request: { method: 'GET', urlPath: '/api/flaky' },
                        response: { status: 200, jsonBody: { message: 'Success' } }
                    }
                ]
            }
        },
        {
            id: 'scenario-todo-workflow',
            title: 'Todo List Workflow',
            description: 'Create → Read → Update lifecycle.',
            category: 'scenarios',
            highlight: 'Scenario · /todo/items',
            content: {
                mappings: [
                    {
                        scenarioName: 'To do list',
                        requiredScenarioState: 'Started',
                        request: { method: 'GET', url: '/todo/items' },
                        response: { jsonBody: { items: ['Buy milk'] } }
                    },
                    {
                        scenarioName: 'To do list',
                        requiredScenarioState: 'Started',
                        newScenarioState: 'Item added',
                        request: {
                            method: 'POST',
                            url: '/todo/items',
                            bodyPatterns: [{ contains: 'Cancel subscription' }]
                        },
                        response: { status: 201 }
                    },
                    {
                        scenarioName: 'To do list',
                        requiredScenarioState: 'Item added',
                        request: { method: 'GET', url: '/todo/items' },
                        response: { jsonBody: { items: ['Buy milk', 'Cancel subscription'] } }
                    }
                ]
            }
        },
        {
            id: 'scenario-order-lifecycle',
            title: 'Order Lifecycle',
            description: 'Order status across states.',
            category: 'scenarios',
            highlight: 'Scenario · /orders/123/status',
            content: {
                mappings: [
                    {
                        scenarioName: 'Order Status',
                        requiredScenarioState: 'Started',
                        newScenarioState: 'Processing',
                        request: { method: 'GET', urlPath: '/orders/123/status' },
                        response: { jsonBody: { status: 'pending' } }
                    },
                    {
                        scenarioName: 'Order Status',
                        requiredScenarioState: 'Processing',
                        newScenarioState: 'Shipped',
                        request: { method: 'GET', urlPath: '/orders/123/status' },
                        response: { jsonBody: { status: 'processing' } }
                    },
                    {
                        scenarioName: 'Order Status',
                        requiredScenarioState: 'Shipped',
                        request: { method: 'GET', urlPath: '/orders/123/status' },
                        response: { jsonBody: { status: 'shipped' } }
                    }
                ]
            }
        },
        {
            id: 'dynamic-echo-request',
            title: 'Echo Request',
            description: 'Reflect request values in the response.',
            category: 'dynamic',
            highlight: 'ANY · /api/echo/*',
            feature: { path: ['response', 'jsonBody', 'path'], label: 'response.jsonBody.*' },
            popular: true,
            content: {
                request: { method: 'ANY', urlPathPattern: '/api/echo/.*' },
                response: {
                    jsonBody: {
                        path: '{{request.path}}',
                        query: '{{request.query.q}}',
                        header: '{{request.headers.X-Custom}}',
                        timestamp: '{{now}}'
                    },
                    transformers: ['response-template']
                }
            }
        },
        {
            id: 'dynamic-jsonpath-extract',
            title: 'JSONPath Extract',
            description: 'Use JSONPath to pull fields from the request body.',
            category: 'dynamic',
            highlight: 'POST · /api/process',
            content: {
                request: { method: 'POST', urlPath: '/api/process' },
                response: {
                    body: "{\"name\": \"{{jsonPath request.body '$.name'}}\"}",
                    transformers: ['response-template']
                }
            }
        },
        {
            id: 'dynamic-random-values',
            title: 'Random Values',
            description: 'Generate UUIDs, codes, and numbers in the response.',
            category: 'dynamic',
            highlight: 'ANY · response-template random values',
            content: {
                request: { method: 'GET', urlPath: '/api/generate' },
                response: {
                    jsonBody: {
                        uuid: "{{randomValue type='UUID'}}",
                        code: "{{randomValue length=8 type='ALPHANUMERIC'}}",
                        number: "{{randomInt lower=1 upper=100}}",
                        type: 'ORDER_ACCEPTED',
                        orderId: "{{jsonPath request.body '$.orderId'}}",
                        occurredAt: "{{now offset='0' pattern=\\\"yyyy-MM-dd'T'HH:mm:ssXXX\\\"}}"
                    },
                    transformers: ['response-template']
                }
            }
        },
        {
            id: 'match-url-regex',
            title: 'URL Pattern (Regex)',
            description: 'Regex path matcher for numeric IDs.',
            category: 'matching',
            highlight: 'GET · /api/users/{id}/orders/{orderId}',
            content: {
                request: {
                    method: 'GET',
                    urlPathPattern: '/api/users/[0-9]+/orders/[a-f0-9-]+'
                }
            }
        },
        {
            id: 'match-query-params',
            title: 'Query Parameters',
            description: 'Match search params with combinations.',
            category: 'matching',
            highlight: 'GET · /api/search?q=…',
            popular: true,
            content: {
                request: {
                    method: 'GET',
                    urlPath: '/api/search',
                    queryParameters: {
                        q: { matches: '.+' },
                        page: { equalTo: '1' },
                        limit: { or: [{ equalTo: '10' }, { equalTo: '20' }] }
                    }
                },
                response: { status: 200 }
            }
        },
        {
            id: 'match-headers',
            title: 'Headers',
            description: 'Match requests by required headers.',
            category: 'matching',
            highlight: 'ANY · header matchers',
            content: {
                request: {
                    method: 'ANY',
                    urlPath: '/api/data',
                    headers: {
                        'Accept': { contains: 'application/json' },
                        'Authorization': { matches: 'Bearer .+' }
                    }
                },
                response: { status: 200 }
            }
        },
        {
            id: 'match-json-equal',
            title: 'JSON Body (equalToJson)',
            description: 'Semantic JSON comparison with json-unit helpers.',
            category: 'matching',
            highlight: 'POST · equalToJson',
            content: {
                request: {
                    method: 'POST',
                    urlPath: '/api/orders',
                    bodyPatterns: [{
                        equalToJson: {
                            customerId: '${json-unit.any-string}',
                            total: '${json-unit.any-number}'
                        },
                        ignoreArrayOrder: true,
                        ignoreExtraElements: true
                    }]
                },
                response: { status: 201 }
            }
        },
        {
            id: 'match-jsonpath',
            title: 'JSONPath',
            description: 'Multiple JSONPath checks in one stub.',
            category: 'matching',
            highlight: 'POST · matchesJsonPath',
            content: {
                request: {
                    method: 'POST',
                    urlPath: '/api/events',
                    bodyPatterns: [
                        { matchesJsonPath: '$.type' },
                        { matchesJsonPath: "$[?(@.priority > 5)]" },
                        { matchesJsonPath: { expression: '$.email', contains: '@example.com' } }
                    ]
                },
                response: { status: 200 }
            }
        },
        {
            id: 'match-basic-auth',
            title: 'Basic Auth',
            description: 'Protect endpoints with HTTP Basic Auth.',
            category: 'matching',
            highlight: 'ANY · basicAuthCredentials',
            content: {
                request: {
                    method: 'GET',
                    urlPath: '/api/secure',
                    basicAuthCredentials: {
                        username: 'admin',
                        password: 'secret'
                    }
                },
                response: { status: 200 }
            }
        },
        {
            id: 'webhook-simple',
            title: 'Simple Webhook',
            description: 'Send a POST callback after accepting a request.',
            category: 'webhooks',
            highlight: 'POST · /api/trigger · webhook',
            popular: true,
            content: {
                request: { method: 'POST', urlPath: '/api/trigger' },
                response: { status: 202 },
                serveEventListeners: [{
                    name: 'webhook',
                    parameters: {
                        method: 'POST',
                        url: 'http://callback-service/webhook',
                        headers: { 'Content-Type': 'application/json' },
                        body: '{"status": "complete"}'
                    }
                }]
            }
        },
        {
            id: 'webhook-templated',
            title: 'Templated Webhook',
            description: 'Populate webhook payload from the original request.',
            category: 'webhooks',
            highlight: 'POST · templated callback',
            content: {
                request: { method: 'POST', urlPath: '/api/orders' },
                response: { status: 202 },
                serveEventListeners: [{
                    name: 'webhook',
                    parameters: {
                        url: "{{jsonPath originalRequest.body '$.callbackUrl'}}",
                        body: "{\"orderId\": \"{{jsonPath originalRequest.body '$.orderId'}}\"}"
                    }
                }]
            }
        },
        {
            id: 'webhook-delayed',
            title: 'Delayed Webhook',
            description: 'Schedule a callback after a fixed delay.',
            category: 'webhooks',
            highlight: 'POST · delay → webhook',
            content: {
                request: { method: 'POST', urlPath: '/api/async-job' },
                response: { status: 202 },
                serveEventListeners: [{
                    name: 'webhook',
                    parameters: {
                        url: 'http://service/callback',
                        delay: { type: 'fixed', milliseconds: 5000 }
                    }
                }]
            }
        },
        {
            id: 'proxy-full',
            title: 'Full Proxy',
            description: 'Pass all traffic through to an upstream API.',
            category: 'proxy',
            highlight: 'ANY · /api/* → proxy',
            popular: true,
            content: {
                priority: 10,
                request: { method: 'ANY', urlPattern: '/api/.*' },
                response: { proxyBaseUrl: 'https://api.example.com' }
            }
        },
        {
            id: 'proxy-override',
            title: 'Proxy + Override',
            description: 'Forward with extra headers or overrides.',
            category: 'proxy',
            highlight: 'ANY · proxy with headers',
            content: {
                priority: 100,
                request: { method: 'ANY', urlPattern: '/api/.*' },
                response: {
                    proxyBaseUrl: 'https://api.example.com',
                    additionalProxyRequestHeaders: {
                        'X-Forwarded-By': 'WireMock'
                    }
                }
            }
        },
        {
            id: 'proxy-start-recording',
            title: 'Start Recording',
            description: 'Record traffic for snapshotting stubs.',
            category: 'proxy',
            highlight: 'ADMIN · recording',
            content: {
                targetBaseUrl: 'https://api.example.com',
                captureHeaders: {
                    'Accept': {},
                    'Authorization': { caseInsensitive: true }
                },
                requestBodyPattern: {
                    matcher: 'equalToJson',
                    ignoreArrayOrder: true
                },
                persist: true,
                repeatsAsScenarios: true
            }
        }
    ];

    function clone(item) {
        return JSON.parse(JSON.stringify(item));
    }

    function normalise(template) {
        if (!template || typeof template !== 'object') {
            throw new Error('Template must be an object');
        }
        if (!template.id) {
            throw new Error('Template requires an id');
        }
        return JSON.parse(JSON.stringify(template));
    }

    const api = {
        getAll() {
            return templates.map(clone);
        },
        findById(id) {
            return templates.find((item) => item.id === id) || null;
        },
        register(template) {
            const normalised = normalise(template);
            const existingIndex = templates.findIndex((item) => item.id === normalised.id);
            if (existingIndex >= 0) {
                templates[existingIndex] = normalised;
            } else {
                templates.push(normalised);
            }
            return this.getAll();
        },
        replaceAll(nextTemplates) {
            if (!Array.isArray(nextTemplates)) {
                throw new Error('replaceAll expects an array of templates');
            }
            templates.length = 0;
            for (const item of nextTemplates) {
                templates.push(JSON.parse(JSON.stringify(item)));
            }
            return this.getAll();
        }
    };

    Object.freeze(api);

    if (!global.MonacoTemplateLibrary) {
        Object.defineProperty(global, 'MonacoTemplateLibrary', {
            value: api,
            configurable: false,
            enumerable: true,
            writable: false,
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
