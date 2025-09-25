'use strict';

// ---- Template library & history helpers ----

const TEMPLATE_LIBRARY = [
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

const TEMPLATE_CATEGORY_LABELS = {
    basic: 'Basic',
    advanced: 'Advanced',
    testing: 'Testing',
    integration: 'Integration',
    proxy: 'Proxy'
};

function formatRelativeTime(timestamp) {
    if (!timestamp) {
        return '—';
    }

    const now = Date.now();
    const diff = timestamp - now;
    const absDiff = Math.abs(diff);

    const units = [
        { limit: 60 * 1000, divisor: 1000, unit: 'second' },
        { limit: 60 * 60 * 1000, divisor: 60 * 1000, unit: 'minute' },
        { limit: 24 * 60 * 60 * 1000, divisor: 60 * 60 * 1000, unit: 'hour' },
        { limit: 7 * 24 * 60 * 60 * 1000, divisor: 24 * 60 * 60 * 1000, unit: 'day' },
        { limit: 30 * 24 * 60 * 60 * 1000, divisor: 7 * 24 * 60 * 60 * 1000, unit: 'week' },
        { limit: Infinity, divisor: 30 * 24 * 60 * 60 * 1000, unit: 'month' }
    ];

    const formatter = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
        ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
        : null;

    for (const { limit, divisor, unit } of units) {
        if (absDiff < limit) {
            const value = Math.round(diff / divisor);
            if (formatter) {
                return formatter.format(value, unit);
            }
            const suffix = value < 0 ? 'ago' : 'from now';
            return `${Math.abs(value)} ${unit}${Math.abs(value) !== 1 ? 's' : ''} ${suffix}`;
        }
    }

    return new Date(timestamp).toLocaleString();
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 B';
    }

    const thresholds = [
        { limit: 1024, suffix: 'B', divisor: 1 },
        { limit: 1024 * 1024, suffix: 'KB', divisor: 1024 },
        { limit: 1024 * 1024 * 1024, suffix: 'MB', divisor: 1024 * 1024 }
    ];

    for (const { limit, suffix, divisor } of thresholds) {
        if (bytes < limit) {
            const value = bytes / divisor;
            if (suffix === 'B') {
                return `${Math.round(value)} ${suffix}`;
            }
            const formatted = value >= 100 ? Math.round(value) : value.toFixed(1);
            return `${formatted} ${suffix}`;
        }
    }

    const value = bytes / (1024 * 1024 * 1024);
    return `${value.toFixed(2)} GB`;
}

function detectSafari(userAgent) {
    const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    if (!ua) {
        return false;
    }
    return ua.includes('Safari')
        && !ua.includes('Chrome')
        && !ua.includes('Chromium')
        && !ua.includes('Android')
        && !ua.includes('Edg');
}

class HistorySnapshotLock {
    constructor(name, options = {}) {
        this.key = `imock-history-lock:${name}`;
        this.ttl = options.ttl || 3000;
        this.token = null;
        this.memoryLocked = false;
        this.memoryExpires = 0;
        this.hasStorage = this.checkStorage();
        this.channel = null;
        this.storageListener = null;

        if (typeof BroadcastChannel !== 'undefined') {
            try {
                this.channel = new BroadcastChannel(this.key);
                this.channel.addEventListener('message', (event) => {
                    if (event && event.data && event.data.type === 'release' && event.data.token === this.token) {
                        this.token = null;
                    }
                });
            } catch (error) {
                this.channel = null;
            }
        }

        if (!this.channel && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            this.storageListener = (event) => {
                if (event && event.key === this.key && !event.newValue) {
                    this.token = null;
                }
            };
            try {
                window.addEventListener('storage', this.storageListener);
            } catch (error) {
                this.storageListener = null;
            }
        }
    }

    checkStorage() {
        try {
            if (typeof localStorage === 'undefined') {
                return false;
            }
            const testKey = `${this.key}:test`;
            localStorage.setItem(testKey, '1');
            localStorage.removeItem(testKey);
            return true;
        } catch (error) {
            return false;
        }
    }

    readLock() {
        if (!this.hasStorage) {
            return null;
        }
        try {
            const raw = localStorage.getItem(this.key);
            if (!raw) {
                return null;
            }
            const record = JSON.parse(raw);
            if (record && typeof record === 'object' && record.expires && record.expires < Date.now()) {
                localStorage.removeItem(this.key);
                return null;
            }
            return record;
        } catch (error) {
            this.hasStorage = false;
            return null;
        }
    }

    writeLock(record) {
        if (!this.hasStorage) {
            return;
        }
        try {
            localStorage.setItem(this.key, JSON.stringify(record));
        } catch (error) {
            this.hasStorage = false;
        }
    }

    async acquire() {
        const now = Date.now();
        const expires = now + this.ttl;
        const newToken = `${now}-${Math.random().toString(16).slice(2)}`;

        if (this.hasStorage) {
            const existing = this.readLock();
            if (existing && existing.expires > now && existing.token !== this.token) {
                return false;
            }
            const tokenToUse = existing && existing.token === this.token ? this.token : newToken;
            this.writeLock({ token: tokenToUse, expires });
            this.token = tokenToUse;
            return true;
        }

        if (this.memoryLocked && this.memoryExpires > now) {
            return false;
        }

        this.memoryLocked = true;
        this.memoryExpires = expires;
        this.token = newToken;
        return true;
    }

    release() {
        if (!this.token) {
            return;
        }

        if (this.hasStorage) {
            const record = this.readLock();
            if (record && record.token === this.token) {
                try {
                    localStorage.removeItem(this.key);
                } catch (error) {
                    // ignore
                }
            }
            if (this.channel) {
                try {
                    this.channel.postMessage({ type: 'release', token: this.token });
                } catch (error) {
                    // ignore
                }
            }
        }

        this.memoryLocked = false;
        this.memoryExpires = 0;
        this.token = null;
    }
}

class HistoryWorkerBridge {
    constructor(workerScript = 'history-worker.js') {
        this.workerScript = workerScript;
        this.pending = new Map();
        this.taskId = 0;
        this.worker = null;
        this.lastSnapshot = null;
        this.env = this.detectEnv();
        const hasLocation = typeof location !== 'undefined';
        this.supportsWorkers = typeof Worker !== 'undefined' && (!hasLocation || location.protocol !== 'file:');
        this.fallback = false;

        if (this.supportsWorkers) {
            try {
                this.worker = new Worker(workerScript);
                this.worker.onmessage = this.handleMessage.bind(this);
                this.worker.onerror = this.handleWorkerError.bind(this);
                if (typeof this.worker.addEventListener === 'function') {
                    this.worker.addEventListener('messageerror', (event) => {
                        console.warn('History worker message error', event);
                    });
                }
            } catch (error) {
                console.warn('Failed to create history worker, falling back to main thread', error);
                this.worker = null;
                this.fallback = true;
            }
        } else {
            this.fallback = true;
        }
    }

    detectEnv() {
        const globalObj = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {});
        const protocol = globalObj.location ? globalObj.location.protocol : 'https:';
        const isSecureContext = typeof globalObj.isSecureContext === 'boolean' ? globalObj.isSecureContext : protocol === 'https:';
        const ua = typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '';
        const isSafari = detectSafari(ua);
        const allowWebCrypto = isSecureContext && typeof globalObj.crypto !== 'undefined' && globalObj.crypto && globalObj.crypto.subtle;
        return { protocol, isSecureContext, isSafari, allowWebCrypto };
    }

    handleMessage(event) {
        const data = event.data || {};
        const taskId = data.id;
        if (!taskId || !this.pending.has(taskId)) {
            return;
        }
        const task = this.pending.get(taskId);
        this.pending.delete(taskId);
        if (data.error) {
            task.reject(new Error(data.error));
            return;
        }
        if (task.type === 'snapshot') {
            this.lastSnapshot = {
                hash: data.result.hash,
                canonical: data.result.canonical,
                format: data.result.meta && data.result.meta.format ? data.result.meta.format : undefined
            };
        }
        task.resolve(data.result);
    }

    handleWorkerError(error) {
        console.warn('History worker failed – switching to fallback mode', error);
        if (this.worker) {
            try {
                this.worker.terminate();
            } catch (terminateError) {
                // ignore
            }
            this.worker = null;
        }
        this.supportsWorkers = false;
        this.fallback = true;
        for (const [, task] of this.pending) {
            task.reject(error);
        }
        this.pending.clear();
    }

    callWorker(type, payload) {
        if (!this.worker) {
            return Promise.reject(new Error('History worker unavailable'));
        }
        const taskId = ++this.taskId;
        const message = { id: taskId, type, payload };
        const promise = new Promise((resolve, reject) => {
            this.pending.set(taskId, { resolve, reject, type });
        });
        this.worker.postMessage(message);
        return promise;
    }

    async prepareSnapshot(payload) {
        const message = {
            content: payload.content,
            previousSnapshot: payload.previousSnapshot || this.lastSnapshot,
            options: {
                keyframeByteThreshold: payload.keyframeByteThreshold,
                maxOps: payload.maxOps,
                diffTimeoutMs: payload.diffTimeoutMs,
                forceKeyframe: Boolean(payload.forceKeyframe)
            },
            env: this.env
        };

        if (this.worker && !this.fallback) {
            const result = await this.callWorker('snapshot', message);
            this.lastSnapshot = {
                hash: result.hash,
                canonical: result.canonical,
                format: result.meta && result.meta.format ? result.meta.format : undefined
            };
            return result;
        }

        return this.processFallback(message);
    }

    async processFallback(message) {
        let previous = message.previousSnapshot || this.lastSnapshot;
        if (previous && (!previous.normalized || !previous.format) && this.lastSnapshot && this.lastSnapshot.hash === previous.hash) {
            previous = {
                ...previous,
                normalized: previous.normalized || this.lastSnapshot.normalized,
                format: previous.format || this.lastSnapshot.format
            };
        }
        const options = Object.assign({}, message.options || {}, { emitNormalized: true });
        const result = await HistoryShared.generateSnapshot(message.content, previous, options, message.env || this.env);
        this.lastSnapshot = {
            hash: result.hash,
            canonical: result.canonical,
            normalized: result.normalized,
            format: result.meta && result.meta.format ? result.meta.format : undefined
        };
        const { normalized, ...publicResult } = result;
        return publicResult;
    }

    async resetCache() {
        this.lastSnapshot = null;
        if (this.worker && !this.fallback) {
            try {
                await this.callWorker('reset-cache', {});
            } catch (error) {
                this.handleWorkerError(error);
            }
        }
    }
}

class EditorHistory {
    constructor(limit = 50, options = {}) {
        this.limit = Math.max(5, limit);
        this.entries = [];
        this.currentId = null;
        this.totalBytes = 0;
        this.cacheLimit = options.cacheLimit || 5;
        this.canonicalCache = new Map();
        this.stateCache = new Map();
        this.workerBridge = new HistoryWorkerBridge(options.workerScript || 'history-worker.js');
        this.snapshotLock = new HistorySnapshotLock('imock-history', { ttl: 3000 });
        const isSafari = this.workerBridge.env.isSafari;
        const baseBudget = isSafari ? 30 * 1024 * 1024 : 50 * 1024 * 1024;
        this.budgetBytes = options.budgetBytes || baseBudget;
        this.keyframeByteThreshold = options.keyframeByteThreshold || HistoryShared.DEFAULT_KEYFRAME_THRESHOLD;
        this.maxDiffOperations = options.maxDiffOperations || HistoryShared.DEFAULT_MAX_OPS;
        this.diffTimeoutMs = options.diffTimeoutMs || HistoryShared.DEFAULT_DIFF_TIMEOUT;
        this.notify = typeof options.notify === 'function' ? options.notify : null;
        this.lastWorkerSnapshot = null;

        if (!this.workerBridge.supportsWorkers && this.notify) {
            this.notify('History worker unavailable – heavy operations will run on the main thread.', 'warning');
        }

        if (!this.workerBridge.env.allowWebCrypto && this.workerBridge.env.isSafari && this.notify) {
            this.notify('Secure context required for fast history hashing in Safari. Falling back to slower SHA-256.', 'warning');
        }
    }

    async reset(initialContent = '', meta = {}) {
        this.entries = [];
        this.currentId = null;
        this.totalBytes = 0;
        this.lastWorkerSnapshot = null;
        this.canonicalCache.clear();
        this.stateCache.clear();
        await this.workerBridge.resetCache();

        const normalized = typeof initialContent === 'string' ? initialContent : '';
        if (normalized.length > 0 || meta.forceInitial) {
            await this.record(normalized, {
                ...meta,
                reason: meta.reason || 'Initial snapshot',
                label: meta.label || 'Initial document',
                force: true,
                forceKeyframe: true
            });
        }
    }

    async record(content, meta = {}) {
        const normalized = typeof content === 'string' ? content : '';
        const timestamp = Date.now();
        const lastEntry = this.entries[this.entries.length - 1];
        const forceRecord = Boolean(meta.force);
        const cleanMeta = this.cleanMeta(meta);

        if (!forceRecord && lastEntry && lastEntry.content === normalized) {
            lastEntry.timestamp = timestamp;
            lastEntry.meta = { ...lastEntry.meta, ...cleanMeta };
            this.currentId = lastEntry.id;
            return { recorded: false, entry: lastEntry, reason: 'unchanged' };
        }

        const lockAcquired = await this.snapshotLock.acquire();
        if (!lockAcquired) {
            return { recorded: false, reason: 'locked' };
        }

        try {
            const workerPayload = {
                content: normalized,
                previousSnapshot: this.lastWorkerSnapshot,
                keyframeByteThreshold: this.keyframeByteThreshold,
                maxOps: this.maxDiffOperations,
                diffTimeoutMs: this.diffTimeoutMs,
                forceKeyframe: Boolean(meta.forceKeyframe || meta.manual || meta.force)
            };

            const result = await this.workerBridge.prepareSnapshot(workerPayload);

            if (result.snapshotType === 'unchanged' && !forceRecord) {
                if (lastEntry) {
                    lastEntry.timestamp = timestamp;
                    lastEntry.meta = { ...lastEntry.meta, ...cleanMeta };
                    this.currentId = lastEntry.id;
                }
                return { recorded: false, entry: lastEntry || null, reason: 'unchanged' };
            }

            const entry = this.createEntry(normalized, cleanMeta, timestamp, result);
            this.entries.push(entry);
            this.currentId = entry.id;
            this.totalBytes += entry.byteSize;
            this.cacheCanonical(entry);
            this.enforceLimit();
            this.enforceBudget();

            this.lastWorkerSnapshot = {
                hash: result.hash,
                canonical: result.canonical,
                format: result.meta && result.meta.format ? result.meta.format : undefined
            };

            return { recorded: true, entry };
        } catch (error) {
            if (this.notify) {
                this.notify(`History snapshot failed: ${error.message || error}`, 'error');
            } else {
                console.warn('History snapshot failed', error);
            }
            return { recorded: false, error };
        } finally {
            this.snapshotLock.release();
        }
    }

    cacheCanonical(entry) {
        this.canonicalCache.set(entry.id, entry.canonical);
        this.stateCache.set(entry.id, entry.content);
        while (this.canonicalCache.size > this.cacheLimit) {
            const key = this.canonicalCache.keys().next().value;
            this.canonicalCache.delete(key);
        }
        while (this.stateCache.size > this.cacheLimit) {
            const key = this.stateCache.keys().next().value;
            this.stateCache.delete(key);
        }
    }

    enforceLimit() {
        if (this.entries.length <= this.limit) {
            return;
        }
        const excess = this.entries.length - this.limit;
        const removed = this.entries.splice(0, excess);
        removed.forEach((entry) => {
            this.totalBytes -= entry.byteSize || 0;
            this.canonicalCache.delete(entry.id);
            this.stateCache.delete(entry.id);
        });
    }

    enforceBudget() {
        while (this.totalBytes > this.budgetBytes && this.entries.length > 1) {
            const removableIndex = this.entries.findIndex(entry => !entry.meta || !entry.meta.manual);
            if (removableIndex === -1) {
                break;
            }
            const removed = this.entries.splice(removableIndex, 1)[0];
            if (removed) {
                this.totalBytes -= removed.byteSize || 0;
                this.canonicalCache.delete(removed.id);
                this.stateCache.delete(removed.id);
            }
        }
    }

    cleanMeta(meta) {
        if (!meta || typeof meta !== 'object') {
            return {};
        }

        const clone = { ...meta };
        delete clone.force;
        delete clone.contentOverride;
        delete clone.editor;
        delete clone.labelGenerated;
        delete clone.forceKeyframe;
        return clone;
    }

