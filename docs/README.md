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

## Feature map
### Dashboard
| Status | Area | Key implementation | Notes |
| --- | --- | --- | --- |
| ✅ | Connection & health | `connectToWireMock`, `checkHealthAndStartUptime`, and `startHealthMonitoring` normalise the base URL, probe `/health` (with a `/mappings` fallback), update the status badge, and maintain the uptime timer.【F:js/features.js†L261-L333】【F:index.html†L16-L119】 |
| ✅ | Mapping management | `fetchAndRenderMappings`, `openEditModal`, and the optimistic cache helpers (`updateOptimisticCache`, `cacheManager`) fetch data, seed the cache from WireMock, keep counters aligned, and reconcile changes from the modal workflow.【F:js/features.js†L28-L249】【F:js/features.js†L2480-L2580】 |
| ✅ | Request log tools | `fetchAndRenderRequests`, `renderRequestCard`, and `clearRequests` drive the list, filtering hooks, and cleanup actions exposed on the Request Log page.【F:js/features.js†L1102-L1296】【F:index.html†L144-L238】 |
| ✅ | Scenario controls | `loadScenarios`, `setScenarioState`, and `resetAllScenarios` call the Admin API, render available states, and refresh after changes.【F:js/features.js†L1488-L1556】【F:index.html†L240-L322】 |
| ✅ | Cache service | `refreshImockCache`, `regenerateImockCache`, and the cache monitor surface rebuild state, optimistic queue depth, and the next validation tick directly in the UI.【F:js/features/cache.js†L1-L812】【F:index.html†L200-L214】 |
| ✅ | Recording workflow | `startRecording`, `stopRecording`, and `handleRecordingSnapshot` now read the Recording form inputs, stream status updates, and render captured stubs in `recordings-list`.【F:js/features/recording.js†L1-L284】【F:index.html†L604-L676】 |
| ✅ | Auto-refresh | `scheduleAutoRefresh` starts shared intervals for mappings and requests, exposes a countdown badge, and respects settings toggles with immediate refreshes.【F:js/main.js†L12-L152】【F:index.html†L210-L214】 |
| ✅ | Demo mode | `DemoMode.createLoader` seeds the dashboard with fixture mappings and requests so the Demo button works without a backend.【F:js/features/demo.js†L1-L112】【F:js/features.js†L157-L189】 |
| ✅ | Import/export buttons | `exportMappings`, `exportRequests`, and `executeImportFromUi` handle JSON/YAML flows, update status badges, and reuse the optimistic cache refresh to reflect new mappings instantly.【F:index.html†L520-L603】【F:js/features.js†L200-L270】 |
| ✅ | Near-miss tooling | `analyzeUnmatchedNearMisses`, `analyzeRequestNearMiss`, and `analyzePatternNearMiss` connect the helper endpoints to a triage card under Request Log.【F:index.html†L360-L415】【F:js/features/near-misses.js†L1-L195】 |

#### Auto-refresh & cache visibility
- The mapping header now includes a live auto-refresh badge driven by `scheduleAutoRefresh`, which reuses `LifecycleManager` intervals to refresh mappings and requests while counting down to the next run.【F:index.html†L200-L214】【F:js/main.js†L12-L168】
- A dedicated cache monitor renders the last rebuild time, optimistic queue size, and the next validation tick so that cache health is visible without opening DevTools.【F:index.html†L200-L214】【F:js/features/cache.js†L820-L910】

#### Recording workflow
- The Recording card reads the target URL, filters, and capture options before calling `startRecording`, `stopRecording`, and `handleRecordingSnapshot`, rendering captured stubs directly in `#recordings-list`.【F:index.html†L604-L676】【F:js/features/recording.js†L1-L284】
- `clearRecordings` issues `DELETE /recordings` with a graceful fallback to the request journal when the endpoint is unavailable, keeping the UI in sync with WireMock’s recording store.【F:js/features/recording.js†L185-L256】

#### Near-miss analysis
- The Request Log page exposes quick buttons that call the near-miss helpers for unmatched traffic, ad-hoc requests, and pattern JSON, displaying the results as formatted cards for triage.【F:index.html†L360-L415】【F:js/features/near-misses.js†L1-L195】

#### Import & export
- Import/export buttons now stream progress into the status area, support JSON/YAML downloads, and reuse optimistic cache helpers so newly imported mappings appear immediately.【F:index.html†L520-L603】【F:js/features.js†L200-L340】

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
| `GET /__admin/requests/unmatched` & near-miss endpoints | Near-miss actions render summaries and JSON payloads inside the Request Log analysis card.【F:index.html†L360-L415】【F:js/features/near-misses.js†L1-L195】 |
| `GET /__admin/scenarios` / `POST /__admin/scenarios/reset` / `PUT /__admin/scenarios/{name}/state` | Fully wired to the Scenarios page actions and inline buttons.【F:js/features.js†L1488-L1556】【F:index.html†L240-L322】 |
| Recording endpoints (`/recordings/start`, `/stop`, `/status`, `/snapshot`) | Recording controls stream status badges and render captured stubs without leaving the dashboard.【F:index.html†L604-L676】【F:js/features/recording.js†L1-L284】 |
| Import/export endpoints (`/mappings/import`, `/requests/remove`, `/recordings` delete) | Import/export actions now upload fixtures, download JSON/YAML, and clear recordings via the Admin API.【F:index.html†L520-L676】【F:js/features.js†L200-L340】【F:js/features/recording.js†L185-L256】 |

## Known gaps & follow-up items
- Extend Demo Mode fixtures to cover scenarios, recordings, and cache health so offline demos mirror live behaviour.【F:js/features/demo.js†L1-L112】【F:js/demo-data.js†L1-L240】
- Grow the JSON editor template catalog and expose quick actions for pinning favourite snippets.【F:editor/monaco-template-library.js†L1-L214】【F:editor/monaco-enhanced.js†L1059-L1160】
- Add recorded stub filtering and download controls so large capture sessions remain manageable from the dashboard.【F:index.html†L604-L676】【F:js/features/recording.js†L1-L284】
- Allow configuring auto-refresh per page and pause intervals automatically when the WireMock connection drops.【F:js/main.js†L12-L168】

## Testing & manual verification
### Automated
- `node tests/cache-workflow.spec.js` – covers optimistic cache create/update/delete flows and ensures the rendered mapping list reflects the cache contents after each operation.【F:tests/cache-workflow.spec.js†L1-L138】

### Manual smoke check
1. Connect to WireMock through **Connect**, confirming the status dot turns green, the uptime counter increments, and health latency appears.【F:index.html†L52-L118】【F:js/features.js†L261-L333】
2. On the **API Mappings** page, refresh, filter by method/status, open **Edit** to view the Monaco modal, and add/delete mappings to observe optimistic cache updates.【F:index.html†L52-L211】【F:js/features.js†L28-L249】
3. Switch to **Request Log**, refresh, apply method/status filters, and clear the log (if permissions allow) to ensure the list rehydrates correctly.【F:index.html†L120-L238】【F:js/features.js†L1102-L1296】
4. Visit **Scenarios**, refresh, change a scenario state, and use **Reset** to confirm Admin API hooks respond and re-render the list.【F:index.html†L240-L322】【F:js/features.js†L1488-L1556】
5. Open the standalone JSON Studio, load a mapping or paste JSON, then use **Format**, **Validate**, **Compare**, and **Save** (if connected to WireMock) to exercise Monaco operations.【F:editor/json-editor.html†L12-L215】【F:editor/monaco-enhanced.js†L1-L158】

