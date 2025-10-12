(function () {
    const now = Date.now();
    const iso = (offsetMs = 0) => new Date(now - offsetMs).toISOString();

    const mappings = [
        {
            id: 'demo-mapping-products-list',
            name: 'List products',
            priority: 1,
            request: {
                method: 'GET',
                urlPath: '/api/products',
                headers: {
                    Accept: 'application/json'
                }
            },
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    items: [
                        { id: 'sku-1000', name: 'Demo Sneakers', price: 129.99 },
                        { id: 'sku-1001', name: 'Demo Backpack', price: 89.5 }
                    ]
                }
            },
            metadata: {
                created: iso(1000 * 60 * 60 * 6),
                edited: iso(1000 * 60 * 60 * 2),
                source: 'demo-seed',
                tags: ['catalog', 'demo']
            }
        },
        {
            id: 'demo-mapping-create-order',
            name: 'Create order',
            priority: 2,
            persistent: true,
            request: {
                method: 'POST',
                urlPath: '/api/orders',
                bodyPatterns: [
                    {
                        matchesJsonPath: "$.items[*].sku"
                    }
                ]
            },
            response: {
                status: 201,
                fixedDelayMilliseconds: 120,
                headers: {
                    'Content-Type': 'application/json',
                    Location: '/api/orders/90001'
                },
                jsonBody: {
                    orderId: '90001',
                    status: 'processing',
                    estimatedDelivery: iso(-1000 * 60 * 15)
                }
            },
            metadata: {
                created: iso(1000 * 60 * 60 * 12),
                edited: iso(1000 * 60 * 45),
                scenarioName: 'checkout-flow',
                source: 'demo-seed'
            }
        },
        {
            id: 'demo-mapping-update-profile',
            name: 'Update profile',
            priority: 3,
            request: {
                method: 'PUT',
                urlPattern: '/api/users/\\d+',
                headers: {
                    Authorization: 'Bearer ***'
                }
            },
            response: {
                status: 204,
                headers: {
                    'X-Demo-Trace': 'profile-update'
                }
            },
            metadata: {
                created: iso(1000 * 60 * 30),
                edited: iso(1000 * 60 * 15),
                source: 'demo-seed',
                tags: ['profile']
            }
        },
        {
            id: 'demo-mapping-delete-session',
            name: 'Delete session',
            priority: 4,
            request: {
                method: 'DELETE',
                urlPathPattern: '/api/sessions/.*'
            },
            response: {
                status: 202,
                headers: {
                    'Retry-After': '30'
                },
                jsonBody: {
                    status: 'scheduled'
                }
            },
            metadata: {
                created: iso(1000 * 60 * 60 * 3),
                source: 'demo-seed'
            }
        }
    ];

    const requests = [
        {
            id: 'demo-request-001',
            wasMatched: true,
            request: {
                method: 'GET',
                url: '/api/products',
                urlPath: '/api/products',
                loggedDate: iso(1000 * 60 * 8),
                headers: {
                    Accept: ['application/json'],
                    Host: ['demo.wiremock.local']
                },
                clientIp: '192.168.10.14'
            },
            responseDefinition: {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    items: [{ id: 'sku-1000' }, { id: 'sku-1001' }]
                })
            }
        },
        {
            id: 'demo-request-002',
            wasMatched: false,
            request: {
                method: 'POST',
                url: '/api/orders',
                loggedDate: iso(1000 * 60 * 5),
                body: JSON.stringify({ items: [] }),
                headers: {
                    'Content-Type': ['application/json'],
                    Host: ['demo.wiremock.local']
                },
                clientIp: '192.168.10.18'
            },
            responseDefinition: {
                status: 404,
                body: 'No matching mapping found',
                headers: {
                    'Content-Type': 'text/plain'
                }
            }
        },
        {
            id: 'demo-request-003',
            wasMatched: true,
            request: {
                method: 'PATCH',
                url: '/api/orders/90001',
                loggedDate: iso(1000 * 60 * 3),
                body: JSON.stringify({ status: 'cancelled' }),
                headers: {
                    'Content-Type': ['application/json'],
                    Authorization: ['Bearer demo-token']
                },
                clientIp: '192.168.10.20'
            },
            responseDefinition: {
                status: 409,
                body: JSON.stringify({ message: 'Order already fulfilled' }),
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        },
        {
            id: 'demo-request-004',
            wasMatched: true,
            request: {
                method: 'DELETE',
                url: '/api/sessions/abc123',
                loggedDate: iso(1000 * 60 * 2),
                headers: {
                    Authorization: ['Bearer demo-token'],
                    Host: ['demo.wiremock.local']
                },
                clientIp: '192.168.10.22'
            },
            responseDefinition: {
                status: 202,
                body: 'Session deletion scheduled',
                headers: {
                    'Retry-After': '30'
                }
            }
        }
    ];

    const datasetMeta = {
        generatedAt: iso()
    };

    const clone = (value) => JSON.parse(JSON.stringify(value));

    window.DemoData = {
        isAvailable() {
            return mappings.length > 0 || requests.length > 0;
        },
        getMappingsPayload() {
            return {
                mappings: clone(mappings),
                meta: { ...datasetMeta },
                __source: 'demo'
            };
        },
        getRequestsPayload() {
            return {
                requests: clone(requests),
                meta: { ...datasetMeta },
                __source: 'demo'
            };
        },
        getDataset() {
            return {
                mappings: clone(mappings),
                requests: clone(requests),
                meta: { ...datasetMeta },
                __source: 'demo'
            };
        }
    };
})();
