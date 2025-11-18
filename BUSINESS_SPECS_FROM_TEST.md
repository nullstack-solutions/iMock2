# Бизнес-спецификации фич из ветки TEST для переноса в CLEAN

## Оглавление
1. [Virtual Scroller](#1-virtual-scroller)
2. [Near Misses API](#2-near-misses-api)
3. [Memory Optimizations](#3-memory-optimizations)
4. [HTTP Header Validation](#4-http-header-validation)
5. [Template System](#5-template-system)
6. [Mapping Duplication](#6-mapping-duplication)
7. [Modal Performance Optimization](#7-modal-performance-optimization)

---

## 1. Virtual Scroller

### Бизнес-проблема
При работе с большими списками (500+ маппингов или запросов) браузер рендерит все DOM-элементы одновременно, что приводит к:
- Замедлению интерфейса (лаги при скролле)
- Увеличению потребления памяти (500+ DOM-нодов)
- Плохому UX на мобильных устройствах

### Бизнес-решение
Виртуализация списка - рендерить только видимые элементы в viewport + небольшой буфер сверху/снизу.

### Функциональные требования

#### 1.1 Адаптивное переключение режимов
- **Порог активации**: 500 элементов
- **< 500 элементов**: Традиционный рендеринг (проще, надежнее)
- **≥ 500 элементов**: Виртуальный скроллинг (производительность)

#### 1.2 Основные возможности
- Рендерить только видимые элементы в viewport
- Поддержка буфера (по умолчанию 3 элемента сверху/снизу)
- Автоматический пересчет при изменении размера окна
- Плавная прокрутка с debouncing (150мс)

#### 1.3 API компонента
```javascript
VirtualScroller({
  container: HTMLElement,      // Контейнер для списка
  items: Array,                // Массив элементов
  itemHeight: number,          // Высота одного элемента (px)
  renderItem: Function,        // Функция рендера: (item, index) => HTML string
  getItemId: Function,         // Получить ID: (item) => id
  bufferSize: number,          // Размер буфера (default: 3)
  onScroll: Function          // Callback при скролле (optional)
})
```

#### 1.4 Методы управления
- `setItems(newItems, preserveScroll)` - обновить список
- `scrollToIndex(index, behavior)` - прокрутить к элементу по индексу
- `scrollToItem(itemId, behavior)` - прокрутить к элементу по ID
- `updateItem(itemId, newData)` - обновить один элемент
- `refresh()` - пересчитать и перерисовать
- `destroy()` - очистка ресурсов

#### 1.5 Оптимизация памяти
- Кэширование отрендеренных DOM-элементов
- Автоматическая очистка кэша при превышении `visibleCount * 2`
- Использование Document Fragment для batch DOM insertion
- Padding вместо absolute positioning для естественного flow

#### 1.6 Интеграция с существующим кодом
**Для маппингов:**
```javascript
// В js/features/mappings.js
window.initMappingsVirtualScroller = function(mappings, container) {
  const USE_VIRTUAL_THRESHOLD = 500;

  if (mappings.length >= USE_VIRTUAL_THRESHOLD) {
    // Использовать виртуальный скроллер
    if (!window.mappingsVirtualScroller) {
      window.mappingsVirtualScroller = new VirtualScroller({
        container: container,
        items: mappings,
        itemHeight: 160,  // Высота карточки маппинга
        renderItem: (mapping) => window.renderMappingCard(mapping),
        getItemId: (mapping) => mapping.id || mapping.uuid
      });
    } else {
      window.mappingsVirtualScroller.setItems(mappings);
    }
  } else {
    // Традиционный рендеринг
    renderList(container, mappings, { ... });
  }
}
```

**Для запросов:**
```javascript
// В js/features/requests.js
window.initRequestsVirtualScroller = function(requests, container) {
  const USE_VIRTUAL_THRESHOLD = 500;

  if (requests.length >= USE_VIRTUAL_THRESHOLD) {
    if (!window.requestsVirtualScroller) {
      window.requestsVirtualScroller = new VirtualScroller({
        container: container,
        items: requests,
        itemHeight: 140,  // Высота карточки запроса
        renderItem: (request) => window.renderRequestCard(request),
        getItemId: (request) => request.id || request.uuid
      });
    } else {
      window.requestsVirtualScroller.setItems(requests);
    }
  } else {
    renderList(container, requests, { ... });
  }
}
```

#### 1.7 CSS стили
```css
.virtual-scroller-wrapper {
  position: relative;
  width: 100%;
}

.is-scrolling {
  /* Опционально: визуальный индикатор при скролле */
  pointer-events: none;
}
```

### Критерии успеха
- При 500+ элементах: рендерятся только ~15-20 видимых элементов
- Плавная прокрутка без лагов
- Память не растет при скролле
- Совместимость с существующими фильтрами, сортировкой, поиском

### Ограничения
- Все элементы должны иметь фиксированную высоту
- Не поддерживается динамическая высота элементов
- Требуется уникальный ID для каждого элемента

---

## 2. Near Misses API

### Бизнес-проблема
Когда запрос не совпадает ни с одним маппингом, пользователь не понимает:
- Почему запрос не совпал?
- Какой маппинг был "ближе всего"?
- Что нужно изменить в маппинге или запросе?

### Бизнес-решение
API для поиска "почти совпавших" (near misses) маппингов - показывает какие маппинги почти подошли к запросу и почему не совпали.

### Функциональные требования

#### 2.1 API endpoints (WireMock)
```javascript
// В js/core.js добавить:
ENDPOINTS: {
  NEAR_MISSES_REQUEST: '/__admin/near-misses/request',
  NEAR_MISSES_PATTERN: '/__admin/near-misses/request-pattern',
  REQUESTS_UNMATCHED_NEAR_MISSES: '/__admin/requests/unmatched/near-misses'
}
```

#### 2.2 Клиентские функции
```javascript
// Найти near misses для конкретного запроса
window.findNearMissesForRequest = async (request) => {
  try {
    const response = await apiFetch(ENDPOINTS.NEAR_MISSES_REQUEST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    return response.nearMisses || [];
  } catch (error) {
    console.error('Near misses for request error:', error);
    return [];
  }
};

// Найти near misses для паттерна
window.findNearMissesForPattern = async (pattern) => {
  try {
    const response = await apiFetch(ENDPOINTS.NEAR_MISSES_PATTERN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pattern)
    });
    return response.nearMisses || [];
  } catch (error) {
    console.error('Near misses for pattern error:', error);
    return [];
  }
};

// Получить near misses для всех несовпавших запросов
window.getNearMissesForUnmatched = async () => {
  try {
    const response = await apiFetch(ENDPOINTS.REQUESTS_UNMATCHED_NEAR_MISSES);
    return response.nearMisses || [];
  } catch (error) {
    console.error('Near misses for unmatched error:', error);
    return [];
  }
};
```

#### 2.3 Интеграция с UI (опционально)
При клике на unmatched запрос:
1. Вызвать `findNearMissesForRequest(request)`
2. Показать список near misses в модальном окне или sidebar
3. Для каждого near miss показать:
   - Маппинг который "почти подошел"
   - Причину несовпадения (URL, метод, заголовки, и т.д.)
   - Кнопку "Edit mapping" для быстрого исправления

### Критерии успеха
- Пользователь может быстро понять почему запрос не совпал
- Ускоряется debugging API моков
- Снижается количество ошибок в конфигурации

### Файлы для создания
- `js/features/near-misses.js` (45 строк)

---

## 3. Memory Optimizations

### Бизнес-проблема
При длительной работе приложения накапливается мусор в памяти:
- Развернутые превью маппингов не закрываются автоматически
- Toast notifications накапливаются бесконечно
- Оптимистичные обновления не удаляются после синхронизации
- Shallow cloning медленнее structuredClone на больших объектах

### Бизнес-решение
Комплекс оптимизаций для предотвращения утечек памяти и ускорения работы.

### Функциональные требования

#### 3.1 Лимиты для предотвращения роста памяти
```javascript
// В js/features/mappings.js
const MAX_PREVIEW_STATE_SIZE = 50;        // Развернутых превью
const MAX_TOAST_STATE_SIZE = 100;         // Уведомлений
const MAX_OPTIMISTIC_MAPPINGS = 50;       // Оптимистичных обновлений
```

#### 3.2 Периодическая очистка (каждую минуту)
```javascript
window.mappingMemoryCleanupInterval = window.LifecycleManager.setInterval(() => {
  // 1. Очистка развернутых превью
  if (window.mappingPreviewState.size > MAX_PREVIEW_STATE_SIZE) {
    const toKeep = Array.from(window.mappingPreviewState)
      .slice(-MAX_PREVIEW_STATE_SIZE);
    window.mappingPreviewState.clear();
    toKeep.forEach(id => window.mappingPreviewState.add(id));
    console.log('🧹 Cleaned mappingPreviewState, kept', toKeep.length, 'items');
  }

  // 2. Очистка toast state с TTL
  if (window.mappingPreviewToastState.size > 0) {
    const now = Date.now();
    const TOAST_TTL = 5 * 60 * 1000; // 5 минут

    const validEntries = [];
    for (const [id, timestamp] of window.mappingPreviewToastState.entries()) {
      if (now - timestamp <= TOAST_TTL) {
        validEntries.push([id, timestamp]);
      }
    }

    // Если слишком много, оставить только новейшие
    if (validEntries.length > MAX_TOAST_STATE_SIZE) {
      validEntries.sort((a, b) => b[1] - a[1]);
      validEntries.length = MAX_TOAST_STATE_SIZE;
    }

    window.mappingPreviewToastState.clear();
    validEntries.forEach(([id, timestamp]) => {
      window.mappingPreviewToastState.set(id, timestamp);
    });
  }

  // 3. Очистка оптимистичных обновлений
  if (window.optimisticShadowMappings.size > MAX_OPTIMISTIC_MAPPINGS) {
    const entries = Array.from(window.optimisticShadowMappings.entries());
    entries.sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0));
    window.optimisticShadowMappings.clear();
    entries.slice(0, MAX_OPTIMISTIC_MAPPINGS).forEach(([id, entry]) => {
      window.optimisticShadowMappings.set(id, entry);
    });
  }
}, 60000); // Каждую минуту
```

#### 3.3 Shallow cloning вместо deep cloning
**Проблема:** `structuredClone()` и `JSON.parse(JSON.stringify())` медленные для больших объектов.

**Решение:** Shallow copy достаточно для оптимистичных обновлений, так как мы не мутируем вложенные объекты.

```javascript
// В js/features/mappings.js
/**
 * Lightweight shallow copy for optimistic shadow mappings
 * PERFORMANCE: Replaces expensive deep cloning
 * For 100 mappings: 500ms → 10ms (-98%)
 */
function cloneMappingForOptimisticShadow(mapping) {
  if (!mapping || typeof mapping !== 'object') {
    return null;
  }

  // Shallow copy - only copy top level
  // Nested objects shared by reference
  // SAFE because we never mutate nested objects during optimistic updates
  return {
    ...mapping,
    // Only clone metadata for timestamp tracking
    ...(mapping.metadata && { metadata: { ...mapping.metadata } })
  };
}
```

#### 3.4 Прямое обновление cacheManager.cache
**Проблема:** Использование геттеров/сеттеров добавляет overhead.

**Решение:** Прямое обновление `window.cacheManager.cache` Map.

```javascript
// БЫЛО (медленно):
window.originalMappings = mappings;
window.allMappings = mappings;

// СТАЛО (быстро):
window.cacheManager.cache.clear();
mappings.forEach(m => {
  const id = m.id || m.uuid;
  if (id) window.cacheManager.cache.set(id, m);
});
```

#### 3.5 Умное кэширование с фоновой синхронизацией
**Логика:**
1. При загрузке: сначала показать данные из кэша (быстрый старт)
2. В фоне: загрузить свежие данные с сервера
3. Merge: сервер + оптимистичные обновления
4. Обновить UI только после полной загрузки

```javascript
// В fetchAndRenderMappings
if (cached) {
  console.log('🧩 [CACHE] Cache hit - quick start');

  // Показать кэш сразу
  data = cached.data;

  // В фоне загрузить свежие данные
  (async () => {
    const fresh = await fetchMappingsFromServer({ force: true });
    // Merge с оптимистичными обновлениями
    const merged = mergeServerAndOptimistic(fresh, optimistic);
    // Обновить UI
    fetchAndRenderMappings(merged, { source: 'server' });
  })();
}
```

### Критерии успеха
- Клонирование 100 маппингов: с 500ms до 10ms (-98%)
- Память стабильна при длительной работе (несколько часов)
- Нет утечек памяти в DevTools Memory Profiler
- Быстрый старт при загрузке из кэша

### Файлы для изменения
- `js/features/mappings.js` (добавить лимиты и очистку)
- `js/features/requests.js` (аналогичные оптимизации)
- `js/features/cache.js` (сохранить существующий GC из clean, добавить лимиты)

---

## 4. HTTP Header Validation

### Бизнес-проблема
Пользователи могут вводить некорректные HTTP заголовки:
- Недопустимые символы в названии заголовка
- Управляющие символы в значении (U+0000-U+001F, U+007F)
- Обернутые кавычки в значениях
- Это приводит к ошибкам при отправке запросов

### Бизнес-решение
Валидация и нормализация HTTP заголовков согласно RFC спецификации.

### Функциональные требования

#### 4.1 Регулярные выражения для валидации
```javascript
// В js/core.js
const HTTP_HEADER_NAME_REGEX = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const HTTP_HEADER_CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
```

#### 4.2 Функции нормализации
```javascript
// Нормализация названия заголовка
window.normalizeCustomHeaderName = (headerName) => {
  return String(headerName || '').trim();
};

// Нормализация значения заголовка (убрать обертки кавычек)
window.normalizeCustomHeaderValue = (headerValue) => {
  if (typeof headerValue !== 'string') {
    return '';
  }

  let result = headerValue.trim();

  // Убрать обертывающие кавычки (", ', `)
  while (result.length >= 2) {
    const firstChar = result[0];
    const lastChar = result[result.length - 1];
    if ((firstChar === lastChar) &&
        (firstChar === '"' || firstChar === "'" || firstChar === '`')) {
      result = result.slice(1, -1).trim();
      continue;
    }
    break;
  }

  return result;
};

// Проверка на недопустимые управляющие символы
window.hasInvalidCustomHeaderValue = (headerValue) => {
  const valueToTest = String(headerValue || '');
  return HTTP_HEADER_CONTROL_CHAR_REGEX.test(valueToTest);
};

// Проверка валидности имени заголовка
window.isValidCustomHeaderName = (headerName) => {
  return HTTP_HEADER_NAME_REGEX.test(headerName);
};
```

#### 4.3 Применение валидации
```javascript
// Обновить ensureCustomHeaderObject в js/core.js
const ensureCustomHeaderObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.keys(value).reduce((acc, key) => {
    const normalizedKey = normalizeCustomHeaderName(key);
    if (!normalizedKey) {
      return acc;
    }

    // Валидация названия
    if (!HTTP_HEADER_NAME_REGEX.test(normalizedKey)) {
      console.warn(`Ignoring invalid custom header name: ${key}`);
      return acc;
    }

    // Нормализация значения
    const normalizedValue = normalizeCustomHeaderValue(value[key]);

    // Валидация значения
    if (hasInvalidCustomHeaderValue(normalizedValue)) {
      console.warn(
        `Ignoring header "${normalizedKey}" - value contains invalid control characters`
      );
      return acc;
    }

    acc[normalizedKey] = normalizedValue;
    return acc;
  }, {});
};

window.ensureCustomHeaderObject = ensureCustomHeaderObject;
```

#### 4.4 UI feedback (опционально)
При вводе заголовка в настройках показывать:
- ✅ Зеленая галочка - заголовок валиден
- ❌ Красный крестик - заголовок невалиден + текст ошибки

### Критерии успеха
- Все некорректные заголовки фильтруются
- В консоли предупреждения о проблемных заголовках
- Нет ошибок HTTP при отправке запросов

### Файлы для изменения
- `js/core.js` (добавить валидацию)

---

## 5. Template System

### Бизнес-проблема
Пользователям сложно создавать маппинги с нуля:
- Нужно знать структуру JSON
- Повторяющиеся паттерны (REST CRUD, proxy, и т.д.)
- Время на создание типовых маппингов

### Бизнес-решение
Система шаблонов - готовые маппинги для типовых сценариев.

### Функциональные требования

#### 5.1 Категории шаблонов
```javascript
const TEMPLATE_CATEGORY_LABELS = {
  basic: 'Basic',           // Простые GET/POST/PUT/DELETE
  advanced: 'Advanced',     // Regex, condition matching
  testing: 'Testing',       // 404, 500, delays
  integration: 'Integration', // OAuth, webhooks
  proxy: 'Proxy'           // Proxy pass-through
};
```

#### 5.2 Структура шаблона
```javascript
{
  id: 'template-get-json',
  name: 'GET JSON Response',
  category: 'basic',
  description: 'Simple GET endpoint returning JSON',
  icon: '📄',
  mapping: {
    request: {
      method: 'GET',
      urlPattern: '/api/resource'
    },
    response: {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      jsonBody: {
        success: true,
        data: {}
      }
    }
  }
}
```

#### 5.3 UI компонент
```html
<!-- В index.html в модальном окне создания -->
<div id="mapping-template-section" class="template-section">
  <h3>Create from Template</h3>
  <div id="mapping-template-grid" class="template-grid">
    <!-- Карточки шаблонов -->
  </div>
  <div id="mapping-template-empty" class="template-empty" style="display:none">
    No templates available
  </div>
</div>
```

#### 5.4 Функции управления
```javascript
// В js/editor.js

// Инициализация раздела шаблонов
function initializeMappingTemplateSection() {
  const grid = document.getElementById('mapping-template-grid');
  if (!grid) return;

  // Event delegation для кнопок
  grid.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-template-action]');
    if (!actionButton) return;

    const card = actionButton.closest('[data-template-id]');
    const templateId = card?.dataset.templateId;
    if (!templateId) return;

    switch (actionButton.dataset.templateAction) {
      case 'preview':
        toggleMappingTemplatePreview(templateId, previewElement, actionButton);
        break;
      case 'copy':
        copyTemplateJson(templateId);
        break;
      case 'create':
        createMappingFromTemplateFromModal(templateId);
        break;
    }
  });
}

// Предпросмотр JSON шаблона
function toggleMappingTemplatePreview(templateId, previewElement, button) {
  const template = getTemplateById(templateId);
  if (!template) return;

  if (previewElement.style.display === 'none') {
    previewElement.textContent = JSON.stringify(template.mapping, null, 2);
    previewElement.style.display = 'block';
    button.textContent = 'Hide Preview';
  } else {
    previewElement.style.display = 'none';
    button.textContent = 'Preview';
  }
}

// Копирование JSON в буфер обмена
async function copyTemplateJson(templateId) {
  const template = getTemplateById(templateId);
  if (!template) return;

  try {
    await navigator.clipboard.writeText(
      JSON.stringify(template.mapping, null, 2)
    );
    NotificationManager.success('Template JSON copied to clipboard');
  } catch (error) {
    NotificationManager.error('Failed to copy template');
  }
}

// Создание маппинга из шаблона
async function createMappingFromTemplateFromModal(templateId) {
  const template = getTemplateById(templateId);
  if (!template) return;

  try {
    // Создать маппинг на сервере
    const response = await apiFetch(ENDPOINTS.MAPPINGS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template.mapping)
    });

    NotificationManager.success(`Mapping created from template: ${template.name}`);

    // Обновить список
    await fetchAndRenderMappings();

    // Закрыть модальное окно
    hideModal('create-mapping-modal');
  } catch (error) {
    NotificationManager.error('Failed to create mapping from template');
    console.error(error);
  }
}
```

#### 5.5 Встроенные шаблоны (примеры)
```javascript
const BUILT_IN_TEMPLATES = [
  {
    id: 'get-json',
    name: 'GET JSON',
    category: 'basic',
    description: 'Simple GET endpoint',
    icon: '📄',
    mapping: {
      request: { method: 'GET', urlPattern: '/api/resource' },
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: { success: true, data: [] }
      }
    }
  },
  {
    id: 'post-create',
    name: 'POST Create',
    category: 'basic',
    description: 'Create resource endpoint',
    icon: '➕',
    mapping: {
      request: {
        method: 'POST',
        urlPattern: '/api/resource',
        headers: { 'Content-Type': { equalTo: 'application/json' } }
      },
      response: {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: { id: '{{randomValue type="UUID"}}', created: true }
      }
    }
  },
  {
    id: 'error-404',
    name: '404 Not Found',
    category: 'testing',
    description: 'Simulate resource not found',
    icon: '❌',
    mapping: {
      request: { method: 'GET', urlPattern: '/api/missing' },
      response: {
        status: 404,
        jsonBody: { error: 'Resource not found' }
      }
    }
  },
  {
    id: 'delay-slow',
    name: 'Slow Response',
    category: 'testing',
    description: 'Simulate slow network',
    icon: '🐌',
    mapping: {
      request: { urlPattern: '.*' },
      response: {
        status: 200,
        fixedDelayMilliseconds: 3000,
        jsonBody: { message: 'Delayed response' }
      }
    }
  }
];
```

### Критерии успеха
- Пользователь может создать типовой маппинг за 1-2 клика
- Минимум 10 встроенных шаблонов
- Возможность просмотра JSON перед созданием
- Копирование JSON в буфер обмена

### Файлы для создания/изменения
- `js/editor.js` (добавить функции шаблонов)
- `js/templates/mapping-templates.js` (новый файл с шаблонами)
- `index.html` (добавить UI раздел шаблонов в модальное окно)
- `styles/modals.css` (стили для карточек шаблонов)

---

## 6. Mapping Duplication

### Бизнес-проблема
Пользователям нужно создавать похожие маппинги:
- Тестирование разных сценариев (200, 404, 500)
- Разные версии API (/v1, /v2)
- Приходится копировать JSON вручную

### Бизнес-решение
Функция "Duplicate mapping" - создать копию с суффиксом "(copy)".

### Функциональные требования

#### 6.1 Функция клонирования
```javascript
// В js/features/requests.js

