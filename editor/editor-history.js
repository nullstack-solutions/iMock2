'use strict';

// ---- Template library & history helpers ----

const TEMPLATE_CATEGORY_LABELS = {
    basic: 'Basic',
    advanced: 'Advanced',
    testing: 'Testing',
    integration: 'Integration',
    proxy: 'Proxy'
};

function getTemplateLibrarySnapshot() {
    if (window.MonacoTemplateLibrary && typeof window.MonacoTemplateLibrary.getAll === 'function') {
        return window.MonacoTemplateLibrary.getAll();
    }
    return [];
}

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

const HISTORY_DB_NAME = 'imock-history-ak';
const HISTORY_DB_VERSION = 1;
const HISTORY_FRAMES_STORE = 'frames';
const HISTORY_SHA_STORE = 'shaIndex';
const HISTORY_LOCK_KEY = 'imock-history-lock';
const HISTORY_LOCK_TTL = 3000;
const DEBOUNCE_MS = 10_000;
const MIN_DELTA_LEN = 200;
const DEFAULT_HISTORY_BUDGET = 50 * 1024 * 1024;
const IOS_HISTORY_BUDGET = 30 * 1024 * 1024;
const LARGE_DIGEST_THRESHOLD = 1_000_000;
const HEADER_PARENT_KEYS = new Set(['headers']);
const IGNORED_KEYS = new Set(['id', 'uuid', 'updatedAt', 'insertionIndex']);

function isInsideJsonBody(context) {
    if (!context || !Array.isArray(context.path)) {
        return false;
    }

    return context.path.includes('jsonBody');
}

function detectHistoryBudget() {
    if (typeof navigator === 'undefined') {
        return DEFAULT_HISTORY_BUDGET;
    }

    const ua = navigator.userAgent || '';
    if (/iphone|ipad|ipod/i.test(ua)) {
        return IOS_HISTORY_BUDGET;
    }

    return DEFAULT_HISTORY_BUDGET;
}

function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function waitForTransaction(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
        tx.onerror = () => reject(tx.error || new Error('Transaction error'));
    });
}

function openHistoryDatabase() {
    if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB is not available');
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(HISTORY_FRAMES_STORE)) {
                const frames = db.createObjectStore(HISTORY_FRAMES_STORE, { keyPath: 'seq', autoIncrement: true });
                frames.createIndex('id', 'id', { unique: true });
                frames.createIndex('ts', 'ts');
            }

            if (!db.objectStoreNames.contains(HISTORY_SHA_STORE)) {
                db.createObjectStore(HISTORY_SHA_STORE, { keyPath: 'sha256' });
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                db.close();
            };
            resolve(db);
        };

        request.onerror = () => reject(request.error);
    });
}

function mappingSortKey(mapping) {
    if (!mapping || typeof mapping !== 'object') {
        return '';
    }

    if (mapping.name) {
        return String(mapping.name).toLowerCase();
    }

    const request = mapping.request || {};
    const method = request.method ? String(request.method) : '';
    const url = request.url
        || request.urlPath
        || request.urlPattern
        || request.urlPathPattern
        || '';
    return [method, url].filter(Boolean).join(' ').toLowerCase();
}

function normalizeLineEndings(value) {
    return typeof value === 'string' ? value.replace(/\r\n/g, '\n') : value;
}