    createEntry(content, meta, timestamp, workerResult) {
        const byteSize = workerResult.byteSize || (content ? HistoryShared.encodeUtf8(content).length : 0);
        const label = meta && meta.label ? meta.label : this.deriveLabel(content, meta);
        const reason = meta && meta.reason ? meta.reason : (meta && meta.action ? meta.action : 'Edit');

        const metaFormat = workerResult.meta && workerResult.meta.format ? workerResult.meta.format : 'json';
        const entry = {
            id: `hist-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp,
            content,
            label,
            preview: this.buildPreview(content),
            byteSize,
            sizeLabel: formatBytes(byteSize),
            hash: workerResult.hash,
            canonical: workerResult.canonical,
            snapshotType: workerResult.snapshotType || 'keyframe',
            diff: workerResult.diff || null,
            format: metaFormat,
            meta: {
                ...meta,
                label,
                reason,
                snapshotType: workerResult.snapshotType || 'keyframe',
                recordedAt: new Date(timestamp).toISOString(),
                keyframeReason: workerResult.meta && workerResult.meta.keyframeReason ? workerResult.meta.keyframeReason : undefined,
                format: metaFormat,
                parseError: workerResult.meta && workerResult.meta.parseError ? workerResult.meta.parseError : undefined
            }
        };

        return entry;
    }

    deriveLabel(content, meta = {}) {
        const fallback = meta && meta.action ? meta.action : 'Snapshot';

        const trimmed = typeof content === 'string' ? content.trim() : '';
        if (!trimmed) {
            return fallback;
        }

        try {
            const data = JSON.parse(trimmed);
            if (data && typeof data === 'object') {
                if (data.name) {
                    return data.name;
                }

                const request = data.request || {};
                const method = request.method || '';
                const url = request.url || request.urlPath || request.urlPattern || request.urlPathPattern || '';
                const parts = [];
                if (method) parts.push(method);
                if (url) parts.push(url);
                if (parts.length) {
                    return parts.join(' · ');
                }
            }
        } catch (error) {
            // Parsing failed – fall back to raw string
        }

        const firstLine = trimmed.split('\n')[0];
        return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine || fallback;
    }

    buildPreview(content) {
        if (typeof content !== 'string' || content.trim().length === 0) {
            return '(empty document)';
        }

        try {
            const parsed = JSON.parse(content);
            const pretty = JSON.stringify(parsed, null, 2);
            return this.truncatePreview(pretty);
        } catch (error) {
            return this.truncatePreview(content);
        }
    }

    truncatePreview(text, maxLines = 8, maxChars = 400) {
        const lines = text.split('\n').slice(0, maxLines);
        let preview = lines.join('\n');
        if (preview.length > maxChars) {
            preview = `${preview.slice(0, maxChars - 1)}…`;
        }
        return preview;
    }

    getEntries(options = {}) {
        const newestFirst = options && options.newestFirst !== undefined ? options.newestFirst : true;
        const entries = [...this.entries];
        return newestFirst ? entries.reverse() : entries;
    }

    getEntryById(entryId) {
        return this.entries.find(entry => entry.id === entryId) || null;
    }

    markCurrent(entryId) {
        this.currentId = entryId || null;
        this.entries.forEach((entry) => {
            entry.meta = entry.meta || {};
            entry.meta.current = entry.id === this.currentId;
        });
    }

    getCurrentId() {
        return this.currentId;
    }

    async clear(options = {}) {
        const keepLatest = options && options.keepLatest !== undefined ? options.keepLatest : true;
        const label = options && options.label ? options.label : 'Current document';
        const content = typeof options.latestContent === 'string' ? options.latestContent : '';

        this.entries = [];
        this.currentId = null;
        this.totalBytes = 0;
        this.lastWorkerSnapshot = null;
        this.canonicalCache.clear();
        this.stateCache.clear();
        await this.workerBridge.resetCache();

        if (keepLatest && content) {
            await this.record(content, {
                reason: 'History cleared',
                label,
                force: true,
                forceKeyframe: true
            });
        }
    }

    getStats() {
        if (!this.entries.length) {
            return {
                count: 0,
                byteSize: 0,
                latestTimestamp: null,
                latestLabel: null,
                budgetBytes: this.budgetBytes
            };
        }

        const latest = this.entries[this.entries.length - 1];

        return {
            count: this.entries.length,
            byteSize: this.totalBytes,
            latestTimestamp: latest ? latest.timestamp : null,
            latestLabel: latest ? latest.label : null,
            budgetBytes: this.budgetBytes
        };
    }
}

function resolveTemplatePath(source, path) {
    if (!source || !path) {
        return undefined;
    }

    const segments = Array.isArray(path)
        ? path
        : String(path)
            .replace(/\[(\d+)\]/g, '.$1')
            .split('.');

    return segments.reduce((acc, segment) => {
        if (acc == null) {
            return undefined;
        }

        if (Array.isArray(acc)) {
            const index = Number(segment);
            return Number.isInteger(index) ? acc[index] : undefined;
        }

        return acc[segment];
    }, source);
}

function formatFeatureValue(value) {
    if (value == null) {
        return '';
    }

    if (typeof value === 'string') {
        return value.length > 80 ? `${value.slice(0, 77)}…` : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    try {
        const serialized = JSON.stringify(value);
        return serialized.length > 80 ? `${serialized.slice(0, 77)}…` : serialized;
    } catch (error) {
        console.warn('Failed to serialise feature value', error);
        return '';
    }
}

function getTemplateFeature(template) {
    if (!template || !template.feature) {
        return null;
    }

    const featurePath = template.feature.path || template.feature;
    const label = template.feature.label
        || (Array.isArray(featurePath) ? featurePath.join('.') : String(featurePath));
    const rawValue = resolveTemplatePath(template.content, featurePath);

    if (typeof rawValue === 'undefined') {
        return null;
    }

    return {
        label,
        value: formatFeatureValue(rawValue)
    };
}

function getTemplateHeadline(template) {
    if (!template) {
        return '';
    }

    if (template.highlight) {
        return template.highlight;
    }

    const info = [];
    if (template.content?.request?.method) {
        info.push(template.content.request.method);
    }
    if (template.content?.request?.url || template.content?.request?.urlPath) {
        info.push(template.content.request.url || template.content.request.urlPath);
    }

    return info.join(' · ');
}

function buildTemplatePreview(template) {
    try {
        const payload = template && template.content ? template.content : {};
        if (typeof payload === 'string') {
            return payload;
        }
        const pretty = JSON.stringify(payload, null, 2);
        const lines = pretty.split('\n').slice(0, 8);
        const preview = lines.join('\n');
        return preview.length > 320 ? `${preview.slice(0, 319)}…` : preview;
    } catch (error) {
        return '[unavailable template preview]';
    }
}

function copyTextToClipboard(text) {
    if (typeof text !== 'string') {
        text = String(text ?? '');
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }

    return Promise.resolve(fallbackCopy(text));

    function fallbackCopy(value) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        } catch (error) {
            console.warn('Clipboard fallback failed:', error);
            return false;
        }
    }
}

function renderTemplateLibrary() {
    const container = document.getElementById('templateGrid');
    if (!container) {
        return;
    }

    const initializer = window.monacoInitializer;
    const templates = initializer && typeof initializer.getTemplateLibrary === 'function'
        ? initializer.getTemplateLibrary()
        : TEMPLATE_LIBRARY.slice();

    container.innerHTML = '';

    ensureTemplatePreviewHandlers();

    const infoPanel = document.createElement('section');
    infoPanel.className = 'template-info';
    infoPanel.innerHTML = `
        <p class="template-info__lead">Browse ready-made WireMock snippets or treat this gallery as a quick reference:</p>
        <ul>
            <li><strong>Use template</strong> drops the JSON straight into the editor.</li>
            <li><strong>Copy JSON</strong> copies the snippet so you can adapt it manually.</li>
            <li>Each card highlights key features like matchers, templating, webhooks, or proxy settings.</li>
        </ul>
        <p>It's perfectly fine to just read through these examples—no need to apply a template if you only need guidance.</p>
    `;
    container.appendChild(infoPanel);

    if (!templates.length) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.innerHTML = '<p>No templates available</p><small>Add templates to TEMPLATE_LIBRARY to populate this view.</small>';
        container.appendChild(empty);
        return;
    }

    templates.forEach((template) => {
        const card = document.createElement('article');
        card.className = 'template-card';
        card.dataset.templateId = template.id;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');

        const header = document.createElement('div');
        header.className = 'template-header';

        const title = document.createElement('h3');
        title.textContent = template.title;
        header.appendChild(title);

        const badge = document.createElement('span');
        const badgeCategory = template.category && TEMPLATE_CATEGORY_LABELS[template.category]
            ? template.category
            : 'basic';
        badge.className = `badge ${badgeCategory}`;
        badge.textContent = TEMPLATE_CATEGORY_LABELS[badgeCategory] || 'Template';
        header.appendChild(badge);

        const description = document.createElement('p');
        description.className = 'template-description';
        description.textContent = template.description || 'Ready-to-use WireMock template.';

        const highlight = document.createElement('span');
        highlight.className = 'template-highlight';
        highlight.textContent = getTemplateHeadline(template);

        const featuresContainer = document.createElement('div');
        featuresContainer.className = 'template-features';

        const featureData = getTemplateFeature(template);
        if (featureData) {
            const feature = document.createElement('div');
            feature.className = 'template-feature';

            const key = document.createElement('div');
            key.className = 'template-feature__key';
            key.textContent = featureData.label;

            const value = document.createElement('div');
            value.className = 'template-feature__value';
            value.textContent = featureData.value;

            feature.appendChild(key);
            feature.appendChild(value);
            featuresContainer.appendChild(feature);
        }

        const preview = document.createElement('pre');
        preview.className = 'history-preview';
        preview.textContent = buildTemplatePreview(template);

        const actions = document.createElement('div');
        actions.className = 'template-actions';

        const useButton = document.createElement('button');
        useButton.className = 'btn btn-primary btn-sm';
        useButton.type = 'button';
        useButton.textContent = 'Use template';
        useButton.addEventListener('click', (event) => {
            event.stopPropagation();
            applyTemplateFromCard(template);
        });

        const copyButton = document.createElement('button');
        copyButton.className = 'btn btn-secondary btn-sm';
        copyButton.type = 'button';
        copyButton.textContent = 'Copy JSON';
        copyButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            const json = template && template.content && typeof template.content === 'string'
                ? template.content
                : JSON.stringify(template.content, null, 2);
            const success = await copyTextToClipboard(json);
            if (initializer && typeof initializer.showNotification === 'function') {
                initializer.showNotification(success ? `Template "${template.title}" copied` : 'Clipboard copy failed', success ? 'success' : 'error');
            }
        });

        actions.appendChild(useButton);
        actions.appendChild(copyButton);

        card.addEventListener('click', () => showTemplatePreview(template));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showTemplatePreview(template);
            }
        });

        card.appendChild(header);
        card.appendChild(description);
        if (highlight.textContent) {
            card.appendChild(highlight);
        }
        if (featuresContainer.childNodes.length) {
            card.appendChild(featuresContainer);
        }
        card.appendChild(preview);
        card.appendChild(actions);

        container.appendChild(card);
    });
}

function ensureTemplatePreviewHandlers() {
    const modal = document.getElementById('templatePreviewModal');
    if (!modal || modal.dataset.previewBound === 'true') {
        return;
    }

    modal.dataset.previewBound = 'true';

    const actions = modal.querySelector('#templatePreviewActions');
    if (actions) {
        actions.addEventListener('click', async (event) => {
            const button = event.target instanceof HTMLElement
                ? event.target.closest('[data-template-action]')
                : null;
            if (!button) {
                return;
            }

            event.preventDefault();

            const action = button.dataset.templateAction;
            if (!action) {
                return;
            }

            const template = getTemplateById(modal.dataset.templateId);
            if (!template) {
                return;
            }

            if (action === 'apply') {
                applyTemplateFromCard(template);
                return;
            }

            if (action === 'copy') {
                const json = typeof template.content === 'string'
                    ? template.content
                    : JSON.stringify(template.content, null, 2);
                const success = await copyTextToClipboard(json);
                const initializer = window.monacoInitializer;
                if (initializer && typeof initializer.showNotification === 'function') {
                    initializer.showNotification(success ? `Template "${template.title}" copied` : 'Clipboard copy failed', success ? 'success' : 'error');
                }
                return;
            }

            if (action === 'close') {
                if (typeof window.closeModal === 'function') {
                    window.closeModal('templatePreviewModal');
                }
            }
        });
    }
}

function getTemplateById(templateId) {
    if (!templateId) {
        return null;
    }

    const initializer = window.monacoInitializer;
    const templates = initializer && typeof initializer.getTemplateLibrary === 'function'
        ? initializer.getTemplateLibrary()
        : TEMPLATE_LIBRARY.slice();

    return templates.find((item) => item.id === templateId) || null;
}

function showTemplatePreview(template) {
    if (!template || !template.id) {
        return;
    }

    const modal = document.getElementById('templatePreviewModal');
    if (!modal) {
        return;
    }

    modal.dataset.templateId = template.id;

    const title = modal.querySelector('#modal-title-template-preview');
    if (title) {
        title.textContent = template.title || 'Template preview';
    }

    const description = modal.querySelector('#templatePreviewDescription');
    if (description) {
        description.textContent = template.description || '';
        description.style.display = template.description ? '' : 'none';
    }

    const meta = modal.querySelector('#templatePreviewMeta');
    if (meta) {
        const headline = getTemplateHeadline(template) || '—';
        const feature = getTemplateFeature(template);

        meta.innerHTML = '';

        const endpointRow = document.createElement('div');
        endpointRow.className = 'template-preview-meta__row';

        const endpointLabel = document.createElement('span');
        endpointLabel.className = 'template-preview-meta__label';
        endpointLabel.textContent = 'Endpoint';

        const endpointValue = document.createElement('span');
        endpointValue.className = 'template-preview-meta__value';
        endpointValue.textContent = headline;

        endpointRow.appendChild(endpointLabel);
        endpointRow.appendChild(endpointValue);
        meta.appendChild(endpointRow);

        if (feature) {
            const featureRow = document.createElement('div');
            featureRow.className = 'template-preview-meta__row';

            const featureLabel = document.createElement('span');
            featureLabel.className = 'template-preview-meta__label';
            featureLabel.textContent = 'Highlight';

            const featureCode = document.createElement('code');
            featureCode.className = 'template-preview-meta__code';
            featureCode.textContent = `${feature.label} = ${feature.value}`;

            featureRow.appendChild(featureLabel);
            featureRow.appendChild(featureCode);
            meta.appendChild(featureRow);
        }
    }

    const code = modal.querySelector('#templatePreviewCode');
    if (code) {
        const payload = template && template.content ? template.content : {};
        const json = typeof payload === 'string'
            ? payload
            : JSON.stringify(payload, null, 2);
        code.textContent = json;
    }

    ensureTemplatePreviewHandlers();

    if (typeof window.openModal === 'function') {
        window.openModal('templatePreviewModal');
    }
}

function applyTemplateFromCard(template) {
    const initializer = window.monacoInitializer;
    if (!initializer) {
        return;
    }

    let applied = false;
    if (typeof initializer.applyTemplate === 'function') {
        applied = initializer.applyTemplate(template);
    } else if (typeof initializer.applyTemplateById === 'function') {
        applied = initializer.applyTemplateById(template.id);
    }

    if (applied && typeof window.closeModal === 'function') {
        window.closeModal('templatePreviewModal');
        window.closeModal('fullscreenModal');
    }
}

function renderHistoryModal(options = {}) {
    const modal = document.getElementById('historyModal');
    if (!modal) {
        return;
    }

    const initializer = window.monacoInitializer;
    if (!initializer) {
        return;
    }

    const modalBody = modal.querySelector('.modal-body');
    const list = modalBody ? modalBody.querySelector('#historyList') : null;
    if (!modalBody || !list) {
        return;
    }

    let statsContainer = modalBody.querySelector('#historyStats');
    if (!statsContainer) {
        statsContainer = document.createElement('div');
        statsContainer.id = 'historyStats';
        statsContainer.className = 'history-stats';
        modalBody.insertBefore(statsContainer, modalBody.firstChild);
    }

    const stats = initializer.getHistoryStats();
    const approxSize = formatBytes(stats.byteSize);
    const budgetSize = stats.budgetBytes ? formatBytes(stats.budgetBytes) : null;
    const sizeLabel = budgetSize ? `${approxSize} / ${budgetSize}` : approxSize;
    const lastSaved = stats.latestTimestamp ? `${formatRelativeTime(stats.latestTimestamp)} (${new Date(stats.latestTimestamp).toLocaleString()})` : '—';
    const latestLabel = stats.latestLabel || '—';

    statsContainer.innerHTML = `
        <div class="history-meta">
            <span class="history-meta__label">Snapshots</span>
            <span>${stats.count}</span>
        </div>
        <div class="history-meta">
            <span class="history-meta__label">Approx size</span>
            <span>${sizeLabel}</span>
        </div>
        <div class="history-meta">
            <span class="history-meta__label">Last save</span>
            <span>${lastSaved}</span>
        </div>
        <div class="history-meta">
            <span class="history-meta__label">Latest label</span>
            <span>${latestLabel}</span>
        </div>
        <div class="history-actions-row">
            <button class="btn btn-secondary btn-sm" data-history-action="snapshot">Manual snapshot</button>
            <button class="btn btn-secondary btn-sm" data-history-action="export">Copy history JSON</button>
            <button class="btn btn-danger btn-sm" data-history-action="clear">Clear history</button>
        </div>
    `;

    if (!statsContainer.dataset.bound) {
        statsContainer.dataset.bound = 'true';
        statsContainer.addEventListener('click', async (event) => {
            const actionButton = event.target instanceof HTMLElement ? event.target.closest('[data-history-action]') : null;
            if (!actionButton) {
                return;
            }

            event.preventDefault();
            const action = actionButton.dataset.historyAction;

            if (action === 'snapshot') {
                await initializer.recordHistorySnapshot('Manual snapshot', { label: 'Manual snapshot', manual: true, force: true, forceKeyframe: true });
                initializer.refreshHistoryUI({ force: true });
                return;
            }

            if (action === 'export') {
                const payload = {
                    exportedAt: new Date().toISOString(),
                    count: stats.count,
                    entries: initializer.getHistoryEntries({ newestFirst: false }).map(entry => ({
                        id: entry.id,
                        timestamp: entry.timestamp,
                        label: entry.label,
                        reason: entry.meta?.reason,
                        occurrences: entry.meta?.occurrences || 1,
                        firstRecordedAt: entry.meta?.firstRecordedAt,
                        lastRecordedAt: entry.meta?.lastRecordedAt,
                        size: entry.byteSize,
                        content: entry.content
                    }))
                };

                const success = await copyTextToClipboard(JSON.stringify(payload, null, 2));
                initializer.showNotification(success ? 'History copied to clipboard' : 'Failed to copy history', success ? 'success' : 'error');
                return;
            }

            if (action === 'clear') {
                const confirmed = typeof window.confirm === 'function'
                    ? window.confirm('Clear history snapshots? The current document will remain as the first entry.')
                    : true;
                if (confirmed) {
                    await initializer.clearHistory({ keepLatest: true, label: 'Current document' });
                }
            }
        });
    }

    if (options.statsOnly) {
        initializer.markHistoryRendered();
        return;
    }

    const entries = initializer.getHistoryEntries({ newestFirst: true });
    const currentId = initializer.getCurrentHistoryEntryId();

    list.innerHTML = '';

    if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.innerHTML = '<p>No history yet</p><small>Changes are tracked automatically – edit the document or create a manual snapshot.</small>';
        list.appendChild(empty);
        initializer.markHistoryRendered();
        return;
    }

    entries.forEach((entry) => {
        const item = document.createElement('article');
        item.className = 'history-item';
        item.dataset.entryId = entry.id;
        if (entry.id === currentId) {
            item.classList.add('current');
        }

        const header = document.createElement('div');
        header.className = 'history-header';

        const title = document.createElement('div');
        title.className = 'history-title';
        title.textContent = entry.label || 'Snapshot';

        const time = document.createElement('div');
        time.className = 'history-time';
        time.textContent = `${formatRelativeTime(entry.timestamp)} · ${new Date(entry.timestamp).toLocaleString()}`;

        header.appendChild(title);
        header.appendChild(time);

        const preview = document.createElement('pre');
        preview.className = 'history-preview';
        preview.textContent = entry.preview || '';

        const metaRow = document.createElement('div');
        metaRow.className = 'history-meta';
        const reason = entry.meta?.reason || 'edit';

        const reasonSpan = document.createElement('span');
        reasonSpan.textContent = `Reason: ${reason}`;
        metaRow.appendChild(reasonSpan);

        const occurrenceCount = entry.meta?.occurrences || 1;
        if (occurrenceCount > 1) {
            const occurrenceSpan = document.createElement('span');
            occurrenceSpan.className = 'history-meta__occurrences';
            const lastSeen = entry.meta?.lastRecordedAt
                ? new Date(entry.meta.lastRecordedAt).toLocaleString()
                : new Date(entry.timestamp).toLocaleString();
            occurrenceSpan.textContent = `Saved ${occurrenceCount}×`;
            occurrenceSpan.title = `Captured ${occurrenceCount} times (last at ${lastSeen})`;
            metaRow.appendChild(occurrenceSpan);
        }

        const sizeSpan = document.createElement('span');
        sizeSpan.textContent = entry.sizeLabel;
        metaRow.appendChild(sizeSpan);

        const buttonsRow = document.createElement('div');
        buttonsRow.className = 'history-action-buttons';

        const restoreButton = document.createElement('button');
        restoreButton.type = 'button';
        restoreButton.className = entry.id === currentId ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm';
        restoreButton.textContent = entry.id === currentId ? 'Current version' : 'Restore';
        restoreButton.disabled = entry.id === currentId;
        restoreButton.addEventListener('click', (event) => {
            event.stopPropagation();
            initializer.restoreHistoryEntry(entry.id, { forceRestore: false });
        });

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'btn btn-secondary btn-sm';
        copyButton.textContent = 'Copy JSON';
        copyButton.addEventListener('click', async (event) => {
            event.stopPropagation();
            const success = await copyTextToClipboard(entry.content);
            initializer.showNotification(success ? 'Snapshot copied to clipboard' : 'Failed to copy snapshot', success ? 'success' : 'error');
        });

        buttonsRow.appendChild(restoreButton);
        buttonsRow.appendChild(copyButton);

        item.appendChild(header);
        item.appendChild(preview);
        item.appendChild(metaRow);
        item.appendChild(buttonsRow);

        item.addEventListener('click', () => {
            if (entry.id !== currentId) {
                initializer.restoreHistoryEntry(entry.id, { forceRestore: false });
            }
        });

        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (entry.id !== currentId) {
                    initializer.restoreHistoryEntry(entry.id, { forceRestore: false });
                }
            }
        });

        list.appendChild(item);
    });

    initializer.markHistoryRendered();
}

// Enhanced Monaco Editor initialization with WireMock Editor integration
// This file provides optimized Monaco Editor setup with JSON schema validation

class MonacoInitializer {
    constructor() {
        this.isInitialized = false;
        this.editors = new Map();
        // Initialize PerformanceController if available
        this.performanceController = typeof PerformanceController !== 'undefined' ? new PerformanceController() : null;
        // Initialize IndexedSearch - use real implementation if available, otherwise create fallback
        this.searchIndex = typeof IndexedSearch !== 'undefined' ? new IndexedSearch() : {
            updateIndex: () => {},
            searchAll: () => [],
            buildIndex: () => {}
        };
        // Initialize ResultCache - use real implementation if available, otherwise create fallback
        this.resultCache = typeof ResultCache !== 'undefined' ? new ResultCache() : {
            get: () => null,
            set: () => {}
        };
        this.workerPool = null;
        this.diffEditor = null;
        this.virtualRenderer = null;
        this.healthMonitoring = {
            enabled: false,
            interval: null,
            stats: {}
        };
        this.lastJSONPathResults = [];
        this.lastJSONPathPointerLocator = null;
        this.lastJSONPathMeta = {
            totalCount: 0,
            truncated: false
        };
        this.currentJSONPathIndex = -1;
        this.lastJSONPathQuery = '';
        this.jsonPathSearchRequestId = 0;
        this.findWidgetIntegration = null;
        this.history = new EditorHistory(60, {
            notify: (message, level) => this.showNotification(message, level)
        });
        this.historyDebounce = null;
        this.suspendHistoryRecording = false;
        this.historyNeedsRender = true;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            await this.loadMonaco();
            this.setupWireMockSchema();
            this.setupOptimizations();
            await this.createEditors();
            this.setupEventHandlers();
            this.isInitialized = true;
            console.log('✅ Monaco Editor initialized with WireMock integration');
        } catch (error) {
            console.error('❌ Monaco Editor initialization failed:', error);
            throw error;
        }
    }

    async loadMonaco() {
        return new Promise((resolve, reject) => {
            require(['vs/editor/editor.main'], resolve, reject);
        });
    }

    setupWireMockSchema() {
        // Enhanced WireMock JSON Schema
        const wireMockSchema = {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Unique identifier for the mapping'
                },
                name: {
                    type: 'string',
                    description: 'Human-readable name for the mapping'
                },
                request: {
                    type: 'object',
                    description: 'Request matching criteria',
                    properties: {
                        method: {
                            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'ANY'],
                            description: 'HTTP method to match'
                        },
                        url: { type: 'string', description: 'Exact URL to match' },
                        urlPath: { type: 'string', description: 'URL path to match' },
                        urlPathPattern: { type: 'string', description: 'URL path pattern (regex)' },
                        urlPattern: { type: 'string', description: 'Full URL pattern (regex)' },
                        queryParameters: { type: 'object', description: 'Query parameter matching' },
                        headers: { type: 'object', description: 'HTTP headers matching' },
                        bodyPatterns: {
                            type: 'array',
                            description: 'Request body matching patterns',
                            items: { type: 'object' }
                        }
                    }
                },
                response: {
                    type: 'object',
                    description: 'Response configuration',
                    properties: {
                        status: {
                            type: 'number',
                            minimum: 100,
                            maximum: 599,
                            description: 'HTTP status code'
                        },
                        body: { type: 'string', description: 'Response body as string' },
                        jsonBody: { type: ['object', 'array'], description: 'Response body as JSON' },
                        headers: { type: 'object', description: 'Response headers' },
                        fixedDelayMilliseconds: { type: 'number', description: 'Fixed delay in milliseconds' }
                    }
                },
                priority: { type: 'number', description: 'Mapping priority' },
                scenarioName: { type: 'string', description: 'Scenario this mapping belongs to' },
                metadata: { type: 'object', description: 'Custom metadata' }
            },
            required: ['request', 'response']
        };

        // Configure JSON language service
        monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
            validate: true,
            schemas: [{
                uri: 'http://wiremock.org/schemas/mapping.json',
                fileMatch: ['*'],
                schema: wireMockSchema
            }]
        });
    }

    setupOptimizations() {
        // Performance optimizations
        try {
            // Initialize WorkerPool if available, otherwise create fallback
            if (typeof WorkerPool !== 'undefined') {
                this.workerPool = new WorkerPool('json-worker.js', 2);
                this.startHealthMonitoring();
                console.log('⚡ Real WorkerPool initialized with health monitoring');
            } else {
                // Fallback mock implementation
                this.workerPool = {
                    execute: async (operation, data, priority) => {
                        switch (operation) {
                            case 'format':
                                const parsed = JSON.parse(data.text);
                                return JSON.stringify(parsed, null, 2);
                            case 'minify':
                                const minParsed = JSON.parse(data.text);
                                return JSON.stringify(minParsed);
                            case 'validate':
                                try {
                                    JSON.parse(data.text);
                                    return { valid: true };
                                } catch (error) {
                                    return { valid: false, error: error.message };
                                }
                            case 'sort_keys':
                                const indent = data && typeof data.indent === 'number' && data.indent >= 0 ? data.indent : 2;
                                const sortParsed = JSON.parse(data.text);
                                const sorted = this.sortKeysDeep(sortParsed);
                                return JSON.stringify(sorted, null, indent);
                            default:
                                return data;
                        }
                    },
                    terminate: () => {},
                    getStats: () => ({ workers: 0, busy: 0, queued: 0, pending: 0 })
                };
                console.log('⚡ Fallback WorkerPool initialized');
            }

            // Initialize VirtualizedJSONRenderer if available
            if (typeof VirtualizedJSONRenderer !== 'undefined') {
                this.virtualRenderer = null; // Will be initialized when editor is created
                console.log('📄 VirtualizedJSONRenderer available');
            }
        } catch (error) {
            console.warn('Performance optimizations initialization failed:', error);
        }
    }

    async createEditors() {
        const theme = document.body.dataset.theme === 'dark' ? 'vs-dark' : 'vs';

        // Check if we have a mappingId in URL - if so, show loading message instead of default stub
        const urlParams = new URLSearchParams(window.location.search);
        const mappingId = urlParams.get('mappingId');
        const initialValue = mappingId
            ? `{\n  "_status": "Loading mapping ${mappingId}..."\n}`
            : this.getDefaultStub();

        // Main editor
        const mainContainer = document.getElementById('jsonEditor');
        if (mainContainer) {
            window.editor = this.createEditor(mainContainer, {
                language: 'json',
                theme: theme,
                value: initialValue,
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                formatOnPaste: true,
                formatOnType: true,
                folding: true
            });

            this.editors.set('main', window.editor);
            await this.initializeHistory(initialValue);
        }
    }

    createEditor(container, options) {
        const editor = monaco.editor.create(container, options);

        this.setupFindWidgetIntegration(editor);

        // Initialize virtualized renderer for this editor
        if (typeof VirtualizedJSONRenderer !== 'undefined') {
            const virtualRenderer = new VirtualizedJSONRenderer(editor);
            editor.virtualRenderer = virtualRenderer;
            
            // Set initial content through virtualizer
            if (options.value) {
                virtualRenderer.setContent(options.value);
            }
        }
        
        // Add content change listener
        editor.onDidChangeModelContent(() => {
            if (this.changeTimeout) clearTimeout(this.changeTimeout);
            this.changeTimeout = setTimeout(() => {
                this.onContentChange(editor);
            }, 500);
        });

        return editor;
    }

    async initializeHistory(initialContent = '') {
        const normalized = typeof initialContent === 'string' ? initialContent : '';
        if (!this.history) {
            this.history = new EditorHistory(60, {
                notify: (message, level) => this.showNotification(message, level)
            });
        }

        await this.history.reset(normalized, { label: 'Initial document', reason: 'Initial snapshot' });
        this.historyNeedsRender = true;
        this.refreshHistoryUI({ statsOnly: true });
    }

    markHistoryRendered() {
        this.historyNeedsRender = false;
    }

    getHistoryEntries(options = {}) {
        if (!this.history) {
            return [];
        }

        return this.history.getEntries(options);
    }

    getHistoryStats() {
        if (!this.history) {
            return { count: 0, byteSize: 0, latestTimestamp: null };
        }

        return this.history.getStats();
    }

    getCurrentHistoryEntryId() {
        return this.history ? this.history.getCurrentId() : null;
    }

    async recordHistorySnapshot(reason = 'Edit', options = {}) {
        if (!this.history) {
            return { recorded: false, reason: 'history-unavailable' };
        }

        const editor = options.editor || this.getActiveEditor();
        if (!editor) {
            return { recorded: false, reason: 'no-editor' };
        }

        let content;
        if (typeof options.contentOverride === 'string') {
            content = options.contentOverride;
        } else if (editor.virtualRenderer && typeof editor.virtualRenderer.getFullContent === 'function') {
            content = editor.virtualRenderer.getFullContent();
        } else if (typeof editor.getValue === 'function') {
            content = editor.getValue();
        } else {
            content = '';
        }

        const allowInvalid = options.allowInvalid ?? Boolean(options.manual);
        if (!allowInvalid) {
            try {
                JSON.parse(content);
            } catch (error) {
                if (!options.silent) {
                    console.debug('[HISTORY] Skipped snapshot – invalid JSON', error);
                }
                return { recorded: false, skipped: true, reason: 'invalid-json' };
            }
        }

        const meta = {
            reason,
            label: options.label,
            manual: Boolean(options.manual),
            action: reason,
            force: Boolean(options.force),
            forceKeyframe: Boolean(options.forceKeyframe)
        };

        try {
            const result = await this.history.record(content, meta);
            if (result && result.recorded) {
                this.historyNeedsRender = true;
                this.refreshHistoryUI({ statsOnly: options.statsOnly === true });
            }
            return result;
        } catch (error) {
            console.warn('History snapshot failed:', error);
            return { recorded: false, error };
        }
    }

    refreshHistoryUI(options = {}) {
        if (typeof window.renderHistoryModal !== 'function') {
            return;
        }

        const modal = document.getElementById('historyModal');
        const isOpen = modal && (modal.classList.contains('show') || modal.getAttribute('aria-hidden') === 'false');
        if (options.force || isOpen) {
            window.renderHistoryModal({
                statsOnly: Boolean(options.statsOnly)
            });
            this.historyNeedsRender = false;
            return;
        }

        if (options.statsOnly) {
            const statsElement = document.getElementById('historyStats');
            if (statsElement) {
                window.renderHistoryModal({ statsOnly: true });
                this.historyNeedsRender = false;
            }
        }
    }

    shouldRenderHistory() {
        return this.historyNeedsRender;
    }

    restoreHistoryEntry(entryId, options = {}) {
        if (!this.history) {
            this.showNotification('History is unavailable', 'warning');
            return false;
        }

        const entry = this.history.getEntryById(entryId);
        if (!entry) {
            this.showNotification('History entry not found', 'warning');
            return false;
        }

        const editor = this.getActiveEditor();
        if (!editor) {
            this.showNotification('No active editor to restore into', 'warning');
            return false;
        }

        const currentValue = editor.getValue ? editor.getValue() : '';
        if (currentValue === entry.content && !options.forceRestore) {
            this.history.markCurrent(entry.id);
            this.refreshHistoryUI({ force: true });
            this.showNotification('Already on this version', 'info');
            return true;
        }

        this.suspendHistoryRecording = true;
        editor.setValue(entry.content);
        this.suspendHistoryRecording = false;

        this.history.markCurrent(entry.id);
        this.historyNeedsRender = true;
        this.refreshHistoryUI({ force: true });
        this.showNotification(`Restored snapshot: ${entry.label}`, 'success');

        return true;
    }

    async clearHistory(options = {}) {
        if (!this.history) {
            return;
        }

        const editor = this.getActiveEditor();
        const currentContent = editor && typeof editor.getValue === 'function' ? editor.getValue() : '';
        await this.history.clear({
            keepLatest: options.keepLatest !== false,
            latestContent: currentContent,
            label: options.label || 'Current document'
        });
        this.historyNeedsRender = true;
        this.refreshHistoryUI({ force: true });
    }

    getTemplateLibrary() {
        return TEMPLATE_LIBRARY.slice();
    }

    applyTemplateById(templateId, options = {}) {
        const template = this.getTemplateLibrary().find(item => item.id === templateId);
        if (!template) {
            this.showNotification('Template not found', 'error');
            return false;
        }

        return this.applyTemplate(template, options);
    }

    applyTemplate(template, options = {}) {
        const editor = this.getActiveEditor();
        if (!editor) {
            this.showNotification('No active editor to apply template', 'warning');
            return false;
        }

        const contentObject = template && template.content ? template.content : {};
        let templateContent = typeof contentObject === 'string'
            ? contentObject
            : JSON.stringify(contentObject, null, 2);

        if (typeof options.transform === 'function') {
            templateContent = options.transform(templateContent, template) || templateContent;
        }

        const currentValue = editor.getValue ? editor.getValue() : '';
        const shouldReplace = options.replace !== false;
        let nextValue = templateContent;

        if (!shouldReplace && currentValue) {
            nextValue = `${currentValue.trimEnd()}\n\n${templateContent}`;
        }

        if (shouldReplace && currentValue && !options.silent && options.confirm !== false) {
            const confirmReplace = typeof window.confirm === 'function'
                ? window.confirm(`Replace current document with "${template.title}" template?`)
                : true;
            if (!confirmReplace) {
                return false;
            }
        }

        this.suspendHistoryRecording = true;
        editor.setValue(nextValue);
        this.suspendHistoryRecording = false;

        this.recordHistorySnapshot('Template applied', {
            label: template.title,
            manual: true,
            force: true,
            forceKeyframe: true,
            statsOnly: false
        });

        this.showNotification(`Template "${template.title}" applied`, 'success');
        return true;
    }

    setupEventHandlers() {
        this.setupKeyboardShortcuts();
        this.setupThemeHandler();
    }

    setupKeyboardShortcuts() {
        if (!window.editor) return;

        const shortcuts = [
            { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, action: () => this.newDocument() },
            { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO, action: () => this.loadFile() },
            { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, action: () => this.saveFile() },
            { key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, action: () => this.formatJSON() },
            { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyM, action: () => this.minifyJSON() },
            { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT, action: () => this.validateJSON() },
            { key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketLeft, action: () => this.collapseAllFolds({ focus: true }) },
            { key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketRight, action: () => this.expandAllFolds({ focus: true }) },
            { key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyS, action: () => this.sortJSONKeys() },
            { key: monaco.KeyMod.Alt | monaco.KeyCode.KeyN, action: () => this.navigateJSONPathMatches(1) },
            { key: monaco.KeyMod.Alt | monaco.KeyCode.KeyP, action: () => this.navigateJSONPathMatches(-1) },
            { key: monaco.KeyMod.Alt | monaco.KeyCode.KeyJ, action: () => this.toggleFindWidgetJSONPathMode() }
        ];

        shortcuts.forEach(({ key, action }) => {
            window.editor.addCommand(key, action);
        });
    }

    setupThemeHandler() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                    const newTheme = document.body.dataset.theme === 'dark' ? 'vs-dark' : 'vs';
                    monaco.editor.setTheme(newTheme);
                    if (this.diffEditor) {
                        this.diffEditor.updateOptions({ theme: newTheme });
                    }
                }
            });
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    onContentChange(editor) {
        // Content change handling
        const content = editor.virtualRenderer ?
            editor.virtualRenderer.getFullContent() :
            editor.getValue();

        // Update search index
        if (this.searchIndex && typeof this.searchIndex.buildIndex === 'function') {
            this.searchIndex.buildIndex(content);
        } else if (this.searchIndex && typeof this.searchIndex.updateIndex === 'function') {
            this.searchIndex.updateIndex(content);
        }

        // Update virtualized renderer if content is large
        if (editor.virtualRenderer && content.split('\n').length > 5000) {
            editor.virtualRenderer.setContent(content);
        }

        if (this.suspendHistoryRecording) {
            return;
        }

        this.historyNeedsRender = true;
        if (this.historyDebounce) {
            clearTimeout(this.historyDebounce);
        }

        this.historyDebounce = setTimeout(() => {
            this.recordHistorySnapshot('Auto snapshot', { statsOnly: true, allowInvalid: false })
                .catch(error => console.debug('[HISTORY] Auto snapshot failed', error));
        }, 10000);
    }

    getDefaultStub() {
        return JSON.stringify({
            'name': 'Example WireMock Mapping',
            'request': {
                'method': 'GET',
                'urlPath': '/api/example'
            },
            'response': {
                'status': 200,
                'jsonBody': {
                    'message': 'Hello from WireMock!',
                    'timestamp': '2024-01-01T00:00:00Z'
                },
                'headers': {
                    'Content-Type': 'application/json'
                }
            }
        }, null, 2);
    }

    // JSON operations
    async formatJSON() {
        const editor = this.getActiveEditor();
        const content = editor.getValue();
        
        try {
            if (this.workerPool) {
                const formatted = await this.workerPool.execute('format', { text: content }, 1);
                editor.setValue(formatted);
            } else {
                const parsed = JSON.parse(content);
                const formatted = JSON.stringify(parsed, null, 2);
                editor.setValue(formatted);
            }
            this.showNotification('JSON formatted', 'success');
        } catch (error) {
            this.showNotification('Format error: ' + error.message, 'error');
        }
    }

    async minifyJSON() {
        const editor = this.getActiveEditor();
        const content = editor.getValue();
        
        try {
            if (this.workerPool) {
                const minified = await this.workerPool.execute('minify', { text: content }, 1);
                editor.setValue(minified);
            } else {
                const parsed = JSON.parse(content);
                const minified = JSON.stringify(parsed);
                editor.setValue(minified);
            }
            this.showNotification('JSON minified', 'success');
        } catch (error) {
            this.showNotification('Minify error: ' + error.message, 'error');
        }
    }

    async validateJSON() {
        const editor = this.getActiveEditor();
        const content = editor.getValue();
        
        try {
            if (this.workerPool) {
                const result = await this.workerPool.execute('validate', { text: content }, 1);
                if (result.valid) {
                    this.showNotification('JSON is valid', 'success');
                } else {
                    this.showNotification(`JSON invalid: ${result.error}`, 'error');
                }
            } else {
                JSON.parse(content);
                this.showNotification('JSON is valid', 'success');
            }
        } catch (error) {
            this.showNotification('JSON invalid: ' + error.message, 'error');
        }
    }

    getActiveEditor() {
        return window.editor || this.editors.get('main');
    }

    resolveTargetEditors(options = {}) {
        if (options && options.editor) {
            return options.editor ? [options.editor] : [];
        }

        if (options && Array.isArray(options.editors) && options.editors.length) {
            return options.editors.filter(Boolean);
        }

        const editors = new Set();

        const editorContainer = document.getElementById('editorContainer');
        if (!editorContainer || editorContainer.style.display !== 'none') {
            const mainEditor = this.editors.get('main');
            if (mainEditor) {
                editors.add(mainEditor);
            }
        }

        const compareContainer = document.getElementById('compareContainer');
        if (compareContainer && compareContainer.style.display !== 'none') {
            if (this.diffEditor) {
                const originalEditor = typeof this.diffEditor.getOriginalEditor === 'function'
                    ? this.diffEditor.getOriginalEditor()
                    : null;
                const modifiedEditor = typeof this.diffEditor.getModifiedEditor === 'function'
                    ? this.diffEditor.getModifiedEditor()
                    : null;

                if (originalEditor) editors.add(originalEditor);
                if (modifiedEditor) editors.add(modifiedEditor);
            } else {
                const leftEditor = this.editors.get('compareEditorLeft');
                const rightEditor = this.editors.get('compareEditorRight');
                if (leftEditor) editors.add(leftEditor);
                if (rightEditor) editors.add(rightEditor);
            }
        }

        if (!editors.size) {
            const activeEditor = this.getActiveEditor();
            if (activeEditor) {
                editors.add(activeEditor);
            }
        }

        return Array.from(editors).filter(Boolean);
    }

    runEditorCommand(editor, commandId, payload = null) {
        if (!editor) return false;

        try {
            if (typeof editor.getAction === 'function') {
                const action = editor.getAction(commandId);
                if (action && typeof action.run === 'function' && (!action.isSupported || action.isSupported())) {
                    const result = action.run();
                    if (result && typeof result.then === 'function') {
                        result.catch(error => console.warn(`Command ${commandId} failed:`, error));
                    }
                    return true;
                }
            }

            if (typeof editor.trigger === 'function') {
                editor.trigger('json-tools', commandId, payload);
                return true;
            }
        } catch (error) {
            console.warn(`Command ${commandId} failed:`, error);
        }

        return false;
    }

    executeCommandOnEditors(commandId, options = {}) {
        const editors = this.resolveTargetEditors(options);
        let executed = 0;

        editors.forEach(editor => {
            if (this.runEditorCommand(editor, commandId, options.payload)) {
                executed++;
            }
        });

        if (options.focus && editors[0] && typeof editors[0].focus === 'function') {
            editors[0].focus();
        }

        return { executed, editors };
    }

    collapseAllFolds(options = {}) {
        const { executed } = this.executeCommandOnEditors('editor.foldAll', options);

        if (executed > 0) {
            const message = executed > 1
                ? 'Collapsed JSON structures in all visible editors'
                : 'Collapsed JSON structures';
            this.showNotification(message, 'success');
        } else {
            this.showNotification('Unable to collapse JSON structures', 'warning');
        }
    }

    expandAllFolds(options = {}) {
        const { executed } = this.executeCommandOnEditors('editor.unfoldAll', options);

        if (executed > 0) {
            const message = executed > 1
                ? 'Expanded JSON structures in all visible editors'
                : 'Expanded JSON structures';
            this.showNotification(message, 'success');
        } else {
            this.showNotification('Unable to expand JSON structures', 'warning');
        }
    }

    async sortJSONKeys(options = {}) {
        const editor = this.getActiveEditor();
        if (!editor) {
            this.showNotification('No active editor', 'warning');
            return;
        }

        const content = editor.getValue();
        const model = editor.getModel && editor.getModel();
        const indentOption = options && typeof options.indent === 'number' && options.indent >= 0
            ? options.indent
            : model && typeof model.getOptions === 'function'
                ? model.getOptions().tabSize
                : 2;
        const indent = Number.isFinite(indentOption) ? indentOption : 2;

        try {
            let sortedText;

            if (this.workerPool && typeof this.workerPool.execute === 'function') {
                sortedText = await this.workerPool.execute('sort_keys', { text: content, indent }, 1);
            } else {
                const parsed = JSON.parse(content);
                const sortedValue = this.sortKeysDeep(parsed);
                sortedText = JSON.stringify(sortedValue, null, indent);
            }

            if (typeof sortedText !== 'string') {
                sortedText = JSON.stringify(sortedText);
            }

            if (sortedText !== content) {
                editor.setValue(sortedText);
            }

            this.showNotification('JSON keys sorted alphabetically', 'success');
        } catch (error) {
            console.error('Sort keys error:', error);
            this.showNotification('Sort keys error: ' + error.message, 'error');
        }
    }

    sortKeysDeep(value) {
        if (Array.isArray(value)) {
            return value.map(item => this.sortKeysDeep(item));
        }

        if (value && typeof value === 'object') {
            const sortedKeys = Object.keys(value).sort((a, b) => a.localeCompare(b));
            const result = {};
            sortedKeys.forEach(key => {
                result[key] = this.sortKeysDeep(value[key]);
            });
            return result;
        }

        return value;
    }

    showNotification(message, type) {
        if (typeof showNotification !== 'undefined') {
            showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    loadMappingIntoEditor(mappingData) {
        const editor = this.getActiveEditor();
        if (editor && mappingData) {
            const formatted = JSON.stringify(mappingData, null, 2);
            editor.setValue(formatted);
            this.showNotification('Mapping loaded', 'success');
        }
    }

    getMappingFromEditor() {
        const editor = this.getActiveEditor();
        if (!editor) return null;
        
        try {
            const content = editor.getValue();
            return JSON.parse(content);
        } catch (error) {
            this.showNotification('Invalid JSON in editor', 'error');
            return null;
        }
    }

    // Enhanced search functionality
    search(query) {
        const editor = this.getActiveEditor();
        if (!editor) {
            this.showNotification('No active editor', 'warning');
            return;
        }

        try {
            // Use Monaco's built-in find functionality
            editor.trigger('search', 'actions.find', {
                searchString: query,
                replaceString: '',
                isRegex: false,
                matchCase: false,
                matchWholeWord: false,
                preserveCase: false
            });
            
            this.showNotification(`Searching for \"${query}\"`, 'success');
        } catch (error) {
            console.error('Search error:', error);
            this.showNotification('Search error: ' + error.message, 'error');
        }
    }

