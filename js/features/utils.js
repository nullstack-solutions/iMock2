'use strict';

const Utils = {
    escapeHtml: (unsafe) => typeof unsafe !== 'string' ? String(unsafe) : 
        unsafe.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]),
    
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

// Backward compatibility for existing code
const escapeHtml = Utils.escapeHtml;
const formatJson = Utils.formatJson;
const parseRequestTime = Utils.parseRequestTime;
const getStatusClass = Utils.getStatusClass;

// --- UNIVERSAL UI COMPONENTS (replace ~100 lines of duplication) ---

// Compact request loader (temporary reuse until DataManager exists)
// --- REMOVED: duplicated applyFilters (FilterManager covers it) ---


window.Utils = Utils;
window.escapeHtml = escapeHtml;
window.formatJson = formatJson;
window.parseRequestTime = parseRequestTime;
window.getStatusClass = getStatusClass;
