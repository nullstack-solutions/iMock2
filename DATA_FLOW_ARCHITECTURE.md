# 🏗️ Архитектура потока данных iMock2

## 📊 Источник правды: WireMock Server

```
WireMock Server (Source of Truth)
    ↓
HTTP API (__admin/mappings)
    ↓
[Полные маппинги с response.status, headers, body и т.д.]
```

---

## 🔄 Flow данных: WireMock → UI

### 1️⃣ **Первый запрос данных с сервера**

**Точка входа:** `fetchMappingsFromServer()` (js/features/state.js:158)

```javascript
// Делает HTTP запрос к WireMock API
await window.apiFetch(window.ENDPOINTS.MAPPINGS)
// Возвращает: { mappings: [...] }
```

**Что возвращается:**
```javascript
{
    mappings: [
        {
            id: "uuid-1",
            name: "Get Users",
            priority: 5,
            request: {
                method: "GET",
                urlPath: "/api/users",
                headers: {...},
                queryParameters: {...}
            },
            response: {
                status: 200,
                body: "{...}",
                jsonBody: {...},
                headers: {...},
                fixedDelayMilliseconds: 100
            },
            metadata: {
                created: "2025-01-01T10:00:00Z",
                edited: "2025-01-01T11:00:00Z"
            }
        },
        // ... остальные маппинги
    ]
}
```

---

### 2️⃣ **Путь A: Быстрая загрузка из Server Cache (__imock_cache__)**

**Используется при первой загрузке страницы с включенным кешем**

```
[Загрузка страницы] → loadMappings({ useCache: true })
    ↓
loadImockCacheBestOf3() (wiremock-extras.js:301)
    ↓
getCacheByFixedId() или getCacheByMetadata()
    ↓
Загружает специальный маппинг "__imock_cache__" с сервера
    ↓
extractCacheJsonBody(response) → response.response.jsonBody
    ↓
{ mappings: [СЛИМ-ВЕРСИЯ маппингов] }
```

**Структура Server Cache маппинга:**
```javascript
{
    id: "__imock_cache__",
    name: "__imock_cache__",
    priority: -1000,
    request: { method: "GET", urlPath: "/__imock_cache__" },
    response: {
        status: 200,
        jsonBody: {
            mappings: [
                // СЛИМ-ВЕРСИЯ (buildSlimList)
                {
                    id: "uuid-1",
                    name: "Get Users",
                    priority: 5,
                    request: {
                        method: "GET",
                        url: "/api/users"
                        // ❌ БЕЗ headers, queryParameters
                    },
                    response: {
                        status: 200  // ✅ ТЕПЕРЬ ЕСТЬ (после фикса)
                        // ❌ БЕЗ body, jsonBody, headers
                    },
                    metadata: {
                        created: "...",
                        edited: "...",
                        source: "..."
                    }
                }
            ]
        }
    },
    metadata: {
        imock: { type: "cache", version: 1 }
    }
}
```

**Timeline с кешем:**
```
T=0ms:   Страница загружается
T=50ms:  loadImockCacheBestOf3() → Быстрая загрузка СЛИМ-данных
T=100ms: Рендер UI из слим-кеша (БЕЗ полных данных)
         ✅ Фильтры применяются к слим-данным
         ✅ response.status есть
         🎨 UI ОСТАЕТСЯ СТАБИЛЬНЫМ (не перерисовывается)
T=200ms: Асинхронный запрос за полными данными (фон)
T=500ms: Полные данные получены → тихая валидация
         ✅ Данные синхронизированы в памяти (window.allMappings)
         ✅ Toast уведомление о статусе синхронизации
         ❌ UI НЕ ПЕРЕРИСОВЫВАЕТСЯ (стабильный рендер)
```

---

### 3️⃣ **Путь B: Прямая загрузка с сервера**

**Используется когда кеш недоступен или отключен**

```
[Загрузка страницы] → loadMappings()
    ↓
fetchMappingsFromServer({ force: true })
    ↓
apiFetch(ENDPOINTS.MAPPINGS)
    ↓
{ mappings: [ПОЛНЫЕ маппинги] }
    ↓
window.originalMappings = serverMappings
    ↓
window.allMappings = originalMappings
    ↓
rebuildMappingIndex()
    ↓
fetchAndRenderMappings() → UI
```

