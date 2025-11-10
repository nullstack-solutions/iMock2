# User Journey: Редактирование Маппинга - Трассировка Кода

Полная трассировка работы модалки редактирования маппинга с указанием, какой код выполняется на каждом этапе.

---

## 🎬 Этап 1: Пользователь нажимает кнопку "Edit"

### Действие пользователя:
Клик на кнопку "Edit" в карточке маппинга

### Что происходит в коде:

**📍 Точка входа:** `index.html:817-939` (HTML кнопка Edit в mapping card)
```html
<button onclick="openEditModal('${mapping.id}')" class="btn-icon">Edit</button>
```

**📍 Вызывается:** `js/features/requests.js:240` - `window.openEditModal(identifier)`

```javascript
window.openEditModal = async (identifier) => {
```

---

## 🔍 Этап 2: Поиск маппинга в кеше

### Действие системы:
Поиск маппинга по identifier (id) в локальном кеше

### Что происходит в коде:

**📍 `js/features/requests.js:242-245`** - Проверка наличия кеша
```javascript
if (!window.allMappings || !Array.isArray(window.allMappings)) {
    NotificationManager.show('Mappings are not loaded', NotificationManager.TYPES.ERROR);
    return;
}
```

**📍 `js/features/requests.js:247-251`** - Нормализация идентификатора
```javascript
const normalizeIdentifier = (value) => {
    if (typeof value === 'string') return value.trim();
    if (value === undefined || value === null) return '';
    return String(value).trim();
};
```

**📍 `js/features/requests.js:253-263`** - Сбор всех возможных идентификаторов маппинга
```javascript
const collectCandidateIdentifiers = (mapping) => {
    if (!mapping || typeof mapping !== 'object') return [];
    return [
        mapping.id,
        mapping.uuid,
        mapping.stubMappingId,
        mapping.stubId,
        mapping.mappingId,
        mapping.metadata?.id
    ].map(normalizeIdentifier).filter(Boolean);
};
```

**📍 `js/features/requests.js:267-273`** - Поиск маппинга в индексе или массиве
```javascript
let mapping = null;
if (window.mappingIndex instanceof Map && targetIdentifier) {
    mapping = window.mappingIndex.get(targetIdentifier) || null;
}
if (!mapping) {
    mapping = window.allMappings.find((candidate) =>
        collectCandidateIdentifiers(candidate).includes(targetIdentifier));
}
```

**📍 `js/features/requests.js:274-278`** - Если маппинг не найден - ошибка
```javascript
if (!mapping) {
    NotificationManager.show('Mapping not found', NotificationManager.TYPES.ERROR);
    return;
}
```

---

## 🎨 Этап 3: Подсветка активной карточки

### Действие системы:
Визуальная индикация редактируемого маппинга

### Что происходит в коде:

**📍 `js/features/requests.js:280-286`** - Очистка предыдущего состояния и подсветка текущей карточки
```javascript
if (typeof UIComponents?.clearCardState === 'function') {
    UIComponents.clearCardState('mapping', 'is-editing');
}
const highlightId = mapping?.id || targetIdentifier;
if (highlightId && typeof UIComponents?.setCardState === 'function') {
    UIComponents.setCardState('mapping', highlightId, 'is-editing', true);
}
```

**Эффект:** Карточка маппинга получает CSS класс `.is-editing` и подсвечивается

---

## 🪟 Этап 4: Открытие модального окна

### Действие системы:
Показ модального окна с backdrop

### Что происходит в коде:

**📍 `js/features/requests.js:289-294`** - Вызов showModal
```javascript
if (typeof window.showModal === 'function') {
    window.showModal('edit-mapping-modal');
} else {
    console.warn('showModal function not found');
    return;
}
```

**📍 `js/core.js:792-805`** - `window.showModal(modalId)`
```javascript
window.showModal = (modalId) => {
    const modal = resolveModalElement(modalId);
    if (!modal) {
        return;
    }

    modal.classList.remove('hidden');    // ← Убирает CSS класс .hidden
    modal.style.display = 'flex';        // ← Показывает модалку (flexbox)

    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);  // ← Фокус на первый input через 100ms
    }
};
```

**Эффект:**
- Модальное окно `#edit-mapping-modal` становится видимым
- Первый input получает фокус

---

## 📝 Этап 5: Заполнение формы кешированными данными

### Действие системы:
Мгновенное отображение данных из кеша для быстрого UX

### Что происходит в коде:

