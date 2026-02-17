'use strict';

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

const HISTORY_SUMMARY_MAX_CHANGES = 8;
const HISTORY_SUMMARY_MODAL_CHANGES = 20;
const HISTORY_SUMMARY_MAX_DEPTH = 4;
const HISTORY_SUMMARY_BRANCH_LIMIT = 20;

function safeParseSnapshot(content) {
    if (typeof content !== 'string') {
        return null;
    }

    try {
        return JSON.parse(content);
    } catch (error) {
        return null;
    }
}

function formatHistoryLeafValue(value) {
    if (value === undefined) {
        return '—';
    }

    if (value === null) {
        return 'null';
    }

    if (typeof value === 'string') {
        const trimmed = value.length > 80 ? `${value.slice(0, 77)}…` : value;
        return `"${trimmed}"`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '[]';
        }
        const simple = value.every((item) => item == null || ['string', 'number', 'boolean'].includes(typeof item));
        if (simple && value.length <= 5) {
            return `[${value.map((item) => formatHistoryLeafValue(item)).join(', ')}]`;
        }
        return `[${value.length} items]`;
    }

    if (typeof value === 'object') {
        const keys = Object.keys(value || {});
        if (!keys.length) {
            return '{}';
        }
        return `{${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', …' : ''}}`;
    }

    return String(value);
}

function flattenSnapshotForSummary(value, target, path = '', depth = 0) {
    if (depth >= HISTORY_SUMMARY_MAX_DEPTH || value == null || typeof value !== 'object') {
        target.set(path || '(root)', formatHistoryLeafValue(value));
        return;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            target.set(path || '(root)', '[]');
            return;
        }

        const length = Math.min(value.length, HISTORY_SUMMARY_BRANCH_LIMIT);
        for (let index = 0; index < length; index += 1) {
            const childPath = path ? `${path}[${index}]` : `[${index}]`;
            flattenSnapshotForSummary(value[index], target, childPath, depth + 1);
        }
        return;
    }

    const keys = Object.keys(value);
    if (!keys.length) {
        target.set(path || '(root)', '{}');
        return;
    }

    const sortedKeys = keys.sort((a, b) => a.localeCompare(b)).slice(0, HISTORY_SUMMARY_BRANCH_LIMIT);
    for (const key of sortedKeys) {
        const childPath = path ? `${path}.${key}` : key;
        flattenSnapshotForSummary(value[key], target, childPath, depth + 1);
    }
}

function summarizeHistoryChanges(currentContent, previousContent, options = {}) {
    const limit = typeof options.limit === 'number' ? options.limit : HISTORY_SUMMARY_MAX_CHANGES;
    const currentParsed = safeParseSnapshot(currentContent);
    const previousParsed = safeParseSnapshot(previousContent);

    if (!currentParsed) {
        const currentLength = typeof currentContent === 'string' ? currentContent.length : 0;
        if (previousParsed) {
            return `Snapshot replaced with non-JSON content (${currentLength} chars)`;
        }

        const previousLength = typeof previousContent === 'string' ? previousContent.length : 0;
        if (previousContent == null) {
            return `Snapshot captured (non-JSON, ${currentLength} chars)`;
        }

        if (typeof previousContent === 'string' && previousContent === currentContent) {
            return 'No textual changes detected';
        }

        return `Content changed (${previousLength} → ${currentLength} chars)`;
    }

    const currentMap = new Map();
    flattenSnapshotForSummary(currentParsed, currentMap);

    const previousMap = new Map();
    if (previousParsed) {
        flattenSnapshotForSummary(previousParsed, previousMap);
    }

    const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
    const sortedKeys = Array.from(keys).sort((a, b) => a.localeCompare(b));

    const lines = [];
    let hidden = 0;

    for (const key of sortedKeys) {
        const prevValue = previousMap.has(key) ? previousMap.get(key) : undefined;
        const nextValue = currentMap.has(key) ? currentMap.get(key) : undefined;
        if (prevValue === nextValue) {
            continue;
        }

        const label = key || '(root)';
        let line;
        if (typeof prevValue === 'undefined') {
            line = `${label}: ++ ${nextValue}`;
        } else if (typeof nextValue === 'undefined') {
            line = `${label}: -- ${prevValue}`;
        } else {
            line = `${label}: ${prevValue} → ${nextValue}`;
        }

        if (lines.length < limit) {
            lines.push(line);
        } else {
            hidden += 1;
        }
    }

    if (!lines.length) {
        if (previousContent == null) {
            return 'Snapshot captured';
        }
        return 'No field-level changes detected';
    }

    if (hidden > 0) {
        lines.push(`…and ${hidden} more change${hidden === 1 ? '' : 's'}`);
    }

    return lines.join('\n');
}