**Timeline без кеша:**
```
T=0ms:   Страница загружается
T=50ms:  fetchMappingsFromServer() → Ожидание...
T=800ms: Полные данные получены
T=850ms: Рендер UI с полными данными
         ✅ Все поля сразу доступны
```

---

### 4️⃣ **Тихая валидация кеша (Silent Cache Validation)**

**Цель:** Проверить актуальность кеша без перерисовки UI

📍 `js/features/mappings.js:470-554`

**Когда срабатывает:**
- После загрузки UI из слим-кеша
- В фоне, асинхронно (200ms задержка)
- Не блокирует взаимодействие пользователя с UI

**Алгоритм:**

```javascript
// 1. Загрузить свежие данные с сервера
const freshData = await fetchMappingsFromServer({ force: true });
const serverMappings = freshData.mappings.filter(x => !isImockCacheMapping(x));
const cachedMappings = cached.data.mappings || [];

// 2. Сравнить ID маппингов
const cachedIds = new Set(cachedMappings.map(m => m.id || m.uuid));
const serverIds = new Set(serverMappings.map(m => m.id || m.uuid));

const missingInCache = [...serverIds].filter(id => !cachedIds.has(id));
const extraInCache = [...cachedIds].filter(id => !serverIds.has(id));
const hasMismatch = missingInCache.length > 0 || extraInCache.length > 0;

// 3. Обновить данные в памяти (БЕЗ перерисовки UI)
window.allMappings = mergedMappings;
window.originalMappings = mergedMappings;
rebuildMappingIndex(window.originalMappings);

// 4. Показать toast уведомление
if (hasMismatch) {
    NotificationManager.warning(
        "Cache discrepancies detected. Manual cache rebuild recommended."
    );
} else {
    NotificationManager.success("Data synchronized with server");
}
```

**Типы уведомлений:**

| Статус | Условие | Сообщение |
|--------|---------|-----------|
| ✅ Success | Кеш === Сервер | "Data synchronized with server" (3s) |
| ⚠️ Warning | Кеш ≠ Сервер | "Cache discrepancies detected (X new on server, Y missing on server). Manual cache rebuild recommended." (5s) |
| ❌ Error | Ошибка fetch | "Cache validation failed" |

**Сценарии расхождений:**

1. **Новые маппинги на сервере** (missingInCache > 0)
   - WireMock перезапустился с новыми mapping файлами
   - Другой пользователь добавил маппинги через API
   - Показывает: "X new on server"

2. **Удаленные маппинги** (extraInCache > 0)
   - Маппинги удалены через WireMock Admin API
   - Файлы удалены из mappings директории
   - Показывает: "Y missing on server"

3. **Комбинированные изменения**
   - Показывает: "2 new on server, 3 missing on server"

**Ключевые особенности:**
- ✅ UI остается стабильным (не мигает)
- ✅ Данные синхронизируются в background
- ✅ Пользователь информирован о статусе
- ✅ Ручной контроль пересборки кеша (через кнопку Regenerate Cache)
- ❌ Нет автоматической перерисовки UI

---

## 🗂️ Хранилища данных

### **1. Memory Cache (CacheManager.cache)**
📍 `js/features/cache.js:8`

```javascript
window.cacheManager = {
    cache: new Map(),  // <--- ОСНОВНОЕ ХРАНИЛИЩЕ
    optimisticQueue: [],
    version: 0
}
```

**Что хранит:**
- ПОЛНЫЕ маппинги с сервера
- Включает response.status, body, headers
- Используется для быстрого доступа без HTTP запросов

**Когда заполняется:**
```javascript
// При rebuildCache()
serverMappings.forEach(mapping => {
    const id = mapping.id || mapping.uuid;
    this.cache.set(id, mapping);  // ПОЛНЫЙ mapping
});
```

**Откуда берутся данные для UI:**
```javascript
// refreshMappingsFromCache() → buildCacheSnapshot()
window.originalMappings = Array.from(this.cache.values());
```

---

### **2. Server Cache (__imock_cache__)**
📍 Маппинг на WireMock сервере

**Что хранит:**
- СЛИМ-версия маппингов (создается через `buildSlimList()`)
- Только критические поля для первого рендера
- Минимизирован для быстрой загрузки

**Как создается:**
```javascript
// regenerateImockCache() → buildSlimList() → slimMapping()
function slimMapping(m) {
    return {
        id: m.id || m.uuid,
        name: m.name,
        request: {
            method: m.request?.method,
            url: pickUrl(m.request)
        },
        response: {
            status: m.response?.status  // ✅ ДОБАВЛЕНО
        },
        metadata: {...}
    };
}
```

