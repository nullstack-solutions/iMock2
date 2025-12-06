# E2E Test Scenarios для QA инженеров

## Контекст
- **Latency**: `/mappings` запрос выполняется 40-50 секунд
- **Concurrent Users**: До 20+ пользователей одновременно
- **WireMock Version**: 3.9.1+

---

## Сценарий 1: Первое подключение QA к WireMock (холодный старт)

### Предусловия
- WireMock сервер запущен и содержит N мапингов (например, 100)
- Служебный кеш-мапинг НЕ существует
- Браузер открывается впервые (нет localStorage)

### Шаги
1. Открыть `index.html` в браузере
2. Ввести URL WireMock сервера
3. Нажать "Connect"

### Ожидаемый результат

**Фаза 1: Поиск кеша (занимает ~2-3 секунды)**
```
Console logs:
🧩 [CACHE] loadImockCacheBestOf3 start
🧩 [CACHE] Trying fixed ID lookup...
  → GET /mappings/00000000-0000-0000-0000-00000000cace → 404
🧩 [CACHE] Fixed ID miss
🧩 [CACHE] Trying metadata lookup (JSONPath)...
  → POST /__admin/mappings/find-by-metadata → empty array
🧩 [CACHE] Metadata miss
🧩 [CACHE] No cache found
```

**Фаза 2: Прямой запрос (занимает 40-50 секунд)**
```
Console logs:
🔗 [API] GET /__admin/mappings
  → Ожидание 40-50 секунд...
✅ [API] GET /__admin/mappings - OK
📦 Mappings render from: direct — 100 items
```

**UI:**
- ✅ Показывается лоадер "Loading mappings..."
- ✅ После загрузки отображаются все 100 мапингов
- ✅ Служебный мапинг `00000000-0000-0000-0000-00000000cace` НЕ отображается в списке

**Фаза 3: Асинхронная генерация кеша (в фоне)**
```
Console logs:
🧩 [CACHE] Async regenerate after cache miss
🧩 [CACHE] Regenerate cache start
🧩 [CACHE] Using fresh server data for cache regeneration
🧩 [CACHE] Upsert cache mapping start
🧩 [CACHE] PUT /mappings/00000000-0000-0000-0000-00000000cace → 404
🧩 [CACHE] PUT failed, POST /mappings
  → POST /__admin/mappings (создает служебный мапинг)
✅ [CACHE] Upsert done (POST)
🧩 [CACHE] Regenerate cache done (100 items) in XXXms
```

### Проверки после завершения
1. **В WireMock появился новый служебный мапинг:**
   - ID: `00000000-0000-0000-0000-00000000cace`
   - Name: `iMock Cache`
   - URL: `/__imock/cache`
   - Priority: 1
   - Response: JSON с slim-версией всех мапингов
   - Metadata: `{ imock: { type: 'cache', version: 1, timestamp: ..., count: 100, hash: ... } }`

2. **Служебный мапинг фильтруется везде:**
   ```javascript
   // Функция фильтрации
   function isImockCacheMapping(m) {
       const byId = m.id === '00000000-0000-0000-0000-00000000cace';
       const byMeta = m?.metadata?.imock?.type === 'cache';
       const byName = m?.name?.toLowerCase() === 'imock cache';
       const byUrl = m?.request?.url === '/__imock/cache';
       return byId || byMeta || byName || byUrl;
   }
   ```

---

## Сценарий 2: Второе подключение (теплый старт)

### Предусловия
- WireMock сервер запущен
- Служебный кеш-мапинг существует (создан в Сценарии 1)
- Браузер закрыт и открывается заново

### Шаги
1. Открыть `index.html` в браузере
2. Ввести URL WireMock сервера
3. Нажать "Connect"

### Ожидаемый результат

**Фаза 1: Быстрая загрузка из кеша (<1 секунда)**
```
Console logs:
🧩 [CACHE] loadImockCacheBestOf3 start
🧩 [CACHE] Trying fixed ID lookup...
  → GET /mappings/00000000-0000-0000-0000-00000000cace → 200 OK (<1s)
🧩 [CACHE] Using cache: fixed id
📦 Mappings render from: cache — 100 items (slim)
```

