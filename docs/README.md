# iMock Documentation

_Last updated: 2025-10-09_

> 📌 **Новый отчёт:** актуальный статус рефакторинга доступен в [docs/refactor-status.md](refactor-status.md).

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

### Import/Export essentials
- **Exports** – The Import/Export page offers one-click downloads for mappings or the request journal. The selected format (JSON/YAML) streams directly via `exportMappings` / `exportRequests` with filename + size surfaced in the status footer.【F:index.html†L520-L573】【F:js/features.js†L418-L492】
- **Imports** – Choose a JSON/YAML file, select the WireMock merge mode, and press **Import**. `executeImportFromUi` uploads the payload, displays the server response, and refreshes counters so the mapping list stays consistent.【F:index.html†L573-L618】【F:js/features.js†L494-L539】
- **Cache-aware** – After a successful import the cache badge updates automatically; for larger syncs use **Force Refresh Cache** to rebuild with the new assets.【F:index.html†L204-L274】【F:js/features/cache.js†L1-L260】

## Feature map
### Dashboard
| Status | Area | Key implementation | Notes |
| --- | --- | --- | --- |
| ✅ | Connection & health | `connectToWireMock`, `checkHealthAndStartUptime`, and `startHealthMonitoring` normalise the base URL, probe `/health` (with a `/mappings` fallback), update the status badge, and maintain the uptime timer.【F:js/features.js†L261-L333】【F:index.html†L16-L119】 |
| ✅ | Mapping management | `fetchAndRenderMappings`, `openEditModal`, and the optimistic cache helpers (`updateOptimisticCache`, `cacheManager`) fetch data, seed the cache from WireMock, keep counters aligned, and reconcile changes from the modal workflow.【F:js/features.js†L28-L249】【F:js/features.js†L2480-L2580】 |
| ✅ | Request log tools | `fetchAndRenderRequests`, `renderRequestCard`, and `clearRequests` drive the list, filtering hooks, and cleanup actions exposed on the Request Log page.【F:js/features.js†L1102-L1296】【F:index.html†L144-L238】 |
| ✅ | Scenario controls | `loadScenarios`, `setScenarioState`, and `resetAllScenarios` call the Admin API, render available states, and refresh after changes.【F:js/features.js†L1488-L1556】【F:index.html†L240-L322】 |
| ✅ | Cache service | `cacheManager`, `refreshMappingsFromCache`, and the new monitor badge surface queue depth, rebuild status, and last sync time while optimistic updates reconcile against the server.【F:js/features/cache.js†L1-L260】【F:index.html†L204-L274】 |
| ✅ | Recording workflow | `startRecordingFromUi`, `stopRecordingFromUi`, and `renderRecordedMappings` wire the Recording page form to the API, persist config choices, and stream captured mappings into the dashboard list.【F:js/features/recording.js†L1-L278】【F:index.html†L660-L724】 |
| ✅ | Auto-refresh | `AutoRefreshService` honours the Settings interval, exposes its schedule via the header badge, and refreshes mappings/requests/scenarios on the configured cadence.【F:js/core.js†L400-L611】【F:index.html†L204-L212】 |
| ✅ | Demo mode | `DemoMode.createLoader` seeds the dashboard with fixture mappings and requests so the Demo button works without a backend.【F:js/features/demo.js†L1-L112】【F:js/features.js†L157-L189】 |
| ✅ | Import/export workflows | `exportMappings`, `exportRequests`, and `executeImportFromUi` stream WireMock payloads, surface file metadata, and provide inline status messaging on completion.【F:index.html†L520-L618】【F:js/features.js†L418-L539】 |
| ✅ | Near-miss tooling | `populateNearMissRequestOptions`, `analyzeNearMissForSelectedRequest`, and the Request Log card render mismatches, scores, and pattern analysis inline for unmatched traffic triage.【F:index.html†L420-L520】【F:js/features/near-misses.js†L1-L253】 |

### JSON editor
| Status | Capability | Key implementation | Notes |
| --- | --- | --- | --- |
| ✅ | Monaco workspace | `MonacoInitializer` loads the editor, applies the WireMock schema, and creates single and diff editors with automatic layout support.【F:editor/monaco-enhanced.js†L1-L118】【F:editor/json-editor.html†L12-L158】 |
| ✅ | JSON operations | Worker-backed helpers format, minify, validate, and diff JSON, with a fallback that still runs these actions in environments where workers are unavailable.【F:editor/monaco-enhanced.js†L94-L158】【F:editor/performance-optimizations.js†L1-L120】 |
| ✅ | Compare mode & utilities | Toolbar controls switch between editor/compare, load files per side, export YAML, and toggle performance monitoring hooks for cache-aware editing workflows.【F:editor/json-editor.html†L20-L158】【F:editor/performance-optimizations.js†L122-L240】 |
| ✅ | Templates & history | `MonacoTemplateLibrary` feeds `renderTemplateLibrary`, while `MonacoInitializer` snapshots history entries to drive the modals and restore actions.【F:editor/monaco-template-library.js†L1-L214】【F:editor/monaco-enhanced.js†L585-L685】【F:editor/monaco-enhanced.js†L1059-L1160】 |
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
| `GET /__admin/requests/unmatched` & near-miss endpoints | Request Log actions populate the Near-miss Analysis card, including per-request and pattern based comparisons.【F:js/features/near-misses.js†L1-L253】【F:index.html†L420-L520】 |
| `GET /__admin/scenarios` / `POST /__admin/scenarios/reset` / `PUT /__admin/scenarios/{name}/state` | Fully wired to the Scenarios page actions and inline buttons.【F:js/features.js†L1488-L1556】【F:index.html†L240-L322】 |
| Recording endpoints (`/recordings/start`, `/stop`, `/status`, `/snapshot`) | The Recording page collects recorder spec options, streams status updates, and renders captured mappings inline after stop or snapshot actions.【F:js/features/recording.js†L1-L278】【F:index.html†L660-L724】 |
| Import/export endpoints (`/mappings/import`, `/requests/remove`, etc.) | Import/export buttons normalise selected files, stream export downloads, and display success/error messaging on completion.【F:js/features.js†L418-L539】【F:index.html†L520-L618】 |

## Known gaps & follow-up items
- Extend Demo Mode fixtures to cover scenarios, recordings, and cache health so offline demos mirror live behaviour.【F:js/features/demo.js†L17-L112】【F:js/demo-data.js†L1-L240】
- Grow the JSON editor template catalog and expose quick actions for pinning favourite snippets.【F:editor/monaco-template-library.js†L1-L214】【F:editor/monaco-enhanced.js†L1059-L1160】
- Expose the request analytics endpoints (`/requests/count`, `/requests/find`) through lightweight dashboards for investigative flows.【F:js/features.js†L1558-L1622】
- Provide quick actions on recorded mappings (bulk download, tagging, promote to library) to streamline playback workflows.【F:js/features/recording.js†L1-L278】
- Allow auto-refresh granularity per tab and pause/resume controls for low-traffic environments.【F:js/core.js†L400-L611】【F:index.html†L204-L212】
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

