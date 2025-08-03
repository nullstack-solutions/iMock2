# 🧪 План расширения тестового покрытия WireMock 3.9.1 API

## 📋 Текущее состояние

### Покрытые endpoints (6/15):
- ✅ `/health` - health check
- ✅ `/mappings` - CRUD операции с маппингами
- ✅ `/requests` - получение логов запросов
- ✅ `/scenarios` - управление сценариями
- ✅ `/scenarios/reset` - сброс сценариев
- ✅ `/scenarios/set-state` - изменение состояния сценария

### Отсутствующие endpoints (9/15):
- ❌ `/settings` - настройки сервера
- ❌ `/recordings` - управление записью
- ❌ `/near-misses` - анализ близких совпадений
- ❌ `/requests/count` - подсчет запросов
- ❌ `/requests/find` - поиск запросов
- ❌ `/requests/unmatched` - несопоставленные запросы
- ❌ `/mappings/find` - поиск маппингов
- ❌ `/mappings/meta` - метаданные маппингов
- ❌ `/files` - управление файлами

## 🎯 Приоритетные улучшения

### 1. Тесты для параметров маппингов (HIGH PRIORITY)

**Отсутствующие параметры:**
```javascript
// Request matching parameters
{
  "urlPath": "/api/users",
  "urlPathPattern": "/api/users/[0-9]+",
  "urlPattern": ".*users.*",
  "method": "GET",
  "headers": {
    "Content-Type": { "equalTo": "application/json" },
    "Authorization": { "matches": "Bearer .*" }
  },
  "queryParameters": {
    "limit": { "equalTo": "10" },
    "offset": { "greaterThan": "0" }
  },
  "bodyPatterns": [
    { "equalToJson": "{\"name\":\"test\"}" },
    { "matchesJsonPath": "$.user.id" }
  ],
  "cookies": {
    "session": { "matches": "[A-Z0-9]+" }
  }
}

// Response parameters
{
  "status": 200,
  "statusMessage": "OK",
  "headers": {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache"
  },
  "body": "response body",
  "bodyFileName": "response.json",
  "jsonBody": { "result": "success" },
  "base64Body": "encoded content",
  "fault": "CONNECTION_RESET_BY_PEER",
  "fixedDelayMilliseconds": 1000,
  "delayDistribution": {
    "type": "lognormal",
    "median": 80,
    "sigma": 0.4
  }
}

// Advanced parameters
{
  "priority": 1,
  "scenarioName": "user-flow",
  "requiredScenarioState": "Started",
  "newScenarioState": "UserCreated",
  "insertionIndex": 0,
  "metadata": {
    "tags": ["user", "api"],
    "description": "User creation endpoint"
  },
  "postServeActions": [
    {
      "name": "webhook",
      "parameters": {
        "method": "POST",
        "url": "http://callback.example.com/webhook"
      }
    }
  ]
}
```

### 2. Тесты для параметров запросов (MEDIUM PRIORITY)

**Расширенные параметры requests:**
```javascript
// Request filtering parameters
{
  "method": "GET",
  "url": "/api/users",
  "since": "2025-01-01T00:00:00Z",
  "until": "2025-12-31T23:59:59Z",
  "unmatched": true,
  "limit": 50,
  "offset": 0
}

// Request details
{
  "id": "request-id",
  "url": "/api/users/123",
  "absoluteUrl": "http://localhost:8080/api/users/123",
  "method": "GET",
  "clientIp": "127.0.0.1",
  "headers": {},
  "cookies": {},
  "browserProxyRequest": false,
  "loggedDate": 1640995200000,
  "bodyAsBase64": "encoded body",
  "body": "request body",
  "loggedDateString": "2022-01-01T00:00:00Z"
}
```

### 3. Новые endpoints для тестирования (HIGH PRIORITY)

#### 3.1 `/near-misses` endpoint
```javascript
// Test near misses analysis
const testNearMisses = async () => {
  const response = await apiFetch('/near-misses');
  // Verify response structure
  assert(response.nearMisses);
  assert(Array.isArray(response.nearMisses));
};
```