**📍 `js/features/requests.js:300-305`** - Вызов populateEditMappingForm
```javascript
if (typeof window.populateEditMappingForm === 'function') {
    window.populateEditMappingForm(mapping);
} else {
    console.error('populateEditMappingForm function not found!');
    return;
}
```

**📍 `js/editor.js:450-476`** - `window.populateEditMappingForm(mapping)`
```javascript
window.populateEditMappingForm = (mapping) => {
    console.log('🔵 [EDITOR DEBUG] populateEditMappingForm called');

    // Сброс состояния редактора
    editorState.originalMapping = mapping;
    editorState.currentMapping = JSON.parse(JSON.stringify(mapping)); // Deep clone
    editorState.isDirty = false;
    updateDirtyIndicator();

    // Заполнение полей формы
    populateFormFields(mapping);

    // Загрузка данных в зависимости от режима
    if (editorState.mode === EDITOR_MODES.JSON) {
        loadJSONMode();
    }
};
```

**📍 `js/editor.js:481-583`** - `populateFormFields(mapping)` - заполняет все поля
```javascript
function populateFormFields(mapping) {
    // Очистка всех полей
    if (idElement) idElement.value = '';
    if (methodElement) methodElement.value = 'GET';
    // ... очистка остальных полей ...

    // Заполнение новыми данными
    if (idElement) idElement.value = mapping.id || '';
    if (methodElement) methodElement.value = mapping.request?.method || 'GET';
    if (urlPatternElement) urlPatternElement.value = mapping.request?.urlPattern || '';
    if (responseStatusElement) responseStatusElement.value = mapping.response?.status || 200;
    if (mappingNameElement) mappingNameElement.value = mapping.name || '';
    // ... заполнение остальных полей ...
}
```

**📍 `js/editor.js:663-685`** - `loadJSONMode()` - загружает JSON в textarea
```javascript
function loadJSONMode() {
    const jsonEditor = document.getElementById('json-editor');
    if (!jsonEditor) return;

    if (!editorState.currentMapping) return;

    const formattedJSON = JSON.stringify(editorState.currentMapping, null, 2);
    jsonEditor.value = formattedJSON;              // ← Заполняет textarea
    adjustJsonEditorHeight(true);                  // ← Подгоняет высоту
}
```

**Эффект:**
- Все поля формы заполнены данными из кеша
- JSON редактор показывает отформатированный JSON
- Индикатор "Unsaved changes" скрыт (`isDirty = false`)

---

## ⏳ Этап 6: Установка состояния загрузки

### Действие системы:
Показ индикатора загрузки во время запроса к серверу

### Что происходит в коде:

**📍 `js/features/requests.js:308-311`** - Включение busy state
```javascript
try {
    if (typeof window.setMappingEditorBusyState === 'function') {
        window.setMappingEditorBusyState(true, 'Loading…');
    }
```

**Эффект:**
- Кнопка "Update Mapping" показывает спиннер
- Текст кнопки меняется на "Loading…"
- Редактор блокируется от изменений

---

## 🌐 Этап 7: Загрузка свежих данных с сервера

### Действие системы:
Асинхронный запрос последней версии маппинга

### Что происходит в коде:

**📍 `js/features/requests.js:313-340`** - Fetch свежих данных
```javascript
const mappingIdForFetch = normalizeIdentifier(mapping.id) ||
                          normalizeIdentifier(mapping.uuid) ||
                          targetIdentifier;

const latest = await apiFetch(`/mappings/${encodeURIComponent(mappingIdForFetch)}`);
const latestMapping = latest?.mapping || latest;

if (latestMapping && latestMapping.id) {
    console.log('🔵 [OPEN MODAL DEBUG] Loaded latest mapping from server');

    // Повторное заполнение формы свежими данными
    window.populateEditMappingForm(latestMapping);

    // Обновление кеша
    const idx = window.allMappings.findIndex((candidate) => candidate === mapping);
    if (idx !== -1) {
        window.allMappings[idx] = latestMapping;
        addMappingToIndex(latestMapping);
    }
}
```

**📍 `js/features/requests.js:334-340`** - Обработка ошибок загрузки
```javascript
} catch (e) {
    console.warn('Failed to load latest mapping, using cached version.', e);
} finally {
    if (typeof window.setMappingEditorBusyState === 'function') {
        window.setMappingEditorBusyState(false);  // ← Снятие busy state
    }
}
```

**Эффект:**
- API запрос: `GET /mappings/{id}`
- Форма обновляется свежими данными с сервера
- Кеш `window.allMappings` обновляется
- Спиннер исчезает, кнопка снова активна

