'use strict';

// JSON Operations Web Worker
// Handles heavy operations: formatting, validation, JSONPath, diffing

// Enhanced worker state with task management
class TaskManager {
    constructor() {
        this.runningTasks = new Map();
        this.taskIdCounter = 0;
    }
    
    addTask(taskId, type, payload, priority = 2) {
        // Cancel existing tasks of same type (last wins)
        this.cancelTasksByType(type);
        
        const abortController = new AbortController();
        const task = {
            id: taskId,
            type,
            payload,
            priority,
            abortController,
            startTime: Date.now(),
            timeout: null
        };
        
        // Set timeout (30 seconds)
        task.timeout = setTimeout(() => {
            this.cancelTask(taskId, 'timeout');
        }, 30000);
        
        this.runningTasks.set(taskId, task);
        return task;
    }
    
    cancelTask(taskId, reason = 'cancelled') {
        const task = this.runningTasks.get(taskId);
        if (task) {
            task.abortController.abort();
            clearTimeout(task.timeout);
            this.runningTasks.delete(taskId);
            
            postMessage({
                type: 'task_cancelled',
                taskId,
                reason
            });
        }
    }
    
    cancelTasksByType(type) {
        for (const [taskId, task] of this.runningTasks) {
            if (task.type === type) {
                this.cancelTask(taskId, 'superseded');
            }
        }
    }
    
    isTaskActive(taskId) {
        const task = this.runningTasks.get(taskId);
        return task && !task.abortController.signal.aborted;
    }
    
    completeTask(taskId) {
        const task = this.runningTasks.get(taskId);
        if (task) {
            clearTimeout(task.timeout);
            this.runningTasks.delete(taskId);
        }
    }
    
    getTaskSignal(taskId) {
        const task = this.runningTasks.get(taskId);
        return task ? task.abortController.signal : null;
    }
}

const taskManager = new TaskManager();
const MAX_RESULT_COUNT = 10000; // Limit search results
const MAX_PROCESSING_TIME = 5000; // 5 seconds for chunked operations

function escapeJsonPointerSegment(segment) {
    return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function isSimpleJsonPathSegment(segment) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(segment);
}

