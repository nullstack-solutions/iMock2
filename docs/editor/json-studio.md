# WireMock JSON Studio — Specification

_Last updated: 2025-11-12_

## 1. Purpose and Scope

WireMock JSON Studio is a browser-only tool for authoring, validating, searching, and comparing JSON files used in WireMock mappings. It runs as a static front-end application with no server dependencies.

**Primary users:** QA engineers and developers who need a fast way to create or adjust WireMock stubs, compare versions, and keep track of changes.

---

## 2. Architecture

**Type:** Single-page application with static assets only

### Key Files

| File | Purpose |
|------|---------|
| `json-editor.html` | Markup and resource loading |
| `json-editor.css` | Styling, theming, highlighting, and modal layouts |
| `monaco-enhanced.js` | Monaco editor integration, UI logic, history, search |
| `json-worker.js` | Web Worker for expensive operations (formatting, validation, diff) |
| `monaco-template-library.js` | WireMock template management |
| `performance-optimizations.js` | Worker pool and performance monitoring |

### Third-Party Dependencies

Loaded via CDN (can be hosted locally):
- **Monaco Editor** — Modern code editor with IntelliSense
- **JSONPath library** — Query support
- **jsonlint-mod** (optional) — Improved error coordinates

---

## 3. Functional Requirements

### 3.1 Monaco Editor Integration

- ✅ **Syntax highlighting** with WireMock schema validation
- ✅ **IntelliSense** for WireMock mapping structure
- ✅ **Line numbers, code folding, auto-completion**
- ✅ **Soft wrap** and bracket matching
- ✅ **Keyboard shortcuts:**
  - `Ctrl/Cmd+N` — New document
  - `Ctrl/Cmd+O` — Load file
  - `Ctrl/Cmd+S` — Save file
  - `Ctrl/Cmd+Shift+F` — Format JSON
  - `Ctrl/Cmd+M` — Minify JSON
  - `Ctrl/Cmd+T` — Validate JSON
  - `Ctrl/Cmd+F` — Search
  - `Ctrl/Cmd+Z/Y` — Undo/Redo

### 3.2 File Operations

- ✅ **New document** pre-populated with WireMock stub template
- ✅ **File load** via dialog or drag-and-drop
- ✅ **Large file support** with worker-based validation
- ✅ **Save** with pre-validation (downloads as `wiremock-stub.json`)
- ✅ **Drag-and-drop** with visual overlay

### 3.3 JSON Operations

- ✅ **Format** — Pretty-print JSON (via Web Worker)
- ✅ **Minify** — Compress JSON (via Web Worker)
- ✅ **Validate** — Syntax check with inline error markers
  - Gutter indicators for error lines
  - Gentle scroll to error location
  - Detailed error messages with line/column coordinates

### 3.4 Search Capabilities

**Text Search:**
- ✅ Case sensitivity toggle (`Aa`)
- ✅ Whole word matching (`W`)
- ✅ Keys-only search (`K`)
- ✅ Values-only search (`V`)
- ✅ Live highlighting while typing
- ✅ Results modal with navigation (`F3/Shift+F3`)

**JSONPath Search:**
- ✅ Triggered by `$` or `$.` prefix
- ✅ Executed in Web Worker
- ✅ Value output with path highlighting
- ✅ Simplified result visualization

### 3.5 Comparison Mode

- ✅ **Dual panes** (left/right editors)
- ✅ **Load/clear** per side independently
- ✅ **Swap panes** functionality
- ✅ **Diff modes:**
  - **Linear** — Line-by-line highlighting
  - **Structural** — Deep JSON comparison
    - Type/value changes
    - Added/removed keys
    - Optional key order ignore

### 3.6 WireMock Templates

Built-in templates accessible via template picker:

| Template | Description |
|----------|-------------|
| Basic GET | Simple request/response mapping |
| POST with bodyPatterns | Request body matching |
| Regex URL | Pattern-based URL matching |
| Fault Injection | Simulating errors and delays |
| Scenario State | Stateful stub behavior |

