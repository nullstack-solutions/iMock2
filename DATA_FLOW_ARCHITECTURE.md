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
         ✅ response.status ТЕПЕРЬ есть
T=200ms: Асинхронный запрос за полными данными
T=500ms: Полные данные получены → обновление UI
         ✅ Теперь есть body, headers и т.д.
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
┌─────────────────────────────────────────────────────────────┐
│                    WireMock Server                          │
│                  (Source of Truth)                          │
│                                                             │
│  /mappings          → Полные маппинги                      │
│  /__imock_cache__   → Слим-кеш для быстрой загрузки       │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
               │ HTTP API                 │ HTTP API
               ↓                          ↓
    ┌──────────────────────┐   ┌──────────────────────┐
    │ fetchMappingsFromServer│   │loadImockCacheBestOf3│
    │    (полные данные)     │   │   (слим-данные)     │
    └──────────┬─────────────┘   └──────────┬───────────┘
               │                            │
               ↓                            ↓
        ┌─────────────────────────────────────────┐
        │       CacheManager.cache (Map)          │
        │     [Полные маппинги в памяти]          │
        └─────────────────┬───────────────────────┘
                          │
        ┌─────────────────┴───────────────────────┐
        │     buildCacheSnapshot()                 │
        │  или Array.from(cache.values())          │
        └─────────────────┬───────────────────────┘
                          │
                          ↓
        ┌─────────────────────────────────────────┐
        │    window.originalMappings (Array)       │
        │         [Все маппинги]                   │
        └─────────────────┬───────────────────────┘
                          │
                          ↓ executeMappingFilters()
        ┌─────────────────────────────────────────┐
        │     window.allMappings (Array)           │
        │      [Отфильтрованные]                   │
        └─────────────────┬───────────────────────┘
                          │
                          ↓ renderList()
        ┌─────────────────────────────────────────┐
        │              UI (DOM)                    │
        │     [Карточки маппингов]                 │
        └─────────────────────────────────────────┘
                          │
                          │ User actions
                          ↓
        ┌─────────────────────────────────────────┐
        │   Optimistic Update → Cache → Server    │
        └─────────────────────────────────────────┘
```

---

## 🎯 Ключевые моменты

1. **Два кеша:**
   - Memory Cache (полные данные в runtime)
   - Server Cache (слим-данные для быстрой загрузки)

2. **Optimistic UI:**
   - Изменения видны мгновенно
   - Синхронизация с сервером в фоне
   - TTL 30 секунд для откатов

3. **Фильтрация:**
   - Работает на `window.allMappings`
   - Источник: `window.originalMappings`
   - Фильтры из URL параметров

4. **Source of Truth:**
   - WireMock сервер - единственный источник правды
   - Кеши - для оптимизации UX
   - Регулярная синхронизация (60 сек)