    // Enhanced compare mode with DiffEditor
    loadCompareContent(side, content) {
        try {
            // Initialize diff editor if not exists
            if (!this.diffEditor) {
                this.initializeDiffEditor();
            }
            
            if (this.diffEditor) {
                // Format the JSON content
                const parsed = JSON.parse(content);
                const formatted = JSON.stringify(parsed, null, 2);
                
                // Get or create models for diff editor
                const currentModel = this.diffEditor.getModel();
                let originalModel, modifiedModel;
                
                if (currentModel) {
                    originalModel = currentModel.original;
                    modifiedModel = currentModel.modified;
                } else {
                    originalModel = monaco.editor.createModel('', 'json');
                    modifiedModel = monaco.editor.createModel('', 'json');
                }
                
                if (side === 'left' || side === 'original') {
                    originalModel.setValue(formatted);
                } else {
                    modifiedModel.setValue(formatted);
                }
                
                // Set both models to the diff editor
                this.diffEditor.setModel({
                    original: originalModel,
                    modified: modifiedModel
                });
                
                this.showNotification(`Content loaded to ${side} panel with diff highlighting`, 'success');
            } else {
                // Fallback to individual editors
                this.loadCompareContentFallback(side, content);
            }
        } catch (error) {
            console.error(`Error loading compare content:`, error);
            this.showNotification(`Error loading ${side} content: ` + error.message, 'error');
        }
    }
    
