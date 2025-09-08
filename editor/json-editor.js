// Global variables
let editor;
let compareEditorLeft;
let compareEditorRight;
let currentMode = 'create';
let history = [];
let historyIndex = -1;
let isDragging = false;

// Simple JSONPath implementation for fallback
function simpleJSONPath(obj, path) {
    if (!path || !obj) return [];
    
    // Remove leading $ if present
    path = path.replace(/^\$\.?/, '');
    
    if (!path) return [obj];
    
    // Split path by dots (handle simple cases)
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length; i++) {
        if (current === null || current === undefined) return [];
        
        // Handle array notation like [0]
        const part = parts[i];
        const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
        
        if (arrayMatch) {
            const key = arrayMatch[1];
            const index = parseInt(arrayMatch[2]);
            current = current[key][index];
        } else {
            current = current[part];
        }
    }
    
    return [current];
}

// WireMock templates
const templates = {
    basicGet: {
        title: "Basic GET Response",
        desc: "Simple GET request with JSON response",
        badge: "Basic",
        data: {
            "request": {
                "method": "GET",
                "url": "/api/resource"
            },
            "response": {
                "status": 200,
                "jsonBody": {
                    "message": "Hello, World!"
                },
                "headers": {
                    "Content-Type": "application/json"
                }
            }
        }
    },
    postWithBody: {
        title: "POST with Body Matching",
        desc: "POST request with body pattern matching",
        badge: "Basic",
        data: {
            "request": {
                "method": "POST",
                "url": "/api/users",
                "bodyPatterns": [
                    { "equalToJson": "{\n  \"name\": \"John\",\n  \"age\": 30\n}" }
                ]
            },
            "response": {
                "status": 201,
                "jsonBody": {
                    "id": "{{randomValue}}",
                    "name": "John",
                    "age": 30
                }
            }
        }
    },
    regexUrl: {
        title: "Regex URL Pattern",
        desc: "URL pattern matching with regex",
        badge: "Advanced",
        data: {
            "request": {
                "method": "GET",
                "urlPattern": "/api/users/[0-9]+"
            },
            "response": {
                "status": 200,
                "jsonBody": {
                    "id": "{{request.path.[2]}}",
                    "name": "User {{request.path.[2]}}"
                }
            }
        }
    },
    faultInjection: {
        title: "Fault Injection",
        desc: "Simulate delays and network errors",
        badge: "Testing",
        data: {
            "request": {
                "method": "GET",
                "url": "/api/slow"
            },
            "response": {
                "status": 200,
                "fixedDelayMilliseconds": 5000,
                "chunkedDribbleDelay": {
                    "numberOfChunks": 5,
                    "totalDuration": 5000
                }
            }
        }
    }
};

function initializeApp() {
    initializeEditors();
    loadTemplates();
    setupEventListeners();
    newDocument();
}

function initializeEditors() {
    // Main editor with performance optimizations
    editor = CodeMirror.fromTextArea(document.getElementById('jsonEditor'), {
        mode: 'application/json',
        theme: 'default',
        lineNumbers: true,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        matchBrackets: true,
        autoCloseBrackets: true,
        lineWrapping: true,
        viewportMargin: 10, // Performance: render only visible lines + buffer
        extraKeys: {
            'Ctrl-Space': 'autocomplete',
            'Ctrl-F': 'findPersistent',
            'Ctrl-N': newDocument,
            'Ctrl-O': loadFile,
            'Ctrl-S': saveFile,
            'Ctrl-G': searchJSONPath // Quick search shortcut
        }
    });
    
    // Add change listener with debouncing for history
    let changeTimeout;
    editor.on('change', function() {
        clearTimeout(changeTimeout);
        changeTimeout = setTimeout(() => {
            addToHistory(editor.getValue());
        }, 2000);
    });

    // Compare editors with performance optimizations
    compareEditorLeft = CodeMirror.fromTextArea(document.getElementById('compareEditorLeft'), {
        mode: 'application/json',
        theme: 'default',
        lineNumbers: true,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        matchBrackets: true,
        autoCloseBrackets: true,
        lineWrapping: true,
        viewportMargin: 10,
        readOnly: false
    });

    compareEditorRight = CodeMirror.fromTextArea(document.getElementById('compareEditorRight'), {
        mode: 'application/json',
        theme: 'default',
        lineNumbers: true,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        matchBrackets: true,
        autoCloseBrackets: true,
        lineWrapping: true,
        viewportMargin: 10,
        readOnly: false
    });
    
    // Add real-time diff highlighting
    let diffTimeout;
    const updateDiff = () => {
        clearTimeout(diffTimeout);
        diffTimeout = setTimeout(() => {
            highlightDifferences();
        }, 500);
    };
    
    compareEditorLeft.on('change', updateDiff);
    compareEditorRight.on('change', updateDiff);

    // Set initial content
    const initialContent = JSON.stringify({
        "request": {
            "method": "GET",
            "url": "/api/hello"
        },
        "response": {
            "status": 200,
            "body": "Hello, World!",
            "headers": {
                "Content-Type": "text/plain"
            }
        }
    }, null, 2);

    editor.setValue(initialContent);
    compareEditorLeft.setValue(initialContent);
    compareEditorRight.setValue(initialContent);
}

