'use strict';

(function initTemplateLibrary(global) {
    const templates = [
    {
        id: 'basic-get',
        title: 'Basic GET stub',
        description: 'Static JSON response for a GET endpoint – perfect starting point for simple mocks.',
        category: 'basic',
        highlight: 'GET · /api/example',
        feature: {
            path: ['response', 'jsonBody', 'message'],
            label: 'response.jsonBody.message'
        },
        content: {
            name: 'Basic GET stub',
            request: {
                method: 'GET',
                urlPath: '/api/example'
            },
            response: {
                status: 200,
                jsonBody: {
                    message: 'Hello from WireMock!',
                    timestamp: new Date().toISOString()
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        }
    },
    {
        id: 'post-body-pattern',
        title: 'POST with JSON body match',
        description: 'Matches on POST payload using JSONPath and echoes selected fields back in the response.',
        category: 'advanced',
        highlight: 'POST · /api/orders',
        feature: {
            path: ['request', 'bodyPatterns', 0, 'matchesJsonPath'],
            label: 'request.bodyPatterns[0].matchesJsonPath'
        },
        content: {
            name: 'POST order matcher',
            request: {
                method: 'POST',
                url: '/api/orders',
                headers: {
                    'Content-Type': {
                        contains: 'application/json'
                    }
                },
                bodyPatterns: [
                    {
                        matchesJsonPath: '$.type',
                        expression: "$[?(@.type == 'priority')]"
                    },
                    {
                        matchesJsonPath: '$.items[*]'
                    }
                ]
            },
            response: {
                status: 201,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    id: "{{randomValue length=8 type='string'}}",
                    status: 'ACCEPTED',
                    receivedAt: "{{now offset='0' pattern=\"yyyy-MM-dd'T'HH:mm:ssXXX\"}}"
                },
                transformers: ['response-template']
            },
            metadata: {
                tags: ['orders', 'priority']
            }
        }
    },
    {
        id: 'webhook-callback',
        title: 'Webhook callback',
        description: 'Illustrates WireMock\'s webhook post-serve action to notify downstream services after a match.',
        category: 'integration',
        highlight: 'POST · /api/orders · webhook',
        feature: {
            path: ['postServeActions', 'webhook', 'url'],
            label: 'postServeActions.webhook.url'
        },
        content: {
            name: 'Order accepted with webhook callback',
            request: {
                method: 'POST',
                urlPath: '/api/orders',
                headers: {
                    'Content-Type': {
                        contains: 'application/json'
                    }
                },
                bodyPatterns: [
                    {
                        matchesJsonPath: '$.orderId'
                    }
                ]
            },
            response: {
                status: 202,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    status: 'QUEUED',
                    message: 'Order accepted and will trigger fulfillment webhook.',
                    callback: 'https://webhook.site/your-endpoint'
                }
            },
            postServeActions: {
                webhook: {
                    method: 'POST',
                    url: 'https://example.org/webhooks/order-events',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-WireMock-Source': 'json-studio'
                    },
                    body: JSON.stringify({
                        type: 'ORDER_ACCEPTED',
                        orderId: "{{jsonPath request.body '$.orderId'}}",
                        occurredAt: "{{now offset='0' pattern=\"yyyy-MM-dd'T'HH:mm:ssXXX\"}}"
                    })
                }
            },
            metadata: {
                tags: ['webhook', 'postServeActions']
            }
        }
    },
    {
        id: 'regex-url',
        title: 'Regex URL matcher',
        description: 'Use `urlPathPattern` to handle numeric identifiers without enumerating every path.',
        category: 'advanced',
        highlight: 'GET · /api/items/{id}',
        feature: {
            path: ['request', 'urlPathPattern'],
            label: 'request.urlPathPattern'
        },
        content: {
            name: 'Item lookup (regex)',
            request: {
                method: 'GET',
                urlPathPattern: '/api/items/([0-9]+)',
                queryParameters: {
                    locale: {
                        matches: '^[a-z]{2}-[A-Z]{2}$'
                    }
                }
            },
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    id: '{{request.pathSegments.[2]}}',
                    locale: '{{request.query.locale}}',
                    name: 'Example item',
                    price: 12.5
                },
                transformers: ['response-template']
            }
        }
    },
    {
        id: 'fault-injection',
        title: 'Fault injection',
        description: 'Simulate backend failures with delayed responses and WireMock faults to test resiliency.',
        category: 'testing',
        highlight: 'GET · /api/internal/report',
        feature: {
            path: ['response', 'fault'],
            label: 'response.fault'
        },
        content: {
            name: 'Fault injection stub',
            request: {
                method: 'GET',
                urlPath: '/api/internal/report',
                headers: {
                    'X-Debug-Scenario': {
                        equalTo: 'fault-test'
                    }
                }
            },
            response: {
                fixedDelayMilliseconds: 1500,
                fault: 'CONNECTION_RESET_BY_PEER',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            },
            metadata: {
                severity: 'high'
            }
        }
    },
    {
        id: 'proxy-pass-through',
        title: 'Proxy pass-through with overrides',
        description: 'Forward requests to an upstream service while tweaking headers and enabling recording.',
        category: 'proxy',
        highlight: 'ANY · /external/* → proxy',
        feature: {
            path: ['response', 'proxyBaseUrl'],
            label: 'response.proxyBaseUrl'
        },
        content: {
            name: 'External proxy passthrough',
            priority: 10,
            request: {
                urlPattern: '/external/.*'
            },
            response: {
                proxyBaseUrl: 'https://api.upstream.example.com',
                additionalProxyRequestHeaders: {
                    'X-Trace-Id': 'wm-{{randomValue type="UUID"}}'
                },
                additionalProxyResponseHeaders: {
                    'X-Proxied-By': 'WireMock JSON Studio'
                }
            },
            persistent: true,
            metadata: {
                tags: ['proxy', 'passthrough']
            }
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