function pathArrayToJsonPath(pathArray) {
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

function pathArrayToPointer(pathArray) {
    if (!Array.isArray(pathArray) || pathArray.length === 0) {
        return '$';
    }

    let pointer = '$';

    for (let i = 1; i < pathArray.length; i++) {
        const part = pathArray[i];
        if (typeof part === 'number') {
            pointer += `/${part}`;
        } else if (typeof part === 'string') {
            pointer += `/${escapeJsonPointerSegment(part)}`;
        } else if (part !== undefined && part !== null) {
            pointer += `/${escapeJsonPointerSegment(String(part))}`;
        }
    }

    return pointer;
}

function appendJsonPathSegment(base, segment) {
    if (typeof segment === 'number') {
        return `${base}[${segment}]`;
    }

    if (isSimpleJsonPathSegment(segment)) {
        return base === '$' ? `${base}.${segment}` : `${base}.${segment}`;
    }

    const escaped = String(segment).replace(/'/g, "\\'");
    return `${base}['${escaped}']`;
}

function appendJsonPathArrayIndex(base, index) {
    return `${base}[${index}]`;
}

function appendPointerSegment(base, segment) {
    const normalized = typeof segment === 'number'
        ? segment
        : escapeJsonPointerSegment(String(segment));
    return `${base}/${normalized}`;
}

// Legacy compatibility
let cancelToken = null;
let activeTasks = new Map();

// Import required libraries (if available)
let jsonpath = null;
let fastJsonPatch = null;
let jsonlint = null;
let jsondiffpatch = null;

// Try to import JSONPath if available
try {
    if (typeof importScripts !== 'undefined') {
        try {
            importScripts('https://cdn.jsdelivr.net/npm/jsonpath@1.1.1/jsonpath.min.js');
            // After import, JSONPath should be available as global
            jsonpath = (typeof JSONPath !== 'undefined') ? JSONPath : null;
            if (jsonpath) {
                console.log('✅ JSONPath library loaded in worker');
            }
        } catch (e) {
            console.warn('Failed to load JSONPath:', e.message);
        }
        
        try {
            importScripts('https://cdn.jsdelivr.net/npm/jsonlint-mod@1.7.6/lib/jsonlint.js');
            jsonlint = self.jsonlint || jsonlint;
        } catch (e) {
            // optional
        }
        
        try {
            importScripts('https://cdn.jsdelivr.net/npm/fast-json-patch@3.0.0/dist/fast-json-patch.min.js');
            fastJsonPatch = self.fastJsonPatch || fastJsonPatch;
        } catch (e) {
            // optional
        }
        
        try {
            importScripts('https://cdn.jsdelivr.net/npm/jsondiffpatch@1.2.0/dist/jsondiffpatch.min.js');
            jsondiffpatch = self.jsondiffpatch || jsondiffpatch;
        } catch (e) {
            // optional
        }
    }
} catch (e) {
    console.warn('Library import failed:', e.message);
}

// Enhanced message handler with task management
self.onmessage = function(e) {
    const { type, payload, taskId } = e.data;
    
    try {
        switch (type) {
            case 'format':
                handleFormatEnhanced(payload, taskId);
                break;
            case 'minify':
                handleMinifyEnhanced(payload, taskId);
                break;
            case 'validate':
                handleValidateEnhanced(payload, taskId);
                break;
            case 'sort_keys':
                handleSortKeysEnhanced(payload, taskId);
                break;
            case 'jsonpath':
                handleJSONPathEnhanced(payload, taskId);
                break;
            case 'diff':
                handleDiffEnhanced(payload, taskId);
                break;
            case 'cancel':
                if (payload && payload.taskId) {
                    taskManager.cancelTask(payload.taskId, 'user_cancelled');
                }
                break;
            case 'cancel_all':
                for (const taskId of taskManager.runningTasks.keys()) {
                    taskManager.cancelTask(taskId, 'cancel_all');
                }
                break;
            default:
                postMessage({
                    type: 'error',
                    taskId,
                    error: `Unknown operation: ${type}`
                });
        }
    } catch (error) {
        taskManager.completeTask(taskId);
        postMessage({
            type: 'error',
            taskId,
            error: error.message,
            stack: error.stack
        });
    }
};

function checkCancellation(taskId) {
    return !taskManager.isTaskActive(taskId);
}

function withTimeout(promise, taskId, timeoutMs = MAX_PROCESSING_TIME) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            const signal = taskManager.getTaskSignal(taskId);
            if (signal) {
                signal.addEventListener('abort', () => {
                    reject(new Error('Operation aborted'));
                });
            }
            setTimeout(() => reject(new Error('Operation timeout')), timeoutMs);
        })
    ]);
}

// Enhanced handlers with proper task management
async function handleFormatEnhanced(payload, taskId) {
    const task = taskManager.addTask(taskId, 'format', payload, 1);
    
    try {
        const result = await withTimeout(
            formatJSONEnhanced(payload, taskId),
            taskId,
            payload.text.length > 5000000 ? 15000 : 5000
        );
        
        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'format_complete',
                taskId,
                result
            });
        }
    } catch (error) {
        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'error',
                taskId,
                error: error.message
            });
        }
    } finally {
        taskManager.completeTask(taskId);
    }
}

async function formatJSONEnhanced(payload, taskId) {
    const { text, chunkSize = 1000000 } = payload;
    
    // Check for cancellation before parsing
    if (checkCancellation(taskId)) {
        throw new Error('Operation cancelled');
    }
    
    // For very large texts, process with yield points
    if (text.length > chunkSize) {
        return await formatLargeJSONEnhanced(text, taskId);
    }
    
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
}

async function formatLargeJSONEnhanced(text, taskId) {
    return new Promise((resolve, reject) => {
        const processChunk = () => {
            if (checkCancellation(taskId)) {
                reject(new Error('Operation cancelled'));
                return;
            }
            
            try {
                const parsed = JSON.parse(text);
                const formatted = JSON.stringify(parsed, null, 2);
                resolve(formatted);
            } catch (error) {
                reject(error);
            }
        };
        
        // Use setTimeout to allow cancellation checks
        setTimeout(processChunk, 0);
    });
}

async function handleMinifyEnhanced(payload, taskId) {
    const task = taskManager.addTask(taskId, 'minify', payload, 1);
    
    try {
        const { text } = payload;
        
        if (checkCancellation(taskId)) {
            throw new Error('Operation cancelled');
        }
        
        const parsed = JSON.parse(text);
        const minified = JSON.stringify(parsed);
        
        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'minify_complete',
                taskId,
                result: minified
            });
        }
    } catch (error) {
        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'error',
                taskId,
                error: error.message
            });
        }
    } finally {
        taskManager.completeTask(taskId);
    }
}

