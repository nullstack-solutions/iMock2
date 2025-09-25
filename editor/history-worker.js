'use strict';

importScripts('history-shared.js');

let lastSnapshotCache = null;
let messageIdCounter = 0;

self.onmessage = async (event) => {
    const data = event.data || {};
    const type = data.type;
    const taskId = data.id != null ? data.id : ++messageIdCounter;

    if (type === 'snapshot') {
        try {
            const payload = data.payload || {};
            const previous = payload.previousSnapshot || null;
            let snapshotInput = previous;
            if (snapshotInput && lastSnapshotCache && lastSnapshotCache.hash === snapshotInput.hash) {
                snapshotInput = {
                    ...snapshotInput,
                    normalized: lastSnapshotCache.normalized,
                    format: lastSnapshotCache.format
                };
            }

            const options = Object.assign({}, payload.options || {}, { emitNormalized: true });
            const result = await HistoryShared.generateSnapshot(payload.content, snapshotInput, options, payload.env || {});

            lastSnapshotCache = {
                hash: result.hash,
                canonical: result.canonical,
                normalized: result.normalized,
                format: result.meta && result.meta.format ? result.meta.format : undefined
            };

            const { normalized, ...publicResult } = result;
            self.postMessage({ id: taskId, result: publicResult });
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            self.postMessage({ id: taskId, error: message });
        }
        return;
    }

    if (type === 'reset-cache') {
        lastSnapshotCache = null;
        self.postMessage({ id: taskId, result: { cleared: true } });
    }
};
