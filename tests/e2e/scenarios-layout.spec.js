const { test, expect } = require('@playwright/test');
const path = require('path');

const mockMappings = [
  {
    id: 'm-1',
    uuid: 'm-1',
    name: 'Scenario Mapping A',
    scenarioName: 'Order_Status',
    requiredScenarioState: 'Started',
    newScenarioState: 'Processing',
    request: { method: 'GET', url: '/orders/123/status' },
    response: { status: 200, body: 'ok' },
    metadata: { created: '2024-01-01T00:00:00Z', edited: '2024-01-01T00:00:00Z', source: 'test' },
  },
  {
    id: 'm-2',
    uuid: 'm-2',
    name: 'Scenario Mapping B',
    scenarioName: 'Order_Status',
    requiredScenarioState: 'Processing',
    request: { method: 'GET', url: '/orders/123/status' },
    response: { status: 200, body: 'ok' },
    metadata: { created: '2024-01-01T00:00:00Z', edited: '2024-01-01T00:00:00Z', source: 'test' },
  },
];

const mockScenarios = [
  {
    id: 'Order_Status',
    state: 'Processing',
    possibleStates: ['Started', 'Processing', 'Shipped'],
    mappings: [
      {
        id: 'm-1',
        name: 'Scenario Mapping A',
        requiredScenarioState: 'Started',
        newScenarioState: 'Processing',
        request: { method: 'GET', url: '/orders/123/status' },
      },
      {
        id: 'm-2',
        name: 'Scenario Mapping B',
        requiredScenarioState: 'Processing',
        newScenarioState: 'Shipped',
        request: { method: 'GET', url: '/orders/123/status' },
      },
    ],
  },
];

async function routeAdminApi(page) {
  await page.route('**/__admin/mappings', (route, request) => {
    if (request.method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mappings: mockMappings }),
      });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });

  await page.route('**/__admin/scenarios', (route, request) => {
    if (request.method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ scenarios: mockScenarios }),
      });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });

  await page.route('**/__admin/scenarios/reset', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/__admin/mappings/00000000-0000-0000-0000-00000000cace', (route) => {
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ errors: [{ code: 404, title: 'Not found' }] }),
    });
  });

  await page.route('**/__admin/health', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
  });

  await page.route('**/__admin/mappings/find-by-metadata', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mappings: [] }) });
  });

  await page.route('**/__admin/mappings/remove-by-metadata', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test.describe('Scenarios responsiveness & layout stability', () => {
  test('header buttons do not shift when selecting scenarios (desktop)', async ({ page }) => {
    await routeAdminApi(page);

    await page.addInitScript(() => {
      try {
        localStorage.setItem('wiremock-settings', JSON.stringify({ host: 'localhost', port: '8080', autoConnect: false }));
      } catch {}
    });

    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
    await page.goto(indexPath);
    await page.waitForTimeout(800);

    await page.evaluate(async () => {
      if (typeof window.connectToWireMock === 'function') {
        await window.connectToWireMock();
      }
    });

    await page.locator('.nav-item[aria-label="Scenarios"]').click();
    await page.evaluate(async () => {
      if (typeof window.loadScenarios === 'function') {
        await window.loadScenarios();
      }
    });
    await page.locator('.scenario-item').first().waitFor({ state: 'visible' });

    const refresh = page.getByRole('button', { name: 'Refresh' });
    const search = page.locator('#scenario-search');

    const beforeFocus = await refresh.boundingBox();
    await search.click();
    const afterFocus = await refresh.boundingBox();
    expect(Math.round(afterFocus.x)).toBe(Math.round(beforeFocus.x));

    const beforeSelect = await refresh.boundingBox();
    await page.locator('[data-scenario-action="select"]').first().click();
    await expect(page.locator('#scenario-bulk-count')).toHaveText('1');
    const afterSelect = await refresh.boundingBox();
    expect(Math.round(afterSelect.x)).toBe(Math.round(beforeSelect.x));
  });

  test('no horizontal overflow at mobile breakpoint (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await routeAdminApi(page);

    await page.addInitScript(() => {
      try {
        localStorage.setItem('wiremock-settings', JSON.stringify({ host: 'localhost', port: '8080', autoConnect: false }));
      } catch {}
    });

    const indexPath = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
    await page.goto(indexPath);
    await page.waitForTimeout(800);

    await page.evaluate(async () => {
      if (typeof window.connectToWireMock === 'function') {
        await window.connectToWireMock();
      }
    });

    await page.locator('.nav-item[aria-label="Scenarios"]').click();
    await page.evaluate(async () => {
      if (typeof window.loadScenarios === 'function') {
        await window.loadScenarios();
      }
    });
    await page.locator('.scenario-item').first().waitFor({ state: 'visible' });

    await page.waitForTimeout(250);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    const bulkDisplay = await page.evaluate(() => getComputedStyle(document.getElementById('scenario-bulk-wrap')).display);
    expect(bulkDisplay).toBe('none');
  });
});