async function handleValidateEnhanced(payload, taskId) {
    const task = taskManager.addTask(taskId, 'validate', payload, 1);

    try {
        const { text, withPositions = false } = payload;
        
        if (checkCancellation(taskId)) {
            throw new Error('Operation cancelled');
        }
        
        let result;
        try {
            const parsed = JSON.parse(text);
            result = {
                valid: true,
                data: parsed
            };
            
            if (withPositions) {
                result.positions = generatePositionMap(text, parsed);
            }
        } catch (error) {
            // Enhanced error reporting with jsonlint if available
            let message = error.message;
            let line = extractLineNumber(message);
            let column = extractColumnNumber(message);
            
            if (jsonlint && typeof jsonlint.parse === 'function') {
                try {
                    jsonlint.parse(text);
                } catch (lintError) {
                    line = lintError.line || line;
                    column = lintError.column || column;
                    message = lintError.message || message;
                }
            }
            
            result = {
                valid: false,
                error: message,
                line,
                column
            };
        }
        
        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'validate_complete',
                taskId,
                result
            });
        }
    } catch (error) {
        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'error',
                taskId,
                error: error.message
            });
        }
    } finally {
        taskManager.completeTask(taskId);
    }
}

async function handleSortKeysEnhanced(payload, taskId) {
    const task = taskManager.addTask(taskId, 'sort_keys', payload, 1);

    try {
        if (!payload || typeof payload.text !== 'string') {
            throw new Error('No JSON content provided');
        }

        if (checkCancellation(taskId)) {
            throw new Error('Operation cancelled');
        }

        const indent = typeof payload.indent === 'number' && payload.indent >= 0 ? payload.indent : 2;
        const parsed = JSON.parse(payload.text);
        const sorted = sortKeysDeep(parsed);
        const result = JSON.stringify(sorted, null, indent);

        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'sort_keys_complete',
                taskId,
                result
            });
        }
    } catch (error) {
        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'error',
                taskId,
                error: error.message
            });
        }
    } finally {
        taskManager.completeTask(taskId);
    }
}

async function handleJSONPathEnhanced(payload, taskId) {
    const task = taskManager.addTask(taskId, 'jsonpath', payload, 3);

    try {
        const { text, path } = payload;
        
        if (checkCancellation(taskId)) {
            throw new Error('Operation cancelled');
        }
        
        const obj = JSON.parse(text);
        let values = [];
        let pathArrays = [];
        let jsonPathStrings = [];
        let pointerPaths = [];
        let resultCount = 0;
        
        if (jsonpath && typeof jsonpath.query === 'function') {
            // Use full JSONPath library with result limiting
            const allResults = jsonpath.query(obj, path);
            const allPaths = jsonpath.paths(obj, path);
            
            // Limit results to prevent memory issues
            resultCount = allResults.length;
            const limitedResults = allResults.slice(0, MAX_RESULT_COUNT);
            const limitedPaths = allPaths.slice(0, MAX_RESULT_COUNT);

            values = limitedResults;
            pathArrays = limitedPaths;
            jsonPathStrings = limitedPaths.map(pathArrayToJsonPath);
            pointerPaths = limitedPaths.map(pathArrayToPointer);
        } else {
            // Fallback to simple implementation
            console.log('🔄 Using fallback JSONPath implementation');
            const simpleResults = simpleJSONPath(obj, path);
            resultCount = simpleResults.length;
            const limited = simpleResults.slice(0, MAX_RESULT_COUNT);

            values = limited.map(item => item.value);
            pathArrays = limited.map(item => item.segments);
            jsonPathStrings = limited.map(item => item.path);
            pointerPaths = limited.map(item => item.pointer);
        }

        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'jsonpath_complete',
                taskId,
                result: {
                    values,
                    paths: pathArrays,
                    jsonPaths: jsonPathStrings,
                    pointerPaths,
                    count: resultCount,
                    truncated: resultCount > MAX_RESULT_COUNT
                }
            });
        }
    } catch (error) {
        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'error',
                taskId,
                error: `JSONPath Error: ${error.message}`
            });
        }
    } finally {
        taskManager.completeTask(taskId);
    }
}