**Когда обновляется:**
```javascript
// При изменении маппингов через UI:
enqueueCacheSync(mapping, operation);
    ↓
scheduleCacheRebuild()
    ↓
refreshImockCache()
    ↓
regenerateImockCache()
    ↓
upsertImockCacheMapping(slimList)
```

---

### **3. Global Arrays**

```javascript
window.originalMappings = []  // Исходные данные (полные)
window.allMappings = []        // Отфильтрованные данные
window.mappingIndex = new Map() // Быстрый поиск по ID
```

**Как заполняются:**

**Из Memory Cache:**
```javascript
// refreshMappingsFromCache()
window.originalMappings = buildCacheSnapshot(); // из cache.values()
window.allMappings = originalMappings;
```

**Из Server:**
```javascript
// loadMappings()
window.originalMappings = serverMappings;
window.allMappings = originalMappings;
```

---

## 🎨 UI Rendering Pipeline

### **Шаг 1: Данные → Фильтры**

```javascript
// executeMappingFilters() (js/managers.js:503)
const method = document.getElementById('filter-method')?.value;
const query = document.getElementById('filter-url')?.value;
const status = document.getElementById('filter-status')?.value;

const filteredMappings = window.originalMappings.filter(mapping => {
    if (method && !mapping.request?.method?.includes(method)) return false;
    if (query && !mapping.request?.url?.includes(query)
              && !mapping.name?.includes(query)) return false;
    if (status && !mapping.response?.status?.toString().includes(status)) return false;
    return true;
});

window.allMappings = filteredMappings;
```

### **Шаг 2: Фильтры → Рендер**

```javascript
// fetchAndRenderMappings() (js/features/mappings.js)
renderList(window.allMappings);
    ↓
// Для каждого маппинга создается карточка
window.allMappings.forEach(mapping => {
    const card = UIComponents.createCard('mapping', {
        id: mapping.id,
        name: mapping.name,
        method: mapping.request?.method,
        url: mapping.request?.url,
        status: mapping.response?.status,  // <-- ИСПОЛЬЗУЕТСЯ
        // ...
    });
});
```

---

## 🔍 URL State Management и Filter Presets

### **URL Query Parameters**

📍 `js/managers.js:914-1043` (URLStateManager)

**Назначение:**
- Фильтры хранятся в URL параметрах
- Позволяет делиться ссылками с активными фильтрами
- Работает с browser history (back/forward)

**Структура URL:**
```
https://example.com/?method=DELETE&query=WEB+DO&status=200
                      ↑         ↑            ↑
                   HTTP метод  Поиск по URL/name  Response status
```

**Параметры:**
- `method` - фильтр по HTTP методу (GET, POST, DELETE и т.д.)
- `query` - поиск по URL маппинга или его названию
- `status` - фильтр по HTTP статусу ответа (200, 404, 500 и т.д.)

**Приоритет загрузки фильтров:**
```javascript
// 1. URL параметры (высший приоритет)
if (window.URLStateManager.hasURLFilters('mappings')) {
    window.URLStateManager.syncUIFromURL('mappings');
}
// 2. localStorage (если нет URL параметров)
else {
    window.FilterManager.restoreFilters('mappings');
}
```

**Синхронизация:**
```javascript
// При изменении фильтров → обновление URL
function executeMappingFilters() {
    const filters = { method, query, status };
    window.URLStateManager.updateURL('mappings', filters, true);
    // replaceState - не создает новую запись в history
}

// При навигации browser (back/forward) → синхронизация UI
window.addEventListener('popstate', () => {
    window.URLStateManager.syncUIFromURL('mappings');
    FilterManager.applyMappingFilters();
});
```

---

### **Filter Presets (Quick Filters)**

📍 `js/managers.js:1045-1227` (FilterPresetsManager)
📍 `js/features/filter-presets.js` (UI)

**Назначение:**
- Быстрое переключение между часто используемыми фильтрами
- Пользовательские сохраненные комбинации фильтров
- Хранятся в localStorage