Templates insert into active editor with cursor positioning.

### 3.7 Change History

- ✅ **JSON patch-based tracking** (RFC-6902 inspired)
- ✅ **Periodic snapshots** for efficient storage
- ✅ **Memory budget** with automatic cleanup
- ✅ **Undo/redo** controls
- ✅ **Statistics view** (total edits, snapshot count)
- ✅ **Export/import** history state
- ✅ **Clear history** action

### 3.8 UI/UX Features

- ✅ **Theme toggle** (light/dark) with persistence
- ✅ **Non-intrusive toast notifications:**
  - Success (green)
  - Info (blue)
  - Warning (yellow)
  - Error (red)
- ✅ **Modal dialogs:**
  - Template picker
  - History viewer
  - Search results
- ✅ **Responsive layout** for different screen sizes

---

## 4. Non-Functional Requirements

### Performance

- ✅ **Web Workers** for heavy operations (format, validate, diff)
- ✅ **Debounced updates** for live features
- ✅ **Configurable viewport margins** for large files
- ✅ **Light mode** for files >5MB (disables resource-intensive features)
- ✅ **Worker pool** for parallel JSON operations

### Reliability

- ✅ **Graceful fallback** when Web Workers unavailable
- ✅ **Main thread processing** as backup for essential operations
- ✅ **Error boundaries** prevent full app crashes

### Security

- ✅ **Browser-only processing** — no data leaves client
- ✅ **CDN dependencies** (recommend local hosting for air-gapped environments)
- ✅ **No external analytics** or tracking

### Cross-Browser Support

- ✅ Modern Chrome/Firefox/Safari/Edge
- ⚠️ Graceful degradation for missing APIs
- ⚠️ Fallback for `file://` protocol (workers disabled)

### Accessibility

- ✅ Keyboard shortcuts for all major operations
- ✅ Clear error messaging with visual indicators
- ✅ Responsive layout
- ⚠️ Screen reader support (partial)

---

## 5. UI Layout

### Header
- Logo and application title
- Theme switcher (light/dark)

### Toolbar

**Editor Mode:**
- File operations: `New` / `Load` / `Save`
- JSON tools: Format / Minify / Validate
- Utilities: Templates / History / Search

**Compare Mode:**
- Per-side controls: `Load Left` / `Load Right` / `Clear Left` / `Clear Right`
- Diff options: Linear / Structural / Ignore Order
- Statistics display

### Main Content Area
- **Editor mode:** Single Monaco instance
- **Compare mode:** Side-by-side diff editors

### Modals
- Template picker with preview cards
- History viewer with restore functionality
- Search results with navigation

---

## 6. Technical Implementation Details

### Validation Algorithm

1. **Baseline:** `JSON.parse()` for syntax checking
2. **Enhanced (if jsonlint-mod available):**
   - Extract exact `line/column` coordinates
   - Add gutter markers at error lines
   - Apply line highlighting
   - Auto-scroll to error position

### Search Implementation

**Text Search:**
```javascript
// Regular expression with context filters
const regex = buildRegex(query, { caseSensitive, wholeWord });
const results = findInJSON(text, regex, { keysOnly, valuesOnly });
```

**JSONPath:**
```javascript
// Worker-based execution
postMessage({ type: 'jsonpath', path: query, json: content });
// Returns: { matches: [...], values: [...] }
```

### Comparison Engine

**Linear Diff:**
- Split both sides into lines
- Compare by index
- Highlight differing indices

**Structural Diff:**
```javascript
function deepCompare(obj1, obj2, options = {}) {
  // Recursive comparison with change types:
  // - 'added': key exists in obj2 only
  // - 'deleted': key exists in obj1 only
  // - 'type_change': same key, different types
  // - 'value_change': same key/type, different values

  if (options.ignoreKeyOrder) {
    obj1 = normalizeKeys(obj1);
    obj2 = normalizeKeys(obj2);
  }

  return generateDiff(obj1, obj2);
}
```

