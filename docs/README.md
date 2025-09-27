# iMock Documentation

_Last updated: 2025-09-24_

## Quick start
### Prerequisites
- WireMock 3.x or later running locally (default admin endpoint `http://localhost:8080/__admin`).
- Node.js ≥ 18 to execute the automated regression spec.
- Any static file server (for example `python -m http.server 8000`) to serve the dashboard locally.

### Launching the dashboard
1. Start your WireMock instance.
2. Serve the repository root with your preferred static server, e.g. `python -m http.server 8000`.
3. Open `http://localhost:8000/index.html`.
4. Use the **Connect to WireMock Server** form to enter the host and port, press **Connect**, and watch the status dot, uptime counter, and health indicator update after the initial probe.

### Opening the JSON editor
- Navigate directly to `http://localhost:8000/editor/json-editor.html` (or open the file from disk). The Monaco-based workspace loads immediately and shares the same WireMock API helpers when saving mappings back to the server.

### Automated regression
- Run `node tests/cache-workflow.spec.js` from the project root. The spec loads `js/core.js` and `js/features.js` in a VM sandbox to assert that optimistic cache operations keep the cache map, optimistic queue, and rendered mappings in sync through create, update, and delete flows.

## Feature map
### Dashboard
| Status | Area | Key implementation | Notes |
| --- | --- | --- | --- |
| ✅ | Connection & health | `connectToWireMock`, `checkHealthAndStartUptime`, and `startHealthMonitoring` normalise the base URL, probe `/health` (with a `/mappings` fallback), update the status badge, and maintain the uptime timer.【F:js/features.js†L261-L333】【F:index.html†L16-L119】 |
| ✅ | Mapping management | `fetchAndRenderMappings`, `openEditModal`, and the optimistic cache helpers (`updateOptimisticCache`, `cacheManager`) fetch data, seed the cache from WireMock, keep counters aligned, and reconcile changes from the modal workflow.【F:js/features.js†L28-L249】【F:js/features.js†L2480-L2580】 |
| ✅ | Request log tools | `fetchAndRenderRequests`, `renderRequestCard`, and `clearRequests` drive the list, filtering hooks, and cleanup actions exposed on the Request Log page.【F:js/features.js†L1102-L1296】【F:index.html†L144-L238】 |
| ✅ | Scenario controls | `loadScenarios`, `setScenarioState`, and `resetAllScenarios` call the Admin API, render available states, and refresh after changes.【F:js/features.js†L1488-L1556】【F:index.html†L240-L322】 |
| ⚠️ | Cache service | `refreshImockCache`, `regenerateImockCache`, and the scheduled validation rebuild WireMock’s cache mapping and reset optimistic queues, but the flow still relies on live endpoints for full verification.【F:js/features.js†L1988-L2107】【F:js/features.js†L2584-L2662】 |
| ✅ | Recording workflow | `initializeRecordingForm`, `startRecording`, `stopRecording`, `takeRecordingSnapshot`, and `downloadRecordingResults` parse the OpenAPI fields (body matchers, extract thresholds, snapshot IDs), persist preferences, surface recorder status, and stream captured mappings with inline export controls.【F:js/features.js†L1599-L2219】【F:index.html†L333-L414】 |
| ⚠️ | Auto-refresh | Settings capture `auto-refresh` preferences, but no interval is started, so datasets refresh only on manual actions or cache rebuilds.【F:js/main.js†L250-L344】 |
| 🚧 | Demo mode | `loadMockData` only raises an informational toast; it does not populate demo mappings or requests.【F:js/features.js†L2728-L2738】 |
| 🚧 | Import/export buttons | The Import/Export page wires buttons to `exportMappings`, `exportRequests`, `importMappings`, and `importAndReplace`, yet these functions are undefined and trigger errors when clicked.【F:index.html†L120-L211】【F:js/features.js†L2686-L2727】 |
| 🚧 | Near-miss tooling | Helper functions (`findNearMissesForRequest`, `findNearMissesForPattern`, `getNearMissesForUnmatched`) exist without UI integration, so unmatched analysis is still manual.【F:js/features.js†L1708-L1760】 |

### JSON editor
| Status | Capability | Key implementation | Notes |
| --- | --- | --- | --- |
| ✅ | Monaco workspace | `MonacoInitializer` loads the editor, applies the WireMock schema, and creates single and diff editors with automatic layout support.【F:editor/monaco-enhanced.js†L1-L118】【F:editor/json-editor.html†L12-L158】 |
| ✅ | JSON operations | Worker-backed helpers format, minify, validate, and diff JSON, with a fallback that still runs these actions in environments where workers are unavailable.【F:editor/monaco-enhanced.js†L94-L158】【F:editor/performance-optimizations.js†L1-L120】 |
| ✅ | Compare mode & utilities | Toolbar controls switch between editor/compare, load files per side, export YAML, and toggle performance monitoring hooks for cache-aware editing workflows.【F:editor/json-editor.html†L20-L158】【F:editor/performance-optimizations.js†L122-L240】 |
| ⚠️ | Templates & history | The Templates and History modals are present in the markup, but no script populates `templateGrid` or `historyList`, leaving both views empty.【F:editor/json-editor.html†L166-L215】 |
| ⚠️ | Worker pool limits | `WorkerPool` skips instantiation when the app runs from `file://`, so heavy JSON operations fall back to the main thread in offline use.【F:editor/performance-optimizations.js†L121-L214】 |

