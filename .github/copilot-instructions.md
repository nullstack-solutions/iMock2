# GitHub Copilot Instructions for iMock2

## Project Overview

iMock2 is a modern, browser-based UI for managing WireMock stub mappings, request logs, scenarios, and recordings. It provides a clean, intuitive interface with real-time monitoring, advanced JSON editing, and comprehensive API management—all running entirely in the browser.

**Technology Stack:**
- Vanilla JavaScript (ES6+), HTML5, CSS3
- Monaco Editor for JSON editing
- WireMock Admin REST API
- IndexedDB for history, LocalStorage for settings
- Web Workers for heavy JSON operations

## Architecture Principles

### Source of Truth
- WireMock server is the single source of truth
- Memory cache (CacheManager) stores full mappings for performance
- Server cache (`__imock_cache__`) provides slim mappings for fast initial load
- Optimistic UI updates with background synchronization

### Data Flow
1. **Load:** WireMock Server → HTTP API → Memory Cache → UI
2. **Update:** UI → Optimistic Cache → WireMock Server → Sync
3. **Filtering:** `window.originalMappings` → Filters → `window.allMappings` → Render

### Module Organization
- `js/features/` - Domain-specific modules (cache, mappings, requests, scenarios, recording, demo)
- `js/core.js` - Core utilities and helpers
- `js/main.js` - Application initialization
- `js/managers.js` - Service managers (notifications, UI components)
- `editor/` - Monaco-based JSON editor with templates and validation

## Coding Guidelines

### File Size Limits
- **Target:** All files should be < 800 lines
- **Current debt:** `features.js` (2600+ lines), `managers.js` (860+ lines) need refactoring
- When adding features, prefer creating new focused modules over expanding existing large files

### Naming Conventions
- **Files:** kebab-case (`mapping-service.js`, `cache-utils.js`)
- **Functions:** camelCase with action verbs (`fetchMappings`, `renderCard`, `updateCache`)
- **Classes:** PascalCase (`NotificationManager`, `CacheService`)
- **Constants:** UPPER_SNAKE_CASE (`API_BASE_URL`, `DEFAULT_TIMEOUT`)
- **Events:** kebab-case (`mapping-updated`, `cache-refreshed`)

### Code Style
- Use `const` for immutable variables, `let` for mutable
- Prefer optional chaining (`mapping.request?.method`)
- Use template literals for strings with variables
- Add error handling for all API calls
- Comments should explain "why", not "what"
- No `console.log` in production code (use logger if needed)

### Global State
- Current state uses `window` globals (technical debt)
- Key globals: `window.originalMappings`, `window.allMappings`, `window.mappingIndex`
- New code should minimize new globals; use existing state management patterns
- Future: Will migrate to centralized state management

### Testing
- Write unit tests for business logic in `tests/*.spec.js`
- Use existing test harness (VM-based, no DOM required)
- Test files should mirror source structure
- Manual smoke testing checklist in `docs/testing.md`

### Error Handling
- All API calls must have try-catch blocks
- Use NotificationManager for user-facing errors
- Log errors with context for debugging
- Graceful degradation (e.g., workers fallback to main thread)

## Common Tasks

### Adding a New Feature
1. Create module in `js/features/` if it's a new domain
2. Register in initialization sequence (`js/main.js`)
3. Add UI elements in `index.html` or create modal
4. Wire event handlers using event delegation pattern
5. Update `docs/features.md` with feature status
6. Add tests in `tests/`

### Working with Mappings
- Fetch: `fetchMappingsFromServer()` → full data from WireMock
- Cache: `CacheManager.cache` (Map) stores full mappings
- Update: Use `updateOptimisticCache()` for UI responsiveness
- Render: `fetchAndRenderMappings()` applies filters and renders cards
- Filters: `executeMappingFilters()` operates on `window.originalMappings`