function setupEventListeners() {
    // Drag and drop
    const dragOverlay = document.getElementById('dragOverlay');
    
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!isDragging) {
            isDragging = true;
            dragOverlay.style.display = 'flex';
        }
    });
    
    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (isDragging && e.relatedTarget === null) {
            isDragging = false;
            dragOverlay.style.display = 'none';
        }
    });
    
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        isDragging = false;
        dragOverlay.style.display = 'none';
        
        if (e.dataTransfer.files.length > 0) {
            handleFileLoad(e.dataTransfer.files[0]);
        }
    });
    
    // Theme toggle
    const themeToggle = document.querySelector('.theme-icon');
    themeToggle.textContent = document.body.dataset.theme === 'dark' ? '☀️' : '🌙';
}

function switchMode(mode) {
    if (currentMode === mode) return;
    
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    
    const editorContainer = document.getElementById('editorContainer');
    const compareContainer = document.getElementById('compareContainer');
    const createEditControls = document.getElementById('createEditControls');
    const compareControls = document.getElementById('compareControls');
    
    switch (mode) {
        case 'create':
        case 'edit':
            editorContainer.style.display = 'block';
            compareContainer.style.display = 'none';
            createEditControls.style.display = 'flex';
            compareControls.style.display = 'none';
            break;
        case 'compare':
            editorContainer.style.display = 'none';
            compareContainer.style.display = 'flex';
            createEditControls.style.display = 'none';
            compareControls.style.display = 'flex';
            break;
    }
    
    currentMode = mode;
}

function newDocument() {
    const defaultContent = JSON.stringify({
        "request": {
            "method": "GET",
            "url": "/api/resource"
        },
        "response": {
            "status": 200,
            "body": "Hello, World!",
            "headers": {
                "Content-Type": "text/plain"
            }
        }
    }, null, 2);
    
    if (currentMode === 'compare') {
        compareEditorLeft.setValue(defaultContent);
        compareEditorRight.setValue(defaultContent);
    } else {
        editor.setValue(defaultContent);
    }
    
    addToHistory(defaultContent);
}

function loadFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => handleFileLoad(e.target.files[0]);
    input.click();
}

function handleFileLoad(file) {
    // Check file size for performance warning
    if (file.size > 1024 * 1024) { // 1MB
        if (!confirm('This file is quite large. Loading may take a moment. Continue?')) {
            return;
        }
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const content = e.target.result;
            
            // Performance optimization: validate JSON without parsing large objects
            if (content.length > 100000) {
                // For very large files, just check basic JSON syntax
                if (!content.trim().match(/^[\{\[].*[\}\]]$/)) {
                    throw new SyntaxError('Invalid JSON format');
                }
            } else {
                JSON.parse(content); // Full validation for smaller files
            }
            
            if (currentMode === 'compare') {
                compareEditorLeft.setValue(content);
            } else {
                editor.setValue(content);
            }
            
            addToHistoryImmediate(content);
        } catch (error) {
            alert('Invalid JSON file: ' + error.message);
        }
    };
    reader.readAsText(file);
}

function saveFile() {
    let content;
    if (currentMode === 'compare') {
        content = compareEditorLeft.getValue();
    } else {
        content = editor.getValue();
    }
    
    try {
        JSON.parse(content); // Validate JSON
    } catch (error) {
        alert('Invalid JSON: ' + error.message);
        return;
    }
    
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wiremock-stub.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadCompareFile(side) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target.result;
                JSON.parse(content); // Validate JSON
                
                if (side === 'left') {
                    compareEditorLeft.setValue(content);
                } else {
                    compareEditorRight.setValue(content);
                }
            } catch (error) {
                alert('Invalid JSON file: ' + error.message);
            }
        };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
}

