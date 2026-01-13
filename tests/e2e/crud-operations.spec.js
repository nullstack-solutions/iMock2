const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('iMock2 CRUD Operations', () => {
  let consoleErrors = [];
  let apiCalls = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    apiCalls = [];

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log('[CONSOLE ERROR]', msg.text());
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      consoleErrors.push(`PAGE ERROR: ${error.message}`);
      console.error('[PAGE ERROR]', error.message);
    });

    // Track API calls
    page.on('request', request => {
      if (request.url().includes('/__admin/')) {
        apiCalls.push({
          method: request.method(),
          url: request.url(),
        });
      }
    });

    // Mock all WireMock endpoints
    await page.route('**/__admin/mappings', async (route, request) => {
      const method = request.method();

      if (method === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            mappings: [
              {
                id: 'existing-1',
                uuid: 'existing-1',
                name: 'Existing Mapping',
                priority: 5,
                request: { method: 'GET', url: '/api/existing' },
                response: { status: 200 },
                metadata: { created: '2024-01-01T00:00:00Z' }
              }
            ]
          })
        });
      } else if (method === 'POST') {
        // Create new mapping
        const body = request.postDataJSON();
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'new-uuid-from-server',
            uuid: 'new-uuid-from-server',
            ...body
          })
        });
      } else {
        route.continue();
      }
    });

    // Mock specific mapping operations
    await page.route('**/__admin/mappings/*', async (route, request) => {
      const method = request.method();
      const url = request.url();

      if (url.includes('00000000-0000-0000-0000-00000000cace')) {
        // Service cache mapping - 404
        route.fulfill({ status: 404 });
      } else if (method === 'PUT') {
        // Update mapping
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(request.postDataJSON())
        });
      } else if (method === 'DELETE') {
        // Delete mapping
        route.fulfill({ status: 200 });
      } else if (method === 'GET') {
        // Get specific mapping
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'existing-1',
            uuid: 'existing-1',
            name: 'Existing Mapping',
            request: { method: 'GET', url: '/api/existing' },
            response: { status: 200 }
          })
        });
      } else {
        route.continue();
      }
    });

    await page.route('**/__admin/', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '3.9.1' })
      });
    });

    await page.route('**/__admin/mappings/find-by-metadata', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mappings: [] })
      });
    });
  });

  test('should handle optimistic CREATE without errors', async ({ page }) => {
    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
    await page.goto(indexPath);
    await page.waitForTimeout(1500);

    // Simulate optimistic create
    const result = await page.evaluate(async () => {
      if (!window.MappingsStore || !window.applyOptimisticMappingUpdate) {
        return { error: 'MappingsStore or applyOptimisticMappingUpdate not available' };
      }

      window.MappingsStore.init();

      const newMapping = {
        id: 'temp-optimistic-123',
        uuid: 'temp-optimistic-123',
        name: 'Optimistic Mapping',
        priority: 10,
        request: { method: 'POST', url: '/api/optimistic' },
        response: { status: 201 },
      };

      try {
        // Apply optimistic update
        window.applyOptimisticMappingUpdate(newMapping);

        return {
          pendingSize: window.MappingsStore.pending.size,
          itemsSize: window.MappingsStore.items.size,
          allMappingsLength: window.allMappings ? window.allMappings.length : 0,
        };
      } catch (e) {
        return { error: e.message, stack: e.stack };
      }
    });

    console.log('Optimistic CREATE result:', result);

    // Check for errors
    const criticalErrors = consoleErrors.filter(err =>
      err.includes('undefined') ||
      err.includes('is not a function') ||
      err.includes('Cannot read')
    );

    if (criticalErrors.length > 0) {
      console.error('=== CRITICAL ERRORS ===');
      criticalErrors.forEach(err => console.error(err));
    }

    expect(result.error).toBeUndefined();
    expect(criticalErrors).toHaveLength(0);
  });

  test('should handle optimistic UPDATE without errors', async ({ page }) => {
    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
    await page.goto(indexPath);
    await page.waitForTimeout(1500);

    const result = await page.evaluate(async () => {
      if (!window.MappingsStore) {
        return { error: 'MappingsStore not available' };
      }

      window.MappingsStore.init();

      // Add existing mapping first
      window.MappingsStore.setFromServer([{
        id: 'existing-update',
        name: 'Original',
        priority: 5,
        request: { method: 'GET', url: '/test' },
        response: { status: 200 }
      }]);

      // Apply optimistic update
      const updated = {
        id: 'existing-update',
        name: 'Updated',
        priority: 10,
        request: { method: 'GET', url: '/test' },
        response: { status: 204 }
      };

      try {
        if (typeof window.applyOptimisticMappingUpdate === 'function') {
          window.applyOptimisticMappingUpdate(updated);
        }

        return {
          pendingSize: window.MappingsStore.pending.size,
          itemsSize: window.MappingsStore.items.size,
        };
      } catch (e) {
        return { error: e.message };
      }
    });

    console.log('Optimistic UPDATE result:', result);

    const criticalErrors = consoleErrors.filter(err =>
      err.includes('undefined') || err.includes('is not a function')
    );

    expect(result.error).toBeUndefined();
    expect(criticalErrors).toHaveLength(0);
  });

  test('should handle cache operations without cacheManager errors', async ({ page }) => {
    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
    await page.goto(indexPath);
    await page.waitForTimeout(2000);

    // Check for cacheManager references in errors
    const cacheManagerErrors = consoleErrors.filter(err =>
      err.toLowerCase().includes('cachemanager') && err.includes('undefined')
    );

    if (cacheManagerErrors.length > 0) {
      console.error('=== CACHEMANAGER ERRORS ===');
      cacheManagerErrors.forEach(err => console.error(err));
    }

    expect(cacheManagerErrors, 'Should not have cacheManager undefined errors').toHaveLength(0);
  });

  test('should properly sync with MappingsStore during operations', async ({ page }) => {
    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
    await page.goto(indexPath);
    await page.waitForTimeout(1500);

    const syncTest = await page.evaluate(async () => {
      if (!window.MappingsStore) {
        return { error: 'MappingsStore not available' };
      }

      window.MappingsStore.init();

      // Test 1: Add to store
      window.MappingsStore.setFromServer([
        { id: '1', name: 'Mapping 1' },
        { id: '2', name: 'Mapping 2' },
      ]);

      const afterSet = {
        items: window.MappingsStore.items.size,
        all: window.MappingsStore.getAll().length,
      };

      // Test 2: Add pending
      window.MappingsStore.addPending({
        id: 'temp-3',
        type: 'create',
        payload: null,
        optimisticMapping: { id: 'temp-3', name: 'Mapping 3' },
      });

      const afterPending = {
        pending: window.MappingsStore.pending.size,
        all: window.MappingsStore.getAll().length,
      };

      // Test 3: Confirm pending
      window.MappingsStore.confirmPending('temp-3', { id: 'real-3', name: 'Mapping 3' });

      const afterConfirm = {
        pending: window.MappingsStore.pending.size,
        items: window.MappingsStore.items.size,
        all: window.MappingsStore.getAll().length,
      };

      return { afterSet, afterPending, afterConfirm };
    });

    console.log('Sync test results:', JSON.stringify(syncTest, null, 2));

    expect(syncTest.error).toBeUndefined();
    expect(syncTest.afterSet.items).toBe(2);
    expect(syncTest.afterPending.pending).toBe(1);
    expect(syncTest.afterConfirm.pending).toBe(0);
    expect(syncTest.afterConfirm.items).toBe(3);
  });
});
