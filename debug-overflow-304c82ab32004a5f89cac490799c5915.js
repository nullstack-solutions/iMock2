const { chromium } = require('playwright');
const path = require('path');

const mockMappings = [
  { id:'m-1', uuid:'m-1', name:'Scenario Mapping A', scenarioName:'Order_Status', requiredScenarioState:'Started', newScenarioState:'Processing', request:{method:'GET', url:'/orders/123/status'}, response:{status:200, body:'ok'}, metadata:{created:'2024-01-01T00:00:00Z', edited:'2024-01-01T00:00:00Z', source:'test'} },
  { id:'m-2', uuid:'m-2', name:'Scenario Mapping B', scenarioName:'Order_Status', requiredScenarioState:'Processing', request:{method:'GET', url:'/orders/123/status'}, response:{status:200, body:'ok'}, metadata:{created:'2024-01-01T00:00:00Z', edited:'2024-01-01T00:00:00Z', source:'test'} },
];

const mockScenarios = [
  { id:'Order_Status', state:'Processing', possibleStates:['Started','Processing','Shipped'], mappings:[
    { id:'m-1', name:'Scenario Mapping A', requiredScenarioState:'Started', newScenarioState:'Processing', request:{method:'GET', url:'/orders/123/status'} },
    { id:'m-2', name:'Scenario Mapping B', requiredScenarioState:'Processing', newScenarioState:'Shipped', request:{method:'GET', url:'/orders/123/status'} },
  ] }
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();

  await page.route('**/__admin/mappings', (route, request) => {
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mappings: mockMappings }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/__admin/scenarios', (route, request) => {
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ scenarios: mockScenarios }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route('**/__admin/scenarios/reset', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/__admin/mappings/00000000-0000-0000-0000-00000000cace', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ errors: [{ code: 404, title: 'Not found' }] }) }));
  await page.route('**/__admin/health', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) }));
  await page.route('**/__admin/mappings/find-by-metadata', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mappings: [] }) }));
  await page.route('**/__admin/mappings/remove-by-metadata', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  await page.addInitScript(() => {
    try {
      localStorage.setItem('wiremock-settings', JSON.stringify({ host: 'localhost', port: '8080', autoConnect: false }));
    } catch {}
  });

  const indexPath = 'file://' + path.resolve(__dirname, 'index.html');
  await page.goto(indexPath);
  await page.waitForTimeout(800);

  await page.evaluate(async () => { if (typeof window.connectToWireMock === 'function') await window.connectToWireMock(); });
  await page.evaluate(() => window.showPage && window.showPage('scenarios', document.querySelector("[onclick*=\"showPage('scenarios'\"]")));
  await page.evaluate(async () => { if (typeof window.loadScenarios === 'function') await window.loadScenarios(); });

  const result = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth - window.innerWidth }));
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