function clearComparePanel(side) {
    if (side === 'left') {
        compareEditorLeft.setValue('');
    } else {
        compareEditorRight.setValue('');
    }
}

function searchJSONPath() {
    const pathInput = document.getElementById('jsonPathInput');
    const path = pathInput.value.trim();
    
    if (!path) {
        alert('Please enter a search term or JSONPath expression');
        return;
    }
    
    let content;
    let targetEditor;
    if (currentMode === 'compare') {
        content = compareEditorLeft.getValue();
        targetEditor = compareEditorLeft;
    } else {
        content = editor.getValue();
        targetEditor = editor;
    }
    
    // Check if it's a JSONPath (starts with $ or contains special characters)
    const isJSONPath = path.startsWith('$') || /[\[\]\*\?]/.test(path);
    
    if (isJSONPath) {
        // JSONPath search
        try {
            const obj = JSON.parse(content);
            let results;
            
            // Try using JSONPath library first
            try {
                if (typeof JSONPath !== 'undefined') {
                    results = JSONPath({ path: path, json: obj });
                } else {
                    throw new Error('JSONPath library not available');
                }
            } catch (e) {
                // Fallback to simple implementation
                results = simpleJSONPath(obj, path);
            }
            
            if (results.length > 0) {
                const formattedResults = JSON.stringify(results, null, 2);
                showSearchResults(`JSONPath Results (${results.length} found):\n${formattedResults}`);
            } else {
                showSearchResults('No results found for the given JSONPath');
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                showSearchResults('Invalid JSON content: ' + error.message);
            } else {
                showSearchResults('Error evaluating JSONPath: ' + error.message);
            }
        }
    } else {
        // String search
        performStringSearch(path, content, targetEditor);
    }
}

function performStringSearch(searchTerm, content, targetEditor) {
    const lines = content.split('\n');
    const matches = [];
    
    lines.forEach((line, index) => {
        const lineIndex = line.toLowerCase().indexOf(searchTerm.toLowerCase());
        if (lineIndex !== -1) {
            matches.push({
                line: index + 1,
                column: lineIndex,
                text: line.trim(),
                context: line.substring(Math.max(0, lineIndex - 20), lineIndex + searchTerm.length + 20)
            });
        }
    });
    
    if (matches.length > 0) {
        // Highlight first match in editor
        const firstMatch = matches[0];
        targetEditor.setCursor(firstMatch.line - 1, firstMatch.column);
        targetEditor.setSelection(
            {line: firstMatch.line - 1, ch: firstMatch.column},
            {line: firstMatch.line - 1, ch: firstMatch.column + searchTerm.length}
        );
        targetEditor.scrollIntoView({line: firstMatch.line - 1, ch: firstMatch.column});
        
        // Show results
        const resultText = matches.map(match => 
            `Line ${match.line}: ${match.context}`
        ).join('\n');
        
        showSearchResults(`String Search Results (${matches.length} found):\n${resultText}`);
    } else {
        showSearchResults(`No matches found for "${searchTerm}"`);
    }
}

