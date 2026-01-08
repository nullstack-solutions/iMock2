# iMock2 Repository Map

_Last updated: 2026-01-08_

This document provides a comprehensive map of the iMock2 repository structure, explaining the purpose and organization of each directory and key files.

---

## Repository Structure Overview

```
iMock2/
├── .github/              # GitHub configuration and workflows
├── docs/                 # Documentation
├── editor/               # Standalone JSON Studio editor
├── js/                   # Main application JavaScript
├── styles/              # CSS stylesheets
├── tests/               # Test suites
├── test-results/        # Test output (generated)
├── index.html           # Main dashboard UI
├── 404.html             # GitHub Pages 404 handler
├── package.json         # Node.js project configuration
├── playwright.config.js # E2E test configuration
├── eslint.config.js     # Linting configuration
└── [documentation files]
```

---

## Core Files

### Entry Points

| File | Purpose | Key Features |
|------|---------|--------------|
| `index.html` | Main dashboard UI | Tab navigation, connection UI, mapping/request/scenario management |
| `editor/json-editor.html` | Standalone JSON editor | Monaco integration, templates, diff view, history |
| `404.html` | GitHub Pages fallback | Redirects to main page |

### Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Node.js project metadata, scripts, dev dependencies |
| `package-lock.json` | Locked dependency versions |
| `.nvmrc` | Node.js version specification (20.x) |
| `playwright.config.js` | Playwright E2E test configuration |
| `eslint.config.js` | ESLint linting rules |
| `eslint-plugin-imock2.js` | Custom ESLint plugin for project-specific rules |
| `.gitignore` | Git ignore patterns |

### Documentation

| File | Content |
|------|---------|
| `README.md` | Project overview, quick start, features |
| `LICENSE` | MIT License |
| `ROADMAP.md` | High-level feature roadmap |
| `DATA_FLOW_ARCHITECTURE.md` | Detailed data flow diagrams (Russian/English) |

---

## Directory Structure

### `.github/` - GitHub Configuration

```
.github/
├── workflows/
│   ├── static.yml    # GitHub Pages deployment workflow
│   └── tests.yml     # CI test workflow
└── copilot-instructions.md  # Copilot AI coding guidelines
```

**Purpose:** GitHub-specific configuration for CI/CD and AI assistance.

**Workflows:**
- `static.yml`: Deploys to GitHub Pages on push to main/test branches
- `tests.yml`: Runs automated tests on PRs and commits

---

### `js/` - Main Application Code

```
js/
├── main.js              # Application initialization, settings loader
├── core.js              # Core utilities (800+ lines)
├── features.js          # Legacy feature implementations (2600+ lines)
├── managers.js          # Service managers (860+ lines)
├── demo-data.js         # Demo mode fixture data
├── editor.js            # Editor integration helpers
├── vendor-js-yaml.min.js  # Vendored js-yaml library
├── lib/
│   └── logger.js        # Logging utilities
├── core/
│   └── lifecycle.js     # Application lifecycle management
└── features/            # Domain-specific modules (newer architecture)
    ├── cache.js         # Cache management and synchronization
    ├── mappings.js      # Mapping CRUD operations
    ├── requests.js      # Request log handling
    ├── scenarios.js     # Scenario state management
    ├── recording.js     # Recording workflow (partial)
    ├── demo.js          # Demo mode loader
    ├── near-misses.js   # Near-miss analysis helpers
    ├── wiremock-extras.js  # Extended WireMock utilities
    ├── filters.js       # Filtering logic
    ├── filter-presets.js   # Predefined filter configurations
    ├── operations.js    # Common operations
    ├── management.js    # Entity management
    ├── store.js         # Data store helpers
    └── event-delegation.js  # Event handling patterns
```

#### Key Files

**main.js** (Application Initialization)
- Loads settings from LocalStorage
- Initializes cache manager
- Sets up event listeners
- Handles theme application
- Entry point: `window.onload`

**core.js** (Core Utilities - 800 lines)
- `apiFetch()`: Centralized API call wrapper
- `formatJson()`: JSON formatting utilities
- `showModal()`, `hideModal()`: Modal management
- Theme toggling and persistence
- Generic utility functions

**features.js** (Legacy Features - 2600 lines) ⚠️
- Connection management
- Mapping operations (create, update, delete)
- Request log rendering
- Scenario operations
- Import/export functionality
- **Status:** Scheduled for refactoring into domain modules

