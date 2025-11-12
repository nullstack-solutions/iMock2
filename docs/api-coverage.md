# WireMock Admin API Coverage

_Last updated: 2025-11-12_

This document maps WireMock Admin API endpoints to their usage within iMock, detailing implementation status and UI integration points.

---

## Coverage Summary

| Category | Endpoints | Implemented | UI Integrated | Coverage |
|----------|-----------|-------------|---------------|----------|
| Health & Status | 1 | 1 | 1 | 100% |
| Mappings | 5 | 5 | 4 | 80% |
| Requests | 5 | 5 | 2 | 40% |
| Scenarios | 3 | 3 | 3 | 100% |
| Recordings | 4 | 4 | 0 | 0% |
| Import/Export | 2 | 2 | 2 | 100% |
| **Total** | **20** | **20** | **12** | **60%** |

---

## Health & Status Endpoints

### `GET /__admin/health`

**Purpose:** Check WireMock instance health and availability

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- Health check on initial connection
- Manual **Health Check** button in dashboard
- Fallback to `/mappings` endpoint if `/health` unavailable

**Code References:**
- Handler: `js/features.js:295-340`
- UI: `index.html:68-118`

**Usage Flow:**
1. User clicks **Connect** or **Health Check**
2. `connectToWireMock()` probes `/health` endpoint
3. Status indicator updates (green = healthy, red = unavailable)
4. Uptime counter starts on successful connection
5. Health latency displayed in dashboard

**Response Handling:**
```javascript
// Success: 200 OK with health status
{
  "status": "UP"
}

// Updates: statusIndicator, uptimeCounter, healthLatency
```

---

## Mapping Endpoints

### `GET /__admin/mappings`

**Purpose:** Retrieve all stub mappings

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- **API Mappings** page refresh button
- Automatic load on page navigation
- Cache refresh operations

**Code References:**
- Handler: `js/features.js:28-249`
- Cache: `js/features.js:1200-1287`
- UI: `index.html:52-211`

**Usage Flow:**
1. User navigates to **API Mappings** or clicks **Refresh**
2. `fetchAndRenderMappings()` calls GET `/mappings`
3. Optimistic cache hydrates from response
4. Mapping cards render with filters applied
5. Counter updates to reflect total mappings

**Response Example:**
```json
{
  "mappings": [
    {
      "id": "uuid-1234",
      "request": { "method": "GET", "url": "/api/users" },
      "response": { "status": 200, "body": "..." }
    }
  ]
}
```

---

### `GET /__admin/mappings/{id}`

**Purpose:** Retrieve specific mapping by UUID

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- **Edit** button on mapping cards
- Opens modal with pre-populated JSON

**Code References:**
- Handler: `js/features.js:1200-1287`
- Modal: `js/features/requests.js:240-347`

**Usage Flow:**
1. User clicks **Edit** on mapping card
2. `openEditModal(mappingId)` fetches mapping details
3. Monaco editor loads with JSON content
4. User can modify and save changes

---

### `POST /__admin/mappings`

**Purpose:** Create new stub mapping

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- **New Mapping** button in dashboard
- JSON Studio save operation
- Import workflow

**Code References:**
- Handler: `js/features.js:1200-1287`
- Optimistic cache: `js/features.js:2030-2090`

**Usage Flow:**
1. User clicks **New Mapping** or saves in JSON Studio
2. Modal opens with template or user creates JSON
3. `createMapping(jsonPayload)` sends POST request
4. Optimistic cache adds entry immediately
5. On success, mapping list refreshes
6. On failure, optimistic entry removed with notification

**Request Example:**
```json
{
  "request": {
    "method": "GET",
    "url": "/api/resource"
  },
  "response": {
    "status": 200,
    "body": "{\"result\": \"success\"}"
  }
}
```

---

### `PUT /__admin/mappings/{id}`

**Purpose:** Update existing mapping

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- **Save** button in edit modal
- Monaco editor update operation

**Code References:**
- Handler: `js/features.js:1200-1287`
- Cache reconciliation: `js/features.js:2030-2090`

**Usage Flow:**
1. User edits mapping JSON in modal
2. Clicks **Save**
3. `updateMapping(id, jsonPayload)` sends PUT request
4. Optimistic cache updates entry
5. Mapping card re-renders with new content
6. Success notification appears

---

### `DELETE /__admin/mappings/{id}`

**Purpose:** Remove specific mapping

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- **Delete** button on mapping cards
- Confirmation dialog before deletion

**Code References:**
- Handler: `js/features.js:1200-1287`
- Optimistic queue: `js/features.js:2480-2580`

**Usage Flow:**
1. User clicks **Delete** on mapping card
2. Confirmation dialog appears
3. On confirm, `deleteMapping(id)` sends DELETE request
4. Optimistic cache removes entry immediately
5. Mapping card fades out and removes from list
6. Counter decrements

---

### `POST /__admin/mappings/reset`

**Purpose:** Remove all mappings

