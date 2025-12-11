#!/usr/bin/env node

/**
 * Simple Page Analyzer for iMock2
 * Работает внутри Docker MCP контейнера
 */

const fs = require('fs');
const path = require('path');

class SimplePageAnalyzer {
    constructor() {
        this.workspace = '/workspace';
        this.testResultsDir = path.join(this.workspace, 'test-results');
        this.testsDir = path.join(this.workspace, 'tests', 'e2e');
        
        // Создаем директории если их нет
        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(this.testResultsDir)) {
            fs.mkdirSync(this.testResultsDir, { recursive: true });
        }
        if (!fs.existsSync(this.testsDir)) {
            fs.mkdirSync(this.testsDir, { recursive: true });
        }
    }

    generateAnalysisReport(url, elements = []) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        const analysis = {
            url: url,
            timestamp: timestamp,
            elements: elements,
            suggestedSelectors: this.generateSelectors(elements),
            testScenarios: this.generateTestScenarios(elements)
        };

        // Сохраняем анализ
        const analysisFile = path.join(this.testResultsDir, `page-analysis-${timestamp}.json`);
        fs.writeFileSync(analysisFile, JSON.stringify(analysis, null, 2));

        // Генерируем тест
        const testFile = path.join(this.testsDir, `generated-test-${timestamp}.spec.js`);
        const testContent = this.generateTest(analysis);
        fs.writeFileSync(testFile, testContent);

        return {
            analysisFile: analysisFile.replace(this.workspace + '/', ''),
            testFile: testFile.replace(this.workspace + '/', ''),
            analysis: analysis
        };
    }

    generateSelectors(elements) {
        return elements.map(el => ({
            element: el,
            selector: this.getBestSelector(el),
            alternatives: this.getAlternativeSelectors(el)
        }));
    }

    getBestSelector(element) {
        if (element.id) return `#${element.id}`;
        if (element.dataTestId) return `[data-testid="${element.dataTestId}"]`;
        if (element.dataAction) return `[data-action="${element.dataAction}"]`;
        if (element.className) return `.${element.className.split(' ').join('.')}`;
        return element.tagName;
    }

    getAlternativeSelectors(element) {
        const alternatives = [];
        
        if (element.textContent) {
            alternatives.push(`text="${element.textContent}"`);
        }
        
        if (element.placeholder) {
            alternatives.push(`[placeholder="${element.placeholder}"]`);
        }
        
        if (element.type) {
            alternatives.push(`${element.tagName}[type="${element.type}"]`);
        }
        
        return alternatives;
    }

    generateTestScenarios(elements) {
        const scenarios = [];
        
        const buttons = elements.filter(el => el.tagName === 'button' || el.role === 'button');
        const inputs = elements.filter(el => ['input', 'select', 'textarea'].includes(el.tagName));
        const forms = elements.filter(el => el.tagName === 'form');

        // Smoke тест
        scenarios.push({
            name: 'Smoke Test',
            description: 'Базовая проверка функциональности',
            steps: [
                'Открыть страницу',
                'Проверить загрузку',
                'Проверить основные элементы'
            ]
        });

        // Тест кнопок
        if (buttons.length > 0) {
            scenarios.push({
                name: 'Button Interaction Test',
                description: 'Проверка работы кнопок',
                steps: [
                    'Найти все кнопки',
                    ...buttons.slice(0, 3).map(btn => `Кликнуть на "${btn.textContent || btn.dataAction}"`),
                    'Проверить результат'
                ]
            });
        }

        // Тест форм
        if (forms.length > 0) {
            scenarios.push({
                name: 'Form Submission Test',
                description: 'Проверка работы форм',
                steps: [
                    'Найти форму',
                    'Заполнить поля',
                    'Отправить форму',
                    'Проверить результат'
                ]
            });
        }

        return scenarios;
    }

    generateTest(analysis) {
        const { url, suggestedSelectors, testScenarios } = analysis;
        
        return `// Автоматически сгенерированный тест для iMock2
// Анализ страницы: ${url}
// Время: ${analysis.timestamp}

const { test, expect } = require('@playwright/test');

test.describe('iMock2 E2E Tests - ${new Date().toISOString().split('T')[0]}', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('${url}');
    await page.waitForLoadState('networkidle');
  });

  test('Страница загружается корректно', async ({ page }) => {
    // Проверка URL
    await expect(page).toHaveURL('${url}');
    
    // Проверка основных элементов
${suggestedSelectors.slice(0, 5).map(sel => 
    `    await expect(page.locator('${sel.selector}')).toBeVisible();`
).join('\n')}
  });

${testScenarios.slice(1).map(scenario => `
  test('${scenario.name}', async ({ page }) => {
    // ${scenario.description}
${scenario.steps.map((step, i) => 
    `    // ${i + 1}. ${step}`
).join('\n')}
    
    // Реализация теста
    // TODO: Добавить конкретные действия и проверки
    console.log('Тест: ${scenario.name}');
  });
`).join('')}

  test('Проверка API запросов', async ({ page }) => {
    // Отслеживание сетевых запросов
    const apiRequests = [];
    
    page.on('request', request => {
      if (request.url().includes('/api/') || request.url().includes('__admin')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });
    
    // Выполняем действия
    await page.waitForTimeout(2000);
    
    // Проверяем что есть API запросы
    console.log('API запросы:', apiRequests);
  });
});
`;
    }

    // Анализ на основе предоставленных данных
    analyzeFromData(url, pageData) {
        const elements = this.extractElements(pageData);
        return this.generateAnalysisReport(url, elements);
    }

    extractElements(pageData) {
        // Извлекаем элементы из данных страницы
        const elements = [];
        
        if (pageData.buttons) {
            pageData.buttons.forEach(btn => {
                elements.push({
                    tagName: 'button',
                    ...btn
                });
            });
        }
        
        if (pageData.inputs) {
            pageData.inputs.forEach(input => {
                elements.push({
                    tagName: 'input',
                    ...input
                });
            });
        }
        
        if (pageData.forms) {
            pageData.forms.forEach(form => {
                elements.push({
                    tagName: 'form',
                    ...form
                });
            });
        }
        
        return elements;
    }
}

module.exports = SimplePageAnalyzer;