---

## 📋 Этап 8: Обновление заголовка модалки

### Действие системы:
Установка заголовка "Edit Mapping"

### Что происходит в коде:

**📍 `js/features/requests.js:342-344`** - Установка title
```javascript
const modalTitleElement = document.getElementById(SELECTORS.MODAL.TITLE);
if (modalTitleElement) modalTitleElement.textContent = 'Edit Mapping';
```

**Эффект:** Заголовок модалки `<h3 id="edit-modal-title">` обновляется

---

## ✏️ Этап 9: Пользователь редактирует JSON

### Действие пользователя:
Изменение содержимого в JSON редакторе (textarea)

### Что происходит в коде:

**📍 `js/editor.js:72-78`** - Event listener на input
```javascript
document.addEventListener('input', (e) => {
    if (e.target.matches('.editor-field') || e.target.id === 'json-editor') {
        editorState.isDirty = true;        // ← Флаг "есть несохраненные изменения"
        updateDirtyIndicator();            // ← Показать индикатор
    }
});
```

**📍 `js/editor.js:updateDirtyIndicator()`** - Показ индикатора
```javascript
function updateDirtyIndicator() {
    const indicator = document.getElementById('editor-dirty-indicator');
    if (indicator) {
        indicator.style.display = editorState.isDirty ? 'inline' : 'none';
    }
}
```

**Эффект:**
- Появляется желтый индикатор "● Unsaved changes" в заголовке модалки
- `editorState.isDirty = true`

---

## 🎨 Этап 10: Пользователь использует кнопки Format/Minify (опционально)

### Действие пользователя:
Клик на кнопку "Format" или "Minify" в header модалки

### Что происходит в коде:

**📍 `js/editor.js:62-68`** - Event listener для кнопок
```javascript
document.addEventListener('click', (e) => {
    if (e.target.matches('[data-action="format-json"]')) {
        formatCurrentJSON();
    }

    if (e.target.matches('[data-action="minify-json"]')) {
        minifyCurrentJSON();
    }
});
```

**📍 `js/editor.js:formatCurrentJSON()`**
```javascript
function formatCurrentJSON() {
    const jsonEditor = document.getElementById('json-editor');
    try {
        const parsed = JSON.parse(jsonEditor.value);
        jsonEditor.value = JSON.stringify(parsed, null, 2);  // ← Форматирование с отступами
        adjustJsonEditorHeight(true);
        NotificationManager.success('JSON formatted');
    } catch (error) {
        NotificationManager.error('Invalid JSON: ' + error.message);
    }
}
```

**📍 `js/editor.js:minifyCurrentJSON()`**
```javascript
function minifyCurrentJSON() {
    const jsonEditor = document.getElementById('json-editor');
    try {
        const parsed = JSON.parse(jsonEditor.value);
        jsonEditor.value = JSON.stringify(parsed);  // ← Минификация (без отступов)
        adjustJsonEditorHeight(true);
        NotificationManager.success('JSON minified');
    } catch (error) {
        NotificationManager.error('Invalid JSON: ' + error.message);
    }
}
```

**Эффект:**
- JSON перефоматируется/минифицируется в textarea
- Показывается уведомление об успехе/ошибке

---

## 💾 Этап 11: Пользователь нажимает "Update Mapping"

### Действие пользователя:
Клик на кнопку "Update Mapping"

### Что происходит в коде:

**📍 `index.html:830`** - HTML кнопка
```html
<button type="button" id="update-mapping-btn" onclick="updateMapping()">
    <span class="btn-label">Update Mapping</span>
    <span class="btn-spinner loading-spinner"></span>
</button>
```

**📍 `js/editor.js:350-445`** - `window.updateMapping()`
```javascript
window.updateMapping = async () => {
    console.log('updateMapping called');

    try {
        // ШАГ 1: Установка busy state
        window.setMappingEditorBusyState(true, 'Updating…');
```

**Эффект:**
- Кнопка показывает спиннер
- Текст меняется на "Updating…"
- Кнопка блокируется (`disabled = true`)

---

## 🔄 Этап 12: Сохранение данных из редактора в state

### Действие системы:
Парсинг JSON и сохранение в `editorState.currentMapping`

### Что происходит в коде:

**📍 `js/editor.js:356-361`** - Сохранение в зависимости от режима
```javascript
// Save current state based on active mode FIRST
if (editorState.mode === EDITOR_MODES.JSON) {
    saveFromJSONMode();           // ← Парсим JSON из textarea
} else {
    saveFromFormMode();           // ← Собираем данные из полей формы
}
```