async function handleDiffEnhanced(payload, taskId) {
    const task = taskManager.addTask(taskId, 'diff', payload, 4);
    
    try {
        const result = await withTimeout(
            performDiffEnhanced(payload, taskId),
            taskId,
            15000 // 15 seconds for diff operations
        );
        
        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'diff_complete',
                taskId,
                result
            });
        }
    } catch (error) {
        if (taskManager.isTaskActive(taskId)) {
            postMessage({
                type: 'error',
                taskId,
                error: `Diff Error: ${error.message}`
            });
        }
    } finally {
        taskManager.completeTask(taskId);
    }
}

async function performDiffEnhanced(payload, taskId) {
    const { leftText, rightText, mode = 'line', ignoreKeyOrder = false } = payload;
    
    if (checkCancellation(taskId)) {
        throw new Error('Operation cancelled');
    }
    
    if (mode === 'structural') {
        return performStructuralDiff(leftText, rightText, ignoreKeyOrder, taskId);
    } else {
        return performLineDiff(leftText, rightText, taskId);
    }
}

// Utility functions
function extractLineNumber(errorMessage) {
    const match = errorMessage.match(/line (\d+)/i);
    return match ? parseInt(match[1]) : null;
}

function extractColumnNumber(errorMessage) {
    const match = errorMessage.match(/column (\d+)/i);
    return match ? parseInt(match[1]) : null;
}

function generatePositionMap(text, parsed) {
    // Simple position mapping for JSON keys and values
    const positions = new Map();
    const lines = text.split('\n');
    
    lines.forEach((line, lineIndex) => {
        const keyMatch = line.match(/"([^"]+)":/);
        if (keyMatch) {
            const key = keyMatch[1];
            const startCol = line.indexOf(keyMatch[0]);
            positions.set(key, {
                line: lineIndex,
                startCol,
                endCol: startCol + keyMatch[0].length
            });
        }
    });
    
    return Object.fromEntries(positions);
}

function simpleJSONPath(obj, path) {
    if (!path || obj === undefined || obj === null) return [];

    const normalizedPath = String(path).replace(/^\$\.?/, '');
    if (!normalizedPath) {
        return [{
            value: obj,
            path: '$',
            pointer: '$',
            segments: ['$']
        }];
    }

    const parts = normalizedPath.split('.');
    let results = [{
        value: obj,
        path: '$',
        pointer: '$',
        segments: ['$']
    }];

    try {
        for (const rawPart of parts) {
            if (!rawPart) continue;
            const nextResults = [];

            for (const result of results) {
                const current = result.value;
                if (current === null || current === undefined) {
                    continue;
                }

                const part = rawPart;

                if (part === '*') {
                    expandWildcard(result, nextResults);
                    continue;
                }

                if (part.startsWith('[')) {
                    processStandaloneArrayToken(part, result, nextResults);
                    continue;
                }

                if (part.includes('[')) {
                    processPropertyWithArray(part, current, result, nextResults);
                    continue;
                }

                if (typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, part)) {
                    const pathWithKey = appendJsonPathSegment(result.path, part);
                    nextResults.push({
                        value: current[part],
                        path: pathWithKey,
                        pointer: appendPointerSegment(result.pointer, part),
                        segments: result.segments.concat(part)
                    });
                }
            }

            results = nextResults;
            if (results.length === 0) break;
        }
    } catch (error) {
        console.warn('JSONPath fallback error:', error.message);
        return [];
    }

    return results;
}

function expandWildcard(result, output) {
    const current = result.value;

    if (Array.isArray(current)) {
        current.forEach((item, index) => {
            output.push({
                value: item,
                path: appendJsonPathArrayIndex(result.path, index),
                pointer: `${result.pointer}/${index}`,
                segments: result.segments.concat(index)
            });
        });
    } else if (current && typeof current === 'object') {
        Object.keys(current).forEach(key => {
            output.push({
                value: current[key],
                path: appendJsonPathSegment(result.path, key),
                pointer: appendPointerSegment(result.pointer, key),
                segments: result.segments.concat(key)
            });
        });
    }
}