#### 3.2 `/requests/count` endpoint
```javascript
// Test request counting
const testRequestCount = async () => {
  const response = await apiFetch('/requests/count');
  assert(typeof response.count === 'number');
};
```

#### 3.3 `/requests/find` endpoint
```javascript
// Test request search
const testRequestFind = async () => {
  const searchParams = {
    method: 'GET',
    url: '/api/users'
  };
  const response = await apiFetch('/requests/find', {
    method: 'POST',
    body: JSON.stringify(searchParams)
  });
  assert(response.requests);
};
```

### 4. Response Templating тесты (MEDIUM PRIORITY)

```javascript
// Test response templating parameters
const templateMapping = {
  "request": {
    "urlPath": "/api/users/{{request.pathSegments.[2]}}"
  },
  "response": {
    "status": 200,
    "body": "{{jsonPath request.body '$.name'}}",
    "headers": {
      "X-Request-Id": "{{request.headers.X-Request-Id}}"
    },
    "transformers": ["response-template"]
  }
};
```

### 5. Fault Injection тесты (LOW PRIORITY)

```javascript
// Test fault injection parameters
const faultMapping = {
  "response": {
    "fault": "MALFORMED_RESPONSE_CHUNK",
    "faultPercentage": 0.1
  }
};

const delayMapping = {
  "response": {
    "fixedDelayMilliseconds": 2000,
    "delayDistribution": {
      "type": "uniform",
      "lower": 1000,
      "upper": 5000
    }
  }
};
```

## 🚀 Рекомендуемый план внедрения

### Фаза 1: Критические параметры (1-2 дня)
1. Добавить тесты для всех параметров маппингов
2. Реализовать тесты для `/near-misses` и `/requests/count`
3. Добавить проверку metadata и priority параметров

### Фаза 2: Расширенная функциональность (2-3 дня)
1. Тесты для response templating
2. Тесты для webhook и post-serve actions
3. Расширенные параметры фильтрации запросов

### Фаза 3: Дополнительные возможности (1-2 дня)
1. Fault injection тесты
2. Тесты для `/files` endpoint
3. Performance и load тесты

## 📝 Структура новых тестов

### Предлагаемая структура файла `api_coverage_tests.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>WireMock 3.9.1 API Coverage Tests</title>
</head>
<body>
    <div class="test-container">
        <h2>🔧 WireMock 3.9.1 API Parameter Coverage Tests</h2>
        
        <!-- Mapping Parameters Tests -->
        <div class="test-section">
            <h3>📋 Mapping Parameters</h3>
            <div class="test-case" id="test-mapping-headers">Headers matching</div>
            <div class="test-case" id="test-mapping-query">Query parameters</div>
            <div class="test-case" id="test-mapping-body">Body patterns</div>
            <div class="test-case" id="test-mapping-priority">Priority handling</div>
            <div class="test-case" id="test-mapping-metadata">Metadata support</div>
        </div>
        
        <!-- Response Parameters Tests -->
        <div class="test-section">
            <h3>📤 Response Parameters</h3>
            <div class="test-case" id="test-response-templating">Response templating</div>
            <div class="test-case" id="test-response-delays">Delay configurations</div>
            <div class="test-case" id="test-response-faults">Fault injection</div>
            <div class="test-case" id="test-response-webhooks">Webhooks</div>
        </div>
        
        <!-- New Endpoints Tests -->
        <div class="test-section">
            <h3>🆕 New Endpoints</h3>
            <div class="test-case" id="test-near-misses">Near misses analysis</div>
            <div class="test-case" id="test-request-count">Request counting</div>
            <div class="test-case" id="test-request-find">Request search</div>
        </div>
    </div>
    
    <script src="api_coverage_tests.js"></script>
</body>
</html>
```

## 🎯 Ожидаемые результаты

После внедрения предложенных тестов:
- **Покрытие API**: с 40% до 85%
- **Параметры маппингов**: с 30% до 90%
- **Endpoints**: с 6/15 до 12/15
- **Качество тестирования**: значительное улучшение

## 📊 Метрики успеха

1. **Покрытие endpoints**: минимум 80%
2. **Покрытие параметров**: минимум 75%
3. **Автоматизация**: 100% автотестов
4. **Документация**: полное покрытие новых тестов
