# Testing Guide

_Last updated: 2025-11-12_

This guide covers automated testing, manual verification procedures, and testing best practices for iMock.

---

## Quick Reference

| Test Type | Command | Duration | Coverage |
|-----------|---------|----------|----------|
| Business Logic | `node tests/business-logic.spec.js` | ~5s | Core helpers, tab totals, demo mode |
| Cache Workflow | `node tests/cache-workflow.spec.js` | ~3s | Optimistic cache CRUD operations |
| Manual Smoke | See checklist below | ~15min | End-to-end UI flows |

---

## Automated Testing

### Prerequisites

- **Node.js** ≥ 18
- No external dependencies required (tests use VM sandbox)
- WireMock server **NOT** required for unit tests

### Running Tests

#### Business Logic Tests

Tests core business helpers without DOM dependencies:

```bash
node tests/business-logic.spec.js
```

**Coverage:**
- Tab total calculations
- Snapshot refresh hooks
- Demo mode signal handling
- State management utilities
- Filter functions (method, status)

**Example Output:**
```
✓ calculateTabTotals returns correct counts
✓ refreshSnapshot updates state correctly
✓ Demo mode signals propagate
✓ Filter functions handle edge cases
All tests passed (4/4)
```

#### Cache Workflow Tests

Tests optimistic cache operations in VM sandbox:

```bash
node tests/cache-workflow.spec.js
```

**Coverage:**
- `updateOptimisticCache` create operation
- `updateOptimisticCache` update operation
- `updateOptimisticCache` delete operation
- `cacheManager` queue management
- Cache-to-render synchronization

**Test Scenarios:**
1. **Create:** Adds optimistic entry, validates queue, checks rendered output
2. **Update:** Modifies existing cache entry, ensures consistency
3. **Delete:** Removes from cache and queue, validates cleanup
4. **Reconciliation:** WireMock response updates override optimistic entries

**Code References:**
- Test file: `tests/cache-workflow.spec.js:1-160`
- Implementation: `js/features/cache.js:6-520`

---

## Manual Verification

### Complete Smoke Test Checklist

Run through this checklist after significant changes or before releases.

#### 1. Connection & Health

**Location:** Dashboard home page

- [ ] Enter WireMock host/port in connection form
- [ ] Click **Connect** button
- [ ] Verify status indicator turns **green**
- [ ] Verify uptime counter **starts incrementing**
- [ ] Verify health latency **displays** (e.g., "42ms")
- [ ] Click **Health Check** button manually
- [ ] Verify health latency **updates**
- [ ] Stop WireMock server
- [ ] Verify status indicator turns **red**
- [ ] Verify error notification appears

**Code References:**
- Connection: `js/features.js:261-333`
- UI: `index.html:52-118`

---

#### 2. API Mappings (CRUD)

**Location:** API Mappings page

**Setup:**
- Ensure WireMock server running
- Have at least 3-5 test mappings loaded

**Read Operations:**
- [ ] Click **API Mappings** tab
- [ ] Verify mapping cards **render**
- [ ] Verify mapping counter shows correct count (e.g., "5 mappings")
- [ ] Check that each card displays:
  - [ ] HTTP method (GET/POST/etc.)
  - [ ] URL pattern
  - [ ] Response status
  - [ ] UUID

**Filter Operations:**
- [ ] Click **Method** filter dropdown
- [ ] Select **GET** → verify only GET mappings show
- [ ] Select **All Methods** → verify all mappings return
- [ ] Click **Status** filter dropdown
- [ ] Select **200** → verify only 200 status mappings show
- [ ] Clear filter → verify all mappings return

**Create Operation:**
- [ ] Click **New Mapping** button
- [ ] Verify Monaco modal opens
- [ ] Verify default template loads
- [ ] Modify JSON (change URL, method, status)
- [ ] Click **Save**
- [ ] Verify new mapping **appears in list** (optimistic)
- [ ] Verify success notification shows
- [ ] Verify counter **increments**

**Update Operation:**
- [ ] Click **Edit** button on a mapping card
- [ ] Verify Monaco modal opens with **existing JSON**
- [ ] Modify response body or status
- [ ] Click **Save**
- [ ] Verify mapping card **updates** (optimistic)
- [ ] Verify success notification shows

**Delete Operation:**
- [ ] Click **Delete** button on a mapping card
- [ ] Verify confirmation dialog appears
- [ ] Click **Cancel** → verify no deletion occurs
- [ ] Click **Delete** again → **Confirm**
- [ ] Verify mapping card **fades out and removes**
- [ ] Verify counter **decrements**
- [ ] Verify success notification shows

**Code References:**
- Mappings: `js/features.js:28-249`
- Edit modal: `js/features/requests.js:240-347`
- Cache: `js/features/cache.js:6-520`
- UI: `index.html:52-211`

---

#### 3. Request Log

**Location:** Request Log page

**Setup:**
- Generate some traffic to WireMock (curl commands or browser requests)

**Refresh & Display:**
- [ ] Click **Request Log** tab
- [ ] Click **Refresh** button
- [ ] Verify request cards render
- [ ] Verify each card shows:
  - [ ] Timestamp
  - [ ] HTTP method
  - [ ] URL
  - [ ] Response status