function processStandaloneArrayToken(token, result, output) {
    const matches = token.match(/\[(.*?)\]/g);
    if (!matches) {
        return;
    }

    let targets = [{
        value: result.value,
        path: result.path,
        pointer: result.pointer,
        segments: result.segments
    }];

    matches.forEach(rawIndex => {
        const indexToken = rawIndex.slice(1, -1);
        const newTargets = [];

        targets.forEach(target => {
            if (!Array.isArray(target.value)) {
                return;
            }

            if (indexToken === '*' || indexToken === '') {
                target.value.forEach((item, index) => {
                    newTargets.push({
                        value: item,
                        path: appendJsonPathArrayIndex(target.path, index),
                        pointer: `${target.pointer}/${index}`,
                        segments: target.segments.concat(index)
                    });
                });
            } else {
                const idx = parseInt(indexToken, 10);
                if (!Number.isNaN(idx) && idx >= 0 && idx < target.value.length) {
                    newTargets.push({
                        value: target.value[idx],
                        path: appendJsonPathArrayIndex(target.path, idx),
                        pointer: `${target.pointer}/${idx}`,
                        segments: target.segments.concat(idx)
                    });
                }
            }
        });

        targets = newTargets;
    });

    output.push(...targets);
}

function processPropertyWithArray(part, current, result, output) {
    const property = part.split('[')[0];
    const bracketSection = part.slice(property.length);
    const matches = bracketSection.match(/\[(.*?)\]/g);

    if (!property || !matches) {
        return;
    }

    if (current === null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, property)) {
        return;
    }

    let targets = [{
        value: current[property],
        path: appendJsonPathSegment(result.path, property),
        pointer: appendPointerSegment(result.pointer, property),
        segments: result.segments.concat(property)
    }];

    matches.forEach(rawIndex => {
        const indexToken = rawIndex.slice(1, -1);
        const newTargets = [];

        targets.forEach(target => {
            if (!Array.isArray(target.value)) {
                return;
            }

            if (indexToken === '*' || indexToken === '') {
                target.value.forEach((item, index) => {
                    newTargets.push({
                        value: item,
                        path: appendJsonPathArrayIndex(target.path, index),
                        pointer: `${target.pointer}/${index}`,
                        segments: target.segments.concat(index)
                    });
                });
            } else {
                const idx = parseInt(indexToken, 10);
                if (!Number.isNaN(idx) && idx >= 0 && idx < target.value.length) {
                    newTargets.push({
                        value: target.value[idx],
                        path: appendJsonPathArrayIndex(target.path, idx),
                        pointer: `${target.pointer}/${idx}`,
                        segments: target.segments.concat(idx)
                    });
                }
            }
        });

        targets = newTargets;
    });

    output.push(...targets);
}

function performLineDiff(leftText, rightText, taskId) {
    const leftLines = leftText.split('\n');
    const rightLines = rightText.split('\n');
    const differences = [];
    
    const maxLines = Math.max(leftLines.length, rightLines.length);
    
    for (let i = 0; i < maxLines; i++) {
        if (checkCancellation(taskId)) return null;
        
        const leftLine = leftLines[i] || '';
        const rightLine = rightLines[i] || '';
        
        if (leftLine !== rightLine) {
            differences.push({
                line: i,
                type: leftLines[i] === undefined ? 'added' : 
                      rightLines[i] === undefined ? 'deleted' : 'changed',
                left: leftLine,
                right: rightLine
            });
        }
    }
    
    return {
        type: 'line',
        differences,
        stats: {
            total: maxLines,
            changed: differences.length,
            unchanged: maxLines - differences.length
        }
    };
}

function performStructuralDiff(leftText, rightText, ignoreKeyOrder, taskId) {
    try {
        const leftObj = JSON.parse(leftText);
        const rightObj = JSON.parse(rightText);
        
        if (ignoreKeyOrder) {
            const normalizedLeft = normalizeObject(leftObj);
            const normalizedRight = normalizeObject(rightObj);
            // Use correct function collectStructuralDifferences instead of deepCompare
            const differences = collectStructuralDifferences(normalizedLeft, normalizedRight, taskId, '');
            if (differences === null) return null;
            
            const merged = mergeRenameDifferences(differences);
            return {
                type: 'structural',
                differences: merged,
                stats: buildStructuralStats(merged)
            };
        } else {
            const differences = collectStructuralDifferences(leftObj, rightObj, taskId, '');
            if (differences === null) return null;
            
            const merged = mergeRenameDifferences(differences);
            return {
                type: 'structural',
                differences: merged,
                stats: buildStructuralStats(merged)
            };
        }
    } catch (error) {
        throw new Error(`Structural diff failed: ${error.message}`);
    }
}

function normalizeObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(normalizeObject);
    }

    // Sort object keys
    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
        sorted[key] = normalizeObject(obj[key]);
    });

    return sorted;
}