/**
 * Clone mapping for creation (strip server-generated fields)
 */
function cloneMappingForCreation(mapping) {
  if (!mapping) return null;

  const clone = { ...mapping };

  // Удалить серверные поля
  delete clone.id;
  delete clone.uuid;
  delete clone.insertionIndex;
  delete clone.metadata;

  return clone;
}

/**
 * Ensure duplicate has unique name
 */
function ensureDuplicateName(clone, original) {
  // Добавить суффикс к имени
  if (clone.name) {
    clone.name = clone.name + ' (copy)';
  } else if (original.request?.urlPattern) {
    clone.name = original.request.urlPattern + ' (copy)';
  }

  return clone;
}

/**
 * Duplicate mapping
 */
window.duplicateMapping = async (mappingId) => {
  try {
    const original = await getMappingById(mappingId);
    if (!original) {
      throw new Error('Mapping not found');
    }

    const clone = cloneMappingForCreation(original);
    ensureDuplicateName(clone, original);

    // Создать на сервере
    const response = await apiFetch(ENDPOINTS.MAPPINGS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clone)
    });

    NotificationManager.success('Mapping duplicated successfully');

    // Обновить список
    await fetchAndRenderMappings();

    return response;
  } catch (error) {
    NotificationManager.error('Failed to duplicate mapping');
    console.error(error);
    throw error;
  }
};
```

#### 6.2 UI интеграция
Добавить кнопку "Duplicate" в карточку маппинга:

```javascript
// В renderMappingCard
const actions = [
  { class: 'secondary', handler: 'editMapping', title: 'Edit in Editor', icon: 'open-external' },
  { class: 'primary', handler: 'openEditModal', title: 'Edit', icon: 'pencil' },
  { class: 'secondary', handler: 'duplicateMapping', title: 'Duplicate', icon: 'copy' }, // NEW
  { class: 'danger', handler: 'deleteMapping', title: 'Delete', icon: 'trash' }
];
```

#### 6.3 Event handler
```javascript
// В event delegation (js/features/event-delegation.js)
case 'duplicate':
  const mappingId = target.dataset.mappingId ||
                    target.closest('[data-id]')?.dataset.id;
  if (mappingId) {
    await window.duplicateMapping(mappingId);
  }
  break;