### Working with Cache
- Memory cache: `CacheManager.cache.set(id, mapping)` for full mappings
- Server cache: `__imock_cache__` mapping stores slim data via `regenerateImockCache()`
- Optimistic updates: `cacheManager.optimisticQueue` tracks pending changes
- Sync: `refreshImockCache()` rebuilds server cache after changes

### Adding API Endpoints
1. Define endpoint in `window.ENDPOINTS` object
2. Use `window.apiFetch()` wrapper for consistent error handling
3. Update optimistic cache before server call
4. Sync server cache after successful operation
5. Update `docs/api-coverage.md`

### Working with Monaco Editor
- Located in `editor/` directory
- `monaco-enhanced.js` handles initialization and integration
- `monaco-template-library.js` provides WireMock stub templates
- `performance-optimizations.js` manages Web Workers
- Schema validation against WireMock mapping structure

## Known Limitations & Technical Debt

### High Priority
- **Monolithic files:** `features.js` (2600 lines) and `managers.js` (860 lines) need splitting
- **Global state:** Heavy reliance on `window` globals (migration to store planned)
- **Limited test coverage:** Only ~10% coverage (target: 70%+)

### In Progress Features
- **Recording workflow:** API integration complete, UI wiring incomplete
- **Auto-refresh:** Settings captured but scheduler not implemented
- **Near-miss analysis:** Helper functions exist, dashboard integration missing

### Performance Considerations
- Use Web Workers for heavy JSON operations (format, minify, diff)
- Workers fail gracefully to main thread on file:// protocol
- Debounce cache rebuilds (1 second)
- Optimistic updates for instant UI feedback

## Integration Points

### WireMock Admin API
- Base URL: `http://localhost:8080/__admin` (configurable)
- Key endpoints: `/mappings`, `/requests`, `/scenarios`, `/recordings`
- Full API coverage documented in `docs/api-coverage.md`

### Storage
- **LocalStorage:** Settings, preferences, theme
- **IndexedDB:** Editor history, large data snapshots
- **Session state:** Optimistic queue, runtime cache

### Demo Mode
- Fixture data in `js/demo-data.js`
- MockWireMockClient provides offline functionality
- Enable via `?demo=true` URL parameter or connection failure

## Documentation References

- **Features status:** `docs/features.md` - Complete feature tracking
- **API coverage:** `docs/api-coverage.md` - WireMock endpoint mapping
- **Testing guide:** `docs/testing.md` - Manual and automated tests
- **Development:** `docs/development.md` - Roadmap and guidelines
- **Architecture:** `DATA_FLOW_ARCHITECTURE.md` - Data flow diagrams
- **Repository map:** `docs/REPOSITORY_MAP.md` - File organization
- **Business features:** `docs/BUSINESS_FEATURES.md` - Capabilities overview

## Build & Test Commands

```bash
# Start development server
npm start  # Serves on port 53771

# Run all tests
npm test

# Run specific test
node tests/business-logic.spec.js

# Coverage report
npm run coverage
```

## Deployment

- **Production:** Push to `main` → Auto-deploy to GitHub Pages
- **Test environment:** Push to `test` branch → Deploy to `/test/` path
- **Static hosting:** No build step required (future: Vite integration planned)

## Dependencies

- Monaco Editor (CDN)
- js-yaml (CDN, vendored copy in `js/vendor-js-yaml.min.js`)
- No npm dependencies for runtime (dev dependencies: Playwright, ESLint)

## Getting Help

- Open issues: [GitHub Issues](https://github.com/nullstack-solutions/iMock2/issues)
- Discussions: [GitHub Discussions](https://github.com/nullstack-solutions/iMock2/discussions)
- Main README: `README.md`
- Feature status: `docs/features.md`

---

**When in doubt:**
1. Check existing patterns in similar features
2. Prioritize code clarity over cleverness
3. Test manually and add automated tests
4. Update documentation for new features
5. Keep files under 800 lines
