'use strict';

function convertJSONToYAML(value, indentLevel = 0) {
    const indent = '  '.repeat(indentLevel);

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return `${indent}[]`;
        }

        return value.map((item) => {
            if (isPlainObject(item) || Array.isArray(item)) {
                const nested = convertJSONToYAML(item, indentLevel + 1).split('\n');
                const firstLine = nested.shift() || '';
                let line = `${indent}- ${firstLine.trimStart()}`;
                if (nested.length > 0) {
                    line += `\n${nested.join('\n')}`;
                }
                return line;
            }

            return `${indent}- ${formatYAMLScalar(item)}`;
        }).join('\n');
    }

    if (isPlainObject(value)) {
        const entries = Object.keys(value);
        if (entries.length === 0) {
            return `${indent}{}`;
        }

        return entries.map((key) => {
            const formattedKey = formatYAMLKey(key);
            const item = value[key];

            if (isPlainObject(item) || Array.isArray(item)) {
                const nested = convertJSONToYAML(item, indentLevel + 1);
                return `${indent}${formattedKey}:\n${nested}`;
            }

            return `${indent}${formattedKey}: ${formatYAMLScalar(item)}`;
        }).join('\n');
    }

    return `${indent}${formatYAMLScalar(value)}`;
}

function formatYAMLScalar(value) {
    if (value === null || value === undefined) {
        return 'null';
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }

    if (typeof value === 'string') {
        if (value === '') {
            return '""';
        }

        const simplePattern = /^[A-Za-z0-9_\-]+$/;
        const reservedWords = /^(?:true|false|null|yes|no|on|off|~)$/i;
        if (simplePattern.test(value) && !reservedWords.test(value)) {
            return value;
        }

        if (!/[\n\r]/.test(value) && !/^\s|\s$/.test(value) && !/[#:>{}\[\],&*?]|!/.test(value)) {
            return value;
        }

        return JSON.stringify(value);
    }

    return JSON.stringify(value);
}

function formatYAMLKey(key) {
    if (typeof key === 'string' && /^[A-Za-z0-9_\-]+$/.test(key)) {
        return key;
    }

    return JSON.stringify(key);
}

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function convertPathArrayToJSONPath(pathArray) {
    if (!Array.isArray(pathArray) || pathArray.length === 0) {
        return '$';
    }

    let result = '$';

    for (let i = 1; i < pathArray.length; i++) {
        const part = pathArray[i];
        if (typeof part === 'number') {
            result += `[${part}]`;
        } else if (typeof part === 'string') {
            if (isSimpleJsonPathSegment(part)) {
                result += `.${part}`;
            } else {
                const escaped = part.replace(/'/g, "\\'");
                result += `['${escaped}']`;
            }
        } else if (part !== undefined && part !== null) {
            result += `[${String(part)}]`;
        }
    }

    return result;
}

function convertPathArrayToPointer(pathArray) {
    if (!Array.isArray(pathArray) || pathArray.length === 0) {
        return '$';
    }

    let pointer = '$';

    for (let i = 1; i < pathArray.length; i++) {
        const part = pathArray[i];
        pointer = appendPointerSegment(pointer, part);
    }

    return pointer;
}

function appendPointerSegment(base, segment) {
    if (typeof segment === 'number') {
        return `${base}/${segment}`;
    }

    return `${base}/${escapeJsonPointerSegment(segment)}`;
}

function escapeJsonPointerSegment(segment) {
    return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function isSimpleJsonPathSegment(segment) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(segment);
}

function buildJSONPointerLocator(text) {
    if (typeof text !== 'string' || text.length === 0) {
        return null;
    }

    try {
        const pointerMap = new Map();
        const length = text.length;
        const lineOffsets = [0];

        for (let i = 0; i < length; i++) {
            if (text[i] === '\n') {
                lineOffsets.push(i + 1);
            }
        }

        let index = 0;

        const offsetToPosition = (offset) => {
            if (offset < 0) offset = 0;
            if (offset > length) offset = length;

            let low = 0;
            let high = lineOffsets.length - 1;

            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                const lineStart = lineOffsets[mid];
                const nextLineStart = mid + 1 < lineOffsets.length ? lineOffsets[mid + 1] : length + 1;

                if (offset < lineStart) {
                    high = mid - 1;
                } else if (offset >= nextLineStart) {
                    low = mid + 1;
                } else {
                    return {
                        lineNumber: mid + 1,
                        column: offset - lineStart + 1
                    };
                }
            }

            const lastLineIndex = lineOffsets.length - 1;
            const lineStart = lineOffsets[lastLineIndex] || 0;
            return {
                lineNumber: lastLineIndex + 1,
                column: offset - lineStart + 1
            };
        };

        const skipWhitespace = () => {
            while (index < length) {
                const char = text[index];
                if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
                    index++;
                } else {
                    break;
                }
            }
        };

        const recordPointer = (pointer, start, end) => {
            if (pointer && start <= end) {
                pointerMap.set(pointer, { start, end });
            }
        };

        const parseValue = (pointer) => {
            skipWhitespace();
            if (index >= length) {
                throw new Error('Unexpected end of JSON input');
            }

            const char = text[index];

            if (char === '{') {
                parseObject(pointer);
                return;
            }

            if (char === '[') {
                parseArray(pointer);
                return;
            }

            if (char === '"') {
                const { start, end } = parseStringLiteral();
                recordPointer(pointer, start, end);
                return;
            }

            if (char === '-' || isDigit(char)) {
                const { start, end } = parseNumberLiteral();
                recordPointer(pointer, start, end);
                return;
            }

            if (text.startsWith('true', index)) {
                const { start, end } = parseLiteral('true');
                recordPointer(pointer, start, end);
                return;
            }

            if (text.startsWith('false', index)) {
                const { start, end } = parseLiteral('false');
                recordPointer(pointer, start, end);
                return;
            }

            if (text.startsWith('null', index)) {
                const { start, end } = parseLiteral('null');
                recordPointer(pointer, start, end);
                return;
            }

            throw new Error(`Unexpected token ${char} at position ${index}`);
        };

        const parseObject = (pointer) => {
            const start = index;
            index++; // Skip {
            skipWhitespace();

            if (index < length && text[index] === '}') {
                index++;
                recordPointer(pointer, start, index);
                return;
            }

            while (index < length) {
                if (text[index] !== '"') {
                    throw new Error('Expected string for object key');
                }

                const { value: key } = parseStringLiteral();
                skipWhitespace();

                if (text[index] !== ':') {
                    throw new Error('Expected colon after object key');
                }

                index++; // Skip :
                const childPointer = appendPointerSegment(pointer, key);
                parseValue(childPointer);
                skipWhitespace();

                const delimiter = text[index];
                if (delimiter === ',') {
                    index++;
                    skipWhitespace();
                    continue;
                }

                if (delimiter === '}') {
                    index++;
                    recordPointer(pointer, start, index);
                    return;
                }

                throw new Error('Expected comma or closing brace in object');
            }

            throw new Error('Unterminated object literal');
        };

        const parseArray = (pointer) => {
            const start = index;
            index++; // Skip [
            skipWhitespace();

            if (index < length && text[index] === ']') {
                index++;
                recordPointer(pointer, start, index);
                return;
            }

            let arrayIndex = 0;
            while (index < length) {
                const childPointer = appendPointerSegment(pointer, arrayIndex);
                parseValue(childPointer);
                arrayIndex++;
                skipWhitespace();

                const delimiter = text[index];
                if (delimiter === ',') {
                    index++;
                    skipWhitespace();
                    continue;
                }

                if (delimiter === ']') {
                    index++;
                    recordPointer(pointer, start, index);
                    return;
                }

                throw new Error('Expected comma or closing bracket in array');
            }

            throw new Error('Unterminated array literal');
        };

        const parseStringLiteral = () => {
            const start = index;
            index++; // Skip opening quote
            let value = '';

            while (index < length) {
                const char = text[index];

                if (char === '"') {
                    index++;
                    return { value, start, end: index };
                }

                if (char === '\\') {
                    index++;
                    if (index >= length) {
                        throw new Error('Unterminated string literal');
                    }

                    const escapeChar = text[index];
                    switch (escapeChar) {
                        case '"':
                        case '\\':
                        case '/':
                            value += escapeChar;
                            break;
                        case 'b':
                            value += '\b';
                            break;
                        case 'f':
                            value += '\f';
                            break;
                        case 'n':
                            value += '\n';
                            break;
                        case 'r':
                            value += '\r';
                            break;
                        case 't':
                            value += '\t';
                            break;
                        case 'u':
                            const hex = text.slice(index + 1, index + 5);
                            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                                throw new Error('Invalid Unicode escape sequence');
                            }
                            value += String.fromCharCode(parseInt(hex, 16));
                            index += 4;
                            break;
                        default:
                            value += escapeChar;
                            break;
                    }
                } else {
                    value += char;
                }

                index++;
            }

            throw new Error('Unterminated string literal');
        };

        const parseNumberLiteral = () => {
            const start = index;

            if (text[index] === '-') {
                index++;
            }

            if (text[index] === '0') {
                index++;
            } else {
                if (!isDigit(text[index])) {
                    throw new Error('Invalid number literal');
                }
                while (index < length && isDigit(text[index])) {
                    index++;
                }
            }

            if (text[index] === '.') {
                index++;
                if (!isDigit(text[index])) {
                    throw new Error('Invalid number literal');
                }
                while (index < length && isDigit(text[index])) {
                    index++;
                }
            }

            if (text[index] === 'e' || text[index] === 'E') {
                index++;
                if (text[index] === '+' || text[index] === '-') {
                    index++;
                }
                if (!isDigit(text[index])) {
                    throw new Error('Invalid number literal');
                }
                while (index < length && isDigit(text[index])) {
                    index++;
                }
            }

            return { start, end: index };
        };

        const parseLiteral = (literal) => {
            const start = index;
            if (text.slice(index, index + literal.length) !== literal) {
                throw new Error(`Expected literal ${literal}`);
            }
            index += literal.length;
            return { start, end: index };
        };

        const isDigit = (char) => char >= '0' && char <= '9';

        parseValue('$');
        skipWhitespace();

        return {
            getRange(pointer) {
                if (!pointerMap.has(pointer)) {
                    return null;
                }

                const location = pointerMap.get(pointer);
                const start = offsetToPosition(location.start);
                const end = offsetToPosition(location.end);
                return {
                    startLineNumber: start.lineNumber,
                    startColumn: start.column,
                    endLineNumber: end.lineNumber,
                    endColumn: end.column
                };
            }
        };
    } catch (error) {
        console.warn('Failed to build JSON pointer locator:', error);
        return null;
    }
}

// Global initializer instance