function canonicalizeValue(value, context = { path: [] }) {
    if (Array.isArray(value)) {
        const parentKey = context.path[context.path.length - 1];
        const mapped = value.map((item) => canonicalizeValue(item, { path: [...context.path, null] }));

        if (parentKey === 'mappings') {
            return mapped
                .map((item) => ({ key: mappingSortKey(item), item }))
                .sort((a, b) => a.key.localeCompare(b.key))
                .map(({ item }) => item);
        }

        return mapped;
    }

    if (value && typeof value === 'object') {
        const entries = [];
        const preserveOrder = isInsideJsonBody(context);
        for (const [rawKey, rawValue] of Object.entries(value)) {
            if (IGNORED_KEYS.has(rawKey) && !preserveOrder) {
                continue;
            }

            const parentKey = context.path[context.path.length - 1];
            const keyNeedsLowercase = parentKey && HEADER_PARENT_KEYS.has(parentKey) && !preserveOrder;
            const key = keyNeedsLowercase ? rawKey.toLowerCase() : rawKey;
            const nextContext = { path: [...context.path, key] };
            const canonicalValue = canonicalizeValue(rawValue, nextContext);
            entries.push([key, canonicalValue]);
        }

        const out = {};
        const sourceEntries = preserveOrder ? entries : entries.sort((a, b) => a[0].localeCompare(b[0]));
        for (const [key, val] of sourceEntries) {
            out[key] = val;
        }
        return out;
    }

    if (typeof value === 'string') {
        return normalizeLineEndings(value);
    }

    return value;
}

function stableStringifyWireMock(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return '';
        }

        try {
            const parsed = JSON.parse(normalizeLineEndings(value));
            const canonical = canonicalizeValue(parsed, { path: [] });
            return JSON.stringify(canonical, null, 2);
        } catch (error) {
            return normalizeLineEndings(value);
        }
    }

    if (value && typeof value === 'object') {
        const canonical = canonicalizeValue(value, { path: [] });
        return JSON.stringify(canonical, null, 2);
    }

    return typeof value === 'undefined' ? '' : String(value);
}

function crc32(u8) {
    let crc = -1;
    for (let i = 0; i < u8.length; i += 1) {
        crc ^= u8[i];
        for (let j = 0; j < 8; j += 1) {
            const mask = -(crc & 1);
            crc = (crc >>> 1) ^ (0xEDB88320 & mask);
        }
    }
    return (crc ^ -1) >>> 0;
}

let digestWorker = null;

async function digestInWorker(u8) {
    if (typeof Worker === 'undefined') {
        return null;
    }

    if (!digestWorker) {
        const script = `self.onmessage = async (event) => {
    try {
        const buffer = event.data;
        const digest = await crypto.subtle.digest('SHA-256', buffer);
        self.postMessage(digest, [digest]);
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};`;
        const blob = new Blob([script], { type: 'application/javascript' });
        digestWorker = new Worker(URL.createObjectURL(blob));
    }

    const bufferCopy = u8.buffer.slice(0);
    return new Promise((resolve, reject) => {
        const handleMessage = (event) => {
            digestWorker.removeEventListener('message', handleMessage);
            digestWorker.removeEventListener('error', handleError);
            const { data } = event;
            if (data && data.error) {
                reject(new Error(data.error));
            } else {
                resolve(data);
            }
        };

        const handleError = (error) => {
            digestWorker.removeEventListener('message', handleMessage);
            digestWorker.removeEventListener('error', handleError);
            reject(error);
        };

        digestWorker.addEventListener('message', handleMessage);
        digestWorker.addEventListener('error', handleError);
        digestWorker.postMessage(bufferCopy, [bufferCopy]);
    });
}