**📍 `js/editor.js:621-650`** - `saveFromJSONMode()`
```javascript
function saveFromJSONMode() {
    const jsonEditor = document.getElementById('json-editor');
    if (!jsonEditor) return;

    const jsonText = jsonEditor.value;
    if (!jsonText.trim()) return;

    try {
        const parsedMapping = JSON.parse(jsonText);  // ← Парсинг JSON
        editorState.currentMapping = parsedMapping;  // ← Сохранение в state
        console.log('🟢 [SAVE DEBUG] Updated currentMapping ID:', editorState.currentMapping?.id);
    } catch (error) {
        throw new Error('Invalid JSON: ' + error.message);
    }
}
```

**Эффект:**
- `editorState.currentMapping` содержит распарсенный объект маппинга
- При ошибке парсинга - выбрасывается исключение

---

## 🔍 Этап 13: Валидация ID маппинга

### Действие системы:
Проверка наличия ID для обновления

### Что происходит в коде:

**📍 `js/editor.js:363-369`** - Проверка ID
```javascript
const mappingData = editorState.currentMapping;
const id = mappingData?.id;

if (!id) {
    NotificationManager.error('Mapping ID not found');
    return;
}
```

**Эффект:**
- Если ID отсутствует - показывается ошибка и функция завершается
- Если ID есть - продолжается выполнение

---

## 📅 Этап 14: Добавление метаданных

### Действие системы:
Установка timestamps и source в metadata

### Что происходит в коде:

**📍 `js/editor.js:374-400`** - Обновление metadata
```javascript
(function(){
    try {
        const nowIso = new Date().toISOString();  // ← Текущее время в ISO
        if (typeof mappingData === 'object' && mappingData) {
            // Инициализация metadata если нет
            if (!mappingData.metadata) {
                mappingData.metadata = {};
            }

            // Установка created timestamp (если первое сохранение)
            if (!mappingData.metadata.created) {
                mappingData.metadata.created = nowIso;
            }

            // Всегда обновляем edited timestamp и source
            mappingData.metadata.edited = nowIso;      // ← Время редактирования
            mappingData.metadata.source = 'ui';        // ← Источник: UI
        }
    } catch (e) {
        console.warn('📅 [METADATA] Failed to update metadata:', e);
    }
})();
```

**Эффект:**
- `mappingData.metadata.created` - время создания (если не было)
- `mappingData.metadata.edited` - время последнего изменения
- `mappingData.metadata.source = 'ui'` - помечается как изменено через UI

---

## 🌐 Этап 15: Отправка PUT запроса на сервер

### Действие системы:
API запрос для обновления маппинга

### Что происходит в коде:

