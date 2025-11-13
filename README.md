# iMock — Modern WireMock Dashboard

> A modern, browser-based UI for managing WireMock stub mappings, request logs, scenarios, and recordings.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![WireMock](https://img.shields.io/badge/WireMock-3.x-green.svg)](https://wiremock.org/)

**iMock** provides a clean, intuitive interface for WireMock with real-time monitoring, advanced JSON editing, and comprehensive API management—all running entirely in your browser.

---

## ✨ Key Features

- 🔌 **Live Connection** — Real-time health monitoring with uptime tracking
- 📋 **Mapping Management** — Full CRUD operations with optimistic caching
- 📊 **Request Logging** — Filter, preview, and analyze incoming requests
- 🎬 **Scenarios & Recording** — Manage stateful scenarios and capture traffic
- ⚡ **JSON Studio** — Monaco-powered editor with templates, validation, and diff tools
- 🎨 **Theme Support** — Light/dark modes with persistent preferences
- 📦 **Import/Export** — Backup and restore your configurations
- 🧪 **Demo Mode** — Explore features without a WireMock instance

---

## 🚀 Quick Start

### Prerequisites

- **WireMock 3.x** or later running locally (default: `http://localhost:8080/__admin`)
- **Modern browser** (Chrome, Firefox, Safari, Edge)
- **Static server** for local development (e.g., `python -m http.server 8000`)

### Running Locally

1. **Start WireMock:**
   ```bash
   java -jar wiremock-standalone-3.x.jar
   ```

2. **Serve iMock:**
   ```bash
   python -m http.server 8000
   # or use your preferred static server
   ```

3. **Open in browser:**
   ```
   http://localhost:8000/index.html
   ```

4. **Connect to WireMock:**
   - Enter your WireMock host and port
   - Click **Connect**
   - Watch the status indicator turn green ✅

### JSON Studio (Standalone)

The Monaco-based JSON editor can run independently:

```
http://localhost:8000/editor/json-editor.html
```

Features include formatting, validation, templates, comparison, and history tracking.

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [Features Overview](docs/features.md) | Complete feature status and capabilities |
| [API Coverage](docs/api-coverage.md) | WireMock Admin API endpoint mapping |
| [Testing Guide](docs/testing.md) | Automated and manual testing procedures |
| [Development](docs/development.md) | Roadmap and contribution guidelines |
| [JSON Studio Spec](docs/editor/json-studio.md) | Detailed editor specification |

---

## 🌐 Deployment

### GitHub Pages (Production)

Pushing to `main` automatically deploys to:
```
https://<username>.github.io/<repo>/
```

### Test Environment

Pushing to `test` branch deploys to:
```
https://<username>.github.io/<repo>/test/
```

Deployment is managed via `.github/workflows/static.yml` using `gh-pages` branch.

---

## 🧪 Testing

### Automated Tests

```bash
# Business logic tests
node tests/business-logic.spec.js

# Cache workflow tests
node tests/cache-workflow.spec.js
```

### Manual Smoke Testing

Follow the comprehensive checklist in [docs/testing.md](docs/testing.md) to verify:
- Connection and health monitoring
- Mapping CRUD operations
- Request log filtering
- Scenario state management
- JSON Studio tools

---

## 🛠️ Technology Stack

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **JSON Editor:** Monaco Editor / CodeMirror 5
- **API:** WireMock Admin REST API
- **Storage:** IndexedDB for history, LocalStorage for settings
- **Workers:** Web Workers for heavy JSON operations

---

## 📋 Project Status

**Current Phase:** Feature-complete dashboard with ongoing optimization

### Working ✅
- Connection management with health monitoring
- Full mapping lifecycle (create, read, update, delete)
- Request log with filters and preview
- Scenario management and state control
- Settings persistence and theme switching
- Demo mode with fixture data
- Comprehensive JSON editor with Monaco

### In Progress ⚠️
- Cache service verification pipeline
- Recording workflow UI integration
- Auto-refresh scheduler
- Near-miss analysis dashboard

See [docs/features.md](docs/features.md) for detailed status tracking.

---

## 🤝 Contributing

Contributions are welcome! Please check [docs/development.md](docs/development.md) for:
- Development roadmap
- Code organization guidelines
- Testing requirements
- Module boundaries and refactoring plans

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- [WireMock Documentation](https://wiremock.org/docs/)
- [WireMock Admin API Reference](https://wiremock.org/docs/api/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)

---

**Last updated:** 2025-11-12
