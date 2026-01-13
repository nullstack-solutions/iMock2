# iMock2 Business Features

_Last updated: 2026-01-08_

This document provides a high-level overview of iMock2's business capabilities, focusing on user-facing features and their value propositions rather than technical implementation details.

---

## Executive Summary

**iMock2** is a modern web-based dashboard for WireMock that enables developers and QAs to:
- Monitor and manage API mock configurations in real-time
- Analyze incoming request traffic with detailed filtering
- Control stateful scenarios for complex test workflows
- Edit JSON configurations with intelligent assistance
- Work offline with demo mode for training and presentations

**Key Value Propositions:**
- ⚡ Zero installation - runs entirely in browser
- 🎯 Real-time visibility into mock behavior
- 🚀 Optimistic UI for instant feedback
- 🎨 Modern, intuitive interface with dark mode
- 🧪 Demo mode for risk-free exploration

---

## Core Business Features

### 1. Connection Management

**Purpose:** Establish and monitor connection to WireMock server

**Capabilities:**
- ✅ **Server Configuration:** Customize WireMock host, port, and admin endpoint
- ✅ **Health Monitoring:** Real-time health checks with visual status indicator
- ✅ **Uptime Tracking:** Live uptime counter showing connection duration
- ✅ **Latency Monitoring:** Response time tracking for health endpoint
- ✅ **Connection Recovery:** Automatic retry and reconnection handling
- ✅ **Custom Authentication:** Support for authentication headers

**User Benefits:**
- Know immediately if WireMock is accessible
- Monitor mock server health during test runs
- Troubleshoot connection issues with latency data
- Secure connections with auth headers

**Use Cases:**
- Development: Connect to local WireMock instance
- Testing: Monitor staging/test environment mocks
- Troubleshooting: Diagnose connection and performance issues

---

### 2. Mapping Management (API Stub Configuration)

**Purpose:** Create, view, modify, and delete WireMock stub mappings (mock API responses)

**Capabilities:**
- ✅ **View All Mappings:** Browse all configured stubs in card view
- ✅ **Filter by Method:** Filter by HTTP method (GET, POST, PUT, DELETE, PATCH)
- ✅ **Filter by Status:** Filter by response status code (200, 404, 500, etc.)
- ✅ **Search by URL/Name:** Quick text search across URLs and mapping names
- ✅ **Create New Mappings:** JSON editor modal with templates and validation
- ✅ **Edit Mappings:** Modify existing stubs with pre-populated JSON
- ✅ **Delete Mappings:** Remove stubs with confirmation
- ✅ **Import/Export:** Backup and restore mapping configurations
- ✅ **Optimistic Updates:** Instant UI updates while syncing with server
- ✅ **Mapping Counter:** Real-time count of active stubs

**User Benefits:**
- Quickly find the stub you need with powerful filters
- Edit mocks without touching config files
- Instant feedback on changes (optimistic UI)
- Safely experiment with backups via export
- Share configurations across teams

**Use Cases:**
- **Development:** Create new API mocks as you build features
- **Testing:** Modify existing stubs to test edge cases
- **Debugging:** Temporarily change responses to troubleshoot issues
- **Collaboration:** Export mappings and share with team
- **Environment Setup:** Import mappings to replicate configurations

---

### 3. Request Log Analysis

**Purpose:** View and analyze incoming requests to WireMock for debugging and validation

**Capabilities:**
- ✅ **Request History:** View all captured requests in chronological order
- ✅ **Request Details:** Expand cards to see full request/response data
- ✅ **Filter by Method:** Filter requests by HTTP method
- ✅ **Filter by Status:** Filter by response status code
- ✅ **Request Preview:** See method, URL, status, and timing at a glance
- ✅ **Clear History:** Remove all logged requests
- ✅ **Export Requests:** Download request log as JSON
- ✅ **Matched Mapping:** See which stub handled each request

**User Benefits:**
- Verify that your tests are hitting the mocks
- Debug why a request didn't match expected stub
- Analyze request patterns and timing
- Validate API client behavior
- Troubleshoot integration issues

**Use Cases:**
- **Testing:** Confirm test requests are matching correct stubs
- **Debugging:** Investigate why a test failed or behaved unexpectedly
- **Monitoring:** Watch live traffic during test execution
- **Validation:** Verify API client sends correct headers/body
- **Analysis:** Export logs for detailed investigation

---

### 4. Scenario Management

**Purpose:** Control stateful scenarios to simulate complex, multi-step API interactions

**Capabilities:**
- ✅ **View Scenarios:** List all configured scenarios with current states
- ✅ **View Current State:** See which state each scenario is currently in
- ✅ **Set State:** Manually transition a scenario to a specific state
- ✅ **Reset Scenarios:** Return scenario to initial state
- ✅ **Reset All:** Bulk reset all scenarios at once
- ✅ **Auto-Refresh:** Automatic UI refresh after state changes

