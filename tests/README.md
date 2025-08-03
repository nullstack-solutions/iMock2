# 🧪 Тесты WireMock UI 2.0

## Основные тесты (в корне проекта)

- **`smoke_test.html`** - основной smoke test для проверки всех модулей
- **`test-comprehensive-final.html`** - финальный комплексный тест всех улучшений

## Дополнительные тесты (в этой папке)

### Интеграционные тесты
- **`test-comprehensive.html`** - базовый комплексный тест
- **`test-final.html`** - промежуточный тест
- **`test-final-integration.html`** - полный интеграционный тест

### API тесты
- **`api_coverage_tests.html`** - тесты покрытия WireMock API
- **`api_test_examples.html`** - примеры использования API

### Документация по API
- **`wiremock_api_corrections.md`** - исправления в API
- **`wiremock_api_test_plan.md`** - план тестирования API

## Рекомендуемый порядок тестирования

1. **Smoke test** - `../smoke_test.html`
2. **Комплексный тест** - `../test-comprehensive-final.html`
3. **Дополнительные тесты** - файлы в этой папке по необходимости

## Что тестируется

- ✅ Подключение к WireMock серверу
- ✅ Authorization header поддержка
- ✅ Toast notifications система
- ✅ Uptime индикатор
- ✅ Connection status UI
- ✅ API запросы и ответы
- ✅ Модульная архитектура
- ✅ UI компоненты и анимации