### History Management (Patch-Based)

```javascript
class HistoryManager {
  constructor(options = {}) {
    this.maxPatches = options.maxPatches || 100;
    this.snapshotInterval = options.snapshotInterval || 20;
    this.patches = [];
    this.snapshots = [];
  }

  recordChange(before, after) {
    const patch = generatePatch(before, after);
    this.patches.push(patch);

    if (this.patches.length % this.snapshotInterval === 0) {
      this.createSnapshot(after);
    }

    if (this.patches.length > this.maxPatches) {
      this.pruneHistory();
    }
  }

  pruneHistory() {
    // Remove oldest patches, keep 80% of limit
    const keepCount = Math.floor(this.maxPatches * 0.8);
    this.patches = this.patches.slice(-keepCount);
  }
}
```

---

## 7. Constraints and Assumptions

### Known Limitations

- ❌ **JSON Schema validation** — Out of scope (only syntax checking)
- ⚠️ **JSONPath highlighting** — Simplified (string matching vs. precise positions)
- ⚠️ **Worker limitations on `file://`** — Disabled for security reasons
- ⚠️ **Large file mode** — May disable live features for performance

### Assumptions

- Users have modern browsers (ES6+ support)
- Network access for CDN dependencies (or local hosting configured)
- Files are valid JSON or will be validated before operations

---

## 8. Deployment

### Static Hosting

Deploy to any static host:
- GitHub Pages
- Netlify
- Vercel
- AWS S3 + CloudFront
- Local web server

### Offline/Air-Gapped Environments

1. Download and host dependencies locally:
   ```
   /vendor/
     ├── monaco-editor/
     ├── jsonpath/
     └── jsonlint-mod/
   ```

2. Update script references in `json-editor.html`

3. Serve via internal web server

---

## 9. Testing Recommendations

### Unit Tests
- ✅ Worker operations (format, minify, validate, JSONPath, diff)
- ✅ History management (patches, snapshots, pruning)
- ✅ Search algorithms (text, JSONPath, filters)

### Integration Tests
- ✅ Drag-and-drop file loading
- ✅ Theme/mode switching persistence
- ✅ Undo/redo across multiple operations
- ✅ Template insertion and editing

### UX Testing
- ✅ All keyboard shortcuts functional
- ✅ Search highlighting accurate
- ✅ Modal interactions smooth
- ✅ Notifications appear and dismiss correctly

### Performance Testing
- ✅ 1MB file — full feature set
- ✅ 5MB file — light mode triggers
- ✅ 10MB+ file — graceful degradation
- ✅ Worker pool efficiency

---

## 10. Roadmap (Future Enhancements)

### Planned Features

| Priority | Feature | Description |
|----------|---------|-------------|
| High | JSON Schema Validation | Full schema support with auto-completion |
| High | Improved JSONPath Highlighting | Precise value position markers |
| Medium | Extended Template Library | Categories, favorites, custom templates |
| Medium | Enhanced Diff Matching | Array element matching by keys |
| Low | History Settings UI | Expose memory limits and snapshot intervals |
| Low | Collaborative Features | Share sessions via URL (view-only) |

### Under Consideration

- Export to YAML/XML formats
- Batch validation for multiple files
- Integration with WireMock recording endpoints
- Plugin system for custom validators

---

## 11. References

- [Monaco Editor Documentation](https://microsoft.github.io/monaco-editor/)
- [WireMock Request Matching](https://wiremock.org/docs/request-matching/)
- [WireMock Response Templating](https://wiremock.org/docs/response-templating/)
- [JSONPath Syntax](https://goessner.net/articles/JsonPath/)
- [RFC 6902 - JSON Patch](https://tools.ietf.org/html/rfc6902)

---

**Document version:** 2.0
**Last updated:** 2025-11-12
