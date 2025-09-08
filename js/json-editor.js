// ===== JSON EDITOR FUNCTIONS =====
// Функции для работы с полнофункциональным JSONEditor

let jsonEditor = null;
let jsonEditorInstance = null;
let originalData = {};
let isFullscreen = false;
let templates = {};

// Инициализация JSONEditor
function initJsonEditor(mode = 'tree', containerId = 'jsoneditor') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('JSONEditor container not found:', containerId);
        return;
    }

    const options = {
        mode: mode,
        modes: ['tree', 'code', 'form', 'view', 'text'],
        enableSort: true,
        enableTransform: true,
        indentation: 2,
        escapeUnicode: true,
        history: true,
        // Включаем встроенные кнопки
        mainMenuBar: true,
        navigationBar: true,
        statusBar: true,
        onChangeText: (jsonString) => {
            // Можно добавить автосохранение или валидацию здесь
            updateDirtyIndicator();
        },
        onModeChange: (newMode) => {
            console.log('Switched to mode:', newMode);
            updateModeIndicator(newMode);
        },
        onError: (err) => {
            console.error('JSON Editor Error:', err);
            showJsonValidationResult('Error: ' + err.message, 'error');
        }
    };

    jsonEditorInstance = new JSONEditor(container, options);
    jsonEditor = jsonEditorInstance; // For backward compatibility
    
    console.log('✅ JSONEditor initialized in', mode, 'mode');
    updateModeIndicator(mode);
    jsonEditorInstance.set({}); // Пустой по умолчанию
}

// Обновление индикатора режима
function updateModeIndicator(mode) {
    const indicator = document.getElementById('editor-mode-indicator');
    if (indicator) {
        indicator.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
    }
}

// Обновление индикатора "грязности" данных
function updateDirtyIndicator() {
    const indicator = document.getElementById('editor-dirty-indicator');
    if (indicator) {
        // В реальной реализации здесь должна быть проверка на изменения
        // indicator.style.display = 'inline';
    }
}

// Загрузка данных в редактор
function loadJsonEditorData(data) {
    if (jsonEditorInstance) {
        try {
            jsonEditorInstance.set(data);
            originalData = JSON.parse(JSON.stringify(data)); // для undo
        } catch (e) {
            console.error('Error loading data to JSONEditor:', e);
        }
    }
}

// Получение данных из редактора
function getJsonEditorData() {
    if (jsonEditorInstance) {
        try {
            return jsonEditorInstance.get();
        } catch (e) {
            console.error('Error getting data from JSONEditor:', e);
            throw new Error('Invalid JSON: ' + e.message);
        }
    }
    return {};
}

// Режим создания
function enterCreateMode() {
    initJsonEditor('tree');
    loadJsonEditorData({}); // Очистить редактор
    const templateSelect = document.getElementById('template-select');
    if (templateSelect) {
        templateSelect.style.display = 'inline-block';
    }
}

// Режим редактирования
function enterEditMode(mappingJson) {
    initJsonEditor('tree');
    loadJsonEditorData(mappingJson);
    const templateSelect = document.getElementById('template-select');
    if (templateSelect) {
        templateSelect.style.display = 'none';
    }
}

// Загрузка шаблонов
function loadTemplates() {
    fetch('templates.json')
        .then(res => res.json())
        .then(data => { 
            templates = data;
            populateTemplateSelect();
        })
        .catch(err => {
            console.error('Error loading templates:', err);
        });
}

// Заполнение выпадающего списка шаблонов
function populateTemplateSelect() {
    const select = document.getElementById('template-select');
    if (!select) return;
    
    // Очистим существующие опции (кроме первой)
    select.innerHTML = '<option value="">Choose template</option>';
    
    // Добавим шаблоны
    Object.keys(templates).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = templates[key].name || key;
        select.appendChild(option);
    });
}

// Загрузка шаблона
function loadTemplate(name) {
    if (templates[name]) {
        loadJsonEditorData(templates[name]);
    }
}

// Скачать JSON
function downloadJson() {
    try {
        const data = getJsonEditorData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mapping.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('JSON Error: ' + e.message);
    }
}

// Копировать JSON
function copyJson() {
    try {
        const data = getJsonEditorData();
        const json = JSON.stringify(data, null, 2);
        navigator.clipboard.writeText(json).then(() => {
            // Покажем уведомление об успешном копировании
            const notification = document.createElement('div');
            notification.textContent = 'Copied to clipboard!';
            notification.style.position = 'fixed';
            notification.style.bottom = '20px';
            notification.style.right = '20px';
            notification.style.backgroundColor = '#4CAF50';
            notification.style.color = 'white';
            notification.style.padding = '10px 20px';
            notification.style.borderRadius = '4px';
            notification.style.zIndex = '10000';
            document.body.appendChild(notification);
            
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy to clipboard');
        });
    } catch (e) {
        alert('JSON Error: ' + e.message);
    }
}

// Format JSON Editor
function formatJsonEditor() {
    try {
        const data = getJsonEditorData();
        loadJsonEditorData(JSON.parse(JSON.stringify(data, null, 2)));
    } catch (e) {
        alert('JSON Error: ' + e.message);
    }
}

// Minify JSON Editor
function minifyJsonEditor() {
    try {
        const data = getJsonEditorData();
        loadJsonEditorData(JSON.parse(JSON.stringify(data)));
    } catch (e) {
        alert('JSON Error: ' + e.message);
    }
}

// JMESPath фильтрация
function applyJmesFilter(query) {
    const resultDiv = document.getElementById('jmes-result');
    if (!resultDiv) return;
    
    if (!query) {
        resultDiv.style.display = 'none';
        return;
    }
    
    try {
        const data = getJsonEditorData();
        const result = jmespath.search(data, query);
        
        resultDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">JMESPath Result:</div>
            <pre style="background: var(--bg-secondary); padding: 10px; border-radius: 4px; max-height: 200px; overflow-y: auto;">${JSON.stringify(result, null, 2)}</pre>
        `;
        resultDiv.style.display = 'block';
        resultDiv.className = 'json-validation success';
    } catch (err) {
        resultDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">JMESPath Error:</div>
            <div>${err.message}</div>
        `;
        resultDiv.style.display = 'block';
        resultDiv.className = 'json-validation error';
    }
}

// Показ результата валидации
function showJsonValidationResult(message, type = 'info') {
    const resultDiv = document.getElementById('jmes-result');
    if (!resultDiv) return;
    
    resultDiv.innerHTML = message;
    resultDiv.className = `json-validation ${type}`;
    resultDiv.style.display = 'block';
    
    // Скроем сообщение через 5 секунд
    setTimeout(() => {
        resultDiv.style.display = 'none';
    }, 5000);
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Загрузим шаблоны при инициализации
    loadTemplates();
});

// Экспортируем функции в глобальную область видимости для использования в HTML
window.initJsonEditor = initJsonEditor;
window.enterCreateMode = enterCreateMode;
window.enterEditMode = enterEditMode;
window.loadJsonEditorData = loadJsonEditorData;
window.getJsonEditorData = getJsonEditorData;
window.downloadJson = downloadJson;
window.copyJson = copyJson;
window.formatJsonEditor = formatJsonEditor;
window.minifyJsonEditor = minifyJsonEditor;
window.loadTemplate = loadTemplate;
window.applyJmesFilter = applyJmesFilter;

console.log('✅ JSON Editor functions loaded');