**managers.js** (Service Managers - 860 lines) ⚠️
- `NotificationManager`: Toast notifications
- `UIComponents`: Card/element creation
- Filter execution
- Tab management
- **Status:** Scheduled for extraction into focused services

**demo-data.js** (Demo Fixtures)
- Sample mappings with various HTTP methods
- Sample request log entries
- Used when `?demo=true` or WireMock unavailable

#### features/ Subdirectory (Modern Architecture)

**cache.js** (Cache Management)
- `CacheManager` class
- Memory cache (Map) for full mappings
- Optimistic update queue
- Server cache (`__imock_cache__`) synchronization
- `rebuildCache()`, `refreshImockCache()` functions

**mappings.js** (Mapping Operations)
- `fetchAndRenderMappings()`: Main rendering pipeline
- Mapping card creation and updates
- Filter application
- Index rebuilding

**requests.js** (Request Log)
- `fetchAndRenderRequests()`: Request log rendering
- Request card creation with expand/collapse
- Method and status filtering
- Clear requests functionality

**scenarios.js** (Scenario Management)
- `loadScenarios()`: Fetch scenario data
- `setScenarioState()`: State transitions
- `resetAllScenarios()`: Bulk reset
- Scenario state display

**recording.js** (Recording Workflow) ⚠️
- API helpers: `startRecording()`, `stopRecording()`
- Snapshot management
- **Status:** API complete, UI wiring incomplete

**demo.js** (Demo Mode)
- `DemoMode.createLoader()`: Fixture seeding
- Mock data injection
- Offline walkthrough support

**wiremock-extras.js** (Extended Utilities)
- Cache loading strategies (`loadImockCacheBestOf3()`)
- Slim mapping builder (`buildSlimList()`, `slimMapping()`)
- Cache metadata management

---

### `editor/` - JSON Studio Editor

```
editor/
├── json-editor.html          # Standalone editor page
├── monaco-enhanced.js        # Monaco initialization (1200 lines)
├── monaco-template-library.js  # WireMock stub templates
├── performance-optimizations.js  # Worker pool and optimization
├── json-worker.js            # Web Worker for JSON operations
└── codemirror5-fallback.html  # CodeMirror 5 legacy support
```

**Purpose:** Standalone Monaco-based JSON editor with WireMock schema validation.

**Key Features:**
- IntelliSense for WireMock properties
- JSON formatting, minification, validation
- Diff/compare mode (side-by-side)
- Template library with WireMock stubs
- History tracking with IndexedDB
- Web Worker acceleration

**monaco-enhanced.js** (Core Editor)
- `MonacoInitializer`: Editor setup with schema
- History management with deduplication
- Toolbar operations (format, minify, validate, export)
- Template modal rendering

**monaco-template-library.js** (Templates)
- Predefined WireMock stub templates
- Categories: Basic HTTP, JSON, Headers, Delays, Scenarios, etc.
- Preview cards with descriptions
- One-click template insertion

**performance-optimizations.js** (Workers)
- `WorkerPool`: Parallel JSON processing
- Worker lifecycle management
- Main thread fallback on file:// protocol
- Graceful degradation

---

### `styles/` - Stylesheets

```
styles/
└── components.css  # Main stylesheet
```

**Purpose:** UI styling for dashboard and editor.

**Key Sections:**
- Layout and grid system
- Component styles (cards, modals, tabs)
- Theme variables (light/dark)
- Responsive design rules
- Animation and transitions

---

### `tests/` - Test Suites

```
tests/
├── run-all.js              # Test runner
├── business-logic.spec.js  # Business logic tests
├── cache-workflow.spec.js  # Cache operation tests
├── mappings.spec.js        # Mapping tests
├── requests.spec.js        # Request log tests
├── scenarios.spec.js       # Scenario tests
├── recording.spec.js       # Recording tests
├── templates.spec.js       # Template tests
├── README.md               # Testing documentation
├── helpers/                # Test utilities
│   └── [helper files]
└── e2e/                    # E2E tests (Playwright)
    └── [test files]
```

**Test Approach:**
- VM-based test harness (no DOM required)
- Isolated module testing
- Fixture data for consistency
- Manual smoke test checklist in `docs/testing.md`

**Coverage:**
- Business logic: ✅ Working
- Cache workflows: ✅ Working
- E2E tests: Planned with Playwright

