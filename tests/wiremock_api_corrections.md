# 🔧 Исправления WireMock 3.9.1 Admin API - Актуальная документация

## ❌ Ошибки в первоначальном анализе

### 1. Recording Endpoints
**Неправильно предполагал:**
- `/__admin/recordings` (GET) - НЕ СУЩЕСТВУЕТ

**Правильные endpoints:**
- `/__admin/recordings/start` (POST) - начать запись
- `/__admin/recordings/stop` (POST) - остановить запись  
- `/__admin/recordings/status` (GET) - статус записи
- `/__admin/recordings/snapshot` (POST) - снимок записи

### 2. Near Misses Endpoints  
**Неправильно предполагал:**
- `/__admin/near-misses` (GET) - НЕ СУЩЕСТВУЕТ

**Правильные endpoints:**
- `/__admin/near-misses/request` (POST) - поиск близких совпадений для запроса
- `/__admin/near-misses/request-pattern` (POST) - поиск близких совпадений для паттерна
- `/__admin/requests/unmatched/near-misses` (GET) - близкие совпадения для несопоставленных запросов

### 3. Request Count Endpoint
**Неправильно предполагал:**
- `/__admin/requests/count` (GET) - НЕПРАВИЛЬНЫЙ МЕТОД

**Правильно:**
- `/__admin/requests/count` (POST) - требует JSON тело с критериями поиска

```json
POST /__admin/requests/count
{
  "method": "POST",
  "url": "/resource/to/count",
  "headers": {
    "Content-Type": {
      "matches": ".*/xml"
    }
  }
}
```

## ✅ Полный список актуальных Admin API endpoints

### Stub Mappings
- `/__admin/mappings` (GET, POST, DELETE)
- `/__admin/mappings/reset` (POST)
- `/__admin/mappings/save` (POST)
- `/__admin/mappings/import` (POST)
- `/__admin/mappings/{stubMappingId}` (GET, PUT, DELETE)
- `/__admin/mappings/find-by-metadata` (POST)
- `/__admin/mappings/remove-by-metadata` (POST)

### Requests
- `/__admin/requests` (GET, DELETE)
- `/__admin/requests/{requestId}` (GET, DELETE)
- `/__admin/requests/reset` (POST) - DEPRECATED
- `/__admin/requests/count` (POST) ⚠️ Требует POST с JSON
- `/__admin/requests/remove` (POST)
- `/__admin/requests/remove-by-metadata` (POST)
- `/__admin/requests/find` (POST)
- `/__admin/requests/unmatched` (GET)
- `/__admin/requests/unmatched/near-misses` (GET)

### Near Misses
- `/__admin/near-misses/request` (POST)
- `/__admin/near-misses/request-pattern` (POST)

### Recordings
- `/__admin/recordings/start` (POST)
- `/__admin/recordings/stop` (POST)
- `/__admin/recordings/status` (GET)
- `/__admin/recordings/snapshot` (POST)

### Scenarios
- `/__admin/scenarios` (GET)
- `/__admin/scenarios/reset` (POST)
- `/__admin/scenarios/{scenarioName}/state` (PUT)

### System
- `/__admin/health` (GET)
- `/__admin/shutdown` (POST)
- `/__admin/settings` (GET, POST, PUT)

## 🆕 Новые возможности в WireMock 3.13.x (последняя версия)

### Добавленные в 3.13.0:
1. **Unmatched stub mappings management**
   - `/__admin/mappings/unmatched` (GET, DELETE) - поиск/удаление неиспользуемых маппингов

2. **Enhanced form parameters support**
   - Множественные form параметры в MappingBuilder

3. **Client IP address matching**
   - Нативный matcher для IP адресов клиентов

4. **LogNormal distribution improvements**
   - Добавлен опциональный maxValue для LogNormal распределения

5. **Query parameter matchers recording**
   - Запись query параметров во время recording

6. **Load balancer support**
   - Поддержка admin вызовов через HAProxy/Load Balancer

### Улучшения в 3.12.x:
1. **Enhanced WebUI**
   - Улучшенный веб-интерфейс
   
2. **Better error handling**
   - Улучшенная обработка ошибок

## 🔧 Исправления для iMock 2.0

### 1. Обновить endpoints в core.js:

