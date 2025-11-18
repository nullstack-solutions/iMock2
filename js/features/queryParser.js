/**
 * Query Parser для фильтрации mappings
 * Простой парсер Gmail-like синтаксиса без внешних зависимостей
 *
 * Примеры запросов:
 * - method:GET,POST          → OR между методами
 * - url:api status:200       → AND между разными полями
 * - method:GET url:/users    → комбинация условий
 * - -status:404              → исключение
 * - priority:1-5             → диапазон приоритетов
 */

'use strict';

const KEYWORDS = ['method', 'url', 'status', 'name', 'scenario'];
const RANGE_KEYWORDS = ['priority'];

/**
 * Парсит query строку в структурированный объект
 * @param {string} query - строка запроса (например: "method:GET,POST url:api")
 * @returns {Object} - распарсенный объект или null при ошибке
 */
function parseQuery(query) {
    if (!query || typeof query !== 'string') {
        return null;
    }

    const trimmed = query.trim();
    if (!trimmed) {
        return null;
    }

    try {
        const result = {};
        let remaining = trimmed;

        // Регулярное выражение для поиска key:value пар
        // Поддерживает: key:value, key:value1,value2, -key:value
        const keyValuePattern = /(-?)(\w+):([\w\/\*\.\-,]+|"[^"]*")/g;
        let match;
        const processedIndices = [];

        while ((match = keyValuePattern.exec(trimmed)) !== null) {
            const isExclude = match[1] === '-';
            const key = match[2];
            let value = match[3];

            // Убираем кавычки если есть
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }

            // Проверяем что это известный keyword
            if (!KEYWORDS.includes(key) && !RANGE_KEYWORDS.includes(key)) {
                continue;
            }

            processedIndices.push({ start: match.index, end: match.index + match[0].length });

            // Обработка диапазонов (например: priority:1-5)
            if (RANGE_KEYWORDS.includes(key)) {
                const rangeParts = value.split('-');
                if (rangeParts.length === 2) {
                    result[key] = {
                        from: rangeParts[0],
                        to: rangeParts[1]
                    };
                } else {
                    result[key] = {
                        from: value,
                        to: value
                    };
                }
                continue;
            }

            // Обработка исключений
            if (isExclude) {
                const values = value.split(',');
                result[key] = {
                    exclude: values.length > 1 ? values : values[0]
                };
                continue;
            }

            // Обработка обычных значений (с поддержкой запятых для OR)
            const values = value.split(',');
            result[key] = values.length > 1 ? values : values[0];
        }

        // Собираем оставшийся текст (свободный поиск)
        if (processedIndices.length > 0) {
            let textParts = [];
            let lastEnd = 0;

            processedIndices.sort((a, b) => a.start - b.start);

            for (const idx of processedIndices) {
                if (idx.start > lastEnd) {
                    const part = trimmed.slice(lastEnd, idx.start).trim();
                    if (part) textParts.push(part);
                }
                lastEnd = idx.end;
            }

            if (lastEnd < trimmed.length) {
                const part = trimmed.slice(lastEnd).trim();
                if (part) textParts.push(part);
            }

            const freeText = textParts.join(' ').trim();
            if (freeText) {
                result.text = freeText;
            }
        } else {
            // Если нет key:value пар, весь текст это свободный поиск
            result.text = trimmed;
        }

        return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
        console.error('Query parse error:', error);
        return null;
    }
}

/**
 * Проверяет соответствие значения условию
 * @param {*} value - значение для проверки
 * @param {*} condition - условие (строка, массив строк, или объект с exclude)
 * @returns {boolean}
 */
function matchesCondition(value, condition) {
    if (!value && value !== 0) {
        return false;
    }

    const stringValue = String(value).toLowerCase();

    // Проверка на исключение (exclude)
    if (condition && typeof condition === 'object' && condition.exclude) {
        const excludeValues = Array.isArray(condition.exclude)
            ? condition.exclude
            : [condition.exclude];

        for (const excludeValue of excludeValues) {
            if (stringValue.includes(String(excludeValue).toLowerCase())) {
                return false;
            }
        }
        return true;
    }

    // Обычное совпадение (OR между значениями если массив)
    const conditions = Array.isArray(condition) ? condition : [condition];

    for (const cond of conditions) {
        const condStr = String(cond).toLowerCase();
        if (stringValue.includes(condStr)) {
            return true;
        }
    }

    return false;
}

