'use strict';

(function(global) {
    const KEYWORDS = ['method', 'url', 'status', 'name', 'scenario', 'matched', 'client'];
    const RANGE_KEYWORDS = ['priority'];

    /**
     * Checks if value matches condition
     */
    function matchesCondition(value, condition) {
        if (value === undefined || value === null) return false;

        const stringValue = String(value).toLowerCase();

        // Check for exclusion
        if (condition && typeof condition === 'object' && condition.exclude) {
            const excludeValues = Array.isArray(condition.exclude) ? condition.exclude : [condition.exclude];
            return !excludeValues.some(ex => stringValue.includes(String(ex).toLowerCase()));
        }

        // Regular match (OR)
        const conditions = Array.isArray(condition) ? condition : [condition];
        return conditions.some(cond => stringValue.includes(String(cond).toLowerCase()));
    }

    /**
     * Checks if value matches range
     */
    function matchesRange(value, range) {
        const numValue = Number(value);
        if (isNaN(numValue)) return false;

        const from = range.from !== undefined ? Number(range.from) : -Infinity;
        const to = range.to !== undefined ? Number(range.to) : Infinity;

        return numValue >= from && numValue <= to;
    }

    /**
     * Parses query string into structured object
     */
    function parseQuery(query) {
        if (!query || typeof query !== 'string') return null;
        
        const trimmed = query.trim();
        if (!trimmed) return null;

        try {
            const result = {};
            const keyValuePattern = /(-?)(\w+):([\w\/\*.,\-]+|"[^"]*")/g;
            let match;
            const processedIndices = [];

            while ((match = keyValuePattern.exec(trimmed)) !== null) {
                const [fullMatch, isExclude, key, rawValue] = match;
                let value = rawValue;

                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }

                if (!KEYWORDS.includes(key) && !RANGE_KEYWORDS.includes(key)) continue;

                processedIndices.push({ start: match.index, end: match.index + fullMatch.length });

                // Handle ranges
                if (RANGE_KEYWORDS.includes(key)) {
                    const rangeMatch = value.match(/^(\d+)-(\d+)$/);
                    if (rangeMatch) {
                        result[key] = { from: rangeMatch[1], to: rangeMatch[2] };
                    } else if (/^\d+$/.test(value)) {
                        result[key] = { from: value, to: value };
                    }
                    continue;
                }

                // Handle exclusions/values
                const values = value.split(',');
                const normalizedValue = values.length > 1 ? values : values[0];
                
                if (isExclude) {
                    result[key] = { exclude: normalizedValue };
                } else {
                    result[key] = normalizedValue;
                }
            }

            // Extract free text
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
                if (textParts.length) result.text = textParts.join(' ');
            } else {
                result.text = trimmed;
            }

            return Object.keys(result).length > 0 ? result : null;
        } catch (error) {
            console.error('Query parse error:', error);
            return null;
        }
    }

    /**
     * Filters mappings
     */
    function filterMappings(mappings, parsedQuery) {
        if (!Array.isArray(mappings)) return [];
        if (!parsedQuery || typeof parsedQuery !== 'object') return mappings;

        return mappings.filter(mapping => {
            if (!mapping) return false;

            const mReq = mapping.request || {};
            const mRes = mapping.response || {};

            if (parsedQuery.method && !matchesCondition(mReq.method, parsedQuery.method)) return false;
            
            if (parsedQuery.url) {
                const url = mReq.url || mReq.urlPattern || mReq.urlPath || '';
                if (!matchesCondition(url, parsedQuery.url)) return false;
            }

            if (parsedQuery.status && !matchesCondition(mRes.status, parsedQuery.status)) return false;
            if (parsedQuery.name && !matchesCondition(mapping.name, parsedQuery.name)) return false;
            if (parsedQuery.scenario && !matchesCondition(mapping.scenarioName, parsedQuery.scenario)) return false;

            if (parsedQuery.priority) {
                const priority = mapping.priority ?? 1;
                if (!matchesRange(priority, parsedQuery.priority)) return false;
            }

            if (parsedQuery.text) {
                const searchText = String(parsedQuery.text).toLowerCase();
                const url = (mReq.url || mReq.urlPattern || mReq.urlPath || '').toLowerCase();
                const name = (mapping.name || '').toLowerCase();
                const method = (mReq.method || '').toLowerCase();
                
                if (!url.includes(searchText) && !name.includes(searchText) && !method.includes(searchText)) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Filters requests
     */
    function filterRequests(requests, parsedQuery) {
        if (!Array.isArray(requests)) return [];
        if (!parsedQuery || typeof parsedQuery !== 'object') return requests;

        return requests.filter(request => {
            if (!request) return false;

            const rReq = request.request || {};
            const rRes = request.response || request.responseDefinition || {};

            if (parsedQuery.method && !matchesCondition(rReq.method, parsedQuery.method)) return false;
            
            if (parsedQuery.url) {
                const url = rReq.url || rReq.urlPath || '';
                if (!matchesCondition(url, parsedQuery.url)) return false;
            }

            if (parsedQuery.status && !matchesCondition(rRes.status, parsedQuery.status)) return false;

            if (parsedQuery.matched !== undefined) {
                const isMatched = request.wasMatched !== false;
                const matchValues = Array.isArray(parsedQuery.matched) ? parsedQuery.matched : [parsedQuery.matched];
                const hasMatch = matchValues.some(val => {
                    const s = String(val).toLowerCase();
                    return ((s === 'true' || s === 'yes' || s === '1') && isMatched) ||
                           ((s === 'false' || s === 'no' || s === '0') && !isMatched);
                });
                if (!hasMatch) return false;
            }

            if (parsedQuery.client && !matchesCondition(rReq.clientIp, parsedQuery.client)) return false;

            if (parsedQuery.text) {
                const searchText = String(parsedQuery.text).toLowerCase();
                const url = (rReq.url || rReq.urlPath || '').toLowerCase();
                const method = (rReq.method || '').toLowerCase();
                const ip = (rReq.clientIp || '').toLowerCase();

                if (!url.includes(searchText) && !method.includes(searchText) && !ip.includes(searchText)) {
                    return false;
                }
            }

            return true;
        });
    }

    // Export API
    global.QueryParser = {
        parseQuery,
        filterMappings,
        filterMappingsByQuery: (mappings, query) => filterMappings(mappings, parseQuery(query)),
        filterRequests,
        filterRequestsByQuery: (requests, query) => filterRequests(requests, parseQuery(query)),
        matchesCondition,
        matchesRange
    };

})(typeof window !== 'undefined' ? window : globalThis);