**Implementation Status:** ✅ Helper exists

**UI Integration:** ⚠️ Not exposed in UI (helper function available)

**Code References:**
- Helper: `js/core.js:150-164`

**Status:** Function implemented but no UI button to trigger it

**Recommendation:** Add **Reset All Mappings** button with strong confirmation dialog

---

## Request Endpoints

### `GET /__admin/requests`

**Purpose:** Retrieve logged requests

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- **Request Log** page
- Refresh button
- Filter controls

**Code References:**
- Handler: `js/features.js:1116-1287`
- Rendering: `js/features/requests.js:3-141`
- UI: `index.html:144-238`

**Usage Flow:**
1. User navigates to **Request Log**
2. `fetchAndRenderRequests()` calls GET `/requests`
3. Request cards render with preview toggles
4. Filters apply (method, status)
5. User can expand cards to view details

---

### `DELETE /__admin/requests`

**Purpose:** Clear all logged requests

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- **Clear Requests** button in Request Log page

**Code References:**
- Handler: `js/features.js:1116-1287`

**Usage Flow:**
1. User clicks **Clear Requests**
2. Confirmation dialog appears
3. `clearRequests()` sends DELETE request
4. Request list clears
5. Success notification appears

---

### `POST /__admin/requests/count`

**Purpose:** Get count of requests matching criteria

**Implementation Status:** ✅ Helper exists

**UI Integration:** ⚠️ Not exposed in UI

**Code References:**
- Helper: `js/features.js:1558-1622`

**Status:** Analytics function available but no dashboard display

**Recommendation:** Add request statistics panel showing counts by method, status, endpoint

---

### `POST /__admin/requests/find`

**Purpose:** Search requests with advanced criteria

**Implementation Status:** ✅ Helper exists

**UI Integration:** ⚠️ Not exposed in UI

**Code References:**
- Helper: `js/features.js:1558-1622`

**Status:** Search function implemented but no UI controls

**Recommendation:** Add advanced search modal with criteria builder

---

### `GET /__admin/requests/unmatched`

**Purpose:** Retrieve requests that didn't match any stub

**Implementation Status:** ✅ Helper exists

**UI Integration:** ⚠️ Not exposed in UI

**Code References:**
- Helper: `js/features.js:1708-1760`

**Status:** Unmatched request detection available but not surfaced

**Recommendation:** Add **Unmatched Requests** tab with near-miss analysis integration

---

## Scenario Endpoints

### `GET /__admin/scenarios`

**Purpose:** List all scenarios and their current states

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- **Scenarios** page
- Refresh button
- State display cards

**Code References:**
- Handler: `js/features.js:1488-1556`
- UI: `index.html:240-322`

**Usage Flow:**
1. User navigates to **Scenarios** page
2. `loadScenarios()` calls GET `/scenarios`
3. Scenario cards render showing current state
4. Each scenario displays available states
5. User can transition states via dropdown

---

### `PUT /__admin/scenarios/{name}/state`

**Purpose:** Set scenario to specific state

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- State dropdown on scenario cards
- Inline state transition

**Code References:**
- Handler: `js/features.js:1488-1556`

**Usage Flow:**
1. User selects new state from dropdown
2. `setScenarioState(name, state)` sends PUT request
3. Scenario card updates to show new state
4. Success notification appears
5. Related mappings may behave differently

**Request Example:**
```json
{
  "state": "STARTED"
}
```

---

### `POST /__admin/scenarios/reset`

**Purpose:** Reset all scenarios to initial state

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- **Reset All Scenarios** button in Scenarios page

**Code References:**
- Handler: `js/features.js:1488-1556`
- UI: `index.html:240-322`

**Usage Flow:**
1. User clicks **Reset All Scenarios**
2. `resetAllScenarios()` sends POST request
3. All scenario cards refresh to show initial states
4. Success notification appears

---

## Recording Endpoints

### `POST /__admin/recordings/start`

**Purpose:** Start recording requests and responses

**Implementation Status:** ✅ Helper exists

**UI Integration:** ⚠️ Partial (button exists, form not wired)

**Code References:**
- Helper: `js/features/recording.js:5-124`
- UI: `index.html:607-640`

**Current Status:**
- Button triggers API call successfully
- Toast notification shows recording started
- Form inputs (URL, filters) not connected
- Recordings list never populates

**Recommendation:** Wire recording configuration form and display captured stubs

---

### `POST /__admin/recordings/stop`

**Purpose:** Stop active recording session

**Implementation Status:** ✅ Helper exists

**UI Integration:** ⚠️ Partial (notification only)

**Code References:**
- Helper: `js/features/recording.js:5-124`

**Current Status:** Works but only shows notification, no recording summary displayed

---

### `GET /__admin/recordings/status`

**Purpose:** Check current recording status

**Implementation Status:** ✅ Helper exists

**UI Integration:** ⚠️ Not exposed in UI

**Code References:**
- Helper: `js/features/recording.js:5-124`