async function sha256Hex(u8) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        try {
            if (u8.byteLength > LARGE_DIGEST_THRESHOLD) {
                const digestBuffer = await digestInWorker(u8);
                if (digestBuffer instanceof ArrayBuffer) {
                    const hashArray = Array.from(new Uint8Array(digestBuffer));
                    return { algorithm: 'sha256', hash: hashArray.map((b) => b.toString(16).padStart(2, '0')).join('') };
                }
            }

            const digest = await crypto.subtle.digest('SHA-256', u8);
            const hashArray = Array.from(new Uint8Array(digest));
            return {
                algorithm: 'sha256',
                hash: hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
            };
        } catch (error) {
            console.warn('[HISTORY] Failed to compute SHA-256, falling back to CRC32', error);
        }
    }

    const fallback = crc32(u8).toString(16).padStart(8, '0');
    return { algorithm: 'crc32', hash: fallback };
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class EditorHistory {
    constructor(limit = 50) {
        this.limit = Math.max(5, limit);
        this.dbPromise = openHistoryDatabase();
        this.cache = new Map();
        this.cacheLimit = 5;
        this.currentId = null;
        this.lastEntry = null;
        this.budgetBytes = detectHistoryBudget();
        this.stats = {
            count: 0,
            byteSize: 0,
            latestTimestamp: null,
            latestLabel: null
        };
        this.ready = this.initialiseState();
    }

    async initialiseState() {
        try {
            const db = await this.dbPromise;
            const entries = await this.readAllFrames(db);
            if (entries.length) {
                const latest = entries[entries.length - 1];
                this.currentId = latest.id;
                this.lastEntry = {
                    seq: latest.seq,
                    length: latest.json.length,
                    timestamp: latest.ts,
                    manual: Boolean(latest.manual)
                };
            }

            let totalBytes = 0;
            let latestTimestamp = null;
            let latestLabel = null;
            for (const entry of entries) {
                totalBytes += entry.byteSize || 0;
                if (!latestTimestamp || entry.ts >= latestTimestamp) {
                    latestTimestamp = entry.ts;
                    latestLabel = entry.label;
                }
            }

            this.stats = {
                count: entries.length,
                byteSize: totalBytes,
                latestTimestamp,
                latestLabel
            };

            // Phase 2: Schedule automatic cleanup
            this.scheduleCleanup();
        } catch (error) {
            console.warn('[HISTORY] Failed to initialise history', error);
        }
    }

    async reset(initialContent = '', meta = {}) {
        await this.ready;
        const normalized = typeof initialContent === 'string' ? initialContent : '';
        await this.withLock(async () => {
            const db = await this.dbPromise;
            const tx = db.transaction([HISTORY_FRAMES_STORE, HISTORY_SHA_STORE], 'readwrite');
            tx.objectStore(HISTORY_FRAMES_STORE).clear();
            tx.objectStore(HISTORY_SHA_STORE).clear();
            await waitForTransaction(tx);
            this.cache.clear();
            this.currentId = null;
            this.lastEntry = null;
            this.stats = {
                count: 0,
                byteSize: 0,
                latestTimestamp: null,
                latestLabel: null
            };
        });

        if (normalized.length > 0 || meta.forceInitial) {
            await this.record(normalized, {
                ...meta,
                reason: meta.reason || 'Initial snapshot',
                label: meta.label || 'Initial document',
                force: true
            });
        }
    }

    async readAllFrames(db) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(HISTORY_FRAMES_STORE, 'readonly');
            const store = tx.objectStore(HISTORY_FRAMES_STORE);
            const entries = [];
            const request = store.openCursor();
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    entries.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(entries);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    updateCache(seq, json) {
        if (!seq) {
            return;
        }

        if (this.cache.has(seq)) {
            this.cache.delete(seq);
        }

        this.cache.set(seq, json);
        while (this.cache.size > this.cacheLimit) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }

    async withLock(fn) {
        if (typeof localStorage === 'undefined') {
            return fn();
        }

        const expiry = Date.now() + HISTORY_LOCK_TTL;
        let acquired = false;
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const raw = localStorage.getItem(HISTORY_LOCK_KEY);
            if (!raw || Number(raw) < Date.now()) {
                try {
                    localStorage.setItem(HISTORY_LOCK_KEY, String(expiry));
                    acquired = true;
                    break;
                } catch (error) {
                    console.warn('[HISTORY] Failed to acquire lock', error);
                }
            }
            await delay(100);
        }

        if (!acquired) {
            return fn();
        }

        try {
            return await fn();
        } finally {
            if (localStorage.getItem(HISTORY_LOCK_KEY) === String(expiry)) {
                localStorage.removeItem(HISTORY_LOCK_KEY);
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
        return clone;
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
            // ignore
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
            const firstLines = content.split('\n').slice(0, 12).join('\n');
            return this.truncatePreview(firstLines);
        }
    }

    truncatePreview(content) {
        const limit = 480;
        if (content.length <= limit) {
            return content;
        }

        return `${content.slice(0, limit - 1)}…`;
    }

    async record(content, meta = {}) {
        await this.ready;
        const normalized = typeof content === 'string' ? content : '';
        const timestamp = Date.now();
        const manual = Boolean(meta.manual);
        const cleanMeta = this.cleanMeta(meta);
        const canonical = stableStringifyWireMock(normalized);
        const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
        const u8 = encoder ? encoder.encode(canonical) : new Uint8Array(Array.from(canonical, (c) => c.charCodeAt(0) & 0xff));
        const { hash, algorithm } = await sha256Hex(u8);

        const last = this.lastEntry;
        if (!manual && last && !meta.force) {
            const deltaLen = Math.abs(canonical.length - last.length);
            const deltaTime = timestamp - last.timestamp;
            if (deltaLen < MIN_DELTA_LEN && deltaTime < DEBOUNCE_MS) {
                return { recorded: false, reason: 'debounced', entry: null };
            }
        }

        return this.withLock(async () => {
            const db = await this.dbPromise;
            const tx = db.transaction([HISTORY_FRAMES_STORE, HISTORY_SHA_STORE], 'readwrite');
            const frames = tx.objectStore(HISTORY_FRAMES_STORE);
            const shaIndex = tx.objectStore(HISTORY_SHA_STORE);

            const shaMatch = await promisifyRequest(shaIndex.get(hash));
            if (shaMatch != null) {
                const seq = typeof shaMatch === 'object' && shaMatch.lastSeq ? shaMatch.lastSeq : shaMatch;
                const existing = seq != null ? await promisifyRequest(frames.get(seq)) : null;
                if (existing && existing.json === canonical) {
                    existing.occurrences = (existing.occurrences || 1) + 1;
                    existing.lastAt = timestamp;
                    if (manual && !existing.manual) {
                        existing.manual = true;
                    }
                    existing.meta = {
                        ...(existing.meta || {}),
                        ...cleanMeta,
                        manual: manual || existing.meta?.manual || existing.manual,
                        occurrences: existing.occurrences,
                        lastRecordedAt: new Date(timestamp).toISOString(),
                        hashAlgorithm: algorithm
                    };
                    await promisifyRequest(frames.put(existing));
                    await waitForTransaction(tx);

                    this.stats.latestTimestamp = timestamp;
                    this.stats.latestLabel = existing.label;
                    this.currentId = existing.id;
                    this.lastEntry = {
                        seq: existing.seq,
                        length: canonical.length,
                        timestamp,
                        manual: existing.manual
                    };
                    this.updateCache(existing.seq, canonical);
                    return { recorded: false, reason: 'duplicate', entry: this.normalizeEntry(existing) };
                }
            }

            const label = cleanMeta.label || this.deriveLabel(canonical, cleanMeta);
            const entry = {
                id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `hist-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
                ts: timestamp,
                kind: 'full',
                sha256: hash,
                shaAlgorithm: algorithm,
                byteSize: u8.byteLength,
                label,
                occurrences: 1,
                json: canonical,
                manual,
                meta: {
                    ...cleanMeta,
                    label,
                    reason: cleanMeta.reason || cleanMeta.action || 'Edit',
                    occurrences: 1,
                    firstRecordedAt: new Date(timestamp).toISOString(),
                    lastRecordedAt: new Date(timestamp).toISOString(),
                    hashAlgorithm: algorithm
                }
            };

            const seq = await promisifyRequest(frames.add(entry));
            entry.seq = seq;
            await promisifyRequest(shaIndex.put({ sha256: hash, lastSeq: seq }));
            await waitForTransaction(tx);

            this.updateCache(seq, canonical);
            this.currentId = entry.id;
            this.lastEntry = { seq, length: canonical.length, timestamp, manual };
            this.stats.count += 1;
            this.stats.byteSize += entry.byteSize;
            this.stats.latestTimestamp = timestamp;
            this.stats.latestLabel = label;

            await this.enforceBudget({ withinLock: true, db });

            return { recorded: true, entry: this.normalizeEntry(entry) };
        });
    }

    normalizeEntry(raw) {
        const content = typeof raw.json === 'string' ? raw.json : '';
        return {
            id: raw.id,
            seq: raw.seq,
            timestamp: raw.ts,
            content,
            label: raw.label,
            preview: this.buildPreview(content),
            byteSize: raw.byteSize,
            sizeLabel: formatBytes(raw.byteSize || 0),
            meta: {
                ...(raw.meta || {}),
                occurrences: raw.occurrences || 1,
                recordedAt: new Date(raw.ts).toISOString()
            }
        };
    }

    async getEntries(options = {}) {
        await this.ready;
        const newestFirst = options.newestFirst === true;
        const db = await this.dbPromise;
        const entries = await this.readAllFrames(db);
        const normalized = entries.map((entry) => this.normalizeEntry(entry));
        normalized.sort((a, b) => (newestFirst ? b.timestamp - a.timestamp : a.timestamp - b.timestamp));
        if (options.limit) {
            return normalized.slice(0, options.limit);
        }
        return normalized;
    }

    async getStats() {
        await this.ready;
        return { ...this.stats };
    }

    getCurrentId() {
        return this.currentId;
    }

    async getEntryById(id) {
        await this.ready;
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(HISTORY_FRAMES_STORE, 'readonly');
            const store = tx.objectStore(HISTORY_FRAMES_STORE);
            const index = store.index('id');
            const request = index.get(id);
            request.onsuccess = () => {
                resolve(request.result ? this.normalizeEntry(request.result) : null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    markCurrent(id) {
        this.currentId = id;
    }

    async clear(options = {}) {
        await this.ready;
        const keepLatest = options.keepLatest !== false;
        const latestContent = options.latestContent || '';
        const label = options.label || 'Current document';

        let preserved = null;
        if (keepLatest) {
            const latestEntries = await this.getEntries({ newestFirst: true, limit: 1 });
            preserved = latestEntries[0] || null;
        }

        await this.withLock(async () => {
            const db = await this.dbPromise;
            const tx = db.transaction([HISTORY_FRAMES_STORE, HISTORY_SHA_STORE], 'readwrite');
            tx.objectStore(HISTORY_FRAMES_STORE).clear();
            tx.objectStore(HISTORY_SHA_STORE).clear();
            await waitForTransaction(tx);
        });

        this.cache.clear();
        this.currentId = null;
        this.lastEntry = null;
        this.stats = {
            count: 0,
            byteSize: 0,
            latestTimestamp: null,
            latestLabel: null
        };

        if (preserved) {
            await this.record(preserved.content, {
                ...preserved.meta,
                label: preserved.label,
                reason: 'Preserved latest snapshot',
                manual: Boolean(preserved.meta?.manual),
                force: true
            });
        } else if (keepLatest && latestContent) {
            await this.record(latestContent, {
                label,
                reason: 'Current document',
                force: true
            });
        }
    }

    async enforceBudget(options = {}) {
        await this.ready;
        if (this.stats.byteSize <= this.budgetBytes) {
            return;
        }

        const run = async (db) => {
            const entries = await this.readAllFrames(db);
            if (!entries.length) {
                return;
            }

            const latestSeq = entries[entries.length - 1].seq;
            const manualSeq = new Set(entries.filter((entry) => entry.manual).map((entry) => entry.seq));
            const keepSeq = new Set([latestSeq]);

            const bucketKeep = new Map();
            const now = Date.now();
            for (const entry of entries) {
                if (manualSeq.has(entry.seq)) {
                    keepSeq.add(entry.seq);
                    continue;
                }

                const age = now - entry.ts;
                let bucketSize;
                if (age <= 60 * 60 * 1000) {
                    bucketSize = 60 * 1000;
                } else if (age <= 24 * 60 * 60 * 1000) {
                    bucketSize = 10 * 60 * 1000;
                } else if (age <= 7 * 24 * 60 * 60 * 1000) {
                    bucketSize = 60 * 60 * 1000;
                } else {
                    bucketSize = 24 * 60 * 60 * 1000;
                }

                const bucketKey = `${bucketSize}:${Math.floor(entry.ts / bucketSize)}`;
                const existing = bucketKeep.get(bucketKey);
                if (!existing || existing.ts < entry.ts) {
                    bucketKeep.set(bucketKey, { seq: entry.seq, ts: entry.ts });
                }
            }

            for (const value of bucketKeep.values()) {
                keepSeq.add(value.seq);
            }

            const deletable = entries
                .filter((entry) => !keepSeq.has(entry.seq) && !manualSeq.has(entry.seq))
                .sort((a, b) => a.ts - b.ts);

            if (!deletable.length) {
                return;
            }

            const tx = db.transaction([HISTORY_FRAMES_STORE, HISTORY_SHA_STORE], 'readwrite');
            const frames = tx.objectStore(HISTORY_FRAMES_STORE);
            const shaIndex = tx.objectStore(HISTORY_SHA_STORE);

            for (const entry of deletable) {
                await promisifyRequest(frames.delete(entry.seq));
                this.stats.byteSize -= entry.byteSize || 0;
                this.stats.count -= 1;

                const shaRecord = await promisifyRequest(shaIndex.get(entry.sha256));
                if (shaRecord && (shaRecord.lastSeq === entry.seq || shaRecord === entry.seq)) {
                    const next = entries
                        .filter((candidate) => candidate.sha256 === entry.sha256 && candidate.seq !== entry.seq)
                        .sort((a, b) => b.seq - a.seq)[0];
                    if (next) {
                        await promisifyRequest(shaIndex.put({ sha256: entry.sha256, lastSeq: next.seq }));
                    } else {
                        await promisifyRequest(shaIndex.delete(entry.sha256));
                    }
                }

                if (this.stats.byteSize <= this.budgetBytes) {
                    break;
                }
            }

            await waitForTransaction(tx);

            if (this.stats.byteSize <= 0 || this.stats.count <= 0) {
                this.stats = {
                    count: 0,
                    byteSize: 0,
                    latestTimestamp: null,
                    latestLabel: null
                };
                this.currentId = null;
                this.lastEntry = null;
            } else {
                const remaining = await this.readAllFrames(db);
                if (remaining.length) {
                    this.stats.count = remaining.length;
                    this.stats.byteSize = remaining.reduce((acc, entry) => acc + (entry.byteSize || 0), 0);
                    const latest = remaining[remaining.length - 1];
                    this.currentId = latest.id;
                    this.lastEntry = {
                        seq: latest.seq,
                        length: latest.json.length,
                        timestamp: latest.ts,
                        manual: Boolean(latest.manual)
                    };
                    this.stats.latestTimestamp = latest.ts;
                    this.stats.latestLabel = latest.label;
                } else {
                    this.stats = {
                        count: 0,
                        byteSize: 0,
                        latestTimestamp: null,
                        latestLabel: null
                    };
                    this.currentId = null;
                    this.lastEntry = null;
                }
            }
        };

        if (options.withinLock && options.db) {
            await run(options.db);
            return;
        }

        await this.withLock(async () => {
            const db = await this.dbPromise;
            await run(db);
        });
    }

    // Phase 2 Optimization: Cleanup old history entries
    // Follows Dexie.js and React Query TTL patterns
    async cleanup(options = {}) {
        const maxAgeMs = options.maxAgeMs || 30 * 24 * 60 * 60 * 1000; // 30 days default
        const maxEntries = options.maxEntries || 50; // Max 50 entries default

        await this.ready;

        await this.withLock(async () => {
            const db = await this.dbPromise;
            const tx = db.transaction(HISTORY_FRAMES_STORE, 'readwrite');
            const store = tx.objectStore(HISTORY_FRAMES_STORE);
            const tsIndex = store.index('ts');

            // 1. Delete entries older than maxAgeMs (time-based cleanup)
            const cutoffTime = Date.now() - maxAgeMs;
            const oldRange = IDBKeyRange.upperBound(cutoffTime);
            let deletedByAge = 0;

            const oldCursor = tsIndex.openCursor(oldRange);
            await new Promise((resolve, reject) => {
                oldCursor.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        deletedByAge++;
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                oldCursor.onerror = () => reject(oldCursor.error);
            });

            await waitForTransaction(tx);

            // 2. Limit total entries (size-based cleanup)
            const tx2 = db.transaction(HISTORY_FRAMES_STORE, 'readwrite');
            const store2 = tx2.objectStore(HISTORY_FRAMES_STORE);
            const countRequest = store2.count();
            const count = await promisifyRequest(countRequest);

            let deletedBySize = 0;
            if (count > maxEntries) {
                const toDelete = count - maxEntries;
                const cursor = store2.openCursor();

                await new Promise((resolve, reject) => {
                    let deleted = 0;
                    cursor.onsuccess = (event) => {
                        const cur = event.target.result;
                        if (cur && deleted < toDelete) {
                            cur.delete();
                            deleted++;
                            deletedBySize++;
                            cur.continue();
                        } else {
                            resolve();
                        }
                    };
                    cursor.onerror = () => reject(cursor.error);
                });
            }

            await waitForTransaction(tx2);

            const totalDeleted = deletedByAge + deletedBySize;
            if (totalDeleted > 0) {
                console.log(`✅ [HISTORY] Cleanup completed: deleted ${deletedByAge} old entries (>${Math.round(maxAgeMs / 86400000)}d) + ${deletedBySize} excess entries`);

                // Update stats
                const remaining = await this.readAllFrames(db);
                this.stats.count = remaining.length;
                this.stats.byteSize = remaining.reduce((acc, entry) => acc + (entry.byteSize || 0), 0);

                if (remaining.length > 0) {
                    const latest = remaining[remaining.length - 1];
                    this.stats.latestTimestamp = latest.ts;
                    this.stats.latestLabel = latest.label;
                } else {
                    this.stats.latestTimestamp = null;
                    this.stats.latestLabel = null;
                    this.currentId = null;
                    this.lastEntry = null;
                }

                console.log(`📊 [HISTORY] Stats after cleanup: ${this.stats.count} entries, ${(this.stats.byteSize / 1024 / 1024).toFixed(2)} MB`);
            }
        });
    }

    // Phase 2: Schedule periodic cleanup
    scheduleCleanup(intervalMs = 24 * 60 * 60 * 1000, options = {}) {
        // Run cleanup once per day by default
        const cleanup = async () => {
            try {
                await this.cleanup(options);
            } catch (error) {
                console.error('[HISTORY] Cleanup failed:', error);
            }
        };

        // Run initial cleanup after 10 seconds
        setTimeout(cleanup, 10000);

        // Schedule periodic cleanup
        const interval = setInterval(cleanup, intervalMs);

        console.log(`✅ [HISTORY] Cleanup scheduled: every ${Math.round(intervalMs / 3600000)}h, max age ${Math.round((options.maxAgeMs || 30 * 24 * 60 * 60 * 1000) / 86400000)}d, max ${options.maxEntries || 50} entries`);

        return interval;
    }
}