**User Benefits:**
- Test complex workflows requiring multiple API calls
- Simulate stateful API behavior (login, shopping cart, etc.)
- Reset test state without restarting WireMock
- Debug scenario transitions in real-time
- Control test flow manually when needed

**Use Cases:**
- **Testing:** Test multi-step user flows (e.g., checkout process)
- **Debugging:** Manually set scenario state to reproduce issues
- **Demo:** Walk through stateful workflows in presentations
- **Development:** Prototype state-dependent API behavior
- **Integration Testing:** Coordinate scenario states across tests

**Scenario Examples:**
- Login flow: anonymous → authenticated → session expired
- Shopping cart: empty → items added → checked out
- Rate limiting: allowed → throttled → blocked
- Payment processing: pending → processing → completed → refunded

---

### 5. Recording (Traffic Capture)

**Purpose:** Capture live API traffic and convert it into WireMock stubs

**Capabilities:**
- ⚠️ **Start Recording:** Begin capturing traffic from a target URL
- ⚠️ **Stop Recording:** End capture session
- ⚠️ **Take Snapshot:** Capture current recordings as stubs
- ⚠️ **Filter by Headers:** Configure which headers to capture
- ⚠️ **URL Filtering:** Limit recording to specific URL patterns

**Status:** ⚠️ API integration complete, UI wiring in progress

**User Benefits (Planned):**
- Generate mocks from real API responses
- Capture production traffic for testing
- Quickly bootstrap mock configurations
- Ensure mocks match real API behavior

**Use Cases (Planned):**
- **Initial Setup:** Record real API to generate initial stubs
- **Regression Testing:** Capture production responses for comparison
- **Contract Testing:** Ensure mocks match actual API contracts
- **Documentation:** Generate examples from real traffic

---

### 6. JSON Studio (Advanced JSON Editing)

**Purpose:** Powerful standalone JSON editor for creating and editing WireMock configurations

**Capabilities:**
- ✅ **Monaco Editor:** VS Code-quality editing experience
- ✅ **Syntax Validation:** Real-time JSON syntax checking
- ✅ **Schema Validation:** WireMock mapping structure validation
- ✅ **IntelliSense:** Auto-completion for WireMock properties
- ✅ **Format/Beautify:** Pretty-print JSON with one click
- ✅ **Minify:** Compress JSON for compact storage
- ✅ **Diff/Compare:** Side-by-side comparison of two JSON documents
- ✅ **Template Library:** Pre-built WireMock stub templates
- ✅ **History Tracking:** Save and restore previous edits
- ✅ **YAML Export:** Convert JSON to YAML format
- ✅ **File Loading:** Load JSON files from disk
- ✅ **Dark Mode:** Eye-friendly editing in low light

**User Benefits:**
- Edit complex JSON without mistakes
- Get intelligent suggestions as you type
- Quickly compare configurations
- Learn WireMock structure with templates
- Undo mistakes with history
- Work faster with keyboard shortcuts

**Use Cases:**
- **Configuration:** Create complex WireMock mappings
- **Learning:** Explore templates to understand WireMock features
- **Debugging:** Compare working vs. broken configurations
- **Migration:** Convert between JSON and YAML
- **Review:** Format and validate team members' configurations

**Template Categories:**
- Basic HTTP responses (200, 404, 500)
- JSON responses with various structures
- Custom headers and authentication
- Delays and timeouts
- Fault injection (network errors, empty responses)
- Scenarios and state machines
- Request matching patterns (URL, headers, body)

---

### 7. Settings & Preferences

**Purpose:** Customize iMock2 behavior and appearance

**Capabilities:**
- ✅ **Server Configuration:** WireMock host, port, admin endpoint
- ✅ **Timeout Settings:** Request timeout duration
- ✅ **Authentication:** Custom auth headers
- ✅ **Cache Settings:** Enable/disable optimistic caching
- ✅ **Theme Selection:** Light/dark mode toggle
- ✅ **Persistent Preferences:** Settings saved across sessions
- ✅ **Demo Mode Toggle:** Enable offline demo mode

**User Benefits:**
- Adapt iMock2 to your environment
- Comfortable viewing in any lighting
- Secure connections with auth
- Optimize for your workflow

**Use Cases:**
- **Multi-Environment:** Switch between dev/test/staging WireMock instances
- **Performance:** Tune timeout settings for slow networks
- **Security:** Add authentication for protected endpoints
- **Accessibility:** Choose theme for visual comfort

---

### 8. Import/Export (Configuration Management)

**Purpose:** Backup, restore, and share WireMock configurations