function showSearchResults(message) {
    // Create or update search results modal
    let modal = document.getElementById('searchResultsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'searchResultsModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="toolbar-section">
                <div class="search-container">
                    <input type="text" id="jsonPathInput" placeholder="Search text or JSONPath ($.path)..." onkeydown="if(event.key==='Enter') searchJSONPath()">
                    <button class="btn btn-icon" onclick="searchJSONPath()" title="Search (Ctrl+G)">
                        🔍
                    </button>
                </div>
            </div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Search Results</h2>
                    <button class="btn btn-icon" onclick="closeSearchResults()">×</button>
                </div>
                <div class="modal-body">
                    <pre id="searchResultsText"></pre>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    document.getElementById('searchResultsText').textContent = message;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeSearchResults() {
    const modal = document.getElementById('searchResultsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function loadTemplates() {
    const templateGrid = document.getElementById('templateGrid');
    templateGrid.innerHTML = '';
    
    Object.entries(templates).forEach(([key, template]) => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.innerHTML = `
            <div class="template-header">
                <h3>${template.title}</h3>
                <span class="badge ${template.badge.toLowerCase()}">${template.badge}</span>
            </div>
            <p>${template.desc}</p>
            <button class="btn btn-primary" onclick="applyTemplate('${key}')">Apply</button>
        `;
        templateGrid.appendChild(card);
    });
}

function applyTemplate(templateKey) {
    const template = templates[templateKey];
    if (template) {
        const content = JSON.stringify(template.data, null, 2);
        if (currentMode === 'compare') {
            compareEditorLeft.setValue(content);
        } else {
            editor.setValue(content);
        }
        addToHistory(content);
        closeModal();
    }
}

function openModal() {
    document.getElementById('fullscreenModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('fullscreenModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function openHistoryModal() {
    updateHistoryModal();
    document.getElementById('historyModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeHistoryModal() {
    document.getElementById('historyModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Optimized history management
const MAX_HISTORY_SIZE = 50;
let historyTimeout;

function addToHistory(content) {
    // Debounce history additions to avoid spam
    clearTimeout(historyTimeout);
    historyTimeout = setTimeout(() => {
        addToHistoryImmediate(content);
    }, 1000);
}

function addToHistoryImmediate(content) {
    // Don't add if content is the same as last entry
    if (history.length > 0 && history[history.length - 1] === content) {
        return;
    }
    
    // Remove any future history if we're not at the end
    if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
    }
    
    history.push(content);
    historyIndex = history.length - 1;
    
    // Limit history size for performance
    if (history.length > MAX_HISTORY_SIZE) {
        history = history.slice(-MAX_HISTORY_SIZE);
        historyIndex = history.length - 1;
    }
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        const content = history[historyIndex];
        if (currentMode === 'compare') {
            compareEditorLeft.setValue(content);
        } else {
            editor.setValue(content);
        }
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        const content = history[historyIndex];
        if (currentMode === 'compare') {
            compareEditorLeft.setValue(content);
        } else {
            editor.setValue(content);
        }
    }
}

function updateHistoryModal() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    
    history.forEach((content, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="history-content">
                <pre>${content.substring(0, 100)}${content.length > 100 ? '...' : ''}</pre>
            </div>
            <div class="history-actions">
                <button class="btn btn-secondary" onclick="loadHistoryItem(${index})">Load</button>
            </div>
        `;
        item.classList.toggle('active', index === historyIndex);
        historyList.appendChild(item);
    });
}

function loadHistoryItem(index) {
    if (index >= 0 && index < history.length) {
        historyIndex = index;
        const content = history[index];
        if (currentMode === 'compare') {
            compareEditorLeft.setValue(content);
        } else {
            editor.setValue(content);
        }
        closeHistoryModal();
    }
}

function toggleTheme() {
    const body = document.body;
    const isDark = body.dataset.theme === 'dark';
    body.dataset.theme = isDark ? 'light' : 'dark';
    
    const themeIcon = document.querySelector('.theme-icon');
    themeIcon.textContent = isDark ? '🌙' : '☀️';
    
    // Update editor themes
    const theme = isDark ? 'default' : 'monokai';
    editor.setOption('theme', theme);
    compareEditorLeft.setOption('theme', theme);
    compareEditorRight.setOption('theme', theme);
}

// Diff highlighting function
function highlightDifferences() {
    if (currentMode !== 'compare') return;
    
    const leftContent = compareEditorLeft.getValue().split('\n');
    const rightContent = compareEditorRight.getValue().split('\n');
    
    // Clear existing marks
    compareEditorLeft.getAllMarks().forEach(mark => mark.clear());
    compareEditorRight.getAllMarks().forEach(mark => mark.clear());
    
    // Simple line-by-line diff
    const maxLines = Math.max(leftContent.length, rightContent.length);
    
    for (let i = 0; i < maxLines; i++) {
        const leftLine = leftContent[i] || '';
        const rightLine = rightContent[i] || '';
        
        if (leftLine !== rightLine) {
            // Highlight different lines
            if (i < leftContent.length) {
                compareEditorLeft.markText(
                    {line: i, ch: 0},
                    {line: i, ch: leftLine.length},
                    {className: 'diff-line-changed'}
                );
            }
            if (i < rightContent.length) {
                compareEditorRight.markText(
                    {line: i, ch: 0},
                    {line: i, ch: rightLine.length},
                    {className: 'diff-line-changed'}
                );
            }
        }
    }
}

// Performance monitoring
function logPerformance(label, fn) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`${label}: ${(end - start).toFixed(2)}ms`);
    return result;
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
