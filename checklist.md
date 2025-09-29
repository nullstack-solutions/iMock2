# iMock status checklist *(Updated: 2025-09-25)*

## Dashboard
| Status | Area | Details |
| --- | --- | --- |
| ✅ | Connection & uptime | `connectToWireMock` and `checkHealthAndStartUptime` normalise the base URL, probe `/health` (falling back to `/mappings`), update the status dot, and start the uptime ticker and health indicator.【F:js/features.js†L261-L333】【F:index.html†L16-L118】 |
| ✅ | Mapping list & filters | `fetchAndRenderMappings` hydrates the global caches, renders cards, and reapplies filters and counters after refreshes.【F:js/features.js†L28-L249】 |
| ✅ | Mapping CRUD & editor hand-off | `openEditModal`, `updateOptimisticCache`, and `cacheManager` keep the optimistic cache, rendered list, and Monaco modal edits in sync with WireMock responses.【F:js/features.js†L1200-L1296】【F:js/features.js†L2480-L2580】 |
| ✅ | Request log review | `fetchAndRenderRequests`, `renderRequestCard`, and `clearRequests` power filtering, preview toggles, and log cleanup on the Request Log page.【F:js/features.js†L1102-L1296】【F:index.html†L144-L238】 |
| ✅ | Scenario management | `loadScenarios`, `setScenarioState`, and `resetAllScenarios` surface Admin API actions with inline refresh on success.【F:js/features.js†L1488-L1556】【F:index.html†L240-L322】 |
| ✅ | Settings & theme | `loadSettings`, `saveSettings`, and `toggleTheme` persist host/port, timeout, auth header, cache toggle, and UI theme across sessions.【F:js/main.js†L22-L138】【F:js/main.js†L344-L420】 |
| ✅ | Notifications & status UI | `NotificationManager` plus helper badges keep connection, cache, and toast messaging coherent across flows.【F:js/features.js†L230-L260】【F:js/features.js†L2584-L2662】 |
| ⚠️ | Cache service depth | `refreshImockCache`, `regenerateImockCache`, and scheduled validation rebuild the cache mapping and reset optimistic queues, but the integration still needs live end-to-end validation.【F:js/features.js†L1988-L2107】【F:js/features.js†L2584-L2662】 |
| ⚠️ | Recording workflow | `startRecording`, `stopRecording`, and `takeRecordingSnapshot` hit the endpoints, yet the Recording tab ignores input fields and never populates `recordings-list`.【F:js/features.js†L1624-L1704】【F:index.html†L324-L413】 |
| ⚠️ | Auto-refresh toggle | Settings capture interval preferences, but no interval timer runs, so updates remain manual unless the cache pipeline triggers them.【F:js/main.js†L250-L344】 |
| 🚧 | Demo mode | `loadMockData` only raises a toast and does not stage sample mappings or requests.【F:js/features.js†L2728-L2738】 |
| 🚧 | Import/export buttons | UI buttons call undefined `exportMappings`, `exportRequests`, `importMappings`, and `importAndReplace`, resulting in console errors when clicked.【F:index.html†L120-L211】【F:js/features.js†L2686-L2727】 |
| 🚧 | Near-miss helpers | `findNearMissesForRequest`, `findNearMissesForPattern`, and `getNearMissesForUnmatched` exist without UI glue, leaving unmatched analysis manual.【F:js/features.js†L1708-L1760】 |

## JSON editor
| Status | Area | Details |
| --- | --- | --- |
| ✅ | Monaco initialisation | `MonacoInitializer` loads Monaco, applies the WireMock schema, and spins up the main and diff editors with automatic layout support.【F:editor/monaco-enhanced.js†L1-L118】【F:editor/json-editor.html†L12-L158】 |
| ✅ | JSON tooling | Worker-backed helpers format, minify, validate, and diff JSON with a graceful fallback when workers are unavailable.【F:editor/monaco-enhanced.js†L94-L158】【F:editor/performance-optimizations.js†L1-L120】 |
| ✅ | Toolbar & compare mode | Toolbar controls switch between Editor/Compare, load files per side, export YAML, and surface performance toggles for cache-aware edits.【F:editor/json-editor.html†L20-L158】【F:editor/performance-optimizations.js†L122-L240】 |
| ✅ | Templates & history modals | `renderTemplateLibrary` and `renderHistoryModal` hydrate the modals, support preview/apply/copy, snapshot export, and restore flows with dedupe-aware history rolling.【F:editor/monaco-enhanced.js†L630-L1180】【F:editor/json-editor.html†L151-L215】 |
| ⚠️ | Offline worker pool | `WorkerPool` skips instantiation on `file://`, so heavy JSON operations fall back to the main thread when the editor runs directly from disk.【F:editor/performance-optimizations.js†L121-L214】 |

## Backlog highlights
- Wire the Recording tab inputs and list rendering to the existing helper responses.【F:index.html†L324-L413】【F:js/features.js†L1624-L1704】
- Implement Import/Export handlers or hide the buttons until the workflows exist.【F:index.html†L120-L211】【F:js/features.js†L2686-L2727】
- Stand up a **Demo Mode** mock client so that every dashboard tab, modal, and editor can be demonstrated without a backend. This includes seeding sample mappings/requests and routing Demo button flows through fixtures instead of live fetches.【F:js/features.js†L2728-L2738】
- Refactor oversized scripts (>1000 lines) into business-oriented modules that cap out around 800 lines, prioritising the 20% of code that drives 80% of usage (connection, mappings, requests, demo).【F:js/features.js†L1-L2738】【F:js/managers.js†L1-L870】
- Surface near-miss helper outputs in the dashboard for unmatched triage.【F:js/features.js†L1708-L1760】
- Harden history hashing (swap 32-bit FNV for 64-bit or `crypto.subtle.digest`) and consider optional diff storage to shrink exports.【F:editor/monaco-enhanced.js†L40-L360】
- Expose cache health (source indicator, optimistic queue depth) directly in the UI while the cache pipeline matures.【F:js/features.js†L2480-L2662】

## Testing
- **Automated** – Shift upcoming coverage toward business logic modules (store, cache, request/mapping services) with lightweight harnesses that run against mocked clients. Existing `node tests/cache-workflow.spec.js` remains the starting point.【F:tests/cache-workflow.spec.js†L1-L138】
- **Demo harness** – Wire the Demo button to a mocked API client so all modals, editors, and notifications can be exercised offline during development.
- **Manual smoke** – Follow the flow in `docs/README.md#manual-smoke-check` to cover connection, mappings CRUD, request log filters, scenarios, and JSON Studio tooling.【F:docs/README.md†L72-L111】