function formatHistoryFullContent(content) {
    if (typeof content !== 'string') {
        return '';
    }

    const parsed = safeParseSnapshot(content);
    if (parsed != null) {
        try {
            return JSON.stringify(parsed, null, 2);
        } catch (error) {
            // ignore
        }
    }

    return content;
}

function renderHistoryPreviewMeta(container, rows) {
    if (!container) {
        return;
    }

    container.innerHTML = '';
    rows.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'history-preview-meta__row';

        const labelEl = document.createElement('span');
        labelEl.className = 'history-preview-meta__label';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.className = 'history-preview-meta__value';
        valueEl.textContent = value;

        row.appendChild(labelEl);
        row.appendChild(valueEl);
        container.appendChild(row);
    });
}

function openHistoryPreview(entry, previousEntry) {
    const modal = document.getElementById('historyPreviewModal');
    if (!modal || !entry) {
        return;
    }

    const initializer = window.monacoInitializer;

    const title = modal.querySelector('#modal-title-history-preview');
    if (title) {
        title.textContent = entry.label || 'Snapshot preview';
    }

    const meta = modal.querySelector('#historyPreviewMeta');
    const occurrences = entry.meta?.occurrences || 1;
    renderHistoryPreviewMeta(meta, [
        ['Saved', `${formatRelativeTime(entry.timestamp)} · ${new Date(entry.timestamp).toLocaleString()}`],
        ['Reason', entry.meta?.reason || 'edit'],
        ['Size', entry.sizeLabel || formatBytes(entry.byteSize || (entry.content ? entry.content.length : 0))],
        ['Occurrences', `${occurrences}×`]
    ]);

    const summary = modal.querySelector('#historyPreviewSummary');
    if (summary) {
        summary.textContent = summarizeHistoryChanges(
            entry.content,
            previousEntry ? previousEntry.content : null,
            { limit: HISTORY_SUMMARY_MODAL_CHANGES }
        );
    }

    const content = modal.querySelector('#historyPreviewContent');
    if (content) {
        content.textContent = formatHistoryFullContent(entry.content);
    }

    const actions = modal.querySelector('#historyPreviewActions');
    if (actions) {
        actions.dataset.currentContent = entry.content || '';
        actions.dataset.entryId = entry.id || '';

        const restoreButton = actions.querySelector('[data-history-preview-action="restore"]');
        if (restoreButton) {
            const currentEntryId = initializer && typeof initializer.getCurrentHistoryEntryId === 'function'
                ? initializer.getCurrentHistoryEntryId()
                : null;
            const isCurrent = currentEntryId && entry.id === currentEntryId;
            restoreButton.disabled = Boolean(isCurrent);
            restoreButton.textContent = isCurrent ? 'Current version' : 'Restore';
        }

        if (!actions.dataset.bound) {
            actions.dataset.bound = 'true';
            actions.addEventListener('click', async (event) => {
                const button = event.target instanceof HTMLElement ? event.target.closest('[data-history-preview-action]') : null;
                if (!button) {
                    return;
                }

                event.preventDefault();
                if (button.dataset.historyPreviewAction === 'copy') {
                    const snapshotContent = actions.dataset.currentContent || '';
                    const success = await copyTextToClipboard(snapshotContent);
                    if (initializer && typeof initializer.showNotification === 'function') {
                        initializer.showNotification(
                            success ? 'Snapshot copied to clipboard' : 'Failed to copy snapshot',
                            success ? 'success' : 'error'
                        );
                    }
                    return;
                }

                if (button.dataset.historyPreviewAction === 'restore') {
                    if (!initializer || typeof initializer.restoreHistoryEntry !== 'function') {
                        return;
                    }

                    const targetId = actions.dataset.entryId;
                    if (!targetId || button.disabled) {
                        return;
                    }

                    const originalLabel = button.textContent;
                    button.disabled = true;

                    try {
                        await initializer.restoreHistoryEntry(targetId, { forceRestore: false, requireConfirm: true });
                    } catch (error) {
                        console.error('[HISTORY] Failed to restore entry from preview', error);
                        button.disabled = false;
                        button.textContent = originalLabel;
                        return;
                    }

                    const currentEntryId = typeof initializer.getCurrentHistoryEntryId === 'function'
                        ? initializer.getCurrentHistoryEntryId()
                        : null;
                    const isCurrent = currentEntryId && targetId === currentEntryId;
                    if (!isCurrent) {
                        button.disabled = false;
                        button.textContent = originalLabel;
                    } else {
                        button.textContent = 'Current version';
                    }
                }
            });
        }
    }

    window.openModal('historyPreviewModal');
}

