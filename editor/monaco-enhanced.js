'use strict';

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
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            await this.loadMonaco();
            this.setupWireMockSchema();
            this.setupOptimizations();
            this.createEditors();
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

    createEditors() {
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
        }
    }

    createEditor(container, options) {
        const editor = monaco.editor.create(container, options);
        
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
            { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT, action: () => this.validateJSON() }
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

    // Enhanced JSONPath search with real path-to-position mapping
    searchJSONPath(query) {
        const editor = this.getActiveEditor();
        if (!editor) {
            this.showNotification('No active editor', 'warning');
            return;
        }

        try {
            const content = editor.getValue();
            if (!content.trim()) {
                this.showNotification('No content to search', 'warning');
                return;
            }

            if (query.startsWith('$.') || query.startsWith('$[') || query === '$') {
                // Enhanced JSONPath search with position mapping
                try {
                    const parsed = JSON.parse(content);
                    const results = this.evaluateJSONPath(parsed, query, content, editor);
                    
                    if (results.length > 0) {
                        let message = `JSONPath "${query}" found ${results.length} match${results.length !== 1 ? 'es' : ''}`;
                        
                        // Highlight the first match
                        if (results[0].position) {
                            const position = results[0].position;
                            editor.setSelection(new monaco.Range(
                                position.startLineNumber,
                                position.startColumn,
                                position.endLineNumber,
                                position.endColumn
                            ));
                            editor.revealPositionInCenter(position);
                            
                            message += ` - First match highlighted`;
                        }
                        
                        // Show preview of the found value
                        const preview = this.formatValuePreview(results[0].value);
                        message += `: ${preview}`;
                        
                        this.showNotification(message, 'success');
                        
                        // Store results for navigation
                        this.lastJSONPathResults = results;
                        
                        if (results.length > 1) {
                            this.showNotification(`Use Alt+N/Alt+P to navigate between ${results.length} matches`, 'info');
                        }
                    } else {
                        this.showNotification(`JSONPath "${query}" not found`, 'info');
                    }
                } catch (parseError) {
                    this.showNotification('Cannot parse JSON for JSONPath search: ' + parseError.message, 'error');
                }
            } else {
                // Fall back to regular text search
                this.search(query);
            }
        } catch (error) {
            console.error('JSONPath search error:', error);
            this.showNotification('JSONPath search error: ' + error.message, 'error');
        }
    }
    
    evaluateJSONPath(data, path, content, editor) {
        const results = [];
        
        // Simple JSONPath implementation with position tracking
        if (path === '$') {
            // Root element
            const position = this.findValuePosition(data, content, editor, '');
            results.push({ value: data, path: '$', position });
            return results;
        }
        
        // Remove leading $. and split path
        const pathParts = path.replace(/^\$\.?/, '').split('.');
        this.traverseJSONPath(data, pathParts, content, editor, '$', results);
        
        return results;
    }
    
    traverseJSONPath(current, pathParts, content, editor, currentPath, results) {
        if (pathParts.length === 0) {
            const position = this.findValuePosition(current, content, editor, currentPath);
            results.push({ value: current, path: currentPath, position });
            return;
        }
        
        const [firstPart, ...remainingParts] = pathParts;
        
        // Handle array notation like [0] or [*]
        if (firstPart.includes('[') && firstPart.includes(']')) {
            const [key, indexPart] = firstPart.split('[');
            const index = indexPart.replace(']', '');
            
            let target = current;
            if (key) {
                target = current[key];
            }
            
            if (Array.isArray(target)) {
                if (index === '*') {
                    // Wildcard - search all array elements
                    target.forEach((item, i) => {
                        const newPath = currentPath + (key ? `.${key}` : '') + `[${i}]`;
                        this.traverseJSONPath(item, remainingParts, content, editor, newPath, results);
                    });
                } else {
                    // Specific index
                    const idx = parseInt(index);
                    if (idx >= 0 && idx < target.length) {
                        const newPath = currentPath + (key ? `.${key}` : '') + `[${idx}]`;
                        this.traverseJSONPath(target[idx], remainingParts, content, editor, newPath, results);
                    }
                }
            }
        } else if (firstPart === '*') {
            // Wildcard for object properties
            if (current && typeof current === 'object' && !Array.isArray(current)) {
                Object.keys(current).forEach(key => {
                    const newPath = currentPath + `.${key}`;
                    this.traverseJSONPath(current[key], remainingParts, content, editor, newPath, results);
                });
            }
        } else {
            // Regular property access
            if (current && typeof current === 'object' && firstPart in current) {
                const newPath = currentPath + `.${firstPart}`;
                this.traverseJSONPath(current[firstPart], remainingParts, content, editor, newPath, results);
            }
        }
    }
    
    findValuePosition(value, content, editor, jsonPath) {
        try {
            // Convert value to string for searching
            let searchText;
            if (typeof value === 'string') {
                searchText = `"${value}"`; // Add quotes for string values
            } else {
                searchText = JSON.stringify(value);
            }
            
            // Use Monaco's find mechanism to locate the text
            const model = editor.getModel();
            const matches = model.findMatches(searchText, false, false, true, null, false);
            
            if (matches.length > 0) {
                // Return the first match position
                return {
                    startLineNumber: matches[0].range.startLineNumber,
                    startColumn: matches[0].range.startColumn,
                    endLineNumber: matches[0].range.endLineNumber,
                    endColumn: matches[0].range.endColumn
                };
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

    // Enhanced search with toolbar toggles
    searchJSONPath(query) {
        if (!query) {
            query = document.getElementById('jsonPathInput')?.value?.trim();
        }
        
        if (!query) {
            this.showNotification('Please enter a search term', 'warning');
            return;
        }

        const editor = this.getActiveEditor();
        if (!editor) {
            this.showNotification('No active editor', 'warning');
            return;
        }

        try {
            // Get search options from toolbar toggles
            const matchCase = document.getElementById('matchCaseToggle')?.checked || false;
            const wholeWord = document.getElementById('wholeWordToggle')?.checked || false;
            const keysOnly = document.getElementById('keysOnlyToggle')?.checked || false;
            const valuesOnly = document.getElementById('valuesOnlyToggle')?.checked || false;

            // If it's a JSONPath query, handle it specially
            if (query.startsWith('$.')) {
                this.searchWithJSONPath(query, editor);
                return;
            }

            // Enhanced search with key/value filtering
            if (keysOnly || valuesOnly) {
                const content = editor.getValue();
                try {
                    const jsonData = JSON.parse(content);
                    const matches = this.findInJSONStructure(jsonData, query, keysOnly, valuesOnly, matchCase);
                    this.highlightJSONMatches(editor, matches);
                    this.showNotification(`Found ${matches.length} matches`, 'success');
                    return;
                } catch (e) {
                    // Fall back to regular search if JSON parsing fails
                }
            }

            // Use Monaco's built-in find functionality with options
            editor.trigger('search', 'actions.find', {
                searchString: query,
                replaceString: '',
                isRegex: false,
                matchCase: matchCase,
                matchWholeWord: wholeWord,
                preserveCase: false
            });
            
            this.showNotification(`Searching for "${query}"`, 'success');
        } catch (error) {
            console.error('Search error:', error);
            this.showNotification('Search error: ' + error.message, 'error');
        }
    }

    searchWithJSONPath(jsonPath, editor) {
        try {
            const content = editor.getValue();
            const jsonData = JSON.parse(content);
            
            // Use the enhanced JSONPath implementation with position tracking
            const results = this.evaluateJSONPath(jsonData, jsonPath, content, editor);
            if (results && results.length > 0) {
                const resultText = results.map(r => `${r.path}: ${this.formatValuePreview(r.value)}`).join(', ');
                this.showNotification(`JSONPath found: ${resultText}`, 'success');
                
                // Highlight the first result if position is available
                if (results[0].position && editor) {
                    editor.setSelection({
                        startLineNumber: results[0].position.startLineNumber,
                        startColumn: results[0].position.startColumn,
                        endLineNumber: results[0].position.endLineNumber,
                        endColumn: results[0].position.endColumn
                    });
                    editor.revealLineInCenter(results[0].position.startLineNumber);
                }
            } else {
                this.showNotification('JSONPath not found', 'warning');
            }
        } catch (error) {
            this.showNotification('Invalid JSON or JSONPath: ' + error.message, 'error');
        }
    }

    findInJSONStructure(obj, searchTerm, keysOnly, valuesOnly, matchCase) {
        const matches = [];
        const search = matchCase ? searchTerm : searchTerm.toLowerCase();

        const traverse = (current, path = '') => {
            if (typeof current === 'object' && current !== null) {
                if (Array.isArray(current)) {
                    current.forEach((item, index) => {
                        traverse(item, `${path}[${index}]`);
                    });
                } else {
                    Object.entries(current).forEach(([key, value]) => {
                        const currentPath = path ? `${path}.${key}` : key;
                        
                        // Check keys
                        if (!valuesOnly) {
                            const keyToCheck = matchCase ? key : key.toLowerCase();
                            if (keyToCheck.includes(search)) {
                                matches.push({
                                    path: currentPath,
                                    type: 'key',
                                    value: key
                                });
                            }
                        }
                        
                        // Check values
                        if (!keysOnly && typeof value === 'string') {
                            const valueToCheck = matchCase ? value : value.toLowerCase();
                            if (valueToCheck.includes(search)) {
                                matches.push({
                                    path: currentPath,
                                    type: 'value',
                                    value: value
                                });
                            }
                        }
                        
                        traverse(value, currentPath);
                    });
                }
            }
        };

        traverse(obj);
        return matches;
    }

    highlightJSONMatches(editor, matches) {
        // Log matches for now - full highlighting would require more complex implementation
        console.log('JSON matches found:', matches);
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
        
        this.isInitialized = false;
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
}