**Preview Toggle:**
- [ ] Click **Expand** on a request card
- [ ] Verify request details appear (headers, body)
- [ ] Click **Collapse**
- [ ] Verify details hide

**Filters:**
- [ ] Apply **Method** filter (e.g., GET)
- [ ] Verify only matching requests show
- [ ] Apply **Status** filter (e.g., 200)
- [ ] Verify only matching status codes show
- [ ] Clear filters → verify all requests return

**Clear Requests:**
- [ ] Click **Clear Requests** button
- [ ] Verify confirmation dialog appears
- [ ] Click **Confirm**
- [ ] Verify request list **clears**
- [ ] Verify success notification shows
- [ ] Make new request to WireMock
- [ ] Click **Refresh**
- [ ] Verify only new request appears

**Code References:**
- Requests: `js/features/requests.js:3-141`
- Rendering: `js/features/requests.js:132-217`
- UI: `index.html:144-238`

---

#### 4. Scenarios

**Location:** Scenarios page

**Setup:**
- Configure WireMock with at least one scenario (e.g., shopping cart flow)

**Load Scenarios:**
- [ ] Click **Scenarios** tab
- [ ] Click **Refresh** button
- [ ] Verify scenario cards render
- [ ] Verify each card shows:
  - [ ] Scenario name
  - [ ] Current state
  - [ ] Available states (dropdown)

**State Transition:**
- [ ] Select different state from dropdown
- [ ] Verify scenario card **updates to new state**
- [ ] Verify success notification shows
- [ ] Test related mapping behavior (if applicable)

**Reset All:**
- [ ] Click **Reset All Scenarios** button
- [ ] Verify all scenario cards return to **initial state**
- [ ] Verify success notification shows

**Code References:**
- Scenarios: `js/features.js:1488-1556`
- UI: `index.html:240-322`

---

#### 5. Settings & Theme

**Location:** Settings page

**Settings Persistence:**
- [ ] Change WireMock host/port
- [ ] Modify request timeout
- [ ] Toggle cache settings
- [ ] Click **Save Settings**
- [ ] Refresh browser page (F5)
- [ ] Verify settings **persisted** (check connection form)

**Theme Toggle:**
- [ ] Click theme toggle (sun/moon icon)
- [ ] Verify UI switches to **dark mode**
- [ ] Check that all panels update colors
- [ ] Refresh page
- [ ] Verify theme **persisted**
- [ ] Toggle back to **light mode**

**Code References:**
- Settings: `js/main.js:85-198`
- Theme: `js/core.js:720-796`

---

#### 6. Import/Export

**Location:** Import/Export page

**Export Mappings:**
- [ ] Ensure some mappings exist
- [ ] Click **Export Mappings** button
- [ ] Verify JSON file downloads (e.g., `wiremock-mappings.json`)
- [ ] Open file in text editor
- [ ] Verify valid JSON with mapping array

**Export Requests:**
- [ ] Ensure request log has entries
- [ ] Click **Export Requests** button
- [ ] Verify JSON file downloads
- [ ] Open file and verify structure

**Import Mappings:**
- [ ] Click **Import Mappings** button
- [ ] Select previously exported JSON file
- [ ] Verify success notification shows
- [ ] Verify mappings appear in list
- [ ] Verify counter updates

**Code References:**
- Import/Export: `js/features.js:418-539`
- UI: `index.html:525-603`

---

#### 7. Demo Mode

**Location:** Dashboard

**Activate Demo:**
- [ ] Click **Demo Mode** button
- [ ] Verify notification shows "Demo mode activated"
- [ ] Verify fixture mappings appear
- [ ] Verify fixture requests appear in log

**Demo Exploration:**
- [ ] Navigate through tabs
- [ ] Verify all UI elements render
- [ ] Test filters
- [ ] Verify no actual API calls made (check network tab)

**Code References:**
- Demo: `js/features/demo.js:17-112`
- Fixtures: `js/demo-data.js:1-200`

---

#### 8. JSON Studio (Standalone Editor)

**Location:** `/editor/json-editor.html`

**Editor Basics:**
- [ ] Open JSON Studio in browser
- [ ] Verify Monaco editor loads
- [ ] Verify default template appears
- [ ] Type/paste JSON content
- [ ] Verify syntax highlighting works

**File Operations:**
- [ ] Click **New** → verify editor clears
- [ ] Click **Load** → select JSON file → verify content loads
- [ ] Modify content
- [ ] Click **Save** → verify file downloads

**JSON Operations:**
- [ ] Enter invalid JSON (e.g., missing comma)
- [ ] Click **Validate** → verify error marker appears
- [ ] Click **Format** → verify JSON pretty-prints
- [ ] Click **Minify** → verify JSON compresses

**Templates:**
- [ ] Click **Templates** button
- [ ] Verify template modal opens
- [ ] Select "Basic GET" template
- [ ] Verify template inserts into editor
- [ ] Test other templates (POST, Regex, Fault)

