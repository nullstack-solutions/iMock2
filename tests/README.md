# WireMock UI testing guide

## Automated regression
- `node tests/cache-workflow.spec.js` – exercises the optimistic cache workflow (create/update/delete) inside a VM sandbox to ensure `updateOptimisticCache` and `cacheManager` keep mappings, optimistic queues, and rendered cards aligned.【F:tests/cache-workflow.spec.js†L1-L138】

## Manual verification
- Follow the consolidated smoke walkthrough in [`docs/README.md#manual-smoke-check`](../docs/README.md#manual-smoke-check) to cover connection, mappings CRUD, request log filters, scenarios, and the JSON Studio tools.【F:docs/README.md†L72-L111】

## Known gaps to watch during testing
- Recording helpers call the endpoints but the Recording tab ignores its inputs and never renders captured mappings yet.【F:index.html†L324-L413】【F:js/features.js†L1624-L1704】
- Import/Export buttons still trigger undefined handlers, so avoid them until implementations land.【F:index.html†L120-L211】【F:js/features.js†L2686-L2727】
- Demo Mode remains a toast-only placeholder; connect to a live WireMock server for meaningful validation.【F:js/features.js†L2728-L2738】

