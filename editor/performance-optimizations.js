'use strict';

// Performance Optimization Classes for WireMock JSON Studio
// Provides virtualization, indexing, worker pools, and caching

// 1. Virtualized JSON Renderer for large documents
class VirtualizedJSONRenderer {
    constructor(editor) {
        this.editor = editor;
        this.fullContent = '';
        this.isVirtualized = false;
    }

    setContent(content) {
        if (typeof content !== 'string') {
            content = '';
        }

        this.fullContent = content;
        const lineCount = content.split('\n').length;

        // Monaco already virtualizes the viewport efficiently. The previous manual
        // chunking prevented users from scrolling beyond ~1000 lines. We now keep the
        // full document in the editor while still tracking the latest content for
        // consumers of getFullContent().
        this.isVirtualized = false;

        if (this.editor.getValue() !== content) {
            this.editor.setValue(content);
        }

        if (lineCount > 5000) {
            console.log(`📄 Loaded large document (${lineCount} lines) without manual virtualization.`);
        }
    }

    updateVisibleRange() {
        // Manual virtualization disabled – nothing to do here.
    }

    getFullContent() {
        return this.isVirtualized ? this.fullContent : this.editor.getValue();
    }

    dispose() {
        this.fullContent = '';
        this.isVirtualized = false;
    }
}

// 2. Optimized search with indexing
class IndexedSearch {
    constructor() {
        this.keyIndex = new Map();
        this.valueIndex = new Map();
        this.lineIndex = [];
        this.isIndexed = false;
        this.lastBuildTime = 0;
    }

    buildIndex(content) {
        const startTime = performance.now();
        const lines = content.split('\n');
        
        this.keyIndex.clear();
        this.valueIndex.clear();
        this.lineIndex = [];
        
        lines.forEach((line, lineNum) => {
            this.lineIndex.push(line);
            const trimmed = line.trim();
            
            // Index keys
            const keyMatch = trimmed.match(/"([^"]+)":/);
            if (keyMatch) {
                const key = keyMatch[1].toLowerCase();
                if (!this.keyIndex.has(key)) {
                    this.keyIndex.set(key, []);
                }
                this.keyIndex.get(key).push({
                    line: lineNum,
                    column: line.indexOf(keyMatch[0]),
                    text: line,
                    key: keyMatch[1]
                });
            }
            
            // Index values
            const valueMatch = trimmed.match(/:\s*"([^"]+)"/);
            if (valueMatch) {
                const value = valueMatch[1].toLowerCase();
                if (!this.valueIndex.has(value)) {
                    this.valueIndex.set(value, []);
                }
                this.valueIndex.get(value).push({
                    line: lineNum,
                    column: line.indexOf(valueMatch[1]),
                    text: line,
                    value: valueMatch[1]
                });
            }
        });
        
        this.isIndexed = true;
        this.lastBuildTime = performance.now() - startTime;
        console.log(`🔍 Search index built in ${this.lastBuildTime.toFixed(2)}ms for ${lines.length} lines`);
    }

    searchKeys(term, options = {}) {
        if (!this.isIndexed) return [];
        
        const searchTerm = options.matchCase ? term : term.toLowerCase();
        const results = [];
        
        for (const [key, locations] of this.keyIndex) {
            if (this.matches(key, searchTerm, options)) {
                results.push(...locations.map(loc => ({ ...loc, type: 'key' })));
            }
        }
        
        return results.slice(0, 1000); // Limit results
    }

    searchValues(term, options = {}) {
        if (!this.isIndexed) return [];
        
        const searchTerm = options.matchCase ? term : term.toLowerCase();
        const results = [];
        
        for (const [value, locations] of this.valueIndex) {
            if (this.matches(value, searchTerm, options)) {
                results.push(...locations.map(loc => ({ ...loc, type: 'value' })));
            }
        }
        
        return results.slice(0, 1000); // Limit results
    }

    searchAll(term, options = {}) {
        const keyResults = this.searchKeys(term, options);
        const valueResults = this.searchValues(term, options);
        
        return [...keyResults, ...valueResults]
            .sort((a, b) => a.line - b.line)
            .slice(0, 1000);
    }

    matches(text, term, options) {
        if (options.wholeWord) {
            const regex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, options.matchCase ? '' : 'i');
            return regex.test(text);
        }
        return text.includes(term);
    }

    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    }

    getStats() {
        return {
            indexed: this.isIndexed,
            keys: this.keyIndex.size,
            values: this.valueIndex.size,
            lines: this.lineIndex.length,
            buildTime: this.lastBuildTime
        };
    }

    clear() {
        this.keyIndex.clear();
        this.valueIndex.clear();
        this.lineIndex = [];
        this.isIndexed = false;
        this.lastBuildTime = 0;
    }
}