**UI:**
- ✅ Мапинги отображаются мгновенно (<1 секунда)
- ✅ Отображается slim-версия (без полных данных request/response)
- ⚠️ Некоторые детали могут быть недоступны (не показываются headers, body и т.д.)

**Фаза 2: Фоновая синхронизация (silent background)**
```
Console logs:
🧩 [CACHE] Cache hit - using cached data for quick start, fetching fresh data
  → Через 200ms запускается фоновая проверка актуальности
🔗 [API] GET /__admin/mappings (в фоне, не блокирует UI)
  → Занимает 40-50 секунд
✅ [API] GET /__admin/mappings - OK
🧩 [CACHE] Comparing cache vs server...
```

**Сценарий 2.1: Кеш актуален (нет изменений)**
```
Console logs:
✅ Data synchronized with server
  → Зеленый тост: "Data synchronized with server"
```

**Сценарий 2.2: Кеш устарел (есть изменения)**
```
Console logs:
⚠️ Cache discrepancies detected (5 new on server, 2 missing on server)
  → Желтый тост: "Cache discrepancies detected. Manual cache rebuild recommended."
```

### Проверки
1. ✅ Первая загрузка занимает <1 секунду (вместо 40-50 секунд)
2. ✅ Фоновая синхронизация не блокирует UI
3. ✅ Уведомление показывается если кеш устарел

---

## Сценарий 3: CRUD операции с оптимистичным UI

### Сценарий 3.1: CREATE новый мапинг

#### Шаги
1. Нажать кнопку "New Mapping"
2. Заполнить форму:
   - Method: POST
   - URL: /api/test
   - Response status: 201
3. Нажать "Save"

#### Ожидаемый результат

**Фаза 1: Оптимистичное обновление (мгновенно)**
```javascript
// mappings.js applyOptimisticMappingUpdate()
context.MappingsStore.addPending({
    id: 'temp-1234567890',  // Временный ID
    type: 'create',
    payload: mapping,
    optimisticMapping: mapping,
    timestamp: Date.now()
});
```

**UI:**
- ✅ Новый мапинг появляется в списке МГНОВЕННО
- ✅ Мапинг помечен как pending (например, полупрозрачный или с индикатором)
- ✅ ID начинается с `temp-`

**Фаза 2: Отправка на сервер (в фоне)**
```
Console logs:
🔗 [API] POST /__admin/mappings
  → body: { request: { method: 'POST', url: '/api/test' }, response: { status: 201 } }
✅ [API] POST /__admin/mappings - OK
  → Server returns: { id: 'real-uuid-from-server', ... }
```

**Фаза 3: Подтверждение (confirmPending)**
```javascript
context.MappingsStore.confirmPending('temp-1234567890', serverMapping);
// Pending удаляется, items обновляется с реальным ID
```

**UI:**
- ✅ Временный ID заменяется на реальный UUID от сервера
- ✅ Индикатор pending исчезает

**Проверки:**
1. ✅ Мапинг виден мгновенно (оптимистично)
2. ✅ После подтверждения имеет реальный ID от сервера
3. ✅ Если сервер вернул ошибку - мапинг откатывается

### Сценарий 3.2: UPDATE существующий мапинг

#### Шаги
1. Кликнуть на мапинг с ID `existing-123`
2. Изменить Response status: 200 → 204
3. Нажать "Update"

#### Ожидаемый результат

**Фаза 1: Оптимистичное обновление**
```javascript
context.MappingsStore.addPending({
    id: 'existing-123',
    type: 'update',
    payload: originalMapping,
    optimisticMapping: updatedMapping,
});
```

**UI:**
- ✅ Изменение видно МГНОВЕННО
- ✅ `getAll()` возвращает optimistic версию

**Фаза 2: Отправка на сервер**
```
🔗 [API] PUT /__admin/mappings/existing-123
✅ [API] PUT - OK
```

**Фаза 3: Подтверждение**
```javascript
context.MappingsStore.confirmPending('existing-123', serverMapping);
```

### Сценарий 3.3: DELETE мапинг

#### Шаги
1. Кликнуть delete на мапинге `to-delete-456`
2. Подтвердить удаление

#### Ожидаемый результат

**Фаза 1: Оптимистичное скрытие**
```javascript
context.MappingsStore.addPending({
    id: 'to-delete-456',
    type: 'delete',
    payload: originalMapping,
    optimisticMapping: null,  // null для delete
});
```