    initializeDiffEditor() {
        const compareContainer = document.getElementById('compareContainer');
        if (!compareContainer) {
            console.warn('Compare container not found, cannot initialize diff editor');
            return;
        }
        
        try {
            const theme = document.body.dataset.theme === 'dark' ? 'vs-dark' : 'vs';
            
            this.diffEditor = monaco.editor.createDiffEditor(compareContainer, {
                theme: theme,
                readOnly: false,
                automaticLayout: true,
                renderSideBySide: true,
                ignoreTrimWhitespace: false,
                renderWhitespace: 'boundary',
                diffWordWrap: 'on',
                originalEditable: true,
                scrollBeyondLastLine: false,
                minimap: { enabled: false },
                enableSplitViewResizing: true,
                renderOverviewRuler: true,
                diffCodeLens: true,
                scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                    useShadows: false
                }
            });
            
            // Create empty models for both sides
            const originalModel = monaco.editor.createModel('', 'json');
            const modifiedModel = monaco.editor.createModel('', 'json');
            
            this.diffEditor.setModel({
                original: originalModel,
                modified: modifiedModel
            });
            
            // Setup synchronized scrolling and enhanced diff features
            this.setupDiffEditorEnhancements();
            
            // Store reference for cleanup
            this.editors.set('diffEditor', this.diffEditor);
            
            console.log('✅ Enhanced Monaco DiffEditor initialized with lock-step scrolling');
        } catch (error) {
            console.error('Failed to initialize diff editor:', error);
        }
    }
    
    setupDiffEditorEnhancements() {
        if (!this.diffEditor) return;
        
        // Add diff navigation shortcuts
        const originalEditor = this.diffEditor.getOriginalEditor();
        const modifiedEditor = this.diffEditor.getModifiedEditor();
        
        // Add keyboard shortcuts for diff navigation
        const diffShortcuts = [
            { key: monaco.KeyMod.Alt | monaco.KeyCode.KeyN, action: () => this.diffEditor.goToNextDiff() },
            { key: monaco.KeyMod.Alt | monaco.KeyCode.KeyP, action: () => this.diffEditor.goToPrevDiff() },
            { key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyR, action: () => this.resetDiffView() }
        ];
        
        diffShortcuts.forEach(({ key, action }) => {
            originalEditor.addCommand(key, action);
            modifiedEditor.addCommand(key, action);
        });
        
        // Setup enhanced diff actions
        originalEditor.addAction({
            id: 'diff-copy-to-modified',
            label: 'Copy to Right Side',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.RightArrow],
            run: () => {
                const content = originalEditor.getValue();
                modifiedEditor.setValue(content);
                this.showNotification('Content copied to right side', 'success');
            }
        });
        
        modifiedEditor.addAction({
            id: 'diff-copy-to-original',
            label: 'Copy to Left Side',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.LeftArrow],
            run: () => {
                const content = modifiedEditor.getValue();
                originalEditor.setValue(content);
                this.showNotification('Content copied to left side', 'success');
            }
        });
        
        // Add content change listeners for real-time diff updates
        originalEditor.onDidChangeModelContent(() => {
            this.onDiffContentChange('original');
        });
        
        modifiedEditor.onDidChangeModelContent(() => {
            this.onDiffContentChange('modified');
        });
    }
    
    onDiffContentChange(side) {
        // Debounced diff analysis
        if (this.diffAnalysisTimeout) clearTimeout(this.diffAnalysisTimeout);
        this.diffAnalysisTimeout = setTimeout(() => {
            this.analyzeDiffChanges(side);
        }, 1000);
    }
    
    analyzeDiffChanges(side) {
        if (!this.diffEditor) return;
        
        const model = this.diffEditor.getModel();
        if (!model) return;
        
        const originalContent = model.original.getValue();
        const modifiedContent = model.modified.getValue();
        
        if (originalContent && modifiedContent) {
            const diffs = this.diffEditor.getDiffComputationResult();
            if (diffs && diffs.changes) {
                const changeCount = diffs.changes.length;
                this.showNotification(`${changeCount} difference${changeCount !== 1 ? 's' : ''} detected`, 'info');
            }
        }
    }
    
    resetDiffView() {
        if (!this.diffEditor) return;
        
        const model = this.diffEditor.getModel();
        if (model) {
            model.original.setValue('');
            model.modified.setValue('');
            this.showNotification('Diff view reset', 'success');
        }
    }
    
    loadCompareContentFallback(side, content) {
        const editorId = side === 'left' ? 'compareEditorLeft' : 'compareEditorRight';
        let editor = this.editors.get(editorId);
        
        if (!editor) {
            const container = document.getElementById(editorId);
            if (container) {
                const theme = document.body.dataset.theme === 'dark' ? 'vs-dark' : 'vs';
                editor = this.createEditor(container, {
                    language: 'json',
                    theme: theme,
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on'
                });
                this.editors.set(editorId, editor);
            }
        }
        
        if (editor) {
            const parsed = JSON.parse(content);
            const formatted = JSON.stringify(parsed, null, 2);
            editor.setValue(formatted);
            this.showNotification(`Content loaded to ${side} panel`, 'success');
        } else {
            throw new Error(`Cannot find container for ${side} compare editor`);
        }
    }

    clearCompareContent(side) {
        try {
            if (this.diffEditor) {
                // Clear diff editor models
                const currentModel = this.diffEditor.getModel();
                if (currentModel) {
                    if (side === 'left' || side === 'original') {
                        currentModel.original.setValue('');
                    } else if (side === 'right' || side === 'modified') {
                        currentModel.modified.setValue('');
                    } else if (side === 'both') {
                        currentModel.original.setValue('');
                        currentModel.modified.setValue('');
                    }
                }
                this.showNotification(`${side.charAt(0).toUpperCase() + side.slice(1)} diff panel cleared`, 'success');
            } else {
                // Fallback to individual editors
                const editorId = side === 'left' ? 'compareEditorLeft' : 'compareEditorRight';
                const editor = this.editors.get(editorId);
                
                if (editor) {
                    editor.setValue('');
                    this.showNotification(`${side.charAt(0).toUpperCase() + side.slice(1)} panel cleared`, 'success');
                } else {
                    this.showNotification(`${side} compare editor not found`, 'warning');
                }
            }
        } catch (error) {
            console.error(`Error clearing ${side} panel:`, error);
            this.showNotification(`Error clearing ${side} panel: ` + error.message, 'error');
        }
    }

    evaluateJSONPath(data, path, content, editor) {
        const results = [];
        const pointerLocator = this.createPointerLocator(content);
        const rootPointer = '$';
        const normalizedPath = typeof path === 'string' ? path.trim() : '';

        // Simple JSONPath implementation with position tracking
        if (!normalizedPath || normalizedPath === '$') {
            const position = this.findValuePosition(data, content, editor, '$', pointerLocator, rootPointer);
            results.push({ value: data, path: '$', pointer: rootPointer, position });
            return results;
        }

        // Remove leading $. and split path
        const strippedPath = normalizedPath.replace(/^\$\.?/, '');
        const pathParts = strippedPath ? strippedPath.split('.').filter(Boolean) : [];
        this.traverseJSONPath(data, pathParts, content, editor, '$', results, pointerLocator, rootPointer);

        return results;
    }

    traverseJSONPath(current, pathParts, content, editor, currentPath, results, pointerLocator, currentPointer) {
        if (pathParts.length === 0) {
            const position = this.findValuePosition(current, content, editor, currentPath, pointerLocator, currentPointer);
            results.push({ value: current, path: currentPath, pointer: currentPointer, position });
            return;
        }

        const [firstPart, ...remainingParts] = pathParts;

        // Handle array notation like [0] or [*]
        if (firstPart.includes('[') && firstPart.includes(']')) {
            const [key, indexPart] = firstPart.split('[');
            const indexToken = indexPart.replace(']', '');

            let target = current;
            let pointerBase = currentPointer;

            if (key) {
                if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) {
                    return;
                }
                target = current[key];
                pointerBase = appendPointerSegment(pointerBase, key);
            }

            if (Array.isArray(target)) {
                if (indexToken === '*') {
                    // Wildcard - search all array elements
                    target.forEach((item, i) => {
                        const newPath = currentPath + (key ? `.${key}` : '') + `[${i}]`;
                        const itemPointer = appendPointerSegment(pointerBase, i);
                        this.traverseJSONPath(item, remainingParts, content, editor, newPath, results, pointerLocator, itemPointer);
                    });
                } else {
                    // Specific index
                    const idx = parseInt(indexToken, 10);
                    if (!Number.isNaN(idx) && idx >= 0 && idx < target.length) {
                        const newPath = currentPath + (key ? `.${key}` : '') + `[${idx}]`;
                        const itemPointer = appendPointerSegment(pointerBase, idx);
                        this.traverseJSONPath(target[idx], remainingParts, content, editor, newPath, results, pointerLocator, itemPointer);
                    }
                }
            }
        } else if (firstPart === '*') {
            // Wildcard for object properties
            if (current && typeof current === 'object' && !Array.isArray(current)) {
                Object.keys(current).forEach(key => {
                    const newPath = currentPath + `.${key}`;
                    const childPointer = appendPointerSegment(currentPointer, key);
                    this.traverseJSONPath(current[key], remainingParts, content, editor, newPath, results, pointerLocator, childPointer);
                });
            }
        } else {
            // Regular property access
            if (current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, firstPart)) {
                const newPath = currentPath + `.${firstPart}`;
                const childPointer = appendPointerSegment(currentPointer, firstPart);
                this.traverseJSONPath(current[firstPart], remainingParts, content, editor, newPath, results, pointerLocator, childPointer);
            }
        }
    }
    
    findValuePosition(value, content, editor, jsonPath, pointerLocator = null, pointer = null) {
        try {
            let locator = pointerLocator || null;
            let pointerCandidate = pointer;

            if (typeof pointerCandidate === 'string' && pointerCandidate.startsWith('$.')) {
                const converted = this.convertJSONPathToPointer(pointerCandidate);
                if (converted) {
                    pointerCandidate = converted;
                }
            }

            if (!pointerCandidate && typeof jsonPath === 'string' && jsonPath.length > 0) {
                pointerCandidate = this.convertJSONPathToPointer(jsonPath);
            }

            if (pointerCandidate) {
                if (!locator) {
                    locator = this.createPointerLocator(content);
                }

                if (locator) {
                    const pointerPosition = locator.getRange(pointerCandidate);
                    if (pointerPosition) {
                        return pointerPosition;
                    }
                }
            }

            const model = editor && typeof editor.getModel === 'function' ? editor.getModel() : null;
            if (!model) {
                return null;
            }

            // Convert value to string for searching
            let searchText;
            if (typeof value === 'string') {
                searchText = `"${value}"`; // Add quotes for string values
            } else {
                searchText = JSON.stringify(value);
            }

            if (searchText) {
                const matches = model.findMatches(searchText, false, false, true, null, false);

                if (matches.length > 0) {
                    const { range } = matches[0];
                    return {
                        startLineNumber: range.startLineNumber,
                        startColumn: range.startColumn,
                        endLineNumber: range.endLineNumber,
                        endColumn: range.endColumn
                    };
                }
            }

            if (value && typeof value === 'object') {
                const pretty = JSON.stringify(value, null, 2);
                if (pretty && pretty !== searchText) {
                    const matches = model.findMatches(pretty, false, false, true, null, false);
                    if (matches.length > 0) {
                        const { range } = matches[0];
                        return {
                            startLineNumber: range.startLineNumber,
                            startColumn: range.startColumn,
                            endLineNumber: range.endLineNumber,
                            endColumn: range.endColumn
                        };
                    }
                }
            }
        } catch (error) {
            console.warn('Could not find position for value:', error);
        }

        return null;
    }
    
    formatValuePreview(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        
        let preview = JSON.stringify(value);
        if (preview.length > 100) {
            preview = preview.slice(0, 97) + '...';
        }
        return preview;
    }

    // Missing methods for keyboard shortcuts
    newDocument() {
        try {
            const editor = this.getActiveEditor();
            if (editor) {
                editor.setValue(this.getDefaultStub());
                this.showNotification('New document created', 'success');
            }
        } catch (error) {
            this.showNotification('Error creating new document: ' + error.message, 'error');
        }
    }

    loadFile() {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const content = e.target.result;
                            const editor = this.getActiveEditor();
                            if (editor) {
                                editor.setValue(content);
                                this.showNotification('File loaded successfully', 'success');
                            }
                        } catch (error) {
                            this.showNotification('Error loading file: ' + error.message, 'error');
                        }
                    };
                    reader.readAsText(file);
                }
            };
            input.click();
        } catch (error) {
            this.showNotification('Error opening file dialog: ' + error.message, 'error');
        }
    }

    saveFile() {
        try {
            const editor = this.getActiveEditor();
            if (editor) {
                const content = editor.getValue();
                const blob = new Blob([content], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'wiremock-mapping.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.showNotification('File saved successfully', 'success');
            }
        } catch (error) {
            this.showNotification('Error saving file: ' + error.message, 'error');
        }
    }

    exportAsYAML() {
        const editor = this.getActiveEditor();
        if (!editor) {
            this.showNotification('No active editor', 'warning');
            return;
        }

        let jsonData;
        try {
            jsonData = JSON.parse(editor.getValue());
        } catch (error) {
            this.showNotification('Cannot export YAML: ' + error.message, 'error');
            return;
        }

        try {
            const yaml = convertJSONToYAML(jsonData);
            const content = yaml.endsWith('\n') ? yaml : `${yaml}\n`;
            const blob = new Blob([content], { type: 'text/yaml' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'wiremock-mapping.yaml';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            this.showNotification('YAML exported', 'success');
        } catch (error) {
            this.showNotification('YAML export failed: ' + error.message, 'error');
        }
    }

    async searchJSONPath(query, options = {}) {
        const editor = this.getActiveEditor();
        if (!editor) {
            if (options.notify !== false) {
                this.showNotification('No active editor', 'warning');
            }
            return [];
        }

        const rawQuery = typeof query === 'string' ? query : '';
        const trimmedQuery = rawQuery.trim();
        const hasQuery = trimmedQuery.length > 0;
        const allowEmpty = options.allowEmpty === true;

        if (!hasQuery && !allowEmpty) {
            if (options.notify !== false) {
                this.showNotification('Please enter a search term', 'warning');
            }
            return [];
        }

        const forcedMode = typeof options.jsonPathMode === 'boolean' ? options.jsonPathMode : null;
        const inferredMode = hasQuery && this.isJSONPathQuery(trimmedQuery);
        const useJsonPath = forcedMode !== null ? forcedMode : inferredMode;

        const integration = await this.openFindWidget({
            query: hasQuery ? trimmedQuery : undefined,
            jsonPathMode: useJsonPath,
            focus: options.focus !== false,
            select: typeof options.select === 'boolean' ? options.select : false,
            notify: options.notify === true
        });

        if (!integration) {
            if (options.notify !== false) {
                this.showNotification('Find widget is not available', 'error');
            }
            return [];
        }

        if (!hasQuery) {
            return [];
        }

        if (useJsonPath) {
            return Array.isArray(this.lastJSONPathResults) ? this.lastJSONPathResults : [];
        }

        return [];
    }

    async searchWithJSONPath(jsonPath, editor, options = {}) {
        const { notify = true, revealFirst = true, fromWidget = false } = options || {};
        const requestId = ++this.jsonPathSearchRequestId;
        const content = editor.getValue();

        if (!content || !content.trim()) {
            this.resetJSONPathResults({ keepQuery: true });
            this.lastJSONPathQuery = jsonPath;
            if (fromWidget) {
                this.updateFindWidgetMatchesCount(0, false, -1, { noContent: true });
            }
            if (notify) {
                this.showNotification('No content to search', 'warning');
            }
            return [];
        }

        let workerResult = null;

        if (this.canUseWorkerForJSONPath()) {
            try {
                workerResult = await this.workerPool.execute('jsonpath', { text: content, path: jsonPath }, 5, 10000);
            } catch (workerError) {
                console.warn('JSONPath worker execution failed, falling back to local parser:', workerError);
            }
        }

        if (workerResult && typeof workerResult === 'object' && Array.isArray(workerResult.values)) {
            const { matches, pointerLocator } = this.convertWorkerResultToMatches(workerResult, jsonPath, content, editor);
            const totalCount = typeof workerResult.count === 'number' ? workerResult.count : matches.length;
            const truncated = Boolean(workerResult.truncated);

            if (requestId !== this.jsonPathSearchRequestId) {
                return matches;
            }

            this.lastJSONPathPointerLocator = pointerLocator;
            return this.handleJSONPathMatches(jsonPath, matches, editor, totalCount, truncated, { notify, revealFirst, fromWidget });
        }

        try {
            const jsonData = JSON.parse(content);
            const results = this.evaluateJSONPath(jsonData, jsonPath, content, editor) || [];

            if (requestId !== this.jsonPathSearchRequestId) {
                return results;
            }

            this.lastJSONPathPointerLocator = null;
            return this.handleJSONPathMatches(jsonPath, results, editor, results.length, false, { notify, revealFirst, fromWidget });
        } catch (error) {
            this.resetJSONPathResults({ keepQuery: true });
            this.lastJSONPathPointerLocator = null;
            this.lastJSONPathQuery = jsonPath;
            if (fromWidget) {
                this.updateFindWidgetMatchesCount(0, false, -1, { error: error.message });
            }
            if (notify) {
                this.showNotification('Invalid JSON or JSONPath: ' + error.message, 'error');
            }
            return [];
        }
    }

    isJSONPathQuery(query) {
        if (!query) return false;
        return query.trim().startsWith('$');
    }

    canUseWorkerForJSONPath() {
        if (!this.workerPool || typeof this.workerPool.execute !== 'function') {
            return false;
        }

        if (Array.isArray(this.workerPool.workers)) {
            return this.workerPool.workers.length > 0;
        }

        return false;
    }

    convertWorkerResultToMatches(workerResult, fallbackPath, content, editor) {
        const values = Array.isArray(workerResult.values) ? workerResult.values : [];
        const pathStrings = this.extractJSONPathStrings(workerResult, fallbackPath, values.length);
        const pointerPaths = this.extractPointerPaths(workerResult, values.length);
        const hasPointers = pointerPaths.some(pointer => typeof pointer === 'string' && pointer.length > 0);
        const pointerLocator = hasPointers ? this.createPointerLocator(content) : null;

        const matches = values.map((value, index) => {
            const path = pathStrings[index] || fallbackPath;
            const pointer = pointerPaths[index] || null;
            let position = null;

            if (pointer && pointerLocator) {
                const pointerPosition = pointerLocator.getRange(pointer);
                if (pointerPosition) {
                    position = pointerPosition;
                }
            }

            if (!position) {
                position = this.findValuePosition(value, content, editor, path, pointerLocator, pointer);
            }

            return {
                value,
                path,
                pointer,
                position
            };
        });

        return { matches, pointerLocator, pointerPaths };
    }

    extractJSONPathStrings(workerResult, fallbackPath, expectedLength = 0) {
        if (!workerResult) return [];

        if (Array.isArray(workerResult.jsonPaths) && workerResult.jsonPaths.length > 0) {
            return workerResult.jsonPaths;
        }

        if (Array.isArray(workerResult.paths) && workerResult.paths.length > 0) {
            return workerResult.paths.map(pathValue => Array.isArray(pathValue)
                ? convertPathArrayToJSONPath(pathValue)
                : String(pathValue));
        }

        if (expectedLength > 0) {
            return new Array(expectedLength).fill(fallbackPath);
        }

        return [];
    }

    extractPointerPaths(workerResult, expectedLength = 0) {
        if (!workerResult) return [];

        if (Array.isArray(workerResult.pointerPaths) && workerResult.pointerPaths.length > 0) {
            return workerResult.pointerPaths;
        }

        if (Array.isArray(workerResult.paths) && workerResult.paths.length > 0) {
            return workerResult.paths.map(pathValue => Array.isArray(pathValue)
                ? convertPathArrayToPointer(pathValue)
                : null);
        }

        if (expectedLength > 0) {
            return new Array(expectedLength).fill(null);
        }

        return [];
    }

    createPointerLocator(text) {
        return buildJSONPointerLocator(text);
    }

    convertJSONPathToPointer(jsonPath) {
        if (typeof jsonPath !== 'string') {
            return null;
        }

        const trimmed = jsonPath.trim();
        if (!trimmed) {
            return null;
        }

        if (trimmed === '$') {
            return '$';
        }

        if (!trimmed.startsWith('$')) {
            return null;
        }

        let pointer = '$';
        let index = 1;

        while (index < trimmed.length) {
            const char = trimmed[index];

            if (char === '.') {
                index++;

                if (index >= trimmed.length) {
                    break;
                }

                if (trimmed[index] === '.') {
                    // Unsupported recursive descent
                    return null;
                }

                if (trimmed[index] === '[') {
                    continue;
                }

                let start = index;
                while (index < trimmed.length && trimmed[index] !== '.' && trimmed[index] !== '[') {
                    index++;
                }

                const segment = trimmed.slice(start, index);
                if (segment) {
                    pointer = appendPointerSegment(pointer, segment);
                }

                continue;
            }

            if (char === '[') {
                index++;

                if (index >= trimmed.length) {
                    break;
                }

                if (trimmed[index] === '\'' || trimmed[index] === '"') {
                    const quote = trimmed[index];
                    index++;
                    let segment = '';

                    while (index < trimmed.length) {
                        const currentChar = trimmed[index];
                        if (currentChar === '\\' && index + 1 < trimmed.length) {
                            segment += trimmed[index + 1];
                            index += 2;
                            continue;
                        }

                        if (currentChar === quote) {
                            break;
                        }

                        segment += currentChar;
                        index++;
                    }

                    if (index < trimmed.length && trimmed[index] === quote) {
                        index++;
                    }

                    if (index < trimmed.length && trimmed[index] === ']') {
                        index++;
                    }

                    if (!segment) {
                        return null;
                    }

                    pointer = appendPointerSegment(pointer, segment);
                } else {
                    let start = index;
                    while (index < trimmed.length && trimmed[index] !== ']') {
                        index++;
                    }

                    const token = trimmed.slice(start, index);

                    if (index < trimmed.length && trimmed[index] === ']') {
                        index++;
                    }

                    if (!token || token === '*') {
                        return null;
                    }

                    const numericIndex = Number(token);
                    if (!Number.isNaN(numericIndex)) {
                        pointer = appendPointerSegment(pointer, numericIndex);
                    } else {
                        pointer = appendPointerSegment(pointer, token);
                    }
                }

                continue;
            }

            // Skip any other characters
            index++;
        }

        return pointer;
    }

    handleJSONPathMatches(jsonPath, matches, editor, totalCount, truncated, options = {}) {
        const { notify = true, revealFirst = true, fromWidget = false } = options || {};

        if (!Array.isArray(matches) || matches.length === 0) {
            this.resetJSONPathResults({ keepQuery: true });
            this.lastJSONPathQuery = jsonPath;
            this.lastJSONPathMeta = { totalCount: 0, truncated: false };
            if (fromWidget) {
                this.updateFindWidgetMatchesCount(0, truncated, -1, { query: jsonPath });
            }
            if (notify) {
                this.showNotification(`JSONPath "${jsonPath}" not found`, 'info');
            }
            return [];
        }

        this.lastJSONPathResults = matches;
        this.lastJSONPathMeta = { totalCount, truncated };
        this.lastJSONPathQuery = jsonPath;

        if (revealFirst) {
            this.focusJSONPathMatch(0, editor, { fromWidget, reveal: true });
        } else if (this.currentJSONPathIndex < 0 || this.currentJSONPathIndex >= matches.length) {
            this.currentJSONPathIndex = 0;
        }

        if (fromWidget) {
            this.updateFindWidgetMatchesCount(totalCount, truncated, this.currentJSONPathIndex);
        }

        if (notify) {
            const effectiveIndex = Math.max(0, this.currentJSONPathIndex);
            const matchForPreview = matches[effectiveIndex] || matches[0];
            let message = `JSONPath "${jsonPath}" found ${totalCount} match${totalCount === 1 ? '' : 'es'}`;
            if (truncated && matches.length < totalCount) {
                message += ` (showing first ${matches.length})`;
            }

            if (matchForPreview && Object.prototype.hasOwnProperty.call(matchForPreview, 'value')) {
                message += `: ${this.formatValuePreview(matchForPreview.value)}`;
            }

            this.showNotification(message, 'success');

            if (totalCount > 1) {
                this.showNotification(`Use Alt+N/Alt+P to navigate between ${totalCount} matches`, 'info');
            }
        }

        return matches;
    }

    resetJSONPathResults(options = {}) {
        const { keepQuery = false } = options || {};
        this.lastJSONPathResults = [];
        this.lastJSONPathMeta = { totalCount: 0, truncated: false };
        this.lastJSONPathPointerLocator = null;
        this.currentJSONPathIndex = -1;
        if (!keepQuery) {
            this.lastJSONPathQuery = '';
        }
    }

    focusJSONPathMatch(index, editor = this.getActiveEditor(), options = {}) {
        const { reveal = true, fromWidget = false } = options || {};

        if (!editor) {
            return false;
        }

        const matches = Array.isArray(this.lastJSONPathResults) ? this.lastJSONPathResults : [];
        if (matches.length === 0) {
            this.currentJSONPathIndex = -1;
            if (fromWidget) {
                this.updateFindWidgetMatchesCount(0, false, -1);
            }
            return false;
        }

        const targetIndex = Number(index);
        if (Number.isNaN(targetIndex) || targetIndex < 0 || targetIndex >= matches.length) {
            return false;
        }

        const match = matches[targetIndex];
        if (!match) {
            return false;
        }

        const content = editor.getValue();
        let position = match.position;
        let pointerLocator = this.lastJSONPathPointerLocator;

        if (!pointerLocator) {
            pointerLocator = this.createPointerLocator(content);
            this.lastJSONPathPointerLocator = pointerLocator;
        }

        if ((!position || typeof position.startLineNumber !== 'number') && pointerLocator) {
            const pointer = match.pointer || this.convertJSONPathToPointer(match.path);
            if (pointer) {
                const pointerPosition = pointerLocator.getRange(pointer);
                if (pointerPosition) {
                    position = pointerPosition;
                    match.position = pointerPosition;
                }
            }
        }

        if (!position || typeof position.startLineNumber !== 'number') {
            const pointer = match.pointer || null;
            const fallbackPosition = this.findValuePosition(match.value, content, editor, match.path, pointerLocator, pointer);
            if (fallbackPosition) {
                position = fallbackPosition;
                match.position = fallbackPosition;
            }
        }

        if (!position || typeof position.startLineNumber !== 'number') {
            return false;
        }

        const range = new monaco.Range(
            position.startLineNumber,
            position.startColumn,
            position.endLineNumber,
            position.endColumn
        );

        editor.setSelection(range);
        if (reveal) {
            if (monaco?.editor?.ScrollType) {
                editor.revealRangeInCenter(range, monaco.editor.ScrollType.Smooth);
            } else {
                editor.revealRangeInCenter(range);
            }
        }

        this.currentJSONPathIndex = targetIndex;

        if (fromWidget || (this.findWidgetIntegration && this.findWidgetIntegration.enabled)) {
            const meta = this.lastJSONPathMeta || {};
            const total = typeof meta.totalCount === 'number' && meta.totalCount > 0
                ? meta.totalCount
                : matches.length;
            this.updateFindWidgetMatchesCount(total, Boolean(meta.truncated), targetIndex);
        }

        return true;
    }

    navigateJSONPathMatches(direction = 1, editor = this.getActiveEditor(), options = {}) {
        const matches = Array.isArray(this.lastJSONPathResults) ? this.lastJSONPathResults : [];

        if (!editor || matches.length === 0) {
            if (options.notify !== false) {
                this.showNotification('No JSONPath matches to navigate', 'warning');
            }
            return false;
        }

        let step = Number(direction);
        if (Number.isNaN(step) || step === 0) {
            step = 1;
        }

        const total = matches.length;
        let targetIndex = typeof this.currentJSONPathIndex === 'number' ? this.currentJSONPathIndex : -1;

        if (targetIndex < 0 || targetIndex >= total) {
            targetIndex = step > 0 ? 0 : total - 1;
        } else {
            targetIndex = (targetIndex + step + total) % total;
        }

        const success = this.focusJSONPathMatch(targetIndex, editor, {
            fromWidget: options.fromWidget,
            reveal: options.reveal !== false
        });

        if (!success && options.notify !== false) {
            this.showNotification('Unable to navigate to JSONPath match', 'warning');
        }

        return success;
    }

    updateFindWidgetMatchesCount(totalCount, truncated, index = this.currentJSONPathIndex, extra = {}) {
        const integration = this.findWidgetIntegration;
        if (!integration || !integration.matchesElement) {
            return;
        }

        const matchesElement = integration.matchesElement;

        if (extra.reset) {
            if (typeof integration.originalMatchesText === 'string') {
                matchesElement.textContent = integration.originalMatchesText;
            }
            matchesElement.removeAttribute('data-jsonpath');
            matchesElement.removeAttribute('data-jsonpath-state');
            matchesElement.removeAttribute('data-jsonpath-partial');
            matchesElement.removeAttribute('title');
            return;
        }

        if (!integration.enabled && !extra.force) {
            return;
        }

        const renderJSONPathStatus = (label, state = 'status', options = {}) => {
            matchesElement.dataset.jsonpath = 'true';
            matchesElement.dataset.jsonpathState = state;

            if (options.partial) {
                matchesElement.dataset.jsonpathPartial = 'true';
            } else {
                matchesElement.removeAttribute('data-jsonpath-partial');
            }

            matchesElement.innerHTML = '';

            const chip = document.createElement('span');
            chip.className = 'jsonpath-chip';
            chip.textContent = 'JSONPath';
            matchesElement.appendChild(chip);

            if (label) {
                const status = document.createElement('span');
                status.className = 'jsonpath-status';
                status.textContent = label;
                matchesElement.appendChild(status);
            }

            if (options.title) {
                matchesElement.title = options.title;
            } else if (label) {
                matchesElement.title = `JSONPath · ${label}`;
            } else {
                matchesElement.removeAttribute('title');
            }
        };

        if (extra.searching) {
            renderJSONPathStatus('searching…');
            return;
        }

        if (extra.emptyQuery) {
            renderJSONPathStatus('enter path');
            return;
        }

        if (extra.noContent) {
            renderJSONPathStatus('no content');
            return;
        }

        if (extra.error) {
            renderJSONPathStatus('error', 'error');
            return;
        }

        if (!totalCount || totalCount <= 0) {
            renderJSONPathStatus('no results');
            return;
        }

        const displayIndex = typeof index === 'number' && index >= 0 ? index + 1 : 1;
        const label = `${displayIndex}/${totalCount}`;
        const partial = truncated && Array.isArray(this.lastJSONPathResults) && this.lastJSONPathResults.length < totalCount;
        const title = partial
            ? `JSONPath results · ${displayIndex}/${totalCount} (partial)`
            : `JSONPath results · ${displayIndex}/${totalCount}`;
        renderJSONPathStatus(label, 'count', { partial, title });
    }

    performFindWidgetJSONPathSearch(query, options = {}) {
        const integration = this.findWidgetIntegration;
        if (!integration || !integration.enabled) {
            return;
        }

        const trimmed = typeof query === 'string' ? query.trim() : '';
        const immediate = Boolean(options.immediate);
        const delay = typeof options.delay === 'number' ? options.delay : 150;

        if (integration.searchDebounce) {
            clearTimeout(integration.searchDebounce);
            integration.searchDebounce = null;
        }

        if (!trimmed) {
            this.resetJSONPathResults({ keepQuery: false });
            this.lastJSONPathQuery = '';
            this.updateFindWidgetMatchesCount(0, false, -1, { emptyQuery: true });
            return;
        }

        const runSearch = () => {
            integration.searchDebounce = null;
            const targetEditor = integration.editor || this.getActiveEditor();
            if (targetEditor) {
                this.searchWithJSONPath(trimmed, targetEditor, {
                    notify: false,
                    revealFirst: options.revealFirst !== false,
                    fromWidget: true
                });
            }
        };

        this.updateFindWidgetMatchesCount(null, false, -1, { searching: true, force: true });

        if (immediate) {
            runSearch();
            return;
        }

        integration.searchDebounce = setTimeout(runSearch, delay);
    }

    setupFindWidgetIntegration(editor) {
        if (typeof document === 'undefined') {
            return;
        }

        if (!this.findWidgetIntegration) {
            this.findWidgetIntegration = {
                editor,
                widget: null,
                toggleElement: null,
                matchesElement: null,
                inputElement: null,
                nextButton: null,
                prevButton: null,
                closeButton: null,
                enabled: false,
                observer: null,
                searchDebounce: null,
                originalMatchesText: '',
                resizeHandler: null,
                resizeObserver: null,
                layoutRaf: null,
                layoutScheduler: 'raf',
                lastLayoutWidth: null,
                lastReservedPadding: null
            };
        } else {
            this.findWidgetIntegration.editor = editor;
            if (!('resizeHandler' in this.findWidgetIntegration)) {
                this.findWidgetIntegration.resizeHandler = null;
            }
            if (!('resizeObserver' in this.findWidgetIntegration)) {
                this.findWidgetIntegration.resizeObserver = null;
            }
            if (!('layoutRaf' in this.findWidgetIntegration)) {
                this.findWidgetIntegration.layoutRaf = null;
            }
            if (!('layoutScheduler' in this.findWidgetIntegration)) {
                this.findWidgetIntegration.layoutScheduler = 'raf';
            }
            if (!('lastLayoutWidth' in this.findWidgetIntegration)) {
                this.findWidgetIntegration.lastLayoutWidth = null;
            }
            if (!('lastReservedPadding' in this.findWidgetIntegration)) {
                this.findWidgetIntegration.lastReservedPadding = null;
            }
        }

        const integration = this.findWidgetIntegration;

        const tryDecorate = () => {
            const widgetNode = document.querySelector('.editor-widget.find-widget');
            if (widgetNode) {
                this.decorateFindWidget(widgetNode, integration);
                return true;
            }
            return false;
        };

        if (!tryDecorate()) {
            if (!integration.observer) {
                integration.observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        if (mutation.addedNodes) {
                            for (const node of mutation.addedNodes) {
                                if (!node || node.nodeType !== 1) {
                                    continue;
                                }

                                const element = node;
                                if (element.classList.contains('find-widget')) {
                                    this.decorateFindWidget(element, integration);
                                    continue;
                                }

                                const nested = element.querySelector ? element.querySelector('.editor-widget.find-widget, .find-widget') : null;
                                if (nested) {
                                    const actualWidget = nested.classList && nested.classList.contains('find-widget')
                                        ? nested
                                        : nested.querySelector('.find-widget');
                                    if (actualWidget) {
                                        this.decorateFindWidget(actualWidget, integration);
                                    }
                                }
                            }
                        }

                        if (mutation.removedNodes && integration.widget) {
                            for (const node of mutation.removedNodes) {
                                if (!node || node.nodeType !== 1) {
                                    continue;
                                }
                                if (node === integration.widget || (node.contains && node.contains(integration.widget))) {
                                    this.handleFindWidgetRemoval();
                                }
                            }
                        }
                    }
                });

                integration.observer.observe(document.body, { childList: true, subtree: true });
            }
        }
    }

    async openFindWidget(options = {}) {
        const editor = this.getActiveEditor();
        if (!editor) {
            return null;
        }

        this.setupFindWidgetIntegration(editor);

        const findAction = editor.getAction && editor.getAction('actions.find');
        try {
            if (findAction && typeof findAction.run === 'function') {
                await findAction.run();
            } else {
                editor.trigger('keyboard', 'actions.find', null);
            }
        } catch (error) {
            console.warn('Find widget command failed, triggering fallback:', error);
            editor.trigger('keyboard', 'actions.find', null);
        }

        const start = Date.now();
        const scheduler = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (callback) => setTimeout(callback, 30);

        return new Promise((resolve) => {
            const awaitWidget = () => {
                const integration = this.findWidgetIntegration;
                if (integration && integration.widget && integration.inputElement) {
                    const input = integration.inputElement;
                    const focus = options.focus !== false;
                    const select = options.select !== false;
                    const notify = options.notify === true;
                    const explicitMode = typeof options.jsonPathMode === 'boolean';
                    const targetMode = explicitMode ? options.jsonPathMode : null;
                    const hasQueryOption = typeof options.query === 'string';
                    const rawQuery = hasQueryOption ? options.query : '';
                    const trimmedQuery = rawQuery.trim();

                    if (hasQueryOption) {
                        if (input.value !== trimmedQuery) {
                            input.value = trimmedQuery;
                        }
                    }

                    if (explicitMode) {
                        this.setFindWidgetJSONPathMode(targetMode, { notify, focusInput: false });
                    }

                    if ((!explicitMode || targetMode !== true) && hasQueryOption) {
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    if (focus) {
                        input.focus();
                        if (select) {
                            input.select();
                        }
                    }

                    resolve(integration);
                    return;
                }

                if (Date.now() - start > 1200) {
                    resolve(null);
                    return;
                }

                scheduler(awaitWidget);
            };

            awaitWidget();
        });
    }

    decorateFindWidget(widgetNode, integration = this.findWidgetIntegration) {
        if (!integration || !widgetNode || typeof widgetNode.querySelector !== 'function') {
            return;
        }

        if (widgetNode.dataset) {
            widgetNode.dataset.jsonpathDecorated = 'true';
        }

        widgetNode.classList.add('jsonpath-extended');

        integration.widget = widgetNode;

        if (typeof window !== 'undefined') {
            if (integration.resizeHandler) {
                window.removeEventListener('resize', integration.resizeHandler);
            }

            integration.resizeHandler = () => {
                this.refreshFindWidgetLayout();
            };

            window.addEventListener('resize', integration.resizeHandler, { passive: true });
        }

        if (typeof ResizeObserver !== 'undefined') {
            if (!integration.resizeObserver) {
                integration.resizeObserver = new ResizeObserver(() => {
                    this.refreshFindWidgetLayout();
                });
            } else {
                integration.resizeObserver.disconnect();
            }

            integration.resizeObserver.observe(widgetNode);
        }

        const matchesElement = widgetNode.querySelector('.matchesCount');
        if (matchesElement) {
            integration.matchesElement = matchesElement;
            if (!integration.originalMatchesText) {
                integration.originalMatchesText = matchesElement.textContent || '';
            }
        }

        const controls = widgetNode.querySelector('.controls');
        if (controls) {
            controls.classList.add('jsonpath-widget-controls');
        }
        if (controls && !widgetNode.querySelector('[data-jsonpath-toggle]')) {
            const toggle = document.createElement('div');
            toggle.className = 'monaco-custom-toggle codicon codicon-symbol-structure';
            toggle.setAttribute('role', 'checkbox');
            toggle.setAttribute('tabindex', '0');
            toggle.setAttribute('aria-checked', 'false');
            toggle.setAttribute('aria-label', 'Use JSONPath (Alt+J)');
            toggle.setAttribute('title', 'Use JSONPath (Alt+J)');
            toggle.dataset.jsonpathToggle = 'true';
            toggle.classList.add('monaco-jsonpath-toggle');

            const toggleHandler = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.setFindWidgetJSONPathMode(!integration.enabled, { notify: true, focusInput: true });
            };

            toggle.addEventListener('click', toggleHandler);
            toggle.addEventListener('keydown', (event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                    toggleHandler(event);
                }
            });

            if (controls.firstChild) {
                controls.insertBefore(toggle, controls.firstChild);
            } else {
                controls.appendChild(toggle);
            }
            integration.toggleElement = toggle;
        } else if (controls) {
            if (!integration.toggleElement) {
                integration.toggleElement = controls.querySelector('[data-jsonpath-toggle]');
            }
            if (integration.toggleElement) {
                integration.toggleElement.classList.add('monaco-jsonpath-toggle');
            }
        }

        const inputElement = widgetNode.querySelector('.find-part .input');
        if (inputElement) {
            integration.inputElement = inputElement;
            if (!inputElement.dataset.jsonpathBound) {
                inputElement.dataset.jsonpathBound = 'true';

                inputElement.addEventListener('input', () => {
                    if (integration.enabled) {
                        this.performFindWidgetJSONPathSearch(inputElement.value);
                    }
                });

                inputElement.addEventListener('keydown', (event) => {
                    if (!integration.enabled) {
                        return;
                    }

                    if (event.key === 'Enter') {
                        event.preventDefault();
                        event.stopPropagation();
                        const query = inputElement.value.trim();
                        if (!query) {
                            this.updateFindWidgetMatchesCount(0, false, -1, { emptyQuery: true });
                            return;
                        }

                        if (query !== this.lastJSONPathQuery) {
                            this.performFindWidgetJSONPathSearch(query, { immediate: true });
                            return;
                        }

                        const direction = event.shiftKey ? -1 : 1;
                        this.navigateJSONPathMatches(direction, integration.editor, { fromWidget: true, notify: false });
                    }
                });
            }
        }

        const nextButton = widgetNode.querySelector('.codicon-find-next-match');
        if (nextButton) {
            integration.nextButton = nextButton;
            if (!nextButton.dataset.jsonpathBound) {
                nextButton.dataset.jsonpathBound = 'true';
                nextButton.addEventListener('mousedown', (event) => {
                    if (integration.enabled) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                });
                nextButton.addEventListener('click', (event) => {
                    if (!integration.enabled) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    const query = integration.inputElement ? integration.inputElement.value.trim() : '';
                    if (query && query !== this.lastJSONPathQuery) {
                        this.performFindWidgetJSONPathSearch(query, { immediate: true });
                        return;
                    }
                    this.navigateJSONPathMatches(1, integration.editor, { fromWidget: true, notify: false });
                });
            }
        }

        const prevButton = widgetNode.querySelector('.codicon-find-previous-match');
        if (prevButton) {
            integration.prevButton = prevButton;
            if (!prevButton.dataset.jsonpathBound) {
                prevButton.dataset.jsonpathBound = 'true';
                prevButton.addEventListener('mousedown', (event) => {
                    if (integration.enabled) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                });
                prevButton.addEventListener('click', (event) => {
                    if (!integration.enabled) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    const query = integration.inputElement ? integration.inputElement.value.trim() : '';
                    if (query && query !== this.lastJSONPathQuery) {
                        this.performFindWidgetJSONPathSearch(query, { immediate: true });
                        return;
                    }
                    this.navigateJSONPathMatches(-1, integration.editor, { fromWidget: true, notify: false });
                });
            }
        }

        const closeButton = widgetNode.querySelector('.codicon-widget-close');
        if (closeButton) {
            integration.closeButton = closeButton;
            if (!closeButton.dataset.jsonpathBound) {
                closeButton.dataset.jsonpathBound = 'true';
                closeButton.addEventListener('click', () => {
                    if (integration.enabled) {
                        this.setFindWidgetJSONPathMode(false, { notify: false });
                    }
                });
            }
        }

        if (integration.enabled) {
            const meta = this.lastJSONPathMeta || {};
            const total = typeof meta.totalCount === 'number' && meta.totalCount > 0
                ? meta.totalCount
                : (Array.isArray(this.lastJSONPathResults) ? this.lastJSONPathResults.length : 0);
            if (total > 0) {
                this.updateFindWidgetMatchesCount(total, Boolean(meta.truncated), this.currentJSONPathIndex, { force: true });
            } else {
                this.updateFindWidgetMatchesCount(0, false, -1, { emptyQuery: !this.lastJSONPathQuery });
            }
        }

        this.refreshFindWidgetLayout({ immediate: true });
    }

    refreshFindWidgetLayout(options = {}) {
        const integration = this.findWidgetIntegration;
        if (!integration || !integration.widget) {
            return;
        }

        const widget = integration.widget;
        widget.classList.add('jsonpath-extended');

        const schedulerType = typeof requestAnimationFrame === 'function' ? 'raf' : 'timeout';
        const scheduler = schedulerType === 'raf'
            ? requestAnimationFrame
            : (callback) => setTimeout(callback, 20);

        if (integration.layoutRaf !== null) {
            if (integration.layoutScheduler === 'raf' && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(integration.layoutRaf);
            } else {
                clearTimeout(integration.layoutRaf);
            }
            integration.layoutRaf = null;
        }

        integration.layoutScheduler = schedulerType;

        const performLayout = () => {
            integration.layoutRaf = null;

            const viewportWidth = typeof window !== 'undefined' ? window.innerWidth || 0 : 0;
            let targetWidth = 460;

            if (viewportWidth > 0) {
                const horizontalPadding = viewportWidth < 600 ? 24 : 48;
                const idealFraction = viewportWidth < 1280 ? 0.62 : 0.5;
                const idealWidth = Math.round(viewportWidth * idealFraction);
                targetWidth = Math.max(380, Math.min(720, viewportWidth - horizontalPadding, idealWidth));

                if (viewportWidth <= 520) {
                    targetWidth = Math.max(320, viewportWidth - 20);
                }
            }

            let widthLimit = targetWidth;
            if (viewportWidth > 0) {
                const viewportLimit = Math.max(320, viewportWidth - 32);
                widthLimit = Math.min(targetWidth, viewportLimit);
            }

            if (integration.lastLayoutWidth !== widthLimit) {
                widget.style.width = `${widthLimit}px`;
                widget.style.maxWidth = 'calc(100vw - 32px)';
                widget.style.minWidth = `${Math.min(Math.max(widthLimit, 320), 420)}px`;
                integration.lastLayoutWidth = widthLimit;
            }

            const findPart = widget.querySelector('.find-part');
            if (findPart) {
                findPart.style.flex = '1 1 auto';
                findPart.style.minWidth = '0';
            }

            const findInput = widget.querySelector('.find-part .monaco-findInput');
            if (findInput) {
                findInput.style.flex = '1 1 auto';
                findInput.style.minWidth = '0';
            }

            const replacePart = widget.querySelector('.replace-part');
            if (replacePart) {
                replacePart.style.flex = '1 1 auto';
                replacePart.style.minWidth = '0';
            }

            const controls = widget.querySelector('.find-part .controls');
            let reservedPadding = 88;
            if (controls) {
                controls.classList.add('jsonpath-widget-controls');
                const rect = controls.getBoundingClientRect();
                if (rect && rect.width) {
                    reservedPadding = Math.max(72, Math.round(rect.width) + 12);
                } else if (controls.children && controls.children.length) {
                    reservedPadding = Math.max(72, (controls.children.length * 24) + 12);
                }
            }

            if (integration.lastReservedPadding !== reservedPadding) {
                const adjustInput = (selector, offset, minimumPadding) => {
                    const container = widget.querySelector(selector);
                    if (!container) {
                        return;
                    }

                    const input = container.querySelector('.input');
                    const mirror = container.querySelector('.mirror');
                    const paddingValue = Math.max(minimumPadding, reservedPadding - offset);

                    if (input) {
                        input.style.width = `calc(100% - ${paddingValue}px)`;
                    }

                    if (mirror) {
                        mirror.style.paddingRight = `${paddingValue}px`;
                    }
                };

                adjustInput('.find-part .monaco-findInput', 0, 72);
                adjustInput('.replace-part .monaco-findInput', 24, 56);

                integration.lastReservedPadding = reservedPadding;
            }

            const matchesElement = widget.querySelector('.matchesCount');
            if (matchesElement) {
                matchesElement.style.minWidth = '96px';
                matchesElement.style.textAlign = 'right';
            }
        };

        if (options.immediate) {
            performLayout();
        }

        integration.layoutRaf = scheduler(() => {
            performLayout();
        });
    }

    toggleFindWidgetJSONPathMode(force) {
        const editor = this.getActiveEditor();
        if (!editor) {
            return;
        }

        const integration = this.findWidgetIntegration;
        const desiredState = typeof force === 'boolean'
            ? force
            : !(integration && integration.enabled);

        const applyToggle = () => {
            this.setupFindWidgetIntegration(editor);
            const updatedIntegration = this.findWidgetIntegration;
            if (updatedIntegration && updatedIntegration.widget) {
                this.setFindWidgetJSONPathMode(desiredState, { notify: true, focusInput: true });
            }
        };

        if (!integration || !integration.widget) {
            const findAction = editor.getAction && editor.getAction('actions.find');
            if (findAction && typeof findAction.run === 'function') {
                findAction.run().then(() => {
                    setTimeout(applyToggle, 0);
                }).catch(() => {
                    setTimeout(applyToggle, 0);
                });
            } else {
                editor.trigger('keyboard', 'actions.find', null);
                setTimeout(applyToggle, 0);
            }
        } else {
            applyToggle();
        }
    }

    setFindWidgetJSONPathMode(enabled, options = {}) {
        const integration = this.findWidgetIntegration;
        if (!integration) {
            return;
        }

        const previousState = integration.enabled;
        integration.enabled = Boolean(enabled);

        if (integration.toggleElement) {
            integration.toggleElement.setAttribute('aria-checked', integration.enabled ? 'true' : 'false');
            integration.toggleElement.classList.toggle('checked', integration.enabled);
            const toggleLabel = integration.enabled ? 'Disable JSONPath (Alt+J)' : 'Use JSONPath (Alt+J)';
            integration.toggleElement.setAttribute('aria-label', toggleLabel);
            integration.toggleElement.setAttribute('title', toggleLabel);
        }

        if (integration.widget) {
            integration.widget.classList.toggle('jsonpath-mode', integration.enabled);
        }

        this.refreshFindWidgetLayout();

        if (!integration.enabled) {
            if (integration.searchDebounce) {
                clearTimeout(integration.searchDebounce);
                integration.searchDebounce = null;
            }
            this.updateFindWidgetMatchesCount(null, false, -1, { reset: true });
            if (options.notify && previousState !== integration.enabled) {
                this.showNotification('JSONPath mode disabled in find widget', 'info');
            }
            return;
        }

        if (options.notify && previousState !== integration.enabled) {
            this.showNotification('JSONPath mode enabled in find widget', 'info');
        }

        const input = integration.inputElement;
        if (options.focusInput && input) {
            input.focus();
            input.select();
        }

        const query = input ? input.value.trim() : '';
        if (query) {
            this.performFindWidgetJSONPathSearch(query, { immediate: true });
        } else {
            this.updateFindWidgetMatchesCount(0, false, -1, { emptyQuery: true });
        }
    }

    handleFindWidgetRemoval() {
        const integration = this.findWidgetIntegration;
        if (!integration) {
            return;
        }

        if (integration.searchDebounce) {
            clearTimeout(integration.searchDebounce);
            integration.searchDebounce = null;
        }

        if (integration.layoutRaf !== null) {
            if (integration.layoutScheduler === 'raf' && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(integration.layoutRaf);
            } else {
                clearTimeout(integration.layoutRaf);
            }
            integration.layoutRaf = null;
        }

        if (integration.resizeObserver && typeof integration.resizeObserver.disconnect === 'function') {
            integration.resizeObserver.disconnect();
            integration.resizeObserver = null;
        }

        if (integration.resizeHandler && typeof window !== 'undefined') {
            window.removeEventListener('resize', integration.resizeHandler);
            integration.resizeHandler = null;
        }

        if (integration.widget) {
            integration.widget.classList.remove('jsonpath-extended', 'jsonpath-mode');
            integration.widget.style.removeProperty('width');
            integration.widget.style.removeProperty('maxWidth');
            integration.widget.style.removeProperty('minWidth');

            const findInput = integration.widget.querySelector('.find-part .input');
            const findMirror = integration.widget.querySelector('.find-part .mirror');
            if (findInput) {
                findInput.style.removeProperty('width');
            }
            if (findMirror) {
                findMirror.style.removeProperty('padding-right');
            }

            const replaceInput = integration.widget.querySelector('.replace-part .input');
            const replaceMirror = integration.widget.querySelector('.replace-part .mirror');
            if (replaceInput) {
                replaceInput.style.removeProperty('width');
            }
            if (replaceMirror) {
                replaceMirror.style.removeProperty('padding-right');
            }
        }

        integration.lastLayoutWidth = null;
        integration.lastReservedPadding = null;

        integration.widget = null;
        integration.toggleElement = null;
        integration.matchesElement = null;
        integration.inputElement = null;
        integration.nextButton = null;
        integration.prevButton = null;
        integration.closeButton = null;
        integration.enabled = false;
    }

    startHealthMonitoring() {
        if (this.healthMonitoring.enabled) return;
        
        this.healthMonitoring.enabled = true;
        this.healthMonitoring.interval = setInterval(() => {
            this.updateHealthStats();
        }, 5000); // Update every 5 seconds
        
        console.log('💊 Health monitoring started');
    }

    updateHealthStats() {
        try {
            const stats = {
                timestamp: Date.now(),
                workerPool: this.workerPool ? this.workerPool.getStats() : null,
                searchIndex: this.searchIndex && typeof this.searchIndex.getStats === 'function' ? 
                    this.searchIndex.getStats() : null,
                performance: this.performanceController && typeof this.performanceController.getStats === 'function' ?
                    this.performanceController.getStats() : null,
                memory: performance.memory ? {
                    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
                } : null
            };
            
            this.healthMonitoring.stats = stats;
            
            // Log warnings for performance issues
            if (stats.workerPool && stats.workerPool.queued > 10) {
                console.warn('⚠️ Worker pool queue is growing:', stats.workerPool.queued);
            }
            
            if (stats.memory && stats.memory.used > stats.memory.limit * 0.8) {
                console.warn('⚠️ Memory usage high:', stats.memory);
            }
            
        } catch (error) {
            console.error('Health monitoring error:', error);
        }
    }

    getHealthStats() {
        return this.healthMonitoring.stats;
    }

    showPerformanceBadge() {
        const stats = this.getHealthStats();
        if (!stats) return;
        
        let badge = document.getElementById('performanceBadge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'performanceBadge';
            badge.className = 'perf-monitor';
            document.body.appendChild(badge);
        }
        
        const content = [];
        if (stats.workerPool) {
            content.push(`Workers: ${stats.workerPool.busy}/${stats.workerPool.workers}`);
            if (stats.workerPool.queued > 0) {
                content.push(`Queue: ${stats.workerPool.queued}`);
            }
        }
        if (stats.memory) {
            content.push(`RAM: ${stats.memory.used}MB`);
        }
        
        badge.textContent = content.join(' | ');
        badge.classList.add('show');
    }

    // Cleanup
    dispose() {
        // Stop health monitoring
        if (this.healthMonitoring.interval) {
            clearInterval(this.healthMonitoring.interval);
            this.healthMonitoring.interval = null;
            this.healthMonitoring.enabled = false;
        }
        
        this.editors.forEach(editor => {
            if (editor.virtualRenderer) {
                editor.virtualRenderer.dispose();
            }
            editor.dispose();
        });
        this.editors.clear();
        
        if (this.diffEditor) {
            this.diffEditor.dispose();
            this.diffEditor = null;
        }
        
        if (this.workerPool) {
            this.workerPool.terminate();
        }
        
        if (this.searchIndex && typeof this.searchIndex.clear === 'function') {
            this.searchIndex.clear();
        }

        if (this.findWidgetIntegration) {
            this.handleFindWidgetRemoval();
            if (this.findWidgetIntegration.observer) {
                this.findWidgetIntegration.observer.disconnect();
                this.findWidgetIntegration.observer = null;
            }
            if (this.findWidgetIntegration.searchDebounce) {
                clearTimeout(this.findWidgetIntegration.searchDebounce);
                this.findWidgetIntegration.searchDebounce = null;
            }
            this.findWidgetIntegration = null;
        }

        this.isInitialized = false;
    }
}