// 3. Worker pool for heavy operations
class WorkerPool {
    constructor(workerScript, poolSize = 4) {
        this.workers = [];
        this.queue = [];
        this.busyWorkers = new Set();
        this.taskIdCounter = 0;
        this.pendingTasks = new Map();
        
        // Skip worker creation if running from file:// protocol
        if (location.protocol === 'file:') {
            console.log('🚧 Skipping worker pool creation due to file:// protocol limitations');
            console.log('👥 Worker pool initialized with 0 workers (file:// mode)');
            return;
        }
        
        for (let i = 0; i < poolSize; i++) {
            try {
                const worker = new Worker(workerScript);
                worker.id = i;
                worker.onmessage = (e) => this.handleMessage(worker, e);
                worker.onerror = (e) => this.handleError(worker, e);
                this.workers.push(worker);
            } catch (error) {
                console.warn(`Failed to create worker ${i}:`, error);
            }
        }
        
        console.log(`👥 Worker pool initialized with ${this.workers.length} workers`);
    }

    execute(operation, payload, priority = 0, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const taskId = ++this.taskIdCounter;
            const task = { 
                id: taskId,
                operation, 
                payload, 
                resolve, 
                reject, 
                priority,
                timestamp: Date.now(),
                timeout: setTimeout(() => {
                    this.cancelTask(taskId, 'timeout');
                }, timeout)
            };
            
            this.pendingTasks.set(taskId, task);
            
            const availableWorker = this.getAvailableWorker();
            if (availableWorker) {
                this.runTask(availableWorker, task);
            } else {
                this.queue.push(task);
                this.queue.sort((a, b) => b.priority - a.priority);
            }
        });
    }

    getAvailableWorker() {
        return this.workers.find(w => !this.busyWorkers.has(w.id));
    }

    runTask(worker, task) {
        this.busyWorkers.add(worker.id);
        worker.currentTask = task;
        
        worker.postMessage({
            type: task.operation,
            payload: task.payload,
            taskId: task.id
        });
    }

    handleMessage(worker, event) {
        const task = worker.currentTask;
        if (task) {
            clearTimeout(task.timeout);
            this.pendingTasks.delete(task.id);
            
            if (event.data.error) {
                task.reject(new Error(event.data.error));
            } else {
                task.resolve(event.data.result || event.data);
            }
        }
        
        this.releaseWorker(worker);
    }

    handleError(worker, error) {
        const task = worker.currentTask;
        if (task) {
            clearTimeout(task.timeout);
            this.pendingTasks.delete(task.id);
            task.reject(error);
        }
        
        this.releaseWorker(worker);
    }

    releaseWorker(worker) {
        this.busyWorkers.delete(worker.id);
        worker.currentTask = null;
        
        // Process next task in queue
        if (this.queue.length > 0) {
            const nextTask = this.queue.shift();
            this.runTask(worker, nextTask);
        }
    }

    cancelTask(taskId, reason = 'cancelled') {
        const task = this.pendingTasks.get(taskId);
        if (task) {
            clearTimeout(task.timeout);
            this.pendingTasks.delete(taskId);
            task.reject(new Error(`Task ${reason}`));
            
            // Remove from queue if still there
            const queueIndex = this.queue.findIndex(t => t.id === taskId);
            if (queueIndex !== -1) {
                this.queue.splice(queueIndex, 1);
            }
        }
    }

    getStats() {
        return {
            workers: this.workers.length,
            busy: this.busyWorkers.size,
            queued: this.queue.length,
            pending: this.pendingTasks.size
        };
    }

    terminate() {
        // Cancel all pending tasks
        for (const [taskId] of this.pendingTasks) {
            this.cancelTask(taskId, 'pool_terminated');
        }
        
        // Terminate all workers
        this.workers.forEach(w => w.terminate());
        this.workers = [];
        this.queue = [];
        this.busyWorkers.clear();
        this.pendingTasks.clear();
    }
}

