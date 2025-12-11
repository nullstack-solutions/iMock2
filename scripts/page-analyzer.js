#!/usr/bin/env node

/**
 * Page Analysis Tool for iMock2
 * Анализирует страницы для генерации точных E2E тестов
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class PageAnalyzer {
    constructor() {
        this.browser = null;
        this.page = null;
        this.analysis = {
            url: '',
            title: '',
            elements: [],
            forms: [],
            buttons: [],
            inputs: [],
            navigation: [],
            modals: [],
            apiCalls: [],
            screenshots: []
        };
    }

    async initialize() {
        this.browser = await chromium.launch({ headless: false });
        this.page = await this.browser.newPage();
        
        // Включаем логирование network запросов
        this.page.on('request', request => {
            if (request.url().includes('/api/') || request.url().includes('__admin')) {
                this.analysis.apiCalls.push({
                    url: request.url(),
                    method: request.method(),
                    headers: request.headers()
                });
            }
        });
    }

    async analyzePage(url, options = {}) {
        console.log(`🔍 Анализ страницы: ${url}`);
        
        await this.page.goto(url, { waitUntil: 'networkidle' });
        
        // Базовая информация
        this.analysis.url = url;
        this.analysis.title = await this.page.title();
        
        // Анализ элементов
        await this.analyzeElements();
        await this.analyzeForms();
        await this.analyzeNavigation();
        await this.analyzeModals();
        
        // Скриншоты
        if (options.screenshots !== false) {
            await this.takeScreenshots();
        }
        
        return this.analysis;
    }

    async analyzeElements() {
        // Интерактивные элементы
        const interactiveElements = await this.page.$$eval('[data-action], [data-testid], button, [role="button"], input, select, textarea',
            elements => elements.map(el => {
                // Inline selector generation since 'this' context isn't available in $$eval
                let selector = '';
                if (el.id) selector = `#${el.id}`;
                else if (el.getAttribute('data-testid')) selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
                else if (el.getAttribute('data-action')) selector = `[data-action="${el.getAttribute('data-action')}"]`;
                else if (el.className) selector = `.${el.className.split(' ').join('.')}`;
                else selector = el.tagName.toLowerCase();

                return {
                    tagName: el.tagName.toLowerCase(),
                    id: el.id,
                    className: el.className,
                    textContent: el.textContent?.trim().substring(0, 50),
                    dataAction: el.getAttribute('data-action'),
                    dataTestId: el.getAttribute('data-testid'),
                    selector: selector,
                    type: el.type || 'unknown',
                    placeholder: el.placeholder || '',
                    visible: el.offsetParent !== null
                };
            })
        );

        this.analysis.elements = interactiveElements.filter(el => el.visible);
        
        // Категоризация элементов
        this.analysis.buttons = interactiveElements.filter(el => 
            el.tagName === 'button' || el.role === 'button' || el.dataAction
        );
        
        this.analysis.inputs = interactiveElements.filter(el => 
            ['input', 'select', 'textarea'].includes(el.tagName)
        );
    }

    async analyzeForms() {
        const forms = await this.page.$$eval('form', forms =>
            forms.map(form => ({
                id: form.id,
                className: form.className,
                action: form.action,
                method: form.method,
                fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => {
                    // Inline selector generation since 'this' context isn't available in $$eval
                    let selector = '';
                    if (field.id) selector = `#${field.id}`;
                    else if (field.getAttribute('data-testid')) selector = `[data-testid="${field.getAttribute('data-testid')}"]`;
                    else if (field.getAttribute('data-action')) selector = `[data-action="${field.getAttribute('data-action')}"]`;
                    else if (field.className) selector = `.${field.className.split(' ').join('.')}`;
                    else selector = field.tagName.toLowerCase();

                    return {
                        name: field.name,
                        type: field.type,
                        id: field.id,
                        className: field.className,
                        placeholder: field.placeholder,
                        required: field.required,
                        selector: selector
                    };
                })
            }))
        );

        this.analysis.forms = forms;
    }

    async analyzeNavigation() {
        const navigation = await this.page.$$eval('nav, [role="navigation"], .nav, .navbar', 
            navs => navs.map(nav => ({
                tagName: nav.tagName.toLowerCase(),
                className: nav.className,
                links: Array.from(nav.querySelectorAll('a')).map(link => ({
                    href: link.href,
                    text: link.textContent?.trim(),
                    className: link.className
                }))
            }))
        );

        this.analysis.navigation = navigation;
    }

    async analyzeModals() {
        // Ищем потенциальные модальные окна
        const modals = await this.page.$$eval('[role="dialog"], .modal, .popup, [data-modal]', 
            modals => modals.map(modal => ({
                id: modal.id,
                className: modal.className,
                visible: modal.offsetParent !== null,
                content: modal.textContent?.trim().substring(0, 100)
            }))
        );

        this.analysis.modals = modals;
    }

    async takeScreenshots() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Полная страница
        const fullPageScreenshot = `analysis-full-${timestamp}.png`;
        await this.page.screenshot({ 
            path: path.join(__dirname, '..', 'test-results', fullPageScreenshot),
            fullPage: true 
        });
        
        // Видимая область
        const viewportScreenshot = `analysis-viewport-${timestamp}.png`;
        await this.page.screenshot({ 
            path: path.join(__dirname, '..', 'test-results', viewportScreenshot)
        });
        
        this.analysis.screenshots = [fullPageScreenshot, viewportScreenshot];
    }

    generateSelector(element) {
        if (element.id) return `#${element.id}`;
        if (element.getAttribute('data-testid')) return `[data-testid="${element.getAttribute('data-testid')}"]`;
        if (element.getAttribute('data-action')) return `[data-action="${element.getAttribute('data-action')}"]`;
        if (element.className) return `.${element.className.split(' ').join('.')}`;
        return element.tagName.toLowerCase();
    }

    async generateTestTemplate() {
        const template = `
// Автоматически сгенерированный тест на основе анализа страницы
const { test, expect } = require('@playwright/test');

test.describe('Анализ страницы: ${this.analysis.title}', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('${this.analysis.url}');
    await page.waitForLoadState('networkidle');
  });

  test('Основные элементы доступны', async ({ page }) => {
    // Проверка заголовка
    await expect(page).toHaveTitle('${this.analysis.title}');
    
    // Проверка ключевых кнопок
${this.analysis.buttons.slice(0, 5).map(btn => 
    `    // ${btn.textContent || btn.dataAction || 'Кнопка'}\n    await expect(page.locator('${btn.selector}')).toBeVisible();`
).join('\n')}
  });

  test('Формы работают корректно', async ({ page }) => {
${this.analysis.forms.map((form, index) => 
    `    // Форма ${index + 1}
    const form${index} = page.locator('${form.id ? '#' + form.id : 'form'}');
    await expect(form${index}).toBeVisible();`
).join('\n')}
  });

  test('Навигация работает', async ({ page }) => {
${this.analysis.navigation.flatMap(nav => 
    nav.links.slice(0, 3).map(link => 
        `    // ${link.text}\n    await expect(page.locator('a[href="${link.href}"]')).toBeVisible();`
    )
).join('\n')}
  });
});
        `.trim();

        return template;
    }

    async saveAnalysis(filename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const analysisFile = filename || `page-analysis-${timestamp}.json`;
        const testFile = filename ? filename.replace('.json', '.spec.js') : `generated-test-${timestamp}.spec.js`;
        
        const analysisPath = path.join(__dirname, '..', 'test-results', analysisFile);
        const testPath = path.join(__dirname, '..', 'tests', 'e2e', testFile);
        
        // Сохраняем анализ
        fs.writeFileSync(analysisPath, JSON.stringify(this.analysis, null, 2));
        
        // Генерируем и сохраняем тест
        const testTemplate = await this.generateTestTemplate();
        fs.writeFileSync(testPath, testTemplate);
        
        console.log(`✅ Анализ сохранен: ${analysisPath}`);
        console.log(`✅ Тест сгенерирован: ${testPath}`);
        
        return { analysisPath, testPath };
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// CLI интерфейс
async function main() {
    const url = process.argv[2];
    if (!url) {
        console.error('❌ Укажите URL для анализа');
        console.log('Пример: node page-analyzer.js http://localhost:53771');
        process.exit(1);
    }

    const analyzer = new PageAnalyzer();
    
    try {
        await analyzer.initialize();
        const analysis = await analyzer.analyzePage(url, { screenshots: true });
        await analyzer.saveAnalysis();
        
        console.log('\n📊 Результаты анализа:');
        console.log(`📄 Заголовок: ${analysis.title}`);
        console.log(`🔘 Кнопок: ${analysis.buttons.length}`);
        console.log(`📝 Форм: ${analysis.forms.length}`);
        console.log(`🧭 Навигационных элементов: ${analysis.navigation.length}`);
        console.log(`🪟 Модальных окон: ${analysis.modals.length}`);
        console.log(`🌐 API вызовов: ${analysis.apiCalls.length}`);
        
    } catch (error) {
        console.error('❌ Ошибка анализа:', error.message);
    } finally {
        await analyzer.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = PageAnalyzer;