**Структура пресета:**
```javascript
{
    "custom-1704110400": {
        name: "API Errors",
        icon: "🔴",
        filters: {
            method: "POST",
            query: "/api",
            status: "500"
        }
    },
    "custom-1704110500": {
        name: "Web Endpoints",
        icon: "🌐",
        filters: {
            method: "",
            query: "WEB",
            status: ""
        }
    }
}
```

**Операции:**

```javascript
// 1. Сохранить текущие фильтры как пресет
window.showSavePresetDialog();
    ↓
const filters = FilterPresetsManager.getCurrentFiltersAsPreset('mappings');
    ↓
FilterPresetsManager.saveCustomPreset(presetId, {
    name: "My Preset",
    icon: "⭐",
    filters: { method, query, status }
});
    ↓
localStorage.setItem('imock-filter-presets-custom', JSON.stringify(presets));

// 2. Применить пресет
FilterPresetsManager.applyPreset(presetId, 'mappings');
    ↓
document.getElementById('filter-method').value = preset.filters.method;
document.getElementById('filter-url').value = preset.filters.query;
document.getElementById('filter-status').value = preset.filters.status;
    ↓
URLStateManager.updateURL('mappings', preset.filters);
    ↓
FilterManager.applyMappingFilters();

// 3. Удалить пресет
FilterPresetsManager.deleteCustomPreset(presetId);
    ↓
localStorage.setItem('imock-filter-presets-custom', JSON.stringify(updated));
    ↓
renderFilterPresets();
```

**UI:**
```html
<div class="filter-presets">
    <span class="filter-presets-label">Quick Filters:</span>
    <button onclick="showSavePresetDialog()">💾</button>
    <div id="filter-presets-list">
        <button onclick="applyPreset('custom-1704110400')">
            🔴 API Errors
        </button>
    </div>
</div>
```

---

### **Active Filter Pills**

📍 `js/features/filter-presets.js:60-95` (renderActiveFilterPills)

**Назначение:**
- Визуальное отображение активных фильтров
- Быстрое удаление отдельного фильтра

**Структура:**
```html
<div class="filter-pills" style="display: flex;">
    <span class="filter-pills-label">Active filters:</span>
    <div class="filter-pills-container">
        <span class="filter-pill">
            <span class="filter-pill-label">Method:</span>
            <span class="filter-pill-value">DELETE</span>
            <button class="filter-pill-remove" onclick="removeFilter('method')">×</button>
        </span>
        <span class="filter-pill">
            <span class="filter-pill-label">Query:</span>
            <span class="filter-pill-value">WEB DO</span>
            <button class="filter-pill-remove" onclick="removeFilter('query')">×</button>
        </span>
        <span class="filter-pill">
            <span class="filter-pill-label">Status:</span>
            <span class="filter-pill-value">200</span>
            <button class="filter-pill-remove" onclick="removeFilter('status')">×</button>
        </span>
    </div>
</div>
```

**Логика отображения:**
```javascript
function renderActiveFilterPills() {
    const filters = {
        method: document.getElementById('filter-method')?.value?.trim(),
        query: document.getElementById('filter-url')?.value?.trim(),
        status: document.getElementById('filter-status')?.value?.trim()
    };

    const hasActiveFilters = filters.method || filters.query || filters.status;

    if (!hasActiveFilters) {
        container.style.display = 'none';  // Скрыть если нет активных
        return;
    }

    container.style.display = 'flex';
    // Рендер pills для каждого активного фильтра
}
```

**Удаление фильтра через pill:**
```javascript
function removeFilterPill(filterType) {
    document.getElementById(`filter-${filterType}`).value = '';
    URLStateManager.updateURL('mappings', getCurrentFilters());
    FilterManager.applyMappingFilters();
    renderActiveFilterPills();
}
```

---

## 🔁 Flow изменений: UI → WireMock

### **1. Создание нового маппинга**

```
[User создает mapping в UI]
    ↓
saveMappingFromEditor()
    ↓
apiFetch('/mappings', { method: 'POST', body: newMapping })
    ↓
[WireMock создает mapping на сервере]
    ↓
updateOptimisticCache(newMapping, 'create', { queueMode: 'add' })
    ↓
cacheManager.addOptimisticUpdate(newMapping, 'create')
    ↓
cacheManager.cache.set(id, newMapping)  // Optimistic update
    ↓
refreshMappingsFromCache()
    ↓
[UI обновляется мгновенно - Optimistic UI]
    ↓
enqueueCacheSync(newMapping, 'create')
    ↓
[Фоновое обновление __imock_cache__ на сервере]
```