**Capabilities:**
- ✅ **Export Mappings:** Download all stubs as JSON file
- ✅ **Export Requests:** Download request log as JSON
- ✅ **Import Mappings:** Upload and apply mapping configurations
- ✅ **Format Validation:** Automatic validation of imported JSON
- ✅ **Bulk Operations:** Import/export many stubs at once
- ✅ **Counter Refresh:** Auto-update counts after operations

**User Benefits:**
- Backup configurations before risky changes
- Share setups with teammates
- Version control mock configurations
- Migrate between environments
- Recover from mistakes

**Use Cases:**
- **Backup:** Export before making major changes
- **Collaboration:** Share stub configurations via files
- **Version Control:** Commit exported JSON to git
- **Environment Sync:** Import prod config to test environment
- **Disaster Recovery:** Restore from backup after accidental deletion

---

### 9. Demo Mode (Offline Exploration)

**Purpose:** Explore iMock2 features without a WireMock server

**Capabilities:**
- ✅ **Fixture Data:** Pre-loaded sample mappings and requests
- ✅ **Full UI Access:** All tabs and features available
- ✅ **Offline Operation:** No backend required
- ✅ **Safe Exploration:** Changes don't affect real data
- ✅ **Status Notifications:** Clear demo mode indicators
- ✅ **Easy Activation:** Automatic fallback or `?demo=true` URL param

**User Benefits:**
- Learn iMock2 without setup
- Demo to stakeholders offline
- Train new team members safely
- Develop UI features without backend

**Use Cases:**
- **Onboarding:** New users explore features risk-free
- **Training:** Teach WireMock concepts with examples
- **Presentations:** Demo at conferences without connectivity
- **Development:** Frontend work without WireMock running
- **Evaluation:** Try before committing to setup

---

### 10. Notifications & Feedback

**Purpose:** Keep users informed of actions and system status

**Capabilities:**
- ✅ **Toast Notifications:** Non-intrusive status messages
- ✅ **Severity Levels:** Success, info, warning, error categories
- ✅ **Auto-Dismiss:** Configurable timeout for messages
- ✅ **Queue Management:** Multiple notifications handled gracefully
- ✅ **Deduplication:** Prevent spam from repeated actions
- ✅ **Action Feedback:** Confirmations for cache, connection, demo events

**User Benefits:**
- Know immediately if actions succeeded
- Stay informed of background operations
- Catch errors before they cause problems
- Understand system state changes

**Use Cases:**
- **Confirmation:** "Mapping created successfully"
- **Errors:** "Failed to connect to WireMock"
- **Warnings:** "Cache sync delayed"
- **Info:** "Switched to demo mode"

---

## Feature Maturity Matrix

| Feature | Status | Completeness | User-Ready |
|---------|--------|--------------|------------|
| Connection Management | ✅ Production | 100% | Yes |
| Mapping Management | ✅ Production | 100% | Yes |
| Request Log | ✅ Production | 100% | Yes |
| Scenario Management | ✅ Production | 100% | Yes |
| JSON Studio | ✅ Production | 95% | Yes |
| Settings/Preferences | ✅ Production | 100% | Yes |
| Import/Export | ✅ Production | 100% | Yes |
| Demo Mode | ✅ Production | 90% | Yes |
| Notifications | ✅ Production | 100% | Yes |
| Recording | ⚠️ In Progress | 60% | Partial |
| Auto-Refresh | 🔄 Planned | 20% | No |
| Near-Miss Analysis | 🔄 Planned | 40% | No |

**Legend:**
- ✅ Production: Fully working and tested
- ⚠️ In Progress: Partial implementation
- 🔄 Planned: Upcoming feature
- Completeness: Technical implementation %
- User-Ready: Available for end users?

---

## User Personas & Workflows

### Persona 1: Backend Developer

**Goals:** Mock external APIs while developing new features

**Primary Features:**
- Mapping Management (create, edit, delete)
- JSON Studio (template library)
- Connection Management
- Request Log (verify API client calls)

**Typical Workflow:**
1. Connect to local WireMock
2. Create new mapping from template
3. Edit JSON to match API spec
4. Test feature code
5. Check request log to verify calls
6. Adjust mapping as needed
7. Export mappings for team

---

### Persona 2: QA Engineer

**Goals:** Configure comprehensive test scenarios

**Primary Features:**
- Scenario Management (state control)
- Mapping Management (filter, search)
- Request Log (validate test execution)
- Import/Export (share test configs)

**Typical Workflow:**
1. Import baseline mappings
2. Configure scenario states
3. Run automated tests
4. Monitor request log
5. Reset scenarios between test runs
6. Export modified configs
7. Share with team via git

---

### Persona 3: DevOps/Test Environment Manager

**Goals:** Maintain consistent mock configurations across environments

**Primary Features:**
- Import/Export (config management)
- Settings (multi-environment)
- Connection Management (monitor health)

**Typical Workflow:**
1. Export prod-like configs
2. Import to test environment
3. Verify mapping counts
4. Monitor connection health
5. Backup before changes
6. Version control exports