```

### Критерии успеха
- Клик на "Duplicate" создает копию маппинга
- Копия имеет суффикс "(copy)" в названии
- Копия не имеет ID, uuid (создается как новая)
- Список обновляется автоматически

### Файлы для изменения
- `js/features/requests.js` (добавить функции)
- `js/features/mappings.js` (добавить кнопку в actions)
- `js/features/event-delegation.js` (добавить handler)

---

## 7. Modal Performance Optimization

### Бизнес-проблема
Открытие модального окна редактирования медленное для больших маппингов (500KB+):
- Парсинг JSON занимает время
- Инициализация Monaco editor медленная
- UI блокируется на время загрузки

### Бизнес-решение
Умная стратегия загрузки: быстрое открытие + отложенная загрузка данных.

### Функциональные требования

#### 7.1 Оценка размера маппинга
```javascript
// В js/features/requests.js

const LARGE_MAPPING_THRESHOLD = 500 * 1024; // 500 KB

function estimateMappingSize(mapping) {
  try {
    const json = JSON.stringify(mapping);
    return json.length;
  } catch {
    return 0;
  }
}
```

#### 7.2 Стратегия загрузки
```javascript
window.openEditModal = async (mappingId, options = {}) => {
  try {
    // 1. Получить маппинг из кэша
    let mapping = window.cacheManager?.cache.get(mappingId);

    if (!mapping) {
      // Если нет в кэше - загрузить с сервера
      mapping = await getMappingById(mappingId);
    }

    if (!mapping) {
      throw new Error('Mapping not found');
    }

    // 2. Оценить размер
    const size = estimateMappingSize(mapping);
    const isLarge = size > LARGE_MAPPING_THRESHOLD;

    if (isLarge) {
      console.log(`📦 Large mapping detected (${(size / 1024).toFixed(2)} KB) - using optimized loading`);

      // СТРАТЕГИЯ ДЛЯ БОЛЬШИХ МАППИНГОВ:
      // a) Открыть модальное окно БЕЗ данных (быстро)
      showModal('edit-mapping-modal');
      showLoadingIndicator('Loading mapping...');

      // b) Загрузить полные данные с сервера (отложенно)
      const fullMapping = await getMappingById(mappingId, { force: true });

      // c) Заполнить editor
      hideLoadingIndicator();
      populateEditor(fullMapping);

    } else {
      console.log(`📦 Small mapping (${(size / 1024).toFixed(2)} KB) - instant load`);

      // СТРАТЕГИЯ ДЛЯ МАЛЕНЬКИХ МАППИНГОВ:
      // Мгновенная загрузка из кэша
      showModal('edit-mapping-modal');
      populateEditor(mapping);
    }

  } catch (error) {
    console.error('Failed to open edit modal:', error);
    NotificationManager.error('Failed to load mapping');
  }
};
```

#### 7.3 Защита от двойной обработки
```javascript
let isModalOpening = false;

