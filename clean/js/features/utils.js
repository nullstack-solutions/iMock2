'use strict';

const Utils = {
    escapeHtml: (unsafe) => typeof unsafe !== 'string' ? String(unsafe) : 
        unsafe.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]),

    normalizeScenarioName: (value, replacement = '_') => {
        if (value == null) {
            return { original: value, normalized: value, changed: false, cleared: false, hadWhitespace: false };
        }

        const original = typeof value === 'string' ? value : String(value);
        const hadWhitespace = /\s/.test(original);
        const normalized = original.trim().replace(/\s+/g, replacement);
        const cleared = Boolean(original) && !normalized;
        const changed = normalized !== original;

        return { original, normalized, changed, cleared, hadWhitespace };
    },
     
    formatJson: (obj, fallback = 'Invalid JSON', maxLength = 1000) => {
        try { 
            const jsonString = JSON.stringify(obj, null, 2);
            if (jsonString.length > maxLength) {
                return jsonString.substring(0, maxLength) + '\n... (truncated - ' + (jsonString.length - maxLength) + ' more characters)';
            }
            return jsonString;
        } 
        catch { return fallback; }
    },
    
    parseRequestTime: (date) => {
        if (!date) return new Date().toLocaleString('en-US');
        try {
            const d = new Date(typeof date === 'number' ? (date > 1e12 ? date : date * 1000) : date);
            return isNaN(d.getTime()) ? `Invalid: ${date}` : d.toLocaleString('en-US');
        } catch { return `Invalid: ${date}`; }
    },
    
    getStatusClass: (status) => {
        const code = parseInt(status) || 0;
        if (code >= 200 && code < 300) return 'success';
        if (code >= 300 && code < 400) return 'redirect';
        if (code >= 400 && code < 500) return 'client-error';
        if (code >= 500) return 'server-error';
        return 'unknown';
    },

    // Format dates for datetime-local input (YYYY-MM-DDTHH:MM)
    formatDateTime: (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    },

    // Check if value is a function
    isFunction: (fn) => typeof fn === 'function',

    // Safely call function if it exists
    safeCall: (fn, ...args) => {
        if (typeof fn === 'function') {
            return fn(...args);
        }
        return undefined;
    },

    // Universal show/hide element helper
    toggleElement: (element, show) => {
        if (!element) return;
        if (show) {
            element.classList.remove('hidden');
        } else {
            element.classList.add('hidden');
        }
    },

    // Show element
    showElement: (element) => {
        if (element) element.classList.remove('hidden');
    },

    // Hide element
    hideElement: (element) => {
        if (element) element.classList.add('hidden');
    }
};

// Backward compatibility: escapeHtml is used directly in scenarios.js
const escapeHtml = Utils.escapeHtml;

window.Utils = Utils;
window.escapeHtml = escapeHtml;