**Compare Mode:**
- [ ] Click **Compare** tab
- [ ] Verify dual editors appear
- [ ] Click **Load Left** → select file
- [ ] Click **Load Right** → select different file
- [ ] Click **Diff** → verify differences highlight
- [ ] Toggle **Structural** diff mode
- [ ] Verify deep comparison results show

**History:**
- [ ] Make several edits in editor
- [ ] Click **History** button
- [ ] Verify history modal shows edit list
- [ ] Click **Restore** on older entry
- [ ] Verify editor content reverts

**Theme:**
- [ ] Toggle theme in JSON Studio
- [ ] Verify editor theme changes
- [ ] Verify persistence across refreshes

**Code References:**
- Monaco: `editor/monaco-enhanced.js:1-118`
- Operations: `editor/performance-optimizations.js:1-240`
- Templates: `editor/monaco-template-library.js:1-200`
- UI: `editor/json-editor.html:12-215`

---

## Known Test Gaps

### Recording Workflow

**Issue:** Recording API helpers call endpoints successfully but UI doesn't integrate results

**Manual Test (Limited):**
- [ ] Click **Start Recording** → verify notification
- [ ] Make requests to WireMock
- [ ] Click **Stop Recording** → verify notification
- ⚠️ **Cannot verify** recorded stubs display (UI not wired)

**Code References:**
- Helpers: `js/features/recording.js:5-124`
- UI (incomplete): `index.html:607-640`

**Expected Fix:** Wire recording form inputs and populate `recordings-list`

---

### Auto-Refresh

**Issue:** Settings saved but scheduler never starts

**Manual Test:**
- [ ] Enable auto-refresh in settings
- [ ] Set interval (e.g., 30 seconds)
- [ ] Save settings
- ⚠️ **Cannot verify** automatic refresh (feature incomplete)

**Workaround:** Use manual refresh buttons

**Code References:**
- Settings: `js/main.js:85-198`
- (Missing scheduler): `js/main.js:250-371`

---

### Near-Miss Analysis

**Issue:** Helper functions exist but no UI integration

**Status:** Cannot be manually tested (no UI controls)

**Code References:**
- Helpers: `js/features/near-misses.js:1-44`

---

## Performance Testing

### Large Dataset Tests

**Mappings:**
- [ ] Import 100+ mappings
- [ ] Verify list renders within 2 seconds
- [ ] Verify scrolling remains smooth
- [ ] Test filters with large dataset

**Request Log:**
- [ ] Generate 500+ requests (load testing tool)
- [ ] Refresh request log
- [ ] Verify cards render progressively
- [ ] Test filtering performance

**JSON Studio:**
- [ ] Load 1MB JSON file → verify formats within 3 seconds
- [ ] Load 5MB JSON file → verify "light mode" triggers
- [ ] Test validation and minify on large files

---

## Regression Testing

### Before Each Release

1. **Run all automated tests:**
   ```bash
   node tests/business-logic.spec.js
   node tests/cache-workflow.spec.js
   ```

2. **Complete smoke test checklist** (sections 1-8 above)

3. **Cross-browser verification:**
   - [ ] Chrome (latest)
   - [ ] Firefox (latest)
   - [ ] Safari (if available)
   - [ ] Edge (latest)

4. **Theme testing:**
   - [ ] All features in light mode
   - [ ] All features in dark mode

5. **Error handling:**
   - [ ] Disconnect WireMock mid-operation
   - [ ] Send malformed JSON
   - [ ] Test with invalid host/port

---

## Automated Test Expansion Roadmap

### Priority 1 (Next Sprint)

- [ ] Add integration tests for recording workflow
- [ ] Add Monaco editor operations tests
- [ ] Add filter function unit tests

### Priority 2 (Future)

- [ ] Add E2E tests with Playwright
- [ ] Add visual regression tests
- [ ] Add performance benchmarks

### Priority 3 (Nice to Have)

- [ ] Add accessibility tests
- [ ] Add mobile responsiveness tests
- [ ] Add load testing suite

---

## CI/CD Integration

### GitHub Actions Workflow

Current setup (`.github/workflows/static.yml`):
- Builds and deploys static site
- **TODO:** Add test execution step

**Proposed Addition:**
```yaml
- name: Run Tests
  run: |
    node tests/business-logic.spec.js
    node tests/cache-workflow.spec.js
```

---

## Bug Reporting Template

When reporting test failures:

```markdown
### Bug Description
Brief description of the issue

### Steps to Reproduce
1. Navigate to...
2. Click...
3. Observe...

### Expected Behavior
What should happen

### Actual Behavior
What actually happens

### Environment
- Browser: Chrome 120
- OS: macOS 14
- WireMock Version: 3.3.1
- iMock Version: commit hash / release tag

### Screenshots
(if applicable)

### Console Errors
(paste any errors from browser console)
```

---

## References

- [Automated Tests](../tests/)
- [Feature Status](features.md)
- [API Coverage](api-coverage.md)
- [Development Guide](development.md)

---

**Next Steps:**

1. Review test coverage gaps
2. Expand automated test suite
3. Add CI/CD test execution
4. Document new test cases as features land

_For questions or test expansion ideas, open an issue in the repository._
