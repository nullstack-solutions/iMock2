# iMock status checklist *(Updated: 2025-09-29)*

## Dashboard
| Status | Area | Details |
| --- | --- | --- |
| ✅ | Connection & uptime | `connectToWireMock` and `checkHealthAndStartUptime` normalise the base URL, probe `/health` with a `/mappings` fallback, drive the status dot, and start the uptime ticker and health indicator.【F:js/features/cache.js†L192-L320】【F:index.html†L152-L198】 |
| ✅ | Mapping list & filters | `fetchAndRenderMappings` hydrates caches, reapplies optimistic queues, and refreshes counters via the shared state snapshots after each load.【F:js/features/mappings.js†L170-L320】【F:js/features/state.js†L95-L141】 |
| ✅ | Mapping CRUD & editor hand-off | `openEditModal`, the enhanced `cacheManager`, and `updateOptimisticCache` keep optimistic entries, rendered cards, and Monaco edits aligned with WireMock responses.【F:js/features/requests.js†L240-L347】【F:js/features/cache.js†L6-L520】 |
| ✅ | Request log review | `fetchAndRenderRequests`, `renderRequestCard`, and `clearRequests` manage filtering, preview toggles, and log cleanup on the Request Log page.【F:js/features/requests.js†L3-L141】【F:js/features/requests.js†L132-L217】 |
| ✅ | Scenario management | `loadScenarios`, `setScenarioState`, and `resetAllScenarios` surface Admin API actions with inline refresh on success.【F:js/features/scenarios.js†L55-L217】【F:index.html†L500-L521】 |
| ✅ | Settings & theme | `loadSettings`, `saveSettings`, and the global `toggleTheme` persist host/port, timeout, auth header, cache toggles, and UI theme across sessions.【F:js/main.js†L85-L198】【F:js/core.js†L720-L796】 |
| ✅ | Notifications & status UI | `NotificationManager` queues, dedupes, and renders toast feedback for cache, connection, and demo flows across the app.【F:js/managers.js†L6-L160】【F:js/managers.js†L310-L464】 |
| ✅ | Cache service monitoring | `cacheManager` now reports queue depth, rebuild status, and last sync time via the dashboard badge while optimistic updates reconcile with WireMock responses.【F:js/features/cache.js†L1-L360】【F:index.html†L204-L274】 |
| ✅ | Recording workflow | `startRecordingFromUi`, `stopRecordingFromUi`, and `renderRecordedMappings` drive the Recording page end-to-end, capturing configs, streaming status, and rendering captured mappings.【F:js/features/recording.js†L1-L278】【F:index.html†L660-L724】 |
| ✅ | Auto-refresh scheduler | `AutoRefreshService` honours the saved interval, updates the header badge, and refreshes mappings/requests/scenarios on cadence with pause-on-disconnect safeguards.【F:js/core.js†L400-L611】【F:index.html†L204-L212】 |
| ✅ | Demo mode | `DemoMode.createLoader` pumps fixture mappings and requests through the normal renderers and mirrors status notifications for offline walkthroughs.【F:js/features/demo.js†L17-L112】【F:js/features.js†L160-L212】 |
| ✅ | Import/export workflows | `executeImportFromUi`, `exportMappings`, and `exportRequests` normalise payloads, stream downloads, and refresh counters when the Import/Export buttons fire.【F:js/features.js†L418-L539】【F:index.html†L525-L603】 |
| ✅ | Near-miss analysis | The Request Log near-miss card populates unmatched requests, runs pattern checks, and renders mismatch summaries inline for quick triage.【F:index.html†L420-L520】【F:js/features/near-misses.js†L1-L253】 |

## JSON editor
| Status | Area | Details |
| --- | --- | --- |
| ✅ | Monaco initialisation | `MonacoInitializer` loads Monaco, applies the WireMock schema, and spins up the main and diff editors with automatic layout support.【F:editor/monaco-enhanced.js†L1-L118】【F:editor/json-editor.html†L12-L158】 |
| ✅ | JSON tooling | Worker-backed helpers format, minify, validate, and diff JSON with a graceful fallback when workers are unavailable.【F:editor/monaco-enhanced.js†L94-L158】【F:editor/performance-optimizations.js†L1-L120】 |
| ✅ | Toolbar & compare mode | Toolbar controls switch between Editor/Compare, load files per side, export YAML, and surface performance toggles for cache-aware edits.【F:editor/json-editor.html†L20-L158】【F:editor/performance-optimizations.js†L122-L240】 |
| ✅ | Templates & history modals | The template library module seeds preview cards, while `renderHistoryModal` surfaces IndexedDB snapshots with dedupe-aware retention and restore flows.【F:editor/monaco-template-library.js†L1-L200】【F:editor/monaco-enhanced.js†L600-L924】 |
| ⚠️ | Offline worker pool | `WorkerPool` skips instantiation on `file://`, so heavy JSON operations fall back to the main thread when the editor runs directly from disk.【F:editor/performance-optimizations.js†L121-L214】 |

## Backlog highlights
- Broaden the **Demo Mode** fixtures to include scenarios, recordings, and cache timelines so offline demos show end-to-end flows.【F:js/features/demo.js†L17-L112】【F:js/demo-data.js†L1-L200】
- Break down the remaining oversized modules (for example `managers.js`) into focused services that stay under the 800-line target while keeping the 20/80 hotspots covered.【F:js/managers.js†L1-L861】
- Harden history hashing (swap 32-bit FNV for 64-bit or `crypto.subtle.digest`) and consider optional diff storage to shrink exports.【F:editor/monaco-enhanced.js†L40-L210】
- Expose the request analytics endpoints (`/requests/count`, `/requests/find`) through dashboard widgets for operations teams.【F:js/features.js†L1558-L1622】
- Provide quick actions on recorded mappings (bulk download, tagging, promote to library) to streamline playback workflows.【F:js/features/recording.js†L1-L278】
- Allow auto-refresh granularity per tab and pause/resume controls for low-traffic environments.【F:js/core.js†L400-L611】【F:index.html†L204-L212】

## Testing
- **Automated** – Focus coverage on the extracted business-logic modules using the VM harnesses in `cache-workflow.spec.js` and `business-logic.spec.js` as baselines.【F:tests/cache-workflow.spec.js†L1-L160】【F:tests/business-logic.spec.js†L1-L194】
- **Demo harness** – Extend the demo-mode fixtures and specs to cover scenarios, recordings, and cache fallbacks so offline demos mirror live behaviour.【F:js/features/demo.js†L17-L112】【F:tests/business-logic.spec.js†L114-L194】
- **Manual smoke** – Follow the flow in `docs/README.md#manual-smoke-check` to cover connection, mappings CRUD, request log filters, scenarios, and JSON Studio tooling.【F:docs/README.md†L72-L111】

