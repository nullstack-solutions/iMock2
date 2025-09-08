Monorepo overview (npm v6+ compatible)
======================================

Structure
- apps/wiremock-admin-ui: React + Vite admin UI
- packages/wiremock-sdk: Generated TypeScript SDK (OpenAPI)
- packages/wiremock-sdk-extra: Thin convenience wrapper over SDK

Generate SDK (PowerShell):
  $env:WM_OAS_URL = "http://<host>:<port>/__admin/docs/openapi.json"
  npm run generate:sdk

Install dependencies (no workspaces required):
  npm run bootstrap

Run UI dev server:
  npm run dev

Notes
- For CORS in WireMock, add --enable-stub-cors when running container.
- UI expects WireMock at the configured Base URL (default http://localhost:8080).
