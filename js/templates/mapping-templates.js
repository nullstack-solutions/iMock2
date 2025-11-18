'use strict';

/**
 * Mapping Templates - Pre-built mappings for common scenarios
 *
 * Categories:
 * - basic: Simple CRUD operations
 * - advanced: Regex, condition matching
 * - testing: Error responses, delays
 * - integration: OAuth, webhooks
 * - proxy: Proxy pass-through
 */

const TEMPLATE_CATEGORY_LABELS = {
    basic: 'Basic',
    advanced: 'Advanced',
    testing: 'Testing',
    integration: 'Integration',
    proxy: 'Proxy'
};

const BUILT_IN_TEMPLATES = [
    // ===== BASIC TEMPLATES =====
    {
        id: 'get-json',
        name: 'GET JSON Response',
        category: 'basic',
        description: 'Simple GET endpoint returning JSON',
        icon: '📄',
        mapping: {
            request: {
                method: 'GET',
                urlPattern: '/api/resource'
            },
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    success: true,
                    data: [],
                    message: 'Resource fetched successfully'
                }
            }
        }
    },
    {
        id: 'post-create',
        name: 'POST Create Resource',
        category: 'basic',
        description: 'Create new resource endpoint',
        icon: '➕',
        mapping: {
            request: {
                method: 'POST',
                urlPattern: '/api/resource',
                headers: {
                    'Content-Type': {
                        equalTo: 'application/json'
                    }
                }
            },
            response: {
                status: 201,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    id: '{{randomValue type=\'UUID\'}}',
                    created: true,
                    timestamp: '{{now}}'
                }
            }
        }
    },
    {
        id: 'put-update',
        name: 'PUT Update Resource',
        category: 'basic',
        description: 'Update existing resource',
        icon: '✏️',
        mapping: {
            request: {
                method: 'PUT',
                urlPattern: '/api/resource/[0-9]+',
                headers: {
                    'Content-Type': {
                        equalTo: 'application/json'
                    }
                }
            },
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    updated: true,
                    timestamp: '{{now}}'
                }
            }
        }
    },
    {
        id: 'delete-resource',
        name: 'DELETE Resource',
        category: 'basic',
        description: 'Delete resource endpoint',
        icon: '🗑️',
        mapping: {
            request: {
                method: 'DELETE',
                urlPattern: '/api/resource/[0-9]+'
            },
            response: {
                status: 204,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        }
    },

    // ===== TESTING TEMPLATES =====
    {
        id: 'error-404',
        name: '404 Not Found',
        category: 'testing',
        description: 'Simulate resource not found',
        icon: '❌',
        mapping: {
            request: {
                method: 'GET',
                urlPattern: '/api/missing'
            },
            response: {
                status: 404,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    error: 'Resource not found',
                    code: 'NOT_FOUND'
                }
            }
        }
    },
    {
        id: 'error-500',
        name: '500 Server Error',
        category: 'testing',
        description: 'Simulate server error',
        icon: '💥',
        mapping: {
            request: {
                urlPattern: '/api/error'
            },
            response: {
                status: 500,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    error: 'Internal server error',
                    code: 'INTERNAL_ERROR'
                }
            }
        }
    },
    {
        id: 'delay-slow',
        name: 'Slow Response (3s delay)',
        category: 'testing',
        description: 'Simulate slow network',
        icon: '🐌',
        mapping: {
            request: {
                urlPattern: '/api/slow'
            },
            response: {
                status: 200,
                fixedDelayMilliseconds: 3000,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    message: 'Delayed response',
                    delay: '3000ms'
                }
            }
        }
    },
    {
        id: 'error-401',
        name: '401 Unauthorized',
        category: 'testing',
        description: 'Simulate authentication failure',
        icon: '🔒',
        mapping: {
            request: {
                urlPattern: '/api/secure'
            },
            response: {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'WWW-Authenticate': 'Bearer realm="API"'
                },
                jsonBody: {
                    error: 'Unauthorized',
                    message: 'Authentication required'
                }
            }
        }
    },

    // ===== ADVANCED TEMPLATES =====
    {
        id: 'regex-url',
        name: 'Regex URL Pattern',
        category: 'advanced',
        description: 'URL pattern with regex matching',
        icon: '🔍',
        mapping: {
            request: {
                method: 'GET',
                urlPathPattern: '/api/users/[0-9]{1,6}'
            },
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    id: '{{request.pathSegments.[2]}}',
                    name: 'User {{randomValue length=8 type=\'ALPHANUMERIC\'}}',
                    email: '{{randomValue length=10 type=\'ALPHANUMERIC\'}}@example.com'
                }
            }
        }
    },
    {
        id: 'conditional-header',
        name: 'Conditional by Header',
        category: 'advanced',
        description: 'Response based on request header',
        icon: '🔀',
        mapping: {
            request: {
                method: 'GET',
                urlPattern: '/api/data',
                headers: {
                    'X-API-Version': {
                        matches: 'v[12]'
                    }
                }
            },
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    version: '{{request.headers.X-API-Version}}',
                    data: 'Version-specific response'
                }
            }
        }
    },

    // ===== INTEGRATION TEMPLATES =====
    {
        id: 'oauth-token',
        name: 'OAuth Token Response',
        category: 'integration',
        description: 'Mock OAuth2 token endpoint',
        icon: '🔑',
        mapping: {
            request: {
                method: 'POST',
                urlPattern: '/oauth/token',
                headers: {
                    'Content-Type': {
                        contains: 'application/x-www-form-urlencoded'
                    }
                }
            },
            response: {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store'
                },
                jsonBody: {
                    access_token: '{{randomValue length=32 type=\'ALPHANUMERIC\'}}',
                    token_type: 'Bearer',
                    expires_in: 3600,
                    refresh_token: '{{randomValue length=32 type=\'ALPHANUMERIC\'}}'
                }
            }
        }
    },
    {
        id: 'webhook',
        name: 'Webhook Receiver',
        category: 'integration',
        description: 'Accept webhook POST requests',
        icon: '🔔',
        mapping: {
            request: {
                method: 'POST',
                urlPattern: '/webhooks/events'
            },
            response: {
                status: 202,
                headers: {
                    'Content-Type': 'application/json'
                },
                jsonBody: {
                    received: true,
                    id: '{{randomValue type=\'UUID\'}}',
                    timestamp: '{{now}}'
                }
            }
        }
    },

    // ===== PROXY TEMPLATES =====
    {
        id: 'proxy-pass',
        name: 'Proxy Pass-through',
        category: 'proxy',
        description: 'Forward request to another server',
        icon: '🔄',
        mapping: {
            request: {
                urlPattern: '/proxy/.*'
            },
            response: {
                proxyBaseUrl: 'https://api.example.com',
                additionalProxyRequestHeaders: {
                    'X-Proxied-By': 'WireMock'
                }
            }
        }
    }
];

/**
 * Get all templates
 * @returns {Array} Array of all templates
 */
window.getAllMappingTemplates = function() {
    return [...BUILT_IN_TEMPLATES];
};

/**
 * Get templates by category
 * @param {string} category Category name
 * @returns {Array} Filtered templates
 */
window.getMappingTemplatesByCategory = function(category) {
    if (!category) return BUILT_IN_TEMPLATES;
    return BUILT_IN_TEMPLATES.filter(t => t.category === category);
};

/**
 * Get template by ID
 * @param {string} templateId Template ID
 * @returns {Object|null} Template object or null
 */
window.getMappingTemplateById = function(templateId) {
    return BUILT_IN_TEMPLATES.find(t => t.id === templateId) || null;
};

/**
 * Get all categories
 * @returns {Object} Category labels
 */
window.getMappingTemplateCategories = function() {
    return { ...TEMPLATE_CATEGORY_LABELS };
};

console.log('✅ Mapping Templates loaded:', BUILT_IN_TEMPLATES.length, 'templates');