**UI:**
- ✅ Мапинг МГНОВЕННО исчезает из списка
- ✅ `getAll()` фильтрует pending deletes

**Фаза 2: Отправка на сервер**
```
🔗 [API] DELETE /__admin/mappings/to-delete-456
✅ [API] DELETE - OK
```

**Фаза 3: Подтверждение**
```javascript
context.MappingsStore.confirmPending('to-delete-456');
// Удаляется из items и pending
```

---

## Сценарий 4: Работа 10 QA инженеров одновременно

### Предусловия
- 10 пользователей подключены к одному WireMock серверу
- Каждый пользователь работает в своем браузере

### Настройки синхронизации
```javascript
// sync-engine.js
config: {
    incrementalInterval: 10000,    // Каждые 10 секунд
    fullSyncInterval: 300000,      // Каждые 5 минут
}
```

### Сценарий 4.1: User A создает мапинг

**User A (создатель):**
1. Создает мапинг `POST /new-api`
2. Видит его МГНОВЕННО в своем UI (оптимистично)
3. Через ~1-2 секунды сервер подтверждает

**User B-J (остальные 9 пользователей):**
1. Продолжают работать в своих окнах
2. **Через максимум 10 секунд** (incremental sync):
   ```
   🔄 [SYNC] Incremental sync triggered
   🔗 [API] GET /__admin/mappings
   ✅ New mappings detected: 1
   📦 UI updated with new mappings
   ```
3. Видят новый мапинг `POST /new-api` в своих списках

### Сценарий 4.2: Конфликт - два пользователя редактируют один мапинг

**Timeline:**

| Время | User A | User B |
|-------|--------|--------|
| T+0s  | Открывает мапинг `123` (status: 200) | Открывает мапинг `123` (status: 200) |
| T+5s  | Меняет status: 200 → 201 | - |
| T+6s  | Нажимает Save → PUT отправлен | - |
| T+7s  | Сервер подтвердил (edited: 12:00:07) | - |
| T+10s | - | Меняет status: 200 → 404 |
| T+11s | - | Нажимает Save → PUT отправлен |
| T+12s | - | **КОНФЛИКТ**: Сервер обновлен User A |

**Разрешение конфликта: Last-Write-Wins**

```javascript
// operations.js или sync-engine.js
async update(id, data) {
    try {
        const response = await api.put(`/mappings/${id}`, data);
        // User B's update перезаписывает изменения User A
        confirmPending(id, response);
    } catch (error) {
        // Откат если ошибка
        rollbackPending(id);
        NotificationManager.error('Update failed');
    }
}
```

**User A через 10 секунд (incremental sync):**
```
🔄 [SYNC] Incremental sync
⚠️ Conflict detected for mapping 123
  → Local: status 201 (edited: 12:00:07)
  → Server: status 404 (edited: 12:00:12)
🔄 Accepting server version (last-write-wins)
⚠️ Toast: "Mapping 123 was updated by another user"
```

**Проверки:**
1. ✅ Last-write-wins: User B's изменения (404) сохранены
2. ✅ User A видит уведомление о конфликте
3. ✅ Через 10 секунд User A видит актуальную версию (404)

### Сценарий 4.3: Валидация кеша при работе 10 пользователей

**User A создает 5 мапингов:**
1. Создает мапинги оптимистично
2. Через ~30 секунд запускается `rebuildServiceCache()`:
   ```
   🧩 [CACHE] Rebuild service cache check
   🧩 [CACHE] Hash changed: abc123 → def456
   🧩 [CACHE] Regenerate cache start
   🧩 [CACHE] PUT /mappings/00000000-0000-0000-0000-00000000cace
   ✅ Service cache updated
   ```

**Users B-J при следующем подключении:**
1. Загружают обновленный кеш через `loadImockCacheBestOf3()`
2. Видят все 5 новых мапингов от User A