**Recommendation:** Add recording status indicator in header (recording/stopped)

---

### `POST /__admin/recordings/snapshot`

**Purpose:** Take snapshot of current recording

**Implementation Status:** ✅ Helper exists

**UI Integration:** ⚠️ Partial (button exists)

**Code References:**
- Helper: `js/features/recording.js:5-124`
- UI: `index.html:607-640`

**Current Status:** Snapshot triggers successfully but captured stubs not displayed

---

## Import/Export Endpoints

### `POST /__admin/mappings/import`

**Purpose:** Bulk import stub mappings

**Implementation Status:** ✅ Fully implemented

**UI Integration:**
- **Import** button in Import/Export page
- File picker with JSON validation

**Code References:**
- Handler: `js/features.js:418-539`
- UI: `index.html:525-603`

**Usage Flow:**
1. User clicks **Import Mappings**
2. File picker opens
3. User selects JSON file
4. `importMappings(file)` validates and uploads
5. Payload normalized and sent to WireMock
6. Mapping counter refreshes
7. Success notification appears

---

### `POST /__admin/requests/remove`

**Purpose:** Remove specific requests from log

**Implementation Status:** ✅ Used in clear operation

**UI Integration:**
- Part of **Clear Requests** functionality

**Code References:**
- Handler: `js/features.js:418-539`

**Note:** Used internally by clear requests operation

---

## Near-Miss Endpoints (Advanced)

### `POST /__admin/requests/unmatched/near-misses`

**Purpose:** Find potential matches for unmatched requests

**Implementation Status:** ✅ Helpers exist

**UI Integration:** ⚠️ Not exposed in UI

**Code References:**
- `findNearMissesForRequest`: `js/features/near-misses.js:1-44`
- `findNearMissesForPattern`: `js/features/near-misses.js:1-44`
- `getNearMissesForUnmatched`: `js/features/near-misses.js:1-44`

**Helpers Available:**
- Find near misses for specific request
- Find near misses for URL pattern
- Get all near misses for unmatched requests

**Recommendation:**
- Add **Near-Miss Analysis** tab
- Show confidence scores for potential matches
- Provide one-click stub creation from near misses

---

## Implementation Priorities

### High Priority (UI Integration Needed)

1. **Recording Workflow** — Wire form inputs and display captured stubs
2. **Unmatched Requests** — Surface unmatched endpoint with near-miss analysis
3. **Request Statistics** — Add analytics panel using count/find endpoints

### Medium Priority (Enhancement)

4. **Advanced Search** — Build criteria-based request search UI
5. **Recording Status** — Add real-time recording indicator
6. **Reset Mappings** — Expose reset all functionality with safeguards

### Low Priority (Power Features)

7. **Near-Miss Suggestions** — Intelligent stub creation assistant
8. **Bulk Operations** — Multi-select mappings for batch delete
9. **API Metrics** — Response time tracking and visualization

---

## Testing Coverage

| Endpoint | Unit Test | Integration Test | Manual Test |
|----------|-----------|------------------|-------------|
| Health | ✅ | ✅ | ✅ |
| GET /mappings | ✅ | ✅ | ✅ |
| POST /mappings | ✅ | ⚠️ | ✅ |
| PUT /mappings/{id} | ✅ | ⚠️ | ✅ |
| DELETE /mappings/{id} | ✅ | ⚠️ | ✅ |
| GET /requests | ✅ | ✅ | ✅ |
| DELETE /requests | ⚠️ | ⚠️ | ✅ |
| Scenarios | ✅ | ✅ | ✅ |
| Recordings | ⚠️ | ❌ | ⚠️ |

**Legend:**
- ✅ Covered
- ⚠️ Partial coverage
- ❌ Not covered

---

## API Error Handling

All API calls implement consistent error handling:

```javascript
try {
  const response = await fetch(endpoint, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  // Process success
  notificationManager.success('Operation successful');

} catch (error) {
  console.error('API Error:', error);
  notificationManager.error(`Operation failed: ${error.message}`);

  // Rollback optimistic updates if applicable
  if (optimisticId) {
    cacheManager.removeOptimistic(optimisticId);
  }
}
```

### Error Response Handling

| Status Code | Handling | User Feedback |
|-------------|----------|---------------|
| 200-299 | Success path | Green toast notification |
| 400 | Validation error | Red toast with details |
| 401/403 | Auth failure | Auth prompt or error message |
| 404 | Not found | Yellow warning toast |
| 500-599 | Server error | Red toast with retry suggestion |
| Network error | Catch block | Connection lost notification |

---

## References

- [WireMock Admin API Documentation](https://wiremock.org/docs/api/)
- [Request Matching](https://wiremock.org/docs/request-matching/)
- [Response Templating](https://wiremock.org/docs/response-templating/)
- [Stateful Behavior (Scenarios)](https://wiremock.org/docs/stateful-behaviour/)

---

_For feature status and implementation details, see [features.md](features.md)_