// 4. Performance controller with debouncing and throttling
class PerformanceController {
    constructor() {
        this.debounceTimers = new Map();
        this.throttleTimestamps = new Map();
        this.measurements = new Map();
    }

    debounce(key, fn, delay) {
        clearTimeout(this.debounceTimers.get(key));
        this.debounceTimers.set(key, setTimeout(() => {
            fn();
            this.debounceTimers.delete(key);
        }, delay));
    }

    throttle(key, fn, limit) {
        const now = Date.now();
        const lastCall = this.throttleTimestamps.get(key) || 0;
        
        if (now - lastCall >= limit) {
            this.throttleTimestamps.set(key, now);
            fn();
            return true;
        }
        return false;
    }

    measurePerformance(label, fn) {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;
        
        // Track measurements
        if (!this.measurements.has(label)) {
            this.measurements.set(label, []);
        }
        this.measurements.get(label).push(duration);
        
        if (duration > 100) {
            console.warn(`🐌 Slow operation [${label}]: ${duration.toFixed(2)}ms`);
        } else if (duration > 50) {
            console.log(`⚡ Operation [${label}]: ${duration.toFixed(2)}ms`);
        }
        
        return result;
    }

    async measureAsync(label, asyncFn) {
        const start = performance.now();
        const result = await asyncFn();
        const duration = performance.now() - start;
        
        // Track measurements
        if (!this.measurements.has(label)) {
            this.measurements.set(label, []);
        }
        this.measurements.get(label).push(duration);
        
        if (duration > 100) {
            console.warn(`🐌 Async operation [${label}]: ${duration.toFixed(2)}ms`);
        }
        
        return result;
    }

    getStats(label) {
        const measurements = this.measurements.get(label);
        if (!measurements || measurements.length === 0) {
            return null;
        }
        
        const sorted = [...measurements].sort((a, b) => a - b);
        return {
            count: measurements.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: measurements.reduce((a, b) => a + b, 0) / measurements.length,
            median: sorted[Math.floor(sorted.length / 2)]
        };
    }

    clearStats() {
        this.measurements.clear();
    }
}

// 5. Result caching system
class ResultCache {
    constructor(maxSize = 100, ttl = 300000) { // 5 minutes TTL
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl;
        this.hits = 0;
        this.misses = 0;
    }

    generateKey(operation, content) {
        // Use content hash for consistent keys
        const hash = this.simpleHash(content);
        return `${operation}:${hash}:${content.length}`;
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    get(operation, content) {
        const key = this.generateKey(operation, content);
        const entry = this.cache.get(key);
        
        if (entry && Date.now() - entry.timestamp < this.ttl) {
            this.hits++;
            return entry.result;
        }
        
        if (entry) {
            this.cache.delete(key); // Remove expired entry
        }
        
        this.misses++;
        return null;
    }

    set(operation, content, result) {
        const key = this.generateKey(operation, content);
        
        // Evict oldest entries if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, {
            result,
            timestamp: Date.now()
        });
    }

    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    getStats() {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? (this.hits / total * 100).toFixed(1) + '%' : '0%'
        };
    }
}

// Export all classes
if (typeof window !== 'undefined') {
    window.VirtualizedJSONRenderer = VirtualizedJSONRenderer;
    window.IndexedSearch = IndexedSearch;
    window.WorkerPool = WorkerPool;
    window.PerformanceController = PerformanceController;
    window.ResultCache = ResultCache;
}

// Export for Node.js if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        VirtualizedJSONRenderer,
        IndexedSearch,
        WorkerPool,
        PerformanceController,
        ResultCache
    };
}