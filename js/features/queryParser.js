/**
 * Query Parser for filtering mappings
 * Simple Gmail-like syntax parser without external dependencies
 *
 * Example queries:
 * - method:GET,POST          → OR between methods
 * - url:api status:200       → AND between different fields
 * - method:GET url:/users    → combination of conditions
 * - -status:404              → exclusion
 * - priority:1-5             → priority range
 */

'use strict';

const KEYWORDS = ['method', 'url', 'status', 'name', 'scenario'];
const RANGE_KEYWORDS = ['priority'];

/**
 * Parses query string into structured object
 * @param {string} query - Query string (e.g., "method:GET,POST url:api")
 * @returns {Object|null} - Parsed object or null on error
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

        // Regular expression to find key:value pairs
        // Supports: key:value, key:value1,value2, -key:value
        const keyValuePattern = /(-?)(\w+):([\w\/\*.,\-]+|"[^"]*")/g;
        let match;
        const processedIndices = [];

        while ((match = keyValuePattern.exec(trimmed)) !== null) {
            const isExclude = match[1] === '-';
            const key = match[2];
            let value = match[3];

            // Remove quotes if present
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }

            // Check that this is a known keyword
            if (!KEYWORDS.includes(key) && !RANGE_KEYWORDS.includes(key)) {
                continue;
            }

            processedIndices.push({ start: match.index, end: match.index + match[0].length });

            // Handle ranges (e.g., priority:1-5)
            if (RANGE_KEYWORDS.includes(key)) {
                // Only treat as range if value matches two numbers separated by a single hyphen
                const rangeMatch = value.match(/^(\d+)-(\d+)$/);
                if (rangeMatch) {
                    result[key] = {
                        from: rangeMatch[1],
                        to: rangeMatch[2]
                    };
                } else if (/^\d+$/.test(value)) {
                    // Single numeric value
                    result[key] = {
                        from: value,
                        to: value
                    };
                }
                // Skip invalid range values (non-numeric)
                continue;
            }

            // Handle exclusions
            if (isExclude) {
                const values = value.split(',');
                result[key] = {
                    exclude: values.length > 1 ? values : values[0]
                };
                continue;
            }

            // Handle regular values (with comma support for OR)
            const values = value.split(',');
            result[key] = values.length > 1 ? values : values[0];
        }

        // Collect remaining text (free search)
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
            // If there are no key:value pairs, all text is free search
            result.text = trimmed;
        }

        return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
        console.error('Query parse error:', error);
        return null;
    }
}

/**
 * Checks if value matches condition
 * @param {*} value - Value to check
 * @param {*} condition - Condition (string, array of strings, or object with exclude)
 * @returns {boolean}
 */
function matchesCondition(value, condition) {
    if (!value && value !== 0) {
        return false;
    }

    const stringValue = String(value).toLowerCase();

    // Check for exclusion
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

    // Regular match (OR between values if array)
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
 * Checks if value matches range
 * @param {number} value - Value to check
 * @param {Object} range - Object with from and to properties
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
 * Filters array of mappings by parsed query
 *
 * Note: When filtering by priority range, mappings without a priority property
 * will be treated as having a default priority of 1.
 *
 * @param {Array} mappings - Array of mappings to filter
 * @param {Object} parsedQuery - Result of parseQuery()
 * @returns {Array} - Filtered array
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

        // Check method
        if (parsedQuery.method) {
            const requestMethod = mapping.request?.method || '';
            if (!matchesCondition(requestMethod, parsedQuery.method)) {
                return false;
            }
        }

        // Check url (search in url, urlPattern, urlPath)
        if (parsedQuery.url) {
            const mappingUrl = mapping.request?.url ||
                             mapping.request?.urlPattern ||
                             mapping.request?.urlPath || '';
            if (!matchesCondition(mappingUrl, parsedQuery.url)) {
                return false;
            }
        }

        // Check status
        if (parsedQuery.status) {
            const responseStatus = mapping.response?.status ?? '';
            if (!matchesCondition(responseStatus, parsedQuery.status)) {
                return false;
            }
        }

        // Check name
        if (parsedQuery.name) {
            const mappingName = mapping.name || '';
            if (!matchesCondition(mappingName, parsedQuery.name)) {
                return false;
            }
        }

        // Check scenario
        if (parsedQuery.scenario) {
            const scenarioName = mapping.scenarioName || '';
            if (!matchesCondition(scenarioName, parsedQuery.scenario)) {
                return false;
            }
        }

        // Check priority (range)
        // Note: Default priority is 1 if not specified on the mapping
        if (parsedQuery.priority) {
            const mappingPriority = mapping.priority ?? 1;
            if (!matchesRange(mappingPriority, parsedQuery.priority)) {
                return false;
            }
        }

        // Check text search (if there is text without a key)
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
 * Main filtering function - parses query and filters mappings
 * @param {Array} mappings - Array of mappings
 * @param {string} queryString - Query string
 * @returns {Array} - Filtered array
 */
function filterMappingsByQuery(mappings, queryString) {
    const parsed = parseQuery(queryString);
    return filterMappings(mappings, parsed);
}

// Export for use in browser
window.QueryParser = {
    parseQuery,
    filterMappings,
    filterMappingsByQuery,
    matchesCondition,
    matchesRange
};
