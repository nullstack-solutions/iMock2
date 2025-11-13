# Development Guide & Roadmap

_Last updated: 2025-11-12_

This document outlines the development roadmap, contribution guidelines, code organization principles, and architectural evolution plan for iMock.

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Refactoring Roadmap](#refactoring-roadmap)
3. [Code Organization](#code-organization)
4. [Development Workflow](#development-workflow)
5. [Contribution Guidelines](#contribution-guidelines)
6. [Future Enhancements](#future-enhancements)

---

## Current Architecture

### Technology Stack

**Frontend:**
- Vanilla JavaScript (ES6+)
- HTML5 / CSS3
- No build step (development simplicity)
- No external framework dependencies

**Editors:**
- Monaco Editor (JSON Studio)
- CodeMirror 5 (legacy support)

**Storage:**
- LocalStorage (settings, preferences)
- IndexedDB (history, large data)
- Session caching (optimistic updates)

**Workers:**
- Web Workers for heavy JSON operations
- Graceful fallback to main thread

### Project Structure

```
iMock2/
├── index.html              # Main dashboard
├── js/
│   ├── main.js            # Application initialization
│   ├── core.js            # Core utilities (800+ lines)
│   ├── features.js        # Feature implementations (2600+ lines)
│   ├── managers.js        # Service managers (860+ lines)
│   ├── demo-data.js       # Demo mode fixtures
│   └── features/          # Domain modules (newer)
│       ├── cache.js
│       ├── mappings.js
│       ├── requests.js
│       ├── scenarios.js
│       ├── recording.js
│       ├── demo.js
│       └── near-misses.js
├── styles/
│   └── components.css     # UI styling
├── editor/
│   ├── json-editor.html   # Standalone JSON Studio
│   ├── monaco-enhanced.js # Monaco integration
│   ├── monaco-template-library.js
│   ├── performance-optimizations.js
│   └── json-worker.js     # Web Worker
├── tests/
│   ├── business-logic.spec.js
│   └── cache-workflow.spec.js
└── docs/                  # Documentation
    ├── features.md
    ├── api-coverage.md
    ├── testing.md
    ├── development.md
    └── editor/
        └── json-studio.md
```

### Known Technical Debt

| Issue | Impact | Priority |
|-------|--------|----------|
| **Monolithic modules** | `features.js` (2600+ lines), `managers.js` (860+ lines) | 🔴 High |
| **Global state** | Heavy reliance on `window` globals | 🟡 Medium |
| **No build system** | Cannot use modern ES modules, tree-shaking | 🟡 Medium |
| **Limited test coverage** | Only 2 automated test files | 🔴 High |
| **Manual dependency management** | CDN-based, no package.json | 🟢 Low |

---

## Refactoring Roadmap

The immediate focus is to **untangle monolithic scripts** while keeping development smooth. We follow the **20/80 principle**: identify the 20% of modules driving 80% of usage and stabilize them first.

### Phase 1: Module Extraction (Q1 2025)

**Goal:** Break down monolithic files into focused domain modules

**Target Modules:**
- `features.js` → Split into domain modules (~800 lines each max)
- `managers.js` → Extract to `src/managers/`

**Domain Boundaries:**
```
src/
├── connection/
│   └── health-monitor.js
├── mappings/
│   ├── mapping-service.js
│   ├── mapping-renderer.js
│   └── mapping-cache.js
├── requests/
│   ├── request-service.js
│   └── request-renderer.js
├── scenarios/
│   └── scenario-service.js
├── notifications/
│   └── notification-manager.js
└── shared/
    ├── cache-utils.js
    ├── filter-utils.js
    └── format-utils.js
```

**Success Criteria:**
- All modules < 800 lines
- Clear single responsibility per file
- Reduced coupling between features
- No functionality regression

---

### Phase 2: Centralized State Management (Q2 2025)

**Goal:** Replace `window` globals with central store

**Approach:**
- Create lightweight store module (Redux/Zustand pattern)
- Migrate global state incrementally
- Maintain backward compatibility during transition

**Store Structure:**
```javascript
const store = {
  state: {
    connection: { status, uptime, health },
    mappings: { items, filters, cache },
    requests: { items, filters },
    scenarios: { items },
    settings: { theme, server, preferences },
    ui: { activeTab, modals }
  },
  actions: {
    // State mutations
  },
  subscribers: []
};
```

**Benefits:**
- Predictable state updates
- Easier debugging (state history)
- Better test isolation
- Foundation for React/Vue migration (future)

---

### Phase 3: Build System Integration (Q3 2025)

**Goal:** Introduce modern build tooling while maintaining simplicity

**Tool Selection:**
- **Vite** (preferred) or Webpack
- Minimal configuration
- Development mode serves unbundled (fast)
- Production builds optimize

**Migration Plan:**

1. **Add package.json:**
   ```json
   {
     "name": "imock",
     "type": "module",
     "scripts": {
       "dev": "vite",
       "build": "vite build",
       "preview": "vite preview",
       "test": "node tests/*.spec.js"
     }
   }
   ```

2. **Convert to ES Modules:**
   - Migrate `js/` to `src/` with `.js` modules
   - Use `import/export` syntax
   - Update HTML to use module entry point

3. **Preserve Static Hosting:**
   - Build output to `dist/`
   - GitHub Pages serves `dist/`
   - No server-side rendering required

**Rollout:**
- Keep current structure working in parallel
- Gradual module conversion
- Full cutover after validation

---

### Phase 4: Test Coverage Expansion (Ongoing)

**Goal:** Increase automated test coverage from ~10% to 70%+

**Test Strategy:**

#### Business Logic Tests (Unit)
- Pure functions in `src/shared/`
- Cache operations
- Filter/format utilities
- State management

**Target:** 80% coverage of business logic

#### Service Tests (Integration)
- API client calls
- Mock fetch responses
- State transitions
- Cache reconciliation

**Target:** 60% coverage of services

#### UI Tests (E2E)
- Playwright or Cypress
- Critical user flows
- Cross-browser verification

**Target:** 90% coverage of happy paths

**Test Expansion Roadmap:**

| Quarter | Focus | Files |
|---------|-------|-------|
| Q1 2025 | Cache operations | `cache-*.spec.js` |
| Q2 2025 | Mapping CRUD | `mappings-*.spec.js` |
| Q3 2025 | Request handling | `requests-*.spec.js` |
| Q4 2025 | E2E flows | `e2e/*.spec.js` |

---

### Phase 5: Enhanced Demo Mode (Q1 2025)

**Goal:** Make Demo Mode self-sufficient for onboarding and QA

**Current State:**
- Basic fixture mappings and requests
- Toast notifications only
- No scenarios or recordings

**Enhancements:**

1. **Expanded Fixtures:**
   - Scenario state transitions
   - Recording snapshots
   - Cache timeline simulation
   - Near-miss examples

2. **Mock API Client:**
   ```javascript
   class MockWireMockClient {
     constructor(fixtures) {
       this.mappings = fixtures.mappings;
       this.requests = fixtures.requests;
       this.scenarios = fixtures.scenarios;
     }

     async getMappings() {
       return Promise.resolve(this.mappings);
     }

     async createMapping(mapping) {
       this.mappings.push(mapping);
       return Promise.resolve({ id: generateId() });
     }

     // ... other endpoints
   }
   ```

3. **Demo Mode Indicator:**
   - Persistent banner showing demo status
   - Easy exit to live mode

4. **Fixture Reuse in Tests:**
   - Share fixtures between demo and test suites
   - Ensure consistency

**Benefits:**
- Offline demos at conferences
- Safe exploration for new users
- QA validation without backend

---

## Code Organization

### File Size Guidelines

**Target:** All files < 800 lines (exception: generated code)

**Current Status:**

| File | Lines | Status | Action |
|------|-------|--------|--------|
| `js/features.js` | 2600+ | 🔴 Oversized | Split into domains |
| `js/managers.js` | 860+ | 🔴 Oversized | Extract services |
| `js/core.js` | 800+ | 🟡 At limit | Monitor, consider split |
| `editor/monaco-enhanced.js` | 1200+ | 🔴 Oversized | Extract to modules |

### Naming Conventions

**Files:**
- Kebab-case: `mapping-service.js`, `cache-utils.js`
- Suffix indicates type: `*.service.js`, `*.renderer.js`, `*.spec.js`

**Functions:**
- camelCase: `fetchMappings()`, `renderMappingCard()`
- Prefix with action verb: `get`, `set`, `fetch`, `render`, `update`, `delete`

**Classes:**
- PascalCase: `NotificationManager`, `CacheService`
- Descriptive noun

**Constants:**
- UPPER_SNAKE_CASE: `API_BASE_URL`, `DEFAULT_TIMEOUT`

**Events:**
- Kebab-case custom events: `mapping-updated`, `cache-refreshed`

### Code Review Checklist

Before merging:

- [ ] All files < 800 lines
- [ ] Functions < 50 lines (guideline, not strict)
- [ ] No new `window` globals (use existing or store)
- [ ] Error handling present
- [ ] Tests added/updated for changes
- [ ] Documentation updated
- [ ] No console.log left in code
- [ ] Comments explain "why", not "what"

---

## Development Workflow

### Local Development

1. **Clone repository:**
   ```bash
   git clone https://github.com/nullstack-solutions/iMock2.git
   cd iMock2
   ```

2. **Start static server:**
   ```bash
   python -m http.server 8000
   # or
   npx serve .
   ```

3. **Start WireMock:**
   ```bash
   java -jar wiremock-standalone-3.x.jar
   ```

4. **Open browser:**
   ```
   http://localhost:8000/index.html
   ```

### Making Changes

1. **Create feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes:**
   - Edit files in `js/`, `styles/`, `editor/`
   - Follow code organization guidelines

3. **Test locally:**
   - Manual testing via browser
   - Run automated tests:
     ```bash
     node tests/business-logic.spec.js
     node tests/cache-workflow.spec.js
     ```

4. **Commit:**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

5. **Push and create PR:**
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code restructuring (no feature change)
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(mappings): add bulk delete functionality
fix(cache): resolve optimistic queue race condition
docs(testing): update smoke test checklist
refactor(managers): extract notification service
test(cache): add coverage for delete operation
```

---

## Contribution Guidelines

### Getting Started

1. Check [open issues](https://github.com/nullstack-solutions/iMock2/issues)
2. Comment on issue to claim it
3. Fork repository
4. Create feature branch
5. Make changes
6. Submit pull request

### Pull Request Template

```markdown
## Description
Brief description of changes

## Related Issue
Closes #123

## Changes Made
- Added X feature
- Fixed Y bug
- Refactored Z module

## Testing
- [ ] Manual testing completed
- [ ] Automated tests added/updated
- [ ] All tests passing

## Screenshots
(if UI changes)

## Checklist
- [ ] Code follows style guidelines
- [ ] No files exceed 800 lines
- [ ] Documentation updated
- [ ] Commit messages follow convention
```

### Code Review Process

1. **Automated checks:**
   - GitHub Pages build succeeds
   - (Future) Tests pass in CI

2. **Manual review:**
   - Code quality
   - Architecture alignment
   - Test coverage

3. **Approval:**
   - At least 1 maintainer approval required
   - Address review feedback
   - Merge to main

---

## Future Enhancements

### Short-Term (Next 3 Months)

- [ ] Complete recording workflow UI
- [ ] Implement auto-refresh scheduler
- [ ] Add cache health indicators
- [ ] Surface near-miss analysis
- [ ] Expand Demo Mode fixtures

### Medium-Term (3-6 Months)

- [ ] Module extraction complete
- [ ] Centralized state management
- [ ] Build system integration
- [ ] Test coverage > 70%
- [ ] Performance monitoring dashboard

### Long-Term (6-12 Months)

- [ ] Real-time WebSocket updates (if WireMock supports)
- [ ] Collaborative features (share sessions)
- [ ] Plugin system for extensions
- [ ] Mobile-responsive redesign
- [ ] Docker deployment option

### Experimental Ideas

- GraphQL endpoint support (if WireMock adds)
- AI-assisted stub generation
- Traffic replay capabilities
- Visual stub builder (drag-and-drop)
- Integration with Postman/Insomnia

---

## Tooling & Automation

### Recommended Tools

**Editor:**
- VS Code with extensions:
  - ESLint
  - Prettier
  - Live Server
  - GitLens

**Browser:**
- Chrome DevTools
- React DevTools (for future migration)

**Testing:**
- Node.js ≥ 18
- Playwright (future E2E)

### Future CI/CD Enhancements

**GitHub Actions Workflow:**

```yaml
name: CI/CD

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm test

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

---

## Performance Targets

### Page Load

- Initial load: < 2 seconds
- Time to interactive: < 3 seconds

### Operations

- Fetch 100 mappings: < 1 second
- Render 100 mapping cards: < 2 seconds
- Filter 100 mappings: < 500ms
- Format 1MB JSON: < 3 seconds (worker)

### Caching

- Optimistic update latency: < 100ms
- Cache reconciliation: < 500ms

---

## References

- [WireMock Documentation](https://wiremock.org/docs/)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/)
- [Vite Documentation](https://vitejs.dev/)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

## Questions & Support

- **Issues:** [GitHub Issues](https://github.com/nullstack-solutions/iMock2/issues)
- **Discussions:** [GitHub Discussions](https://github.com/nullstack-solutions/iMock2/discussions)
- **Email:** [maintainer contact]

---

**Last Updated:** 2025-11-12
**Roadmap Version:** 1.1