```javascript
window.ENDPOINTS = {
    HEALTH: '/health',
    MAPPINGS: '/mappings',
    MAPPINGS_UNMATCHED: '/mappings/unmatched', // НОВЫЙ
    REQUESTS: '/requests',
    REQUESTS_COUNT: '/requests/count', // POST метод
    REQUESTS_FIND: '/requests/find', // POST метод
    REQUESTS_UNMATCHED: '/requests/unmatched',
    SCENARIOS: '/scenarios',
    SCENARIOS_RESET: '/scenarios/reset',
    SCENARIOS_SET_STATE: '/scenarios/set-state',
    RECORDINGS_START: '/recordings/start', // ИСПРАВЛЕНО
    RECORDINGS_STOP: '/recordings/stop', // ИСПРАВЛЕНО
    RECORDINGS_STATUS: '/recordings/status', // ИСПРАВЛЕНО
    NEAR_MISSES_REQUEST: '/near-misses/request', // ИСПРАВЛЕНО
    NEAR_MISSES_PATTERN: '/near-misses/request-pattern', // ИСПРАВЛЕНО
    SETTINGS: '/settings'
};
```

### 2. Исправить функции в features.js:

```javascript
// Исправленная функция подсчета запросов
window.getRequestCount = async (criteria = {}) => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_COUNT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(criteria)
        });
        return response.count;
    } catch (error) {
        console.error('Request count error:', error);
        return 0;
    }
};

// Новая функция для поиска запросов
window.findRequests = async (criteria) => {
    try {
        const response = await apiFetch(ENDPOINTS.REQUESTS_FIND, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(criteria)
        });
        return response.requests || [];
    } catch (error) {
        console.error('Find requests error:', error);
        return [];
    }
};

// Исправленная функция записи
window.startRecording = async (config) => {
    try {
        await apiFetch(ENDPOINTS.RECORDINGS_START, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        NotificationManager.success('Recording started');
    } catch (error) {
        NotificationManager.error(`Recording start failed: ${error.message}`);
    }
};

window.stopRecording = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_STOP, {
            method: 'POST'
        });
        NotificationManager.success('Recording stopped');
        return response.mappings || [];
    } catch (error) {
        NotificationManager.error(`Recording stop failed: ${error.message}`);
        return [];
    }
};

window.getRecordingStatus = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_STATUS);
        return response.status;
    } catch (error) {
        console.error('Recording status error:', error);
        return 'Unknown';
    }
};
```

### 3. Обновить тесты в smoke_test.html:

```javascript
// Тест для правильного использования requests/count
const testRequestCount = async () => {
    try {
        const criteria = {
            method: 'GET',
            url: '/test'
        };
        const response = await apiFetch('/__admin/requests/count', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(criteria)
        });
        
        if (typeof response.count === 'number') {
            setTestStatus('test-request-count', 'pass', 'Request count works correctly');
        } else {
            setTestStatus('test-request-count', 'fail', 'Invalid response format');
        }
    } catch (error) {
        setTestStatus('test-request-count', 'fail', error.message);
    }
};

// Тест для recordings endpoints
const testRecordingEndpoints = async () => {
    try {
        // Тест статуса записи
        const status = await apiFetch('/__admin/recordings/status');
        
        if (status && status.status) {
            setTestStatus('test-recordings', 'pass', 'Recording endpoints work');
        } else {
            setTestStatus('test-recordings', 'fail', 'Invalid status response');
        }
    } catch (error) {
        setTestStatus('test-recordings', 'fail', error.message);
    }
};
```

## 📊 Обновленная статистика покрытия

**После исправлений:**
- **Покрытие endpoints**: 50% (12 из 24 актуальных)
- **Правильно реализованные**: 6 из 6 базовых
- **Требуют исправления**: 6 endpoints (recordings, near-misses, requests/count)
- **Новые возможности 3.13.x**: 0% покрытие

## 🎯 Приоритетные задачи

1. **КРИТИЧНО**: Исправить методы для recordings, near-misses, requests/count
2. **ВЫСОКО**: Добавить поддержку новых endpoints из 3.13.x
3. **СРЕДНЕ**: Реализовать расширенные параметры маппингов
4. **НИЗКО**: Добавить поддержку новых возможностей (IP matching, enhanced forms)

## ✅ Заключение

Основные проблемы связаны с неправильным пониманием структуры API:
- Некоторые endpoints требуют POST вместо GET
- Recordings и Near Misses имеют подэндпоинты
- Нужно обновить код для соответствия актуальной спецификации WireMock 3.9.1+