## API coverage snapshot
| Endpoint | UI / Helper usage | Coverage notes |
| --- | --- | --- |
| `GET /__admin/health` | Health check on connect plus manual **Health Check** button.【F:js/features.js†L295-L340】【F:index.html†L68-L118】 |
| `GET /__admin/mappings` & CRUD | Mapping list, modal editor fetch, delete, optimistic cache refresh.【F:js/features.js†L28-L249】【F:js/features.js†L1200-L1287】 |
| `POST /__admin/mappings` / `PUT /__admin/mappings/{id}` / `DELETE /__admin/mappings/{id}` | Used by modal save/update and delete flows, plus cache regeneration upsert logic.【F:js/features.js†L1200-L1287】【F:js/features.js†L2030-L2090】 |
| `POST /__admin/mappings/reset` | Not currently invoked from the UI; available via helper backlog.【F:js/core.js†L150-L164】 |
| `GET /__admin/requests` & `DELETE /__admin/requests` | Request Log refresh and clear actions.【F:js/features.js†L1116-L1287】 |
| `POST /__admin/requests/count` / `POST /__admin/requests/find` | Helper functions exist for analytics, but no UI surfaces the results yet.【F:js/features.js†L1558-L1622】 |
| `GET /__admin/requests/unmatched` & near-miss endpoints | Helper functions implemented without UI glue; intended for future unmatched analysis tooling.【F:js/features.js†L1708-L1760】 |
| `GET /__admin/scenarios` / `POST /__admin/scenarios/reset` / `PUT /__admin/scenarios/set-state` | Fully wired to the Scenarios page actions and inline buttons.【F:js/features.js†L1488-L1556】【F:index.html†L240-L322】 |
| Recording endpoints (`/recordings/start`, `/stop`, `/status`, `/snapshot`) | Helpers post full spec-compliant bodies, render results, manage snapshot IDs, and expose a JSON download for generated mappings.【F:js/features.js†L1821-L2219】 |

| Import/export endpoints (`/mappings/import`, `/requests/remove`, etc.) | Placeholders only; buttons throw because handlers are undefined.【F:index.html†L120-L211】【F:js/features.js†L2686-L2727】 |

## Known gaps & follow-up items
- Polish snapshot UX by surfacing saved presets, quick ID pickers from the request journal, and richer result metadata (e.g. transformer badges).【F:index.html†L333-L414】【F:js/features.js†L1821-L2219】
- Implement Import/Export handlers or hide the buttons until the download/upload logic exists to prevent runtime errors.【F:index.html†L120-L211】【F:js/features.js†L2686-L2727】
- Add a Demo Mode data loader so the dashboard can be exercised without a live WireMock server.【F:js/features.js†L2728-L2738】
- Surface near-miss helper results in the UI to assist unmatched request triage.【F:js/features.js†L1708-L1760】
- Populate the JSON editor Templates and History modals with data and controls for inserting fragments or viewing saved revisions.【F:editor/json-editor.html†L166-L215】
- Consider exposing cache state (current source, optimistic queue depth) directly in the dashboard for easier monitoring while the cache pipeline evolves.【F:js/features.js†L2480-L2662】

## Testing & manual verification
### Automated
- `node tests/cache-workflow.spec.js` – covers optimistic cache create/update/delete flows and ensures the rendered mapping list reflects the cache contents after each operation.【F:tests/cache-workflow.spec.js†L1-L138】

### Manual smoke check
1. Connect to WireMock through **Connect**, confirming the status dot turns green, the uptime counter increments, and health latency appears.【F:index.html†L52-L118】【F:js/features.js†L261-L333】
2. On the **API Mappings** page, refresh, filter by method/status, open **Edit** to view the Monaco modal, and add/delete mappings to observe optimistic cache updates.【F:index.html†L52-L211】【F:js/features.js†L28-L249】
3. Switch to **Request Log**, refresh, apply method/status filters, and clear the log (if permissions allow) to ensure the list rehydrates correctly.【F:index.html†L120-L238】【F:js/features.js†L1102-L1296】
4. Visit **Scenarios**, refresh, change a scenario state, and use **Reset** to confirm Admin API hooks respond and re-render the list.【F:index.html†L240-L322】【F:js/features.js†L1488-L1556】
5. Open the standalone JSON Studio, load a mapping or paste JSON, then use **Format**, **Validate**, **Compare**, and **Save** (if connected to WireMock) to exercise Monaco operations.【F:editor/json-editor.html†L12-L215】【F:editor/monaco-enhanced.js†L1-L158】