**📍 `js/editor.js:401-405`** - PUT запрос
```javascript
const response = await apiFetch(`/mappings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mappingData)  // ← Отправка полного объекта маппинга
});
```

**API Endpoint:** `PUT /mappings/{id}`
**Request Body:** JSON объект маппинга с обновленной metadata

**📍 `js/editor.js:408-409`** - Обработка ответа
```javascript
const updatedMapping = response?.mapping || response;
console.log('Mapping updated successfully, using server response:', updatedMapping);
```

**Эффект:**
- Сервер получает обновленный маппинг
- Сервер возвращает актуальную версию маппинга (может добавить свои поля)

---

## ✅ Этап 16: Уведомление об успехе

### Действие системы:
Показ success notification

### Что происходит в коде:

**📍 `js/editor.js:411`** - Success notification
```javascript
NotificationManager.success('Mapping updated!');
```

**Эффект:**
- Зеленое toast уведомление "Mapping updated!" в правом верхнем углу
- Автоматически исчезает через несколько секунд

---

## 🔄 Этап 17: Обновление оптимистичного кеша

### Действие системы:
Обновление локального кеша без перезагрузки списка

### Что происходит в коде:

**📍 `js/editor.js:414-418`** - Optimistic cache update
```javascript
try {
    if (updatedMapping) {
        updateOptimisticCache(updatedMapping, 'update');  // ← Обновление кеша
    }
} catch (e) {
    console.warn('optimistic updates after edit failed:', e);
}
```

**📍 `js/cache.js:updateOptimisticCache()`** (предположительно)
```javascript
function updateOptimisticCache(mapping, operation) {
    // Находим маппинг в window.allMappings по ID
    const idx = window.allMappings.findIndex(m => m.id === mapping.id);

    if (idx !== -1) {
        window.allMappings[idx] = mapping;  // ← Обновляем в массиве
    }

    // Обновляем индекс
    if (window.mappingIndex instanceof Map) {
        window.mappingIndex.set(mapping.id, mapping);
    }

    // Обновляем DOM карточки маппинга без полной перерисовки
    updateMappingCardInDOM(mapping);
}
```

**Эффект:**
- Карточка маппинга в списке мгновенно обновляется без мерцания
- Кеш `window.allMappings` синхронизирован с сервером

---

## 🧹 Этап 18: Сброс состояния dirty

### Действие системы:
Убираем индикатор "Unsaved changes"

### Что происходит в коде:

**📍 `js/editor.js:420-421`** - Сброс dirty flag
```javascript
editorState.isDirty = false;
updateDirtyIndicator();
```

**Эффект:**
- Индикатор "● Unsaved changes" исчезает
- `editorState.isDirty = false`

---

## 🚪 Этап 19: Закрытие модального окна

### Действие системы:
Скрытие модалки и очистка состояния

### Что происходит в коде:

**📍 `js/editor.js:423-424`** - Вызов hideModal
```javascript
console.log('Hiding modal...');
hideModal('edit-mapping-modal');
```

**📍 `js/core.js:812-833`** - `window.hideModal(modal)`
```javascript
window.hideModal = (modal) => {
    const modalElement = typeof modal === 'string' ? resolveModalElement(modal) : modal;
    if (!modalElement) return;

    modalElement.classList.add('hidden');     // ← Добавляем CSS класс .hidden
    modalElement.style.display = 'none';      // ← Скрываем модалку

    const form = modalElement.querySelector('form');
    if (form) {
        form.reset();  // ← Сбрасываем все поля формы
    }

    // Очистка подсветки карточки
    if (modalElement.id === 'edit-mapping-modal' &&
        typeof UIComponents?.clearCardState === 'function') {
        UIComponents.clearCardState('mapping', 'is-editing');  // ← Убираем подсветку
    }
};
```

**Эффект:**
- Модальное окно исчезает
- Форма очищается
- Подсветка карточки маппинга убирается (класс `.is-editing` удален)

---

## 🔍 Этап 20: Повторное применение фильтров (если активны)

### Действие системы:
Обновление отфильтрованного списка маппингов

### Что происходит в коде:

**📍 `js/editor.js:428-435`** - Проверка и применение фильтров
```javascript
// Проверяем наличие активных фильтров
const hasActiveFilters = document.getElementById(SELECTORS.MAPPING_FILTERS.METHOD)?.value ||
                       document.getElementById(SELECTORS.MAPPING_FILTERS.URL)?.value ||
                       document.getElementById(SELECTORS.MAPPING_FILTERS.STATUS)?.value;

if (hasActiveFilters) {
    FilterManager.applyMappingFilters();  // ← Перефильтровка списка
}
```

**Эффект:**
- Если есть активные фильтры (по method/url/status) - список перефильтровывается
- Обновленный маппинг отображается с учетом фильтров

---

## ✅ Этап 21: Завершение операции

### Действие системы:
Снятие busy state, логирование

### Что происходит в коде:

**📍 `js/editor.js:437-444`** - Finally блок
```javascript
console.log('updateMapping completed successfully');

} catch (e) {
    console.error('Error in updateMapping:', e);
    NotificationManager.error(`Update failed: ${e.message}`);  // ← Ошибка
} finally {
    window.setMappingEditorBusyState(false);  // ← Снятие busy state в любом случае
}
```

**Эффект:**
- Кнопка "Update Mapping" снова активна
- Спиннер исчезает
- Логи завершения в консоли

---

## 🔴 Обработка ошибок (если что-то пошло не так)

### Возможные ошибки:

1. **Маппинг не найден в кеше**
   - **Где:** `js/features/requests.js:274-278`
   - **Эффект:** Красное уведомление "Mapping not found"

2. **Невалидный JSON**
   - **Где:** `js/editor.js:621-650` - `saveFromJSONMode()`
   - **Эффект:** Выброс исключения `"Invalid JSON: ..."`

3. **Отсутствует ID маппинга**
   - **Где:** `js/editor.js:366-369`
   - **Эффект:** Красное уведомление "Mapping ID not found"

4. **Ошибка API запроса**
   - **Где:** `js/editor.js:401-405` - PUT запрос
   - **Эффект:** Catch блок, уведомление `"Update failed: {error message}"`

5. **Ошибка оптимистичного обновления**
   - **Где:** `js/editor.js:414-418`
   - **Эффект:** Предупреждение в консоли, но операция продолжается

---

## 📊 Структура данных editorState

```javascript
editorState = {
    mode: 'json',                    // Режим редактора: 'json' | 'form'
    originalMapping: {...},          // Оригинальная версия маппинга
    currentMapping: {...},           // Текущая редактируемая версия
    isDirty: false                   // Флаг наличия несохраненных изменений
}
```

---

## 📁 Ключевые файлы и их роли

| Файл | Роль | Основные функции |
|------|------|------------------|
| `index.html:817-939` | HTML разметка модалки | Структура modal, кнопки, inputs |
| `js/features/requests.js:240-347` | Открытие модалки | `openEditModal()` - поиск маппинга, загрузка данных |
| `js/editor.js:1-900` | Логика редактора | `populateEditMappingForm()`, `updateMapping()`, JSON/Form режимы |
| `js/core.js:792-833` | Утилиты модалок | `showModal()`, `hideModal()` |
| `styles/modals.css` | Стили модалки | CSS для modal, backdrop, animations |

---

## 🎯 Итоговый flow в одной схеме

```
User Click "Edit"
       ↓