---

### **2. Обновление маппинга**

```
[User редактирует mapping]
    ↓
saveMappingFromEditor()
    ↓
apiFetch('/mappings/' + id, { method: 'PUT', body: updatedMapping })
    ↓
[WireMock обновляет mapping]
    ↓
updateOptimisticCache(updatedMapping, 'update', { queueMode: 'confirm' })
    ↓
cacheManager.confirmOptimisticUpdate(id)  // Убираем из очереди
    ↓
cacheManager.cache.set(id, updatedMapping)
    ↓
refreshMappingsFromCache()
    ↓
[UI показывает обновленные данные]
```

---

### **3. Удаление маппинга**

```
[User удаляет mapping]
    ↓
deleteMapping(id)
    ↓
updateOptimisticCache({ id }, 'delete', { queueMode: 'add' })
    ↓
cacheManager.cache.delete(id)  // Optimistic delete
    ↓
refreshMappingsFromCache()
    ↓
[UI убирает карточку мгновенно]
    ↓
apiFetch('/mappings/' + id, { method: 'DELETE' })
    ↓
[WireMock удаляет mapping]
    ↓
cacheManager.confirmOptimisticUpdate(id)
    ↓
enqueueCacheSync(null, 'delete')
```

---

## ⚡ Optimistic Updates

### **Очередь оптимистичных обновлений**

```javascript
cacheManager.optimisticQueue = [
    {
        id: "uuid-1",
        op: "create",
        payload: { ...newMapping },
        ts: 1704110400000
    },
    {
        id: "uuid-2",
        op: "delete",
        payload: null,
        ts: 1704110450000
    }
]
```

### **Lifecycle оптимистичных обновлений**

```
1. User делает изменение
    ↓
2. addOptimisticUpdate() → добавляем в очередь
    ↓
3. UI обновляется мгновенно (из cache)
    ↓
4. HTTP запрос к WireMock в фоне
    ↓
5а. Если успешно → confirmOptimisticUpdate() → убираем из очереди
5б. Если ошибка → TTL истекает (30 сек) → cleanupStaleOptimisticUpdates()
    ↓
6. rebuildCache() → синхронизация с сервером
```

---

## 🔄 Синхронизация кешей

### **Автоматическая синхронизация**

```javascript
// Каждые 60 секунд
cacheManager.syncInterval = setInterval(() => {
    if (optimisticQueue.length > 0) {
        rebuildCache();  // Синхронизация с сервером
    }
}, 60000);
```

### **Ручная синхронизация**

```javascript
// При изменении маппинга
enqueueCacheSync(mapping, operation);
    ↓
scheduleCacheRebuild()  // debounced 1 секунда
    ↓
refreshImockCache()
    ↓
regenerateImockCache()
    ↓
buildSlimList(allMappings)
    ↓
upsertImockCacheMapping(slimList)
    ↓
[__imock_cache__ обновлен на сервере]
```

---

## 🐛 Проблема с фильтрацией (ИСПРАВЛЕНО)

### **Проблема:**

```
T=100ms: loadImockCacheBestOf3()
    ↓
{ mappings: [слим-версия БЕЗ response.status] }
    ↓
executeMappingFilters()
    ↓
mapping.response?.status  // ❌ undefined
    ↓
Фильтр по статусу не работает!
```

### **Решение:**

```javascript
// slimMapping() теперь включает response.status
function slimMapping(m) {
    return {
        // ...
        response: {
            status: m.response?.status  // ✅ ДОБАВЛЕНО
        }
    };
}
```

---

## 📝 Итоговая схема

