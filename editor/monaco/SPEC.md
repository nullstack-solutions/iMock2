# WireMock JSON Studio — Specification

## 1. Purpose and Scope
WireMock JSON Studio is a browser-only tool for authoring, validating, searching, and comparing JSON files used in WireMock mappings. It runs as a static front-end application with no server dependencies.

Primary users are QA engineers and developers who need a fast way to create or adjust WireMock stubs, compare versions, and keep track of changes.

## 2. Architecture
- Type: single-page application with static assets only.
- Key files:
  - `json-editor.html` — markup and resource loading.
  - `json-editor.css` — styling, theming, highlighting, and modal layouts.
  - `json-editor.js` — UI logic, editor integration, history, search, and comparison.
  - `json-worker.js` — Web Worker that handles expensive tasks (formatting, minification, validation, JSONPath, diff).
  - `patch-history.js` — JSON patch based history (pseudo RFC-6902) with snapshots.
- Third-party dependencies (loaded via CDN but can be hosted locally):
  - CodeMirror 5 (core plus addons for folding, linting, and search).
  - JSONPath library.
  - `jsonlint-mod` (optional, improves error coordinates).

## 3. Functional Requirements
### 3.1 JSON Editor
- Syntax highlighting, line numbers, code folding, auto brackets, and soft wrap.
- Keyboard shortcuts (Win/Linux and macOS):
  - `Ctrl/Cmd+N` — new document.
  - `Ctrl/Cmd+O` — load file.
  - `Ctrl/Cmd+S` — save file.
  - `Ctrl/Cmd+Shift+F` — format JSON.
  - `Ctrl/Cmd+M` — minify JSON.
  - `Ctrl/Cmd+T` — validate JSON.
  - `Ctrl/Cmd+F` — search, `Ctrl/Cmd+G` — JSONPath, `F3/Shift+F3` — navigate results.
  - `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y` / `Ctrl/Cmd+Shift+Z` — undo/redo.
- Theme toggle (light/dark) that keeps editors in sync.
- Drag and drop `.json` files with an overlay and support for large files.

### 3.2 File Operations
- New document pre-populated with a default WireMock stub example.
- File load via dialog or drag and drop with validation; large files are validated inside the worker.
- Save validates first and downloads as `wiremock-stub.json`.

### 3.3 JSON Operations
- Formatting and minification executed in the Web Worker with success/error notifications.
- Validation combines `JSON.parse` with optional `jsonlint-mod` for accurate coordinates; inline markers (gutter dot, row highlight) and gentle scroll to the error location.

### 3.4 Search
- Text search options: case sensitivity (`Aa`), whole word (`W`), keys only (`K`), values only (`V`).
- Live highlighting while typing, results modal, and navigation with `F3/Shift+F3`.
- JSONPath search triggers when input equals `$` or starts with `$.`; executed in the worker with value output and simplified highlighting along the path.

### 3.5 Comparison (Compare)
- Dual editor panes (left/right), load/clear per side, and swap panes.
- Diff modes:
  - Linear — highlights differing lines.
  - Structural — deep JSON comparison (type/value/added/removed) with optional ignore order.
- Presents concise statistics and/or a list of changes.

### 3.6 WireMock Templates
- Built-in templates: Basic GET, POST with `bodyPatterns`, Regex URL, Fault Injection.
- Template picker modal that inserts the selected template into the active editor.

### 3.7 Change History
- JSON patch driven history: add/remove/replace for objects and arrays with periodic snapshots.
- Memory budget with automatic cleanup of older patches once limits are exceeded.
- Undo/redo controls, statistics view, export, and clear history actions.

### 3.8 Notifications and UI
- Non-intrusive toast notifications (success/info/warning/error).
- Modal dialogs: Templates, History, Search Results.

## 4. Non-Functional Requirements
- Performance: heavy operations run inside the Web Worker; debounce UI updates; configurable `viewportMargin`; light mode for large files (>5–10 MB) that disables resource-intensive live features.
- Reliability: fall back to running tasks on the main thread when Workers are unavailable for essential operations.
- Security: all processing stays in the browser; network requests only target CDN dependencies (recommend local hosting for offline use).
- Cross-browser support: modern Chrome/Firefox/Safari with graceful fallback when APIs are missing.
- UX/Accessibility: hotkeys, clear messaging, responsive layout, and visual error cues.

## 5. UI and Navigation
- Header: logo and theme switcher.
- Toolbar:
  - Editor mode: `New` / `Load` / `Save`.
  - Compare mode: `Load Left` / `Load Right` / `Clear Left` / `Clear Right`.
  - Mode tabs: `Editor` / `Compare`.
  - Search group: input field plus toggles `Aa/W/K/V`; actions ✨ format, 🧹 minify, ✅ validate, 🧩 templates, 🕒 history; 🔍 button.
- Main content: single editor or dual comparison panels.
- Modals: Templates, History, Search Results.

## 6. Algorithms and Implementation Details
- Validation: baseline `JSON.parse`; when `jsonlint-mod` is available extract exact `line/column`, add gutter marker and line highlight, and scroll to the position.
- Search:
  - JSONPath: executed in the worker via the JSONPath library (or a lightweight fallback); returns paths/values with simplified highlight based on string matches.
  - Text search: regular expressions with whole-word logic tailored for JSON context plus key/value filters.
- Comparison:
  - Linear: line-by-line diff highlighting by index.
  - Structural: recursive comparison with change types `added`, `deleted`, `value_change`, `type_change`; optional `ignoreKeyOrder` via key normalization.
- History (patch based):
  - Generate patches for objects and arrays, maintain periodic snapshots, softly prune to 80% of the limit when over capacity, support undo/redo, and allow exporting/importing history state.

## 7. Constraints and Assumptions
- CDN dependencies should be bundled or hosted internally for corporate/offline environments.
- JSON Schema validation is out of scope; only raw JSON syntax is checked.
- JSONPath highlighting remains simplified (path string matching instead of precise value positions).
- Light mode may disable certain live features to protect performance with large files.

## 8. Deployment
- Any static hosting platform or opening `json-editor.html` directly in the browser.
- For resilience, host dependencies locally (CodeMirror, JSONPath, `jsonlint-mod`).

## 9. Testing Recommendations
- Worker unit tests: formatting, minification, validation, JSONPath, and diff across valid and invalid payloads.
- Integration: drag and drop of large files, theme/mode switching, undo/redo, history management.
- UX: hotkeys, search, highlighting, modals, notifications.
- Performance: files of 1 MB / 5 MB / 10 MB+, confirm light mode behavior.

## 10. Roadmap (Potential Enhancements)
- Add JSON Schema validation with key auto-completion.
- Improve JSONPath highlighting with precise value positions.
- Expand WireMock templates and categories with a snippet library.
- Enhance structural diff (match array elements by keys/identifiers).
- Expose history settings in the UI (memory limit, snapshot cadence).

---
Document version: 1.0