openEditModal(id)                    [js/features/requests.js:240]
       ↓
Поиск в кеше                         [js/features/requests.js:267-273]
       ↓
Подсветка карточки                   [js/features/requests.js:280-286]
       ↓
showModal('edit-mapping-modal')      [js/core.js:792-805]
       ↓
populateEditMappingForm(mapping)     [js/editor.js:450-476]
  ├─→ populateFormFields()           [js/editor.js:481-583]
  └─→ loadJSONMode()                 [js/editor.js:663-685]
       ↓
setMappingEditorBusyState(true)      [js/features/requests.js:309-311]
       ↓
API: GET /mappings/{id}              [js/features/requests.js:314]
       ↓
populateEditMappingForm(latest)      [js/editor.js:450] (второй раз)
       ↓
setMappingEditorBusyState(false)     [js/features/requests.js:337-339]
       ↓
[User edits JSON]                    [Textarea input]
       ↓
isDirty = true                       [js/editor.js:72-78]
       ↓
User clicks "Update Mapping"         [index.html:830]
       ↓
updateMapping()                      [js/editor.js:350]
  ├─→ setMappingEditorBusyState(true)   [js/editor.js:354]
  ├─→ saveFromJSONMode()                [js/editor.js:358]
  ├─→ Add metadata timestamps           [js/editor.js:374-400]
  ├─→ API: PUT /mappings/{id}           [js/editor.js:401-405]
  ├─→ NotificationManager.success()     [js/editor.js:411]
  ├─→ updateOptimisticCache()           [js/editor.js:416]
  ├─→ isDirty = false                   [js/editor.js:420]
  ├─→ hideModal()                       [js/editor.js:424]
  ├─→ FilterManager.applyFilters()      [js/editor.js:433]
  └─→ setMappingEditorBusyState(false)  [js/editor.js:443]
       ↓
✅ DONE - Mapping updated!
```

---

## 🔗 Связанные компоненты

- **NotificationManager** - показ toast уведомлений
- **UIComponents** - управление состоянием карточек (подсветка)
- **FilterManager** - фильтрация списка маппингов
- **apiFetch()** - обертка для fetch с обработкой ошибок
- **window.allMappings** - глобальный кеш маппингов
- **window.mappingIndex** - Map индекс для быстрого поиска по ID

---

## 📝 Заметки о производительности

1. **Двухступенчатая загрузка:**
   - Сначала показываются кешированные данные (мгновенно)
   - Затем подгружаются свежие данные с сервера (async)

2. **Оптимистичные обновления:**
   - Кеш обновляется сразу после успешного PUT запроса
   - DOM карточки обновляется без полной перерисовки

3. **Truncation для больших данных:**
   - В form полях данные обрезаются после 5000 символов
   - Подсказка переключиться в JSON режим для полного просмотра

4. **Auto-resize для textarea:**
   - JSON редактор автоматически подгоняет высоту под контент

---

## 🎨 CSS классы и их роли

- `.modal` - container модалки с backdrop
- `.hidden` - скрывает элемент (display: none)
- `.is-editing` - подсвечивает редактируемую карточку
- `.is-loading` - показывает спиннер на кнопке
- `.dirty-indicator` - индикатор несохраненных изменений
- `.btn-spinner` - анимированный спиннер загрузки

---

**Конец документации**