```
┌──────────────────────────────────────────────────────────────────────┐
│                        WireMock Server                               │
│                      (Source of Truth)                               │
│                                                                      │
│  /mappings          → Полные маппинги                               │
│  /__imock_cache__   → Слим-кеш (с response.status)                 │
└──────────────┬────────────────────────────┬──────────────────────────┘
               │                            │
               │ HTTP API (slow)            │ HTTP API (fast)
               ↓                            ↓
    ┌─────────────────────────┐  ┌──────────────────────────┐
    │fetchMappingsFromServer  │  │loadImockCacheBestOf3     │
    │   (полные данные)       │  │   (слим-данные)          │
    │   T=800ms               │  │   T=100ms                │
    └───────────┬─────────────┘  └────────┬─────────────────┘
                │                         │
                │                         ↓ БЫСТРЫЙ РЕНДЕР
                │              ┌──────────────────────────────┐
                │              │   UI (DOM) - СТАБИЛЬНЫЙ      │
                │              │   [Рендер из слим-кеша]      │
                │              │   ❌ Не перерисовывается     │
                │              └──────────────────────────────┘
                │
                ↓ ТИХАЯ ВАЛИДАЦИЯ В ФОНЕ
    ┌────────────────────────────────────────────────────────┐
    │   Silent Cache Validation (background)                 │
    │   • Сравнение cachedIds vs serverIds                   │
    │   • Обновление window.allMappings/originalMappings     │
    │   • Toast: Success / Warning / Error                   │
    │   • ❌ БЕЗ UI re-render                                │
    └────────────────────────────────────────────────────────┘
                │
                ↓
        ┌───────────────────────────────────────────┐
        │      CacheManager.cache (Map)             │
        │    [Полные маппинги в памяти]             │
        └─────────────────┬─────────────────────────┘
                          │
                          ↓
        ┌───────────────────────────────────────────┐
        │   window.originalMappings (Array)         │
        │        [Все маппинги]                     │
        └─────────────────┬─────────────────────────┘
                          │
                          ↓ executeMappingFilters()
                          │ (применяет method, query, status)
        ┌───────────────────────────────────────────┐
        │    window.allMappings (Array)             │
        │       [Отфильтрованные]                   │
        └─────────────────┬─────────────────────────┘
                          │
                          ↓ renderList()
        ┌───────────────────────────────────────────┐
        │           UI (DOM)                        │
        │      [Карточки маппингов]                 │
        └───────────────┬─┬─────────────────────────┘
                        │ │
           ┌────────────┘ └────────────┐
           │                           │
           ↓ User changes filter        ↓ User clicks preset
    ┌──────────────────┐      ┌─────────────────────┐
    │ URLStateManager  │      │ FilterPresetsManager│
    │ ?method=GET      │◄─────┤ localStorage        │
    │ &query=api       │      │ custom presets      │
    │ &status=200      │      └─────────────────────┘
    └──────────────────┘
           │
           ↓ URL update + filter apply
    ┌──────────────────────────────────────┐
    │   Active Filter Pills                │
    │   [Method: GET] [Query: api] [×]     │
    └──────────────────────────────────────┘
           │
           │ User actions (create/edit/delete)
           ↓
    ┌──────────────────────────────────────┐
    │  Optimistic Update → Cache → Server  │
    │  • UI мгновенно                      │
    │  • Sync в фоне                       │
    └──────────────────────────────────────┘
```

---

## 🎯 Ключевые моменты

1. **Два кеша:**
   - Memory Cache (полные данные в runtime)
   - Server Cache (слим-данные для быстрой загрузки)
   - Слим-кеш теперь включает `response.status` для фильтрации

2. **Optimistic UI:**
   - Изменения видны мгновенно
   - Синхронизация с сервером в фоне
   - TTL 30 секунд для откатов

3. **Тихая валидация кеша:**
   - UI рендерится один раз из кеша и остается стабильным
   - Полные данные загружаются в фоне (без перерисовки UI)
   - Toast уведомления о статусе синхронизации
   - Ручной контроль пересборки кеша при расхождениях

4. **Фильтрация:**
   - Работает на `window.allMappings`
   - Источник: `window.originalMappings`
   - Фильтры из URL параметров (приоритет) или localStorage
   - Три типа фильтров: `method`, `query` (URL/name), `status`

5. **URL State Management:**
   - Фильтры хранятся в URL query parameters
   - Позволяет делиться ссылками с активными фильтрами
   - Синхронизация с browser history (back/forward)
   - Приоритет: URL → localStorage

6. **Filter Presets:**
   - Пользовательские сохраненные комбинации фильтров
   - Хранятся в localStorage
   - Быстрое переключение между часто используемыми фильтрами
   - БЕЗ дефолтных пресетов (только custom)

7. **Active Filter Pills:**
   - Визуальное отображение активных фильтров
   - Быстрое удаление отдельного фильтра (×)
   - Автоматически скрываются когда нет активных фильтров

8. **Source of Truth:**
   - WireMock сервер - единственный источник правды
   - Кеши - для оптимизации UX
   - Регулярная синхронизация (60 сек)
   - Тихая валидация после загрузки кеша