**Фоновая валидация (background refresh):**
```javascript
// mappings.js backgroundRefreshMappings()
async backgroundRefreshMappings(silent = true) {
    const freshData = await fetchMappingsFromServer({ force: true });
    const serverMappings = freshData.mappings.filter(x => !isImockCacheMapping(x));
    const cachedMappings = cached.data.mappings || [];

    // Сравнение
    const serverIds = new Set(serverMappings.map(m => m.id));
    const cachedIds = new Set(cachedMappings.map(m => m.id));

    const missingInCache = serverIds - cachedIds;  // Новые на сервере
    const extraInCache = cachedIds - serverIds;    // Удаленные на сервере

    if (missingInCache.length > 0 || extraInCache.length > 0) {
        NotificationManager.warning(
            `Cache discrepancies detected (${missingInCache.length} new, ${extraInCache.length} missing)`
        );
    }
}
```

---

## Сценарий 5: Offline → Online переход

### Шаги
1. User работает с WireMock (online)
2. Создает 3 мапинга оптимистично
3. WireMock сервер падает / сеть пропадает
4. User продолжает работать (видит оптимистичные мапинги)
5. WireMock восстанавливается

### Ожидаемый результат

**Во время offline:**
```
⚠️ API request failed: Network error
🔄 Retrying... (attempt 1/3)
  → Delay 2s
🔄 Retrying... (attempt 2/3)
  → Delay 4s (exponential backoff)
❌ All retries failed
⚠️ Toast: "Connection lost. Changes will sync when online."
```

**Pending operations накапливаются:**
```javascript
MappingsStore.pending = Map {
    'temp-111': { type: 'create', data: {...}, retries: 0 },
    'temp-222': { type: 'create', data: {...}, retries: 0 },
    'temp-333': { type: 'create', data: {...}, retries: 0 },
}
```

**После восстановления:**
```
✅ Connection restored
🔄 Syncing pending operations (3 items)...
🔗 [API] POST /mappings (temp-111)
✅ Confirmed temp-111 → real-uuid-1
🔗 [API] POST /mappings (temp-222)
✅ Confirmed temp-222 → real-uuid-2
🔗 [API] POST /mappings (temp-333)
✅ Confirmed temp-333 → real-uuid-3
✅ Toast: "All changes synchronized"
```

---

## Проверочный чеклист для QA

### ✅ Первое подключение (холодный старт)
- [ ] Загрузка занимает 40-50 секунд (без кеша)
- [ ] После загрузки создается служебный кеш-мапинг
- [ ] Служебный мапинг не отображается в списке
- [ ] Второе подключение быстрое (<1 секунда)

### ✅ Служебный кеш-мапинг
- [ ] ID: `00000000-0000-0000-0000-00000000cace`
- [ ] URL: `/__imock/cache`
- [ ] Содержит slim-версию всех мапингов
- [ ] Фильтруется из UI по 4 критериям (ID, metadata, name, URL)

### ✅ CRUD операции
- [ ] Create: мапинг появляется мгновенно (оптимистично)
- [ ] Update: изменения видны мгновенно
- [ ] Delete: мапинг исчезает мгновенно
- [ ] При ошибке сервера - откат к исходному состоянию

### ✅ Многопользовательская работа
- [ ] Изменения других пользователей видны через max 10 секунд
- [ ] Конфликты разрешаются по last-write-wins
- [ ] Уведомления о конфликтах показываются
- [ ] Кеш обновляется автоматически каждые 30 секунд

### ✅ Фоновая синхронизация
- [ ] Не блокирует UI
- [ ] Показывает уведомления о рассинхронизации
- [ ] Полная синхронизация каждые 5 минут
- [ ] Инкрементальная синхронизация каждые 10 секунд

### ✅ Offline resilience
- [ ] Оптимистичные операции накапливаются
- [ ] При восстановлении сети - автосинхронизация
- [ ] Retry логика с exponential backoff (2s, 4s, 8s)

---

## Debug команды для console

```javascript
// Проверить состояние MappingsStore
MappingsStore.items.size          // Количество мапингов
MappingsStore.pending.size        // Количество pending операций
MappingsStore.stats              // Статистика

// Проверить наличие служебного кеша
await fetch('http://localhost:8080/__admin/mappings/00000000-0000-0000-0000-00000000cace')

// Проверить SyncEngine
SyncEngine.config                 // Настройки синхронизации
SyncEngine.timers                 // Активные таймеры

// Вручную запустить синхронизацию
await SyncEngine.incrementalSync()
await SyncEngine.fullSync()

// Принудительно пересоздать кеш
await regenerateImockCache()

// Проверить pending операции
Array.from(MappingsStore.pending.values())
```