window.openEditModal = async (mappingId, options = {}) => {
  // Предотвратить одновременные открытия
  if (isModalOpening) {
    console.warn('Modal already opening, ignoring duplicate request');
    return;
  }

  isModalOpening = true;

  try {
    // ... логика открытия ...
  } finally {
    isModalOpening = false;
  }
};
```

### Критерии успеха
- Маленькие маппинги (<500KB): открываются мгновенно из кэша
- Большие маппинги (≥500KB): окно открывается быстро, данные загружаются отложенно
- UI не блокируется при загрузке
- Показывается индикатор загрузки для больших маппингов

### Файлы для изменения
- `js/features/requests.js` (обновить openEditModal)
- `js/editor.js` (добавить showLoadingIndicator/hideLoadingIndicator)

---

## Приоритеты реализации

### High Priority (обязательно)
1. ✅ Virtual Scroller - значительное улучшение производительности
2. ✅ Memory Optimizations - предотвращение утечек памяти
3. ✅ Modal Performance - улучшение UX

### Medium Priority (желательно)
4. Near Misses API - улучшение debugging
5. HTTP Header Validation - предотвращение ошибок
6. Mapping Duplication - удобство работы

### Low Priority (опционально)
7. Template System - ускорение создания маппингов

---

## Принципы реализации в CLEAN

### 1. Сохранить существующую функциональность
- ❌ НЕ удалять Query Parser
- ❌ НЕ удалять Filter Presets
- ❌ НЕ удалять Cache GC
- ❌ НЕ удалять горячие клавиши

### 2. Решение конфликтов в пользу CLEAN
При конфликтах между clean и test:
- Использовать архитектуру из clean
- Использовать UI/UX из clean
- Добавить функциональность из test БЕЗ замены существующей

### 3. Тестирование
После реализации каждой фичи:
1. Проверить совместимость с Query Parser
2. Проверить совместимость с Filter Presets
3. Проверить работу Cache GC
4. Проверить горячие клавиши
5. Проверить на 500+ элементах

### 4. Документация
Для каждой новой фичи создать:
- JSDoc комментарии в коде
- Примеры использования
- Описание граничных случаев

---

## Заключение

Эти спецификации описывают **ЧТО** нужно реализовать и **ЗАЧЕМ**, но не **КАК** именно это сделать в контексте clean. Реализация должна быть адаптирована к архитектуре clean с сохранением всех существующих фич.