---

### Persona 4: Integration Test Developer

**Goals:** Test complex multi-step API interactions

**Primary Features:**
- Scenario Management (state transitions)
- Mapping Management (response variations)
- Request Log (debug matching)
- Near-Miss Analysis (troubleshoot)

**Typical Workflow:**
1. Configure stateful scenarios
2. Run integration test suite
3. Check request log for matches
4. Diagnose near-misses
5. Adjust mapping patterns
6. Reset scenarios
7. Re-run tests

---

### Persona 5: New Team Member

**Goals:** Learn WireMock and iMock2 quickly

**Primary Features:**
- Demo Mode (safe exploration)
- JSON Studio (templates)
- Documentation links

**Typical Workflow:**
1. Open iMock2 in demo mode
2. Explore fixture mappings
3. Try JSON Studio templates
4. Experiment with filters
5. Review request log examples
6. Read documentation
7. Connect to real WireMock

---

## Integration Points

### WireMock Integration
- Full support for WireMock 3.x Admin API
- Compatible with standalone and embedded modes
- Supports all mapping features (matchers, scenarios, delays, faults)
- Works with WireMock extensions (custom matchers, transformers)

### Development Workflow Integration
- Export mappings to version control (git)
- Import configurations in CI/CD pipelines
- Browser-based (no installation friction)
- Works with any WireMock deployment (local, remote, Docker)

### Team Collaboration
- Share mapping configs via export files
- Demo mode for training and presentations
- Consistent UI across all team members
- No server-side state (each user's view is independent)

---

## Competitive Advantages

| Feature | iMock2 | Alternative Tools |
|---------|--------|-------------------|
| **Zero Installation** | ✅ Browser-only | ❌ Often require install |
| **Real-Time UI** | ✅ Live updates | ⚠️ Manual refresh |
| **Optimistic Updates** | ✅ Instant feedback | ❌ Wait for server |
| **Demo Mode** | ✅ Offline capable | ❌ Requires backend |
| **JSON Studio** | ✅ Monaco editor | ⚠️ Basic editors |
| **Template Library** | ✅ 20+ templates | ❌ None |
| **Dark Mode** | ✅ Full support | ⚠️ Partial |
| **Import/Export** | ✅ Full configs | ⚠️ Limited |
| **Scenario Control** | ✅ Manual + auto | ⚠️ Limited UI |
| **Request Log** | ✅ Rich filtering | ⚠️ Basic list |

---

## Roadmap Highlights

### Short-Term (Next 3 Months)
- ✅ Complete recording workflow UI
- ✅ Implement auto-refresh scheduler
- ✅ Add cache health indicators
- ✅ Surface near-miss analysis in UI

### Medium-Term (3-6 Months)
- 🔄 Bulk operations (multi-select)
- 🔄 Advanced filtering (regex, JSONPath)
- 🔄 Mapping search with highlighting
- 🔄 Export with format options (YAML, Markdown)

### Long-Term (6-12 Months)
- 🔄 Real-time updates (WebSocket if WireMock adds support)
- 🔄 Collaborative features (shared sessions)
- 🔄 Mobile-responsive redesign
- 🔄 Plugin system for extensions

---

## Success Metrics

### User Adoption
- GitHub Stars: Growing community interest
- GitHub Pages traffic: Active usage
- Demo mode usage: Onboarding effectiveness

### User Efficiency
- Time to create mapping: < 2 minutes (vs. editing JSON files)
- Time to find mapping: < 30 seconds (with filters)
- Time to troubleshoot: < 5 minutes (with request log + near-miss)

### System Reliability
- Uptime monitoring: Real-time health checks
- Optimistic UI: < 100ms latency for local updates
- Cache sync: < 1 second for background updates

---

## Support & Resources

### Documentation
- Feature Guide: `docs/features.md`
- Testing Guide: `docs/testing.md`
- API Coverage: `docs/api-coverage.md`
- Development: `docs/development.md`

### Links
- WireMock Documentation: https://wiremock.org/docs/
- GitHub Repository: https://github.com/nullstack-solutions/iMock2
- Issue Tracker: https://github.com/nullstack-solutions/iMock2/issues

### Getting Started
1. No installation required - open in browser
2. Start WireMock locally: `java -jar wiremock-standalone-3.x.jar`
3. Serve iMock2: `python -m http.server 8000` or `npx serve`
4. Open: `http://localhost:8000/index.html`
5. Connect to WireMock and start managing mocks!

**Or try Demo Mode:**
- Open: `http://localhost:8000/index.html?demo=true`
- Explore features with sample data
- No WireMock server required

---

_For technical implementation details, see [Repository Map](REPOSITORY_MAP.md) and [Data Flow Architecture](../DATA_FLOW_ARCHITECTURE.md)_

_Last updated: 2026-01-08_