/**
 * Проверяет соответствие значения диапазону
 * @param {number} value - значение для проверки
 * @param {Object} range - объект с from и to
 * @returns {boolean}
 */
function matchesRange(value, range) {
    const numValue = Number(value);
    if (isNaN(numValue)) {
        return false;
    }

    const from = range.from !== undefined ? Number(range.from) : -Infinity;
    const to = range.to !== undefined ? Number(range.to) : Infinity;

    return numValue >= from && numValue <= to;
}

/**
 * Фильтрует массив mappings по распарсенному query
 * @param {Array} mappings - массив mappings для фильтрации
 * @param {Object} parsedQuery - результат parseQuery()
 * @returns {Array} - отфильтрованный массив
 */
function filterMappings(mappings, parsedQuery) {
    if (!Array.isArray(mappings)) {
        return [];
    }

    if (!parsedQuery || typeof parsedQuery !== 'object') {
        return mappings;
    }

    return mappings.filter(mapping => {
        if (!mapping) {
            return false;
        }

        // Проверка method
        if (parsedQuery.method) {
            const requestMethod = mapping.request?.method || '';
            if (!matchesCondition(requestMethod, parsedQuery.method)) {
                return false;
            }
        }

        // Проверка url (ищем в url, urlPattern, urlPath)
        if (parsedQuery.url) {
            const mappingUrl = mapping.request?.url ||
                             mapping.request?.urlPattern ||
                             mapping.request?.urlPath || '';
            if (!matchesCondition(mappingUrl, parsedQuery.url)) {
                return false;
            }
        }

        // Проверка status
        if (parsedQuery.status) {
            const responseStatus = mapping.response?.status ?? '';
            if (!matchesCondition(responseStatus, parsedQuery.status)) {
                return false;
            }
        }

        // Проверка name
        if (parsedQuery.name) {
            const mappingName = mapping.name || '';
            if (!matchesCondition(mappingName, parsedQuery.name)) {
                return false;
            }
        }

        // Проверка scenario
        if (parsedQuery.scenario) {
            const scenarioName = mapping.scenarioName || '';
            if (!matchesCondition(scenarioName, parsedQuery.scenario)) {
                return false;
            }
        }

        // Проверка priority (диапазон)
        if (parsedQuery.priority) {
            const mappingPriority = mapping.priority ?? 1;
            if (!matchesRange(mappingPriority, parsedQuery.priority)) {
                return false;
            }
        }

        // Проверка текстового поиска (если есть text без ключа)
        if (parsedQuery.text) {
            const searchText = String(parsedQuery.text).toLowerCase();
            const mappingUrl = (mapping.request?.url ||
                              mapping.request?.urlPattern ||
                              mapping.request?.urlPath || '').toLowerCase();
            const mappingName = (mapping.name || '').toLowerCase();
            const mappingMethod = (mapping.request?.method || '').toLowerCase();

            if (!mappingUrl.includes(searchText) &&
                !mappingName.includes(searchText) &&
                !mappingMethod.includes(searchText)) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Главная функция фильтрации - парсит query и фильтрует mappings
 * @param {Array} mappings - массив mappings
 * @param {string} queryString - строка запроса
 * @returns {Array} - отфильтрованный массив
 */
function filterMappingsByQuery(mappings, queryString) {
    const parsed = parseQuery(queryString);
    return filterMappings(mappings, parsed);
}

// Экспорт для использования в браузере
window.QueryParser = {
    parseQuery,
    filterMappings,
    filterMappingsByQuery,
    matchesCondition,
    matchesRange
};

console.log('✅ Query Parser loaded');
