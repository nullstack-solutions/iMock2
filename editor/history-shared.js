'use strict';

(function (global) {
    const NOISE_FIELDS = new Set(['id', 'uuid', 'updatedAt', 'insertionIndex']);
    const DEFAULT_KEYFRAME_THRESHOLD = 256 * 1024;
    const DEFAULT_MAX_OPS = 5000;
    const DEFAULT_DIFF_TIMEOUT = 75;

    const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

    function encodeUtf8(value) {
        const text = typeof value === 'string' ? value : (value == null ? '' : String(value));
        if (textEncoder) {
            return textEncoder.encode(text);
        }
        const result = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) {
            result[i] = text.charCodeAt(i) & 0xff;
        }
        return result;
    }

    function normalizeLineEndings(value) {
        return typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : value;
    }

    function sortObjectKeys(obj) {
        const sorted = {};
        Object.keys(obj).sort().forEach((key) => {
            sorted[key] = obj[key];
        });
        return sorted;
    }

    function getParentKey(path) {
        return path.length >= 1 ? path[path.length - 1] : null;
    }

    function shouldIgnoreField(parentKey, key) {
        if (NOISE_FIELDS.has(key)) {
            return true;
        }
        if (parentKey === 'response' && (key === 'wasMatched' || key === 'fromConfiguredStub')) {
            return true;
        }
        return false;
    }

    function normalizeHeaders(headers, path) {
        if (!headers || typeof headers !== 'object') {
            return headers;
        }
        const normalized = {};
        Object.keys(headers).forEach((headerKey) => {
            const lowerKey = headerKey.toLowerCase();
            normalized[lowerKey] = normalizeNode(headers[headerKey], path.concat(lowerKey));
        });
        return sortObjectKeys(normalized);
    }

    function mappingSortKey(mapping) {
        if (!mapping || typeof mapping !== 'object') {
            return '';
        }
        if (mapping.name) {
            return String(mapping.name).toLowerCase();
        }
        const request = mapping.request || {};
        const method = (request.method || '').toLowerCase();
        const url = (request.url || request.urlPath || request.urlPattern || request.urlPathPattern || '').toLowerCase();
        const combined = `${method} ${url}`.trim();
        return combined;
    }

    function sortMappings(mappings, path) {
        const normalised = mappings.map((item, index) => normalizeNode(item, path.concat(index)));
        normalised.sort((a, b) => mappingSortKey(a).localeCompare(mappingSortKey(b)));
        return normalised;
    }

    function bodyPatternSortKey(pattern) {
        if (!pattern || typeof pattern !== 'object') {
            return '';
        }
        const keys = Object.keys(pattern).sort();
        if (keys.length === 0) {
            return '';
        }
        return keys[0];
    }

    function sortBodyPatterns(patterns, path) {
        const normalised = patterns.map((item, index) => normalizeNode(item, path.concat(index)));
        normalised.sort((a, b) => {
            const typeCompare = bodyPatternSortKey(a).localeCompare(bodyPatternSortKey(b));
            if (typeCompare !== 0) {
                return typeCompare;
            }
            const stringA = stableStringify(a);
            const stringB = stableStringify(b);
            return stringA.localeCompare(stringB);
        });
        return normalised;
    }

    function normalizeNode(value, path = []) {
        if (value == null) {
            return value;
        }

        if (typeof value === 'string') {
            return normalizeLineEndings(value);
        }

        if (typeof value !== 'object') {
            return value;
        }

        if (Array.isArray(value)) {
            const parentKey = getParentKey(path);
            if (parentKey === 'mappings') {
                return sortMappings(value, path);
            }
            if (parentKey === 'bodyPatterns') {
                return sortBodyPatterns(value, path);
            }
            return value.map((item, index) => normalizeNode(item, path.concat(index)));
        }

        const parentKey = getParentKey(path);
        const normalizedObject = {};
        Object.keys(value)
            .filter((key) => !shouldIgnoreField(parentKey, key))
            .sort()
            .forEach((key) => {
                if (key === 'headers') {
                    normalizedObject[key] = normalizeHeaders(value[key], path.concat(key));
                } else if (key === 'transformerParameters') {
                    const normalised = normalizeNode(value[key], path.concat(key));
                    normalizedObject[key] = sortObjectKeys(normalised);
                } else {
                    normalizedObject[key] = normalizeNode(value[key], path.concat(key));
                }
            });

        return normalizedObject;
    }

    function parseContent(content) {
        if (typeof content === 'string') {
            return JSON.parse(content);
        }
        if (content && typeof content === 'object') {
            return content;
        }
        return {};
    }

    function stableStringify(root) {
        const stack = [];
        const output = [];
        stack.push({ value: root, stage: 0, iterator: null, key: null });

        while (stack.length) {
            const frame = stack.pop();
            const { value, stage } = frame;

            if (stage === 0) {
                if (value == null) {
                    output.push('null');
                    continue;
                }

                if (typeof value === 'string') {
                    output.push(JSON.stringify(value));
                    continue;
                }

                if (typeof value === 'number') {
                    output.push(Number.isFinite(value) ? String(value) : 'null');
                    continue;
                }

                if (typeof value === 'boolean') {
                    output.push(value ? 'true' : 'false');
                    continue;
                }

                if (Array.isArray(value)) {
                    output.push('[');
                    if (value.length === 0) {
                        output.push(']');
                        continue;
                    }
                    frame.stage = 1;
                    frame.index = 0;
                    stack.push(frame);
                    stack.push({ value: value[0], stage: 0 });
                    continue;
                }

                if (typeof value === 'object') {
                    const keys = Object.keys(value);
                    output.push('{');
                    if (keys.length === 0) {
                        output.push('}');
                        continue;
                    }
                    keys.sort();
                    frame.stage = 2;
                    frame.keys = keys;
                    frame.index = 0;
                    stack.push(frame);
                    const firstKey = keys[0];
                    output.push(JSON.stringify(firstKey));
                    output.push(':');
                    stack.push({ value: value[firstKey], stage: 0 });
                    continue;
                }

                output.push('null');
                continue;
            }

            if (stage === 1) {
                const arr = frame.value;
                const nextIndex = ++frame.index;
                if (nextIndex < arr.length) {
                    output.push(',');
                    stack.push(frame);
                    stack.push({ value: arr[nextIndex], stage: 0 });
                } else {
                    output.push(']');
                }
                continue;
            }

            if (stage === 2) {
                const obj = frame.value;
                const keys = frame.keys;
                const nextIndex = ++frame.index;
                if (nextIndex < keys.length) {
                    output.push(',');
                    const key = keys[nextIndex];
                    output.push(JSON.stringify(key));
                    output.push(':');
                    stack.push(frame);
                    stack.push({ value: obj[key], stage: 0 });
                } else {
                    output.push('}');
                }
            }
        }

        return output.join('');
    }

    function pointerFromPath(path) {
        if (!path || path.length === 0) {
            return '';
        }
        return '/' + path.map(segment => String(segment).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
    }

    function diffDocuments(base, target, options = {}) {
        const ops = [];
        const maxOps = options.maxOps != null ? options.maxOps : DEFAULT_MAX_OPS;
        const maxDuration = options.maxDurationMs != null ? options.maxDurationMs : DEFAULT_DIFF_TIMEOUT;
        const startTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        let truncated = false;
        let timedOut = false;

        function now() {
            return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        }

        function walk(a, b, path) {
            if (truncated || timedOut) {
                return;
            }

            if (ops.length >= maxOps) {
                truncated = true;
                return;
            }

            if (now() - startTime > maxDuration) {
                timedOut = true;
                return;
            }

            if (a === b) {
                return;
            }

            const typeA = typeof a;
            const typeB = typeof b;

            if (typeA !== 'object' || typeB !== 'object' || a == null || b == null) {
                ops.push({ op: 'replace', path: pointerFromPath(path), value: b });
                return;
            }

            const isArrayA = Array.isArray(a);
            const isArrayB = Array.isArray(b);

            if (isArrayA !== isArrayB) {
                ops.push({ op: 'replace', path: pointerFromPath(path), value: b });
                return;
            }

            if (isArrayA && isArrayB) {
                const maxLength = Math.max(a.length, b.length);
                for (let i = 0; i < maxLength && !truncated && !timedOut; i++) {
                    if (i >= a.length) {
                        ops.push({ op: 'add', path: pointerFromPath(path.concat(i)), value: b[i] });
                    } else if (i >= b.length) {
                        ops.push({ op: 'remove', path: pointerFromPath(path.concat(i)) });
                    } else {
                        walk(a[i], b[i], path.concat(i));
                    }
                }
                return;
            }

            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            const keySet = new Set([...keysA, ...keysB]);
            const allKeys = Array.from(keySet).sort();

            for (let i = 0; i < allKeys.length && !truncated && !timedOut; i++) {
                const key = allKeys[i];
                const hasA = Object.prototype.hasOwnProperty.call(a, key);
                const hasB = Object.prototype.hasOwnProperty.call(b, key);
                if (!hasB) {
                    ops.push({ op: 'remove', path: pointerFromPath(path.concat(key)) });
                } else if (!hasA) {
                    ops.push({ op: 'add', path: pointerFromPath(path.concat(key)), value: b[key] });
                } else {
                    walk(a[key], b[key], path.concat(key));
                }
            }
        }

        walk(base, target, []);

        return {
            operations: ops,
            opCount: ops.length,
            truncated,
            timedOut
        };
    }

    const K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);

    function sha256Fallback(bytes) {
        const length = bytes.length;
        const words = new Uint32Array(((length + 9 + 63) >> 6) << 4);
        for (let i = 0; i < length; i++) {
            words[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
        }
        words[length >> 2] |= 0x80 << (24 - (length & 3) * 8);
        words[words.length - 1] = length << 3;

        const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);

        const w = new Uint32Array(64);
        for (let i = 0; i < words.length; i += 16) {
            for (let t = 0; t < 16; t++) {
                w[t] = words[i + t];
            }
            for (let t = 16; t < 64; t++) {
                const s0 = ((w[t - 15] >>> 7) | (w[t - 15] << 25)) ^ ((w[t - 15] >>> 18) | (w[t - 15] << 14)) ^ (w[t - 15] >>> 3);
                const s1 = ((w[t - 2] >>> 17) | (w[t - 2] << 15)) ^ ((w[t - 2] >>> 19) | (w[t - 2] << 13)) ^ (w[t - 2] >>> 10);
                w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
            }

            let a = H[0];
            let b = H[1];
            let c = H[2];
            let d = H[3];
            let e = H[4];
            let f = H[5];
            let g = H[6];
            let h = H[7];

            for (let t = 0; t < 64; t++) {
                const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
                const ch = (e & f) ^ (~e & g);
                const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
                const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const temp2 = (S0 + maj) >>> 0;

                h = g;
                g = f;
                f = e;
                e = (d + temp1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (temp1 + temp2) >>> 0;
            }

            H[0] = (H[0] + a) >>> 0;
            H[1] = (H[1] + b) >>> 0;
            H[2] = (H[2] + c) >>> 0;
            H[3] = (H[3] + d) >>> 0;
            H[4] = (H[4] + e) >>> 0;
            H[5] = (H[5] + f) >>> 0;
            H[6] = (H[6] + g) >>> 0;
            H[7] = (H[7] + h) >>> 0;
        }

        let hex = '';
        for (let i = 0; i < H.length; i++) {
            hex += ('00000000' + H[i].toString(16)).slice(-8);
        }
        return hex;
    }

    async function computeSha256(bytes, env = {}) {
        const allowWebCrypto = env.allowWebCrypto !== false && typeof crypto !== 'undefined' && crypto && crypto.subtle;
        if (allowWebCrypto) {
            try {
                const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                const digest = await crypto.subtle.digest('SHA-256', buffer);
                const resultArray = new Uint8Array(digest);
                let hex = '';
                for (let i = 0; i < resultArray.length; i++) {
                    hex += ('00' + resultArray[i].toString(16)).slice(-2);
                }
                return hex;
            } catch (error) {
                // Fall back to JS implementation
            }
        }
        return sha256Fallback(bytes);
    }

    function prepareCanonical(content, options = {}) {
        const parsed = parseContent(content);
        const normalized = normalizeNode(parsed, []);
        const canonical = stableStringify(normalized);
        const canonicalBytes = encodeUtf8(canonical);
        const rawBytes = encodeUtf8(typeof content === 'string' ? content : JSON.stringify(content));
        return { normalized, canonical, canonicalBytes, rawBytes };
    }

    async function generateSnapshot(content, previousSnapshot, options = {}, env = {}) {
        const settings = {
            keyframeByteThreshold: DEFAULT_KEYFRAME_THRESHOLD,
            maxOps: DEFAULT_MAX_OPS,
            diffTimeoutMs: DEFAULT_DIFF_TIMEOUT,
            forceKeyframe: false,
            emitNormalized: false,
            ...options
        };

        const canonicalData = prepareCanonical(content, settings);
        const hash = await computeSha256(canonicalData.canonicalBytes, env);

        const result = {
            snapshotType: 'keyframe',
            canonical: canonicalData.canonical,
            hash,
            byteSize: canonicalData.canonicalBytes.length,
            rawByteSize: canonicalData.rawBytes.length,
            diff: null,
            meta: {
                keyframeReason: previousSnapshot ? 'forced' : 'initial',
                timedOut: false
            },
            normalized: settings.emitNormalized ? canonicalData.normalized : undefined
        };

        if (previousSnapshot && previousSnapshot.hash === hash && !settings.forceKeyframe) {
            result.snapshotType = 'unchanged';
            return result;
        }

        if (previousSnapshot && !settings.forceKeyframe) {
            if (result.byteSize > settings.keyframeByteThreshold) {
                result.meta.keyframeReason = 'size-threshold';
            } else {
                let baseNormalized = previousSnapshot.normalized;
                if (!baseNormalized) {
                    baseNormalized = JSON.parse(previousSnapshot.canonical);
                }
                const diffResult = diffDocuments(baseNormalized, canonicalData.normalized, {
                    maxOps: settings.maxOps,
                    maxDurationMs: settings.diffTimeoutMs
                });

                if (diffResult.opCount === 0) {
                    result.snapshotType = 'unchanged';
                    return result;
                }

                if (diffResult.timedOut) {
                    result.meta.keyframeReason = 'diff-timeout';
                } else if (diffResult.truncated || diffResult.opCount > settings.maxOps) {
                    result.meta.keyframeReason = 'diff-op-threshold';
                } else {
                    result.snapshotType = 'patch';
                    result.meta.keyframeReason = 'diff';
                    result.diff = {
                        operations: diffResult.operations,
                        opCount: diffResult.opCount,
                        patchByteSize: encodeUtf8(JSON.stringify(diffResult.operations)).length,
                        timedOut: diffResult.timedOut,
                        truncated: diffResult.truncated
                    };
                }
            }
        }

        if (result.snapshotType === 'keyframe' && result.meta.keyframeReason === 'forced' && !previousSnapshot) {
            result.meta.keyframeReason = 'initial';
        }

        return result;
    }

    global.HistoryShared = {
        normalizeNode,
        stableStringify,
        prepareCanonical,
        diffDocuments,
        computeSha256,
        generateSnapshot,
        encodeUtf8,
        DEFAULT_KEYFRAME_THRESHOLD,
        DEFAULT_MAX_OPS,
        DEFAULT_DIFF_TIMEOUT
    };
})(typeof self !== 'undefined' ? self : window);