---

### `docs/` - Documentation

```
docs/
├── features.md             # Complete feature status tracking
├── api-coverage.md         # WireMock Admin API endpoint mapping
├── testing.md              # Testing procedures and checklists
├── development.md          # Development roadmap and guidelines
├── MAPPINGS_ARCHITECTURE.md  # Mapping data structure details
├── REPOSITORY_MAP.md       # This file
├── BUSINESS_FEATURES.md    # Business capabilities overview
└── editor/
    └── json-studio.md      # JSON Studio specification
```

**Documentation Strategy:**
- `features.md`: Single source of truth for feature status
- `api-coverage.md`: Maps UI features to WireMock API endpoints
- `testing.md`: Manual and automated test procedures
- `development.md`: Contribution guidelines and roadmap
- Architecture docs: Deep dives into data flow and structure

---

## File Size Analysis

### Monolithic Files (Refactoring Targets)

| File | Lines | Status | Priority |
|------|-------|--------|----------|
| `js/features.js` | ~2600 | 🔴 Oversized | High - Split into domains |
| `editor/monaco-enhanced.js` | ~1200 | 🔴 Oversized | Medium - Extract modules |
| `js/managers.js` | ~860 | 🔴 Oversized | High - Extract services |
| `js/core.js` | ~800 | 🟡 At limit | Low - Monitor growth |

### Well-Sized Modules

| File | Lines | Status |
|------|-------|--------|
| `js/features/cache.js` | ~520 | ✅ Good |
| `js/features/mappings.js` | ~320 | ✅ Good |
| `js/features/requests.js` | ~350 | ✅ Good |
| `js/features/scenarios.js` | ~220 | ✅ Good |
| `js/features/demo.js` | ~110 | ✅ Good |

**Target:** All files < 800 lines

---

## Data Flow Architecture

### Source of Truth Hierarchy

```
1. WireMock Server (Single source of truth)
   ↓
2. Memory Cache (CacheManager.cache Map)
   ↓
3. Global Arrays (window.originalMappings, window.allMappings)
   ↓
4. UI (DOM elements)
```

### Key State Locations

| State | Location | Type | Purpose |
|-------|----------|------|---------|
| Full mappings | `CacheManager.cache` | Map | Fast access, full data |
| Slim cache | WireMock `__imock_cache__` | Mapping | Fast initial load |
| Original data | `window.originalMappings` | Array | Pre-filter source |
| Filtered data | `window.allMappings` | Array | Post-filter, for rendering |
| Mapping index | `window.mappingIndex` | Map | Quick ID lookup |
| Optimistic queue | `cacheManager.optimisticQueue` | Array | Pending updates |

### Update Flows

**Create Mapping:**
```
UI → optimisticCache.add() → UI update → WireMock API → confirm → syncServerCache
```

**Update Mapping:**
```
UI → optimisticCache.update() → UI update → WireMock API → confirm → syncServerCache
```

**Delete Mapping:**
```
UI → optimisticCache.delete() → UI update → WireMock API → confirm → syncServerCache
```

---

## Module Dependencies

### Initialization Order (main.js)

1. Load settings from LocalStorage
2. Initialize CacheManager
3. Set up ENDPOINTS configuration
4. Register event listeners
5. Apply theme
6. Load initial data (cache or server)
7. Render UI

### Runtime Dependencies

```
index.html
  ↓
main.js
  ↓
  ├── core.js (utilities)
  ├── managers.js (services)
  └── features/ (domain modules)
      ├── cache.js
      ├── mappings.js
      ├── requests.js
      ├── scenarios.js
      ├── recording.js
      └── demo.js
```

### Editor Dependencies

```
json-editor.html
  ↓
monaco-enhanced.js
  ↓
  ├── monaco-template-library.js
  ├── performance-optimizations.js
  │   └── json-worker.js
  └── vendor-js-yaml.min.js (for YAML export)
```

---

## External Dependencies

### Runtime (CDN)
- Monaco Editor: `https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/`
- None others (self-contained)

### Development (npm)
- `@playwright/test`: E2E testing
- `eslint`: Code linting
- `serve`: Development server

### Vendored
- `js/vendor-js-yaml.min.js`: YAML parsing/export

---

## Build & Deployment

### Build Process
- **Current:** No build step (static HTML/JS/CSS)
- **Future:** Vite integration planned for optimization