function sortKeysDeep(value) {
    if (Array.isArray(value)) {
        return value.map(sortKeysDeep);
    }

    if (value && typeof value === 'object') {
        const sorted = {};
        Object.keys(value)
            .sort((a, b) => a.localeCompare(b))
            .forEach(key => {
                sorted[key] = sortKeysDeep(value[key]);
            });
        return sorted;
    }

    return value;
}

function collectStructuralDifferences(left, right, taskId, path = '') {
    if (checkCancellation(taskId)) return null;

    // Strict equality covers primitives and references already equal
    if (left === right) {
        return [];
    }

    const differences = [];

    if (typeof left !== typeof right) {
        differences.push({
            path,
            type: 'type_change',
            left: typeof left,
            right: typeof right,
            leftValue: left,
            rightValue: right
        });
        return differences;
    }

    if (left === null || right === null) {
        if (left !== right) {
            differences.push({
                path,
                type: 'value_change',
                left,
                right
            });
        }
        return differences;
    }

    if (typeof left !== 'object') {
        if (left !== right) {
            differences.push({
                path,
                type: 'value_change',
                left,
                right
            });
        }
        return differences;
    }

    if (Array.isArray(left) && Array.isArray(right)) {
        const maxLength = Math.max(left.length, right.length);
        for (let i = 0; i < maxLength; i++) {
            if (checkCancellation(taskId)) return null;

            const newPath = `${path}[${i}]`;
            if (i >= left.length) {
                differences.push({
                    path: newPath,
                    type: 'added',
                    right: right[i]
                });
            } else if (i >= right.length) {
                differences.push({
                    path: newPath,
                    type: 'deleted',
                    left: left[i]
                });
            } else {
                const subDiffs = collectStructuralDifferences(left[i], right[i], taskId, newPath);
                if (subDiffs === null) return null;
                differences.push(...subDiffs);
            }
        }
        return differences;
    }

    if (!Array.isArray(left) && !Array.isArray(right)) {
        const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);

        for (const key of allKeys) {
            if (checkCancellation(taskId)) return null;

            const newPath = path ? `${path}.${key}` : key;

            if (!(key in left)) {
                differences.push({
                    path: newPath,
                    type: 'added',
                    right: right[key]
                });
            } else if (!(key in right)) {
                differences.push({
                    path: newPath,
                    type: 'deleted',
                    left: left[key]
                });
            } else {
                const subDiffs = collectStructuralDifferences(left[key], right[key], taskId, newPath);
                if (subDiffs === null) return null;
                differences.push(...subDiffs);
            }
        }
        return differences;
    }

    differences.push({
        path,
        type: 'type_change',
        left: Array.isArray(left) ? 'array' : typeof left,
        right: Array.isArray(right) ? 'array' : typeof right,
        leftValue: left,
        rightValue: right
    });

    return differences;
}

function mergeRenameDifferences(differences) {
    if (!Array.isArray(differences) || differences.length === 0) {
        return Array.isArray(differences) ? differences : [];
    }

    const addsByParent = new Map();
    differences.forEach((diff, index) => {
        if (!diff || diff.type !== 'added') return;
        const parent = getParentPath(diff.path);
        const bucket = addsByParent.get(parent) || [];
        bucket.push({ diff, index });
        addsByParent.set(parent, bucket);
    });

    const consumedAdds = new Set();
    const consumedDeletes = new Set();
    const renameAnchors = new Map();

    for (let i = 0; i < differences.length; i++) {
        const diff = differences[i];
        if (!diff || diff.type !== 'deleted' || consumedDeletes.has(i)) continue;

        const parent = getParentPath(diff.path);
        const candidates = addsByParent.get(parent) || [];

        for (const candidate of candidates) {
            if (consumedAdds.has(candidate.index)) continue;

            const leftValue = diff.left;
            const rightValue = candidate.diff.right;
            const keysSimilar = computeKeySimilarity(getKeyFromPath(diff.path), getKeyFromPath(candidate.diff.path));
            const valuesSimilar = computeValueSimilarity(leftValue, rightValue);

            if (deepEqual(leftValue, rightValue) || (keysSimilar >= 0.55 && valuesSimilar >= 0.85)) {
                consumedAdds.add(candidate.index);
                consumedDeletes.add(i);
                const anchor = Math.min(i, candidate.index);
                renameAnchors.set(anchor, {
                    type: 'renamed',
                    path: parent || '[root]',
                    fromKey: getKeyFromPath(diff.path),
                    toKey: getKeyFromPath(candidate.diff.path),
                    fromPath: diff.path,
                    toPath: candidate.diff.path,
                    left: leftValue,
                    right: rightValue,
                    similarity: {
                        key: Number(keysSimilar.toFixed(3)),
                        value: Number(valuesSimilar.toFixed(3))
                    }
                });
                break;
            }
        }
    }

    const result = [];
    for (let i = 0; i < differences.length; i++) {
        if (renameAnchors.has(i)) {
            result.push(renameAnchors.get(i));
        }

        const diff = differences[i];
        if (!diff) continue;

        if (consumedAdds.has(i) || consumedDeletes.has(i)) {
            continue;
        }

        result.push(diff);
    }

    return result;
}