function convertJSONToYAML(value, indentLevel = 0) {
    const indent = '  '.repeat(indentLevel);

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return `${indent}[]`;
        }

        return value.map((item) => {
            if (isPlainObject(item) || Array.isArray(item)) {
                const nested = convertJSONToYAML(item, indentLevel + 1).split('\n');
                const firstLine = nested.shift() || '';
                let line = `${indent}- ${firstLine.trimStart()}`;
                if (nested.length > 0) {
                    line += `\n${nested.join('\n')}`;
                }
                return line;
            }

            return `${indent}- ${formatYAMLScalar(item)}`;
        }).join('\n');
    }

    if (isPlainObject(value)) {
        const entries = Object.keys(value);
        if (entries.length === 0) {
            return `${indent}{}`;
        }

        return entries.map((key) => {
            const formattedKey = formatYAMLKey(key);
            const item = value[key];

            if (isPlainObject(item) || Array.isArray(item)) {
                const nested = convertJSONToYAML(item, indentLevel + 1);
                return `${indent}${formattedKey}:\n${nested}`;
            }

            return `${indent}${formattedKey}: ${formatYAMLScalar(item)}`;
        }).join('\n');
    }

    return `${indent}${formatYAMLScalar(value)}`;
}

function formatYAMLScalar(value) {
    if (value === null || value === undefined) {
        return 'null';
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }

    if (typeof value === 'string') {
        if (value === '') {
            return '""';
        }

        const simplePattern = /^[A-Za-z0-9_\-]+$/;
        const reservedWords = /^(?:true|false|null|yes|no|on|off|~)$/i;
        if (simplePattern.test(value) && !reservedWords.test(value)) {
            return value;
        }

        if (!/[\n\r]/.test(value) && !/^\s|\s$/.test(value) && !/[#:>{}\[\],&*?]|!/.test(value)) {
            return value;
        }

        return JSON.stringify(value);
    }

    return JSON.stringify(value);
}

function formatYAMLKey(key) {
    if (typeof key === 'string' && /^[A-Za-z0-9_\-]+$/.test(key)) {
        return key;
    }

    return JSON.stringify(key);
}

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function convertPathArrayToJSONPath(pathArray) {
    if (!Array.isArray(pathArray) || pathArray.length === 0) {
        return '$';
    }

    let result = '$';

    for (let i = 1; i < pathArray.length; i++) {
        const part = pathArray[i];
        if (typeof part === 'number') {
            result += `[${part}]`;
        } else if (typeof part === 'string') {
            if (isSimpleJsonPathSegment(part)) {
                result += `.${part}`;
            } else {
                const escaped = part.replace(/'/g, "\\'");
                result += `['${escaped}']`;
            }
        } else if (part !== undefined && part !== null) {
            result += `[${String(part)}]`;
        }
    }

    return result;
}

function convertPathArrayToPointer(pathArray) {
    if (!Array.isArray(pathArray) || pathArray.length === 0) {
        return '$';
    }

    let pointer = '$';

    for (let i = 1; i < pathArray.length; i++) {
        const part = pathArray[i];
        pointer = appendPointerSegment(pointer, part);
    }

    return pointer;
}

function appendPointerSegment(base, segment) {
    if (typeof segment === 'number') {
        return `${base}/${segment}`;
    }

    return `${base}/${escapeJsonPointerSegment(segment)}`;
}

function escapeJsonPointerSegment(segment) {
    return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function isSimpleJsonPathSegment(segment) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(segment);
}

function buildJSONPointerLocator(text) {
    if (typeof text !== 'string' || text.length === 0) {
        return null;
    }

    try {
        const pointerMap = new Map();
        const length = text.length;
        const lineOffsets = [0];

        for (let i = 0; i < length; i++) {
            if (text[i] === '\n') {
                lineOffsets.push(i + 1);
            }
        }

        let index = 0;

        const offsetToPosition = (offset) => {
            if (offset < 0) offset = 0;
            if (offset > length) offset = length;

            let low = 0;
            let high = lineOffsets.length - 1;

            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                const lineStart = lineOffsets[mid];
                const nextLineStart = mid + 1 < lineOffsets.length ? lineOffsets[mid + 1] : length + 1;

                if (offset < lineStart) {
                    high = mid - 1;
                } else if (offset >= nextLineStart) {
                    low = mid + 1;
                } else {
                    return {
                        lineNumber: mid + 1,
                        column: offset - lineStart + 1
                    };
                }
            }

            const lastLineIndex = lineOffsets.length - 1;
            const lineStart = lineOffsets[lastLineIndex] || 0;
            return {
                lineNumber: lastLineIndex + 1,
                column: offset - lineStart + 1
            };
        };

        const skipWhitespace = () => {
            while (index < length) {
                const char = text[index];
                if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
                    index++;
                } else {
                    break;
                }
            }
        };

        const recordPointer = (pointer, start, end) => {
            if (pointer && start <= end) {
                pointerMap.set(pointer, { start, end });
            }
        };

        const parseValue = (pointer) => {
            skipWhitespace();
            if (index >= length) {
                throw new Error('Unexpected end of JSON input');
            }

            const char = text[index];

            if (char === '{') {
                parseObject(pointer);
                return;
            }

            if (char === '[') {
                parseArray(pointer);
                return;
            }

            if (char === '"') {
                const { start, end } = parseStringLiteral();
                recordPointer(pointer, start, end);
                return;
            }

            if (char === '-' || isDigit(char)) {
                const { start, end } = parseNumberLiteral();
                recordPointer(pointer, start, end);
                return;
            }

            if (text.startsWith('true', index)) {
                const { start, end } = parseLiteral('true');
                recordPointer(pointer, start, end);
                return;
            }

            if (text.startsWith('false', index)) {
                const { start, end } = parseLiteral('false');
                recordPointer(pointer, start, end);
                return;
            }

            if (text.startsWith('null', index)) {
                const { start, end } = parseLiteral('null');
                recordPointer(pointer, start, end);
                return;
            }

            throw new Error(`Unexpected token ${char} at position ${index}`);
        };

        const parseObject = (pointer) => {
            const start = index;
            index++; // Skip {
            skipWhitespace();

            if (index < length && text[index] === '}') {
                index++;
                recordPointer(pointer, start, index);
                return;
            }

            while (index < length) {
                if (text[index] !== '"') {
                    throw new Error('Expected string for object key');
                }

                const { value: key } = parseStringLiteral();
                skipWhitespace();

                if (text[index] !== ':') {
                    throw new Error('Expected colon after object key');
                }

                index++; // Skip :
                const childPointer = appendPointerSegment(pointer, key);
                parseValue(childPointer);
                skipWhitespace();

                const delimiter = text[index];
                if (delimiter === ',') {
                    index++;
                    skipWhitespace();
                    continue;
                }

                if (delimiter === '}') {
                    index++;
                    recordPointer(pointer, start, index);
                    return;
                }

                throw new Error('Expected comma or closing brace in object');
            }

            throw new Error('Unterminated object literal');
        };

        const parseArray = (pointer) => {
            const start = index;
            index++; // Skip [
            skipWhitespace();

            if (index < length && text[index] === ']') {
                index++;
                recordPointer(pointer, start, index);
                return;
            }

            let arrayIndex = 0;
            while (index < length) {
                const childPointer = appendPointerSegment(pointer, arrayIndex);
                parseValue(childPointer);
                arrayIndex++;
                skipWhitespace();

                const delimiter = text[index];
                if (delimiter === ',') {
                    index++;
                    skipWhitespace();
                    continue;
                }

                if (delimiter === ']') {
                    index++;
                    recordPointer(pointer, start, index);
                    return;
                }

                throw new Error('Expected comma or closing bracket in array');
            }

            throw new Error('Unterminated array literal');
        };

        const parseStringLiteral = () => {
            const start = index;
            index++; // Skip opening quote
            let value = '';

            while (index < length) {
                const char = text[index];

                if (char === '"') {
                    index++;
                    return { value, start, end: index };
                }

                if (char === '\\') {
                    index++;
                    if (index >= length) {
                        throw new Error('Unterminated string literal');
                    }

                    const escapeChar = text[index];
                    switch (escapeChar) {
                        case '"':
                        case '\\':
                        case '/':
                            value += escapeChar;
                            break;
                        case 'b':
                            value += '\b';
                            break;
                        case 'f':
                            value += '\f';
                            break;
                        case 'n':
                            value += '\n';
                            break;
                        case 'r':
                            value += '\r';
                            break;
                        case 't':
                            value += '\t';
                            break;
                        case 'u':
                            const hex = text.slice(index + 1, index + 5);
                            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                                throw new Error('Invalid Unicode escape sequence');
                            }
                            value += String.fromCharCode(parseInt(hex, 16));
                            index += 4;
                            break;
                        default:
                            value += escapeChar;
                            break;
                    }
                } else {
                    value += char;
                }

                index++;
            }

            throw new Error('Unterminated string literal');
        };

        const parseNumberLiteral = () => {
            const start = index;

            if (text[index] === '-') {
                index++;
            }

            if (text[index] === '0') {
                index++;
            } else {
                if (!isDigit(text[index])) {
                    throw new Error('Invalid number literal');
                }
                while (index < length && isDigit(text[index])) {
                    index++;
                }
            }

            if (text[index] === '.') {
                index++;
                if (!isDigit(text[index])) {
                    throw new Error('Invalid number literal');
                }
                while (index < length && isDigit(text[index])) {
                    index++;
                }
            }

            if (text[index] === 'e' || text[index] === 'E') {
                index++;
                if (text[index] === '+' || text[index] === '-') {
                    index++;
                }
                if (!isDigit(text[index])) {
                    throw new Error('Invalid number literal');
                }
                while (index < length && isDigit(text[index])) {
                    index++;
                }
            }

            return { start, end: index };
        };

        const parseLiteral = (literal) => {
            const start = index;
            if (text.slice(index, index + literal.length) !== literal) {
                throw new Error(`Expected literal ${literal}`);
            }
            index += literal.length;
            return { start, end: index };
        };

        const isDigit = (char) => char >= '0' && char <= '9';

        parseValue('$');
        skipWhitespace();

        return {
            getRange(pointer) {
                if (!pointerMap.has(pointer)) {
                    return null;
                }

                const location = pointerMap.get(pointer);
                const start = offsetToPosition(location.start);
                const end = offsetToPosition(location.end);
                return {
                    startLineNumber: start.lineNumber,
                    startColumn: start.column,
                    endLineNumber: end.lineNumber,
                    endColumn: end.column
                };
            }
        };
    } catch (error) {
        console.warn('Failed to build JSON pointer locator:', error);
        return null;
    }
}

// Global initializer instance
const monacoInitializer = new MonacoInitializer();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        monacoInitializer.initialize().catch(console.error);
    });
} else {
    monacoInitializer.initialize().catch(console.error);
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.monacoInitializer = monacoInitializer;
    window.renderTemplateLibrary = renderTemplateLibrary;
    window.renderHistoryModal = renderHistoryModal;
}