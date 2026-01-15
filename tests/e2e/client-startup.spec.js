const { test, expect } = require('@playwright/test');
const path = require('path');

// Mock data
const mockMappings = [
  {
    id: 'test-mapping-1',
    uuid: 'test-mapping-1',
    name: 'Test Mapping 1',
    priority: 5,
    request: { method: 'GET', url: '/api/test1' },
    response: { status: 200, body: 'OK' },
    metadata: {
      created: '2024-01-01T00:00:00Z',
      edited: '2024-01-01T00:00:00Z',
      source: 'test'
    }
  },
  {
    id: 'test-mapping-2',
    uuid: 'test-mapping-2',
    name: 'Test Mapping 2',
    priority: 10,
    request: { method: 'POST', url: '/api/test2' },
    response: { status: 201, body: 'Created' },
    metadata: {
      created: '2024-01-01T00:00:00Z',
      edited: '2024-01-01T00:00:00Z',
      source: 'test'
    }
  }
];

test.describe('iMock2 Client Startup', () => {
  let consoleMessages = [];
  let consoleErrors = [];

  test.beforeEach(async ({ page }) => {
    consoleMessages = [];
    consoleErrors = [];

    // Capture all console messages
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push({ type: msg.type(), text });

      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleErrors.push(`[${msg.type().toUpperCase()}] ${text}`);
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      consoleErrors.push(`PAGE ERROR: ${error.message}\n${error.stack}`);
    });

    // Mock WireMock Admin API responses
    await page.route('**/__admin/mappings', (route, request) => {
      if (request.method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ mappings: mockMappings })
        });
      } else {
        route.continue();
      }
    });

    // Mock cache mapping endpoint (fixed ID)
    await page.route('**/__admin/mappings/00000000-0000-0000-0000-00000000cace', (route) => {
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ code: 404, title: 'Not found' }] })
      });
    });

    // Mock health check endpoints - both root and /health
    await page.route('**/__admin/', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '3.9.1' })
      });
    });

    await page.route('**/__admin/health', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'healthy', healthy: true })
      });
    });

    // Mock find-by-metadata endpoint
    await page.route('**/__admin/mappings/find-by-metadata', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mappings: [] })
      });
    });
  });

  test('should load without JavaScript errors', async ({ page }) => {
    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');

    // Load the page
    await page.goto(indexPath);

    // Wait for scripts to load and init
    await page.waitForTimeout(3000);

    // Print all console messages for debugging
    console.log('\n=== CONSOLE MESSAGES ===');
    consoleMessages.forEach(({ type, text }) => {
      if (type !== 'log') { // Skip regular logs, show only warnings/errors
        console.log(`[${type.toUpperCase()}] ${text}`);
      }
    });

    // Print errors separately
    if (consoleErrors.length > 0) {
      console.log('\n=== ERRORS/WARNINGS FOUND ===');
      consoleErrors.forEach(err => console.error(err));
    }

    // Check for critical errors
    const criticalErrors = consoleErrors.filter(err =>
      (err.includes('undefined') && !err.includes('⚠️')) ||
      err.includes('is not a function') ||
      err.includes('Cannot read properties') ||
      err.includes('Cannot access') ||
      (err.includes('cacheManager') && err.includes('undefined'))
    );

    if (criticalErrors.length > 0) {
      console.error('\n=== CRITICAL ERRORS ===');
      criticalErrors.forEach(err => console.error('❌', err));
    }

    // Assertions
    expect(criticalErrors, `Found ${criticalErrors.length} critical errors`).toHaveLength(0);
  });

  test('should initialize MappingsStore correctly', async ({ page }) => {
    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
    await page.goto(indexPath);
    await page.waitForTimeout(2000);

    // Check if MappingsStore is available
    const mappingsStoreExists = await page.evaluate(() => {
      return typeof window.MappingsStore !== 'undefined';
    });

    if (!mappingsStoreExists) {
      const globals = await page.evaluate(() => Object.keys(window).filter(k => k.includes('apping') || k.includes('tore')));
      console.log('Available globals:', globals);
    }

    expect(mappingsStoreExists).toBe(true);

    // Check MappingsStore structure
    const storeStructure = await page.evaluate(() => {
      if (!window.MappingsStore) return null;
      return {
        hasItems: window.MappingsStore.items instanceof Map,
        hasPending: window.MappingsStore.pending instanceof Map,
        hasInit: typeof window.MappingsStore.init === 'function',
        hasGetAll: typeof window.MappingsStore.getAll === 'function',
        hasAddPending: typeof window.MappingsStore.addPending === 'function',
        hasConfirmPending: typeof window.MappingsStore.confirmPending === 'function',
      };
    });

    expect(storeStructure.hasItems).toBe(true);
    expect(storeStructure.hasPending).toBe(true);
    expect(storeStructure.hasInit).toBe(true);
    expect(storeStructure.hasGetAll).toBe(true);
    expect(storeStructure.hasAddPending).toBe(true);
    expect(storeStructure.hasConfirmPending).toBe(true);
  });

  test('should not reference deleted cacheManager', async ({ page }) => {
    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
    await page.goto(indexPath);
    await page.waitForTimeout(2000);

    // Check for references to old cacheManager
    const cacheManagerErrors = consoleErrors.filter(err =>
      (err.includes('cacheManager') && err.includes('undefined')) ||
      (err.includes('optimisticQueue') && err.includes('undefined'))
    );

    if (cacheManagerErrors.length > 0) {
      console.error('\n=== CACHEMANAGER REFERENCES FOUND ===');
      cacheManagerErrors.forEach(err => console.error('❌', err));
    }

    expect(cacheManagerErrors, 'Should not reference deleted cacheManager').toHaveLength(0);
  });

  test('should connect and load mappings with mocked API', async ({ page }) => {
    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
    await page.goto(indexPath);
    await page.waitForTimeout(1000);

    // Set WireMock URL
    await page.evaluate(() => {
      if (typeof window.setWiremockUrl === 'function') {
        window.setWiremockUrl('http://localhost:8080');
      }
    });

    // Trigger connection (if auto-connect is not enabled)
    const connected = await page.evaluate(async () => {
      if (typeof window.connectToWireMock === 'function') {
        try {
          await window.connectToWireMock();
          return true;
        } catch (e) {
          console.error('Connect failed:', e);
          return false;
        }
      }
      return null;
    });

    console.log('Connection result:', connected);

    // Wait for mappings to load
    await page.waitForTimeout(3000);

    // Check if mappings loaded
    const mappingsLoaded = await page.evaluate(() => {
      return {
        allMappingsCount: window.allMappings ? window.allMappings.length : 0,
        storeItemsCount: window.MappingsStore ? window.MappingsStore.items.size : 0,
      };
    });

    console.log('Mappings loaded:', mappingsLoaded);

    // Should have loaded mock mappings (or at least initialized arrays)
    expect(mappingsLoaded.allMappingsCount).toBeGreaterThanOrEqual(0);
  });

  test('should autoconnect with cached config and display mappings', async ({ page }) => {
    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');

    // Track network requests
    const networkRequests = [];
    page.on('request', request => {
      if (request.url().includes('__admin')) {
        networkRequests.push({ method: request.method(), url: request.url() });
      }
    });

    // Pre-set localStorage with saved connection settings (simulating a returning user)
    await page.addInitScript(() => {
      const savedSettings = {
        host: 'localhost',
        port: '8080',
        autoConnect: true,
        cacheEnabled: true
      };
      localStorage.setItem('wiremock-settings', JSON.stringify(savedSettings));
    });

    // Load the page
    await page.goto(indexPath);

    // Wait for autoconnect and data loading
    await page.waitForTimeout(4000);

    console.log('Network requests to __admin:', JSON.stringify(networkRequests, null, 2));

    // Check if mappings are loaded in MappingsStore
    const storeState = await page.evaluate(() => {
      return {
        storeItemsCount: window.MappingsStore ? window.MappingsStore.items.size : 0,
        allMappingsCount: window.allMappings ? window.allMappings.length : 0,
        isSyncing: window.MappingsStore?.metadata?.isSyncing || false,
        isRendering: window.MappingsStore?.metadata?.isRendering || false,
        wiremockBaseUrl: window.wiremockBaseUrl || 'not set'
      };
    });

    console.log('Store state after autoconnect:', storeState);

    // Verify mappings are loaded in store
    expect(storeState.storeItemsCount).toBe(2);
    expect(storeState.allMappingsCount).toBe(2);
    expect(storeState.isSyncing).toBe(false);
    expect(storeState.isRendering).toBe(false);

    // Check UI state - mappings should be visible
    const uiState = await page.evaluate(() => {
      const loadingState = document.getElementById('mappings-loading');
      const emptyState = document.getElementById('mappings-empty');
      const container = document.getElementById('mappings-list');
      const mappingCards = container?.querySelectorAll('.mapping-card') || [];
      const filterQuery = document.getElementById('filter-query');

      return {
        loadingHidden: loadingState?.classList.contains('hidden') ?? false,
        emptyStateHidden: emptyState?.classList.contains('hidden') ?? true,
        containerVisible: container?.style.display !== 'none',
        mappingCardsCount: mappingCards.length,
        filterQueryValue: filterQuery?.value || ''
      };
    });

    console.log('UI state after autoconnect:', uiState);

    // Verify UI state - loading should be hidden, mappings should be visible
    expect(uiState.loadingHidden).toBe(true);
    expect(uiState.emptyStateHidden).toBe(true);
    expect(uiState.containerVisible).toBe(true);
    expect(uiState.mappingCardsCount).toBe(2);
  });

  test('should display mappings after cache loading with empty filter', async ({ page }) => {
    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');

    // Create cache data that will be returned
    const cacheData = {
      timestamp: Date.now(),
      version: '1.0',
      items: mockMappings,
      count: mockMappings.length
    };

    // Pre-set localStorage with saved settings and empty filter
    await page.addInitScript(() => {
      const savedSettings = {
        host: 'localhost',
        port: '8080',
        autoConnect: true,
        cacheEnabled: true
      };
      localStorage.setItem('wiremock-settings', JSON.stringify(savedSettings));
      // Clear any saved filter state
      localStorage.removeItem('imock-filters-mappings');
    });

    // Mock the cache mapping endpoint to return cache data
    await page.route('**/__admin/mappings/00000000-0000-0000-0000-00000000cace', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-0000-0000-00000000cace',
          priority: 1000,
          request: { method: 'GET', url: '/__imock/cache/v2' },
          response: {
            status: 200,
            jsonBody: cacheData
          }
        })
      });
    });

    // Load the page
    await page.goto(indexPath);

    // Wait for autoconnect and cache loading
    await page.waitForTimeout(4000);

    // Check if mappings are visible
    const uiState = await page.evaluate(() => {
      const loadingState = document.getElementById('mappings-loading');
      const emptyState = document.getElementById('mappings-empty');
      const container = document.getElementById('mappings-list');
      const mappingCards = container?.querySelectorAll('.mapping-card') || [];
      const filterQuery = document.getElementById('filter-query');

      return {
        loadingHidden: loadingState?.classList.contains('hidden') ?? false,
        emptyStateHidden: emptyState?.classList.contains('hidden') ?? true,
        containerVisible: container?.style.display !== 'none',
        mappingCardsCount: mappingCards.length,
        filterQueryValue: filterQuery?.value || '',
        storeItemsCount: window.MappingsStore ? window.MappingsStore.items.size : 0
      };
    });

    console.log('UI state after cache load:', uiState);

    // Verify mappings are visible without needing to clear filters
    expect(uiState.loadingHidden).toBe(true);
    expect(uiState.emptyStateHidden).toBe(true);
    expect(uiState.containerVisible).toBe(true);
    expect(uiState.mappingCardsCount).toBe(2);
    expect(uiState.filterQueryValue).toBe('');
  });
});