async function renderHistoryModal(options = {}) {
    const modal = document.getElementById('historyModal');
    if (!modal) {
        return;
    }

    const initializer = window.monacoInitializer;
    if (!initializer) {
        return;
    }

    try {
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

        const stats = await initializer.getHistoryStats();
        const approxSize = formatBytes(stats.byteSize);
        const lastSaved = stats.latestTimestamp
            ? `${formatRelativeTime(stats.latestTimestamp)} (${new Date(stats.latestTimestamp).toLocaleString()})`
            : '—';
        const latestLabel = stats.latestLabel || '—';
        const safeApproxSize = window.Utils.escapeHtml(approxSize);
        const safeLastSaved = window.Utils.escapeHtml(lastSaved);
        const safeLatestLabel = window.Utils.escapeHtml(latestLabel);
        const safeCount = typeof stats.count === 'number' ? stats.count : window.Utils.escapeHtml(String(stats.count || '—'));

        statsContainer.innerHTML = `
            <div class="history-meta">
                <span class="history-meta__label">Snapshots</span>
                <span>${safeCount}</span>
            </div>
            <div class="history-meta">
                <span class="history-meta__label">Approx size</span>
                <span>${safeApproxSize}</span>
            </div>
            <div class="history-meta">
                <span class="history-meta__label">Last save</span>
                <span>${safeLastSaved}</span>
            </div>
            <div class="history-meta">
                <span class="history-meta__label">Latest label</span>
                <span>${safeLatestLabel}</span>
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
                    await initializer.recordHistorySnapshot('Manual snapshot', { label: 'Manual snapshot', manual: true, force: true });
                    await initializer.refreshHistoryUI({ force: true });
                    return;
                }

                if (action === 'export') {
                    const historyEntries = await initializer.getHistoryEntries({ newestFirst: false });
                    const payload = {
                        exportedAt: new Date().toISOString(),
                        count: stats.count,
                        entries: historyEntries.map(entry => ({
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

        const entries = await initializer.getHistoryEntries({ newestFirst: true });
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

        entries.forEach((entry, index) => {
            const item = document.createElement('article');
            item.className = 'history-item';
            item.dataset.entryId = entry.id;
            if (entry.id === currentId) {
                item.classList.add('current');
            }

            const previousEntry = entries[index + 1] || null;

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
            preview.className = 'history-preview is-clickable';
            preview.textContent = summarizeHistoryChanges(entry.content, previousEntry ? previousEntry.content : null);
            preview.title = 'View full snapshot';
            preview.setAttribute('role', 'button');
            preview.tabIndex = 0;
            preview.addEventListener('click', (event) => {
                event.stopPropagation();
                openHistoryPreview(entry, previousEntry);
            });
            preview.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    openHistoryPreview(entry, previousEntry);
                }
            });

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
                void initializer.restoreHistoryEntry(entry.id, { forceRestore: false, requireConfirm: true })
                    .catch((error) => console.error('[HISTORY] Failed to restore entry', error));
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

            list.appendChild(item);
        });

        initializer.markHistoryRendered();
    } catch (error) {
        console.error('[HISTORY] Failed to render history modal', error);
    }
}

// Enhanced Monaco Editor initialization with WireMock Editor integration
// This file provides optimized Monaco Editor setup with JSON schema validation