function buildStructuralStats(differences) {
    const stats = {
        total: differences.length,
        added: 0,
        deleted: 0,
        changed: 0,
        renamed: 0
    };

    differences.forEach(diff => {
        if (!diff) return;
        switch (diff.type) {
            case 'added':
                stats.added += 1;
                break;
            case 'deleted':
                stats.deleted += 1;
                break;
            case 'value_change':
            case 'type_change':
                stats.changed += 1;
                break;
            case 'renamed':
                stats.renamed += 1;
                break;
            default:
                break;
        }
    });

    return stats;
}

function getParentPath(path) {
    if (!path) return '';
    const lastDot = path.lastIndexOf('.');
    const lastBracket = path.lastIndexOf('[');
    const sepIndex = Math.max(lastDot, lastBracket);
    return sepIndex >= 0 ? path.substring(0, sepIndex) : '';
}

function getKeyFromPath(path) {
    if (!path) return '';
    if (path.endsWith(']')) {
        const bracketIndex = path.lastIndexOf('[');
        return bracketIndex >= 0 ? path.substring(bracketIndex) : path;
    }
    const lastDot = path.lastIndexOf('.');
    return lastDot >= 0 ? path.substring(lastDot + 1) : path;
}

function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;

    if (a && typeof a === 'object' && b && typeof b === 'object') {
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i])) return false;
            }
            return true;
        }

        if (!Array.isArray(a) && !Array.isArray(b)) {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            if (keysA.length !== keysB.length) return false;
            for (const key of keysA) {
                if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
                if (!deepEqual(a[key], b[key])) return false;
            }
            return true;
        }

        return false;
    }

    return false;
}

function computeKeySimilarity(leftKey, rightKey) {
    if (leftKey === rightKey) return 1;
    if (!leftKey || !rightKey) return 0;
    return 1 - (levenshteinDistance(leftKey, rightKey) / Math.max(leftKey.length, rightKey.length, 1));
}

function computeValueSimilarity(leftValue, rightValue) {
    try {
        const leftStr = safeStringifyForSimilarity(leftValue);
        const rightStr = safeStringifyForSimilarity(rightValue);
        if (leftStr === rightStr) return 1;
        return 1 - (levenshteinDistance(leftStr, rightStr) / Math.max(leftStr.length, rightStr.length, 1));
    } catch (e) {
        return 0;
    }
}

function safeStringifyForSimilarity(value) {
    if (value === null || value === undefined) return '' + value;
    if (typeof value === 'string') return value;
    try {
        if (typeof value === 'object') {
            return JSON.stringify(normalizeObject(value));
        }
        return JSON.stringify(value);
    } catch (e) {
        return String(value);
    }
}

function levenshteinDistance(a, b) {
    if (a === b) return 0;
    const lenA = a.length;
    const lenB = b.length;
    if (lenA === 0) return lenB;
    if (lenB === 0) return lenA;

    const prev = new Array(lenB + 1);
    const curr = new Array(lenB + 1);

    for (let j = 0; j <= lenB; j++) prev[j] = j;

    for (let i = 1; i <= lenA; i++) {
        curr[0] = i;
        const charA = a.charAt(i - 1);
        for (let j = 1; j <= lenB; j++) {
            const charB = b.charAt(j - 1);
            const cost = charA === charB ? 0 : 1;
            curr[j] = Math.min(
                curr[j - 1] + 1,        // insertion
                prev[j] + 1,            // deletion
                prev[j - 1] + cost      // substitution
            );
        }
        for (let j = 0; j <= lenB; j++) {
            prev[j] = curr[j];
        }
    }

    return prev[lenB];
}