### Deployment Pipeline
```
Push to main
  ↓
GitHub Actions (.github/workflows/static.yml)
  ↓
Deploy to gh-pages branch
  ↓
GitHub Pages hosting
  ↓
https://<username>.github.io/iMock2/
```

### Test Pipeline
```
Push/PR
  ↓
GitHub Actions (.github/workflows/tests.yml)
  ↓
Run npm test
  ↓
Report results
```

---

## Navigation Guide

### "I want to..."

**Add a new feature:**
1. Create module in `js/features/` (if new domain)
2. Wire in `main.js` initialization
3. Add UI in `index.html`
4. Update `docs/features.md`
5. Add tests in `tests/`

**Fix a bug:**
1. Locate relevant module in `js/` or `js/features/`
2. Check `docs/features.md` for feature context
3. Add test case reproducing bug
4. Fix and verify

**Modify UI:**
1. Edit `index.html` for structure
2. Edit `styles/components.css` for styling
3. Check `js/managers.js` for component creation logic

**Work on cache:**
1. Main logic: `js/features/cache.js`
2. WireMock extras: `js/features/wiremock-extras.js`
3. Architecture: `DATA_FLOW_ARCHITECTURE.md`
4. Tests: `tests/cache-workflow.spec.js`

**Work on editor:**
1. Editor UI: `editor/json-editor.html`
2. Monaco integration: `editor/monaco-enhanced.js`
3. Templates: `editor/monaco-template-library.js`
4. Workers: `editor/performance-optimizations.js`, `editor/json-worker.js`

**Write tests:**
1. Add to `tests/` directory
2. Follow pattern in existing `*.spec.js` files
3. Use test helpers in `tests/helpers/`
4. Update `tests/run-all.js` if new suite

**Update documentation:**
1. Feature status: `docs/features.md`
2. API coverage: `docs/api-coverage.md`
3. Testing: `docs/testing.md`
4. Development: `docs/development.md`
5. Architecture: `DATA_FLOW_ARCHITECTURE.md`

---

## Quick Reference

### Key Entry Points
- Dashboard: `index.html` → `main.js` → `features/`
- JSON Editor: `editor/json-editor.html` → `monaco-enhanced.js`
- Tests: `tests/run-all.js` → `*.spec.js`

### Key Classes
- `CacheManager`: Cache operations (cache.js)
- `NotificationManager`: Toast notifications (managers.js)
- `UIComponents`: UI element creation (managers.js)
- `MonacoInitializer`: Editor setup (monaco-enhanced.js)
- `WorkerPool`: Web Worker management (performance-optimizations.js)

### Key Functions
- `fetchMappingsFromServer()`: Get mappings from WireMock
- `fetchAndRenderMappings()`: Main mapping render pipeline
- `updateOptimisticCache()`: Optimistic UI updates
- `executeMappingFilters()`: Apply filters to mappings
- `refreshImockCache()`: Sync server cache

### Configuration Locations
- Settings: LocalStorage (key: `imockSettings`)
- Theme: LocalStorage (key: `imockTheme`)
- History: IndexedDB (database: `MonacoHistory`)
- Demo mode: `js/demo-data.js`

---

## Future Evolution

### Planned Refactoring (See docs/development.md)

**Phase 1 (Q1 2025):** Module extraction
- Split `features.js` into domain modules
- Extract services from `managers.js`
- Target: All files < 800 lines

**Phase 2 (Q2 2025):** Centralized state
- Replace `window` globals with store
- Redux/Zustand-style state management
- Improved debugging and testing

**Phase 3 (Q3 2025):** Build system
- Vite integration
- ES modules with import/export
- Production optimization

**Phase 4 (Ongoing):** Test coverage
- Expand to 70%+ coverage
- E2E tests with Playwright
- CI/CD integration

---

## Related Documents

- [Features Overview](features.md) - Feature status and capabilities
- [API Coverage](api-coverage.md) - WireMock endpoint mapping
- [Testing Guide](testing.md) - Test procedures
- [Development Roadmap](development.md) - Contribution guidelines
- [Data Flow Architecture](../DATA_FLOW_ARCHITECTURE.md) - Data flow diagrams
- [Business Features](BUSINESS_FEATURES.md) - Business capabilities

---

_This map is maintained as the project evolves. Last updated: 2026-01-08_
