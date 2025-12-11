'use strict';

/**
 * DOM Helper utilities for common DOM operations
 * @namespace DOM
 */
const DOM = {
    /**
     * Get element with caching support
     * @param {string} selectorId - Element ID or selector
     * @returns {Element|null} DOM element or null if not found
     */
    getElement(selectorId) {
        if (!selectorId) return null;
        
        // Use cache if available
        if (window.elementCache && window.elementCache.has(selectorId)) {
            return window.elementCache.get(selectorId);
        }
        
        // Try ID first for performance
        let element = document.getElementById(selectorId) || document.querySelector(selectorId);
        
        // If not found and selector contains CSS syntax, try querySelector
        if (!element && (selectorId.includes('.') || selectorId.includes('[') || selectorId.includes('>'))) {
            element = document.querySelector(selectorId);
        }
        
        // Cache the element if found
        if (element && window.elementCache) {
            window.elementCache.set(selectorId, element);
        }
        
        return element;
    },

    /**
     * Get element value with fallback
     * @param {string} selectorId - Element ID or selector
     * @param {string} defaultValue - Default value if element not found or has no value
     * @returns {string} Element value or default value
     */
    getValue(selectorId, defaultValue = '') {
        const el = this.getElement(selectorId);
        return el?.value ?? defaultValue;
    },
    
    /**
     * Set element value
     * @param {string} selectorId - Element ID or selector
     * @param {string} value - Value to set
     * @returns {boolean} True if value was set successfully
     */
    setValue(selectorId, value) {
        const el = this.getElement(selectorId);
        if (el) {
            el.value = value;
            // Trigger change event for consistency
            this.dispatchEvent(el, 'change');
            return true;
        }
        return false;
    },
    
    /**
     * Get element text content
     * @param {string} selectorId - Element ID or selector
     * @param {string} defaultValue - Default value if element not found
     * @returns {string} Element text content or default value
     */
    getText(selectorId, defaultValue = '') {
        const el = this.getElement(selectorId);
        return el?.textContent ?? defaultValue;
    },
    
    /**
     * Set element text content
     * @param {string} selectorId - Element ID or selector
     * @param {string} text - Text content to set
     * @returns {boolean} True if text was set successfully
     */
    setText(selectorId, text) {
        const el = this.getElement(selectorId);
        if (el) {
            el.textContent = text;
            return true;
        }
        return false;
    },
    
    /**
     * Show/hide element
     * @param {string} selectorId - Element ID or selector
     * @param {boolean} show - True to show, false to hide
     * @returns {boolean} True if visibility was changed successfully
     */
    toggle(selectorId, show) {
        const el = this.getElement(selectorId);
        if (el) {
            el.style.display = show ? 'block' : 'none';
            return true;
        }
        return false;
    },
    
    /**
     * Add/remove CSS class
     * @param {string} selectorId - Element ID or selector
     * @param {string} className - CSS class name
     * @param {boolean} force - True to always add, false to always remove, undefined to toggle
     * @returns {boolean} True if class was modified successfully
     */
    toggleClass(selectorId, className, force) {
        const el = this.getElement(selectorId);
        if (el && el.classList) {
            el.classList.toggle(className, force);
            return true;
        }
        return false;
    },
    
    /**
     * Add CSS class
     * @param {string} selectorId - Element ID or selector
     * @param {string} className - CSS class name to add
     * @returns {boolean} True if class was added successfully
     */
    addClass(selectorId, className) {
        const el = this.getElement(selectorId);
        if (el && el.classList) {
            el.classList.add(className);
            return true;
        }
        return false;
    },
    
    /**
     * Remove CSS class
     * @param {string} selectorId - Element ID or selector
     * @param {string} className - CSS class name to remove
     * @returns {boolean} True if class was removed successfully
     */
    removeClass(selectorId, className) {
        const el = this.getElement(selectorId);
        if (el && el.classList) {
            el.classList.remove(className);
            return true;
        }
        return false;
    },
    
    /**
     * Check if element has CSS class
     * @param {string} selectorId - Element ID or selector
     * @param {string} className - CSS class name to check
     * @returns {boolean} True if element has the class
     */
    hasClass(selectorId, className) {
        const el = this.getElement(selectorId);
        return el?.classList?.contains(className) || false;
    },
    
    /**
     * Set element attribute
     * @param {string} selectorId - Element ID or selector
     * @param {string} attributeName - Attribute name
     * @param {string} value - Attribute value
     * @returns {boolean} True if attribute was set successfully
     */
    setAttribute(selectorId, attributeName, value) {
        const el = this.getElement(selectorId);
        if (el) {
            el.setAttribute(attributeName, value);
            return true;
        }
        return false;
    },
    
    /**
     * Get element attribute
     * @param {string} selectorId - Element ID or selector
     * @param {string} attributeName - Attribute name
     * @param {string} defaultValue - Default value if attribute not found
     * @returns {string|null} Attribute value or default value
     */
    getAttribute(selectorId, attributeName, defaultValue = null) {
        const el = this.getElement(selectorId);
        return el?.getAttribute(attributeName) ?? defaultValue;
    },
    
    /**
     * Remove element attribute
     * @param {string} selectorId - Element ID or selector
     * @param {string} attributeName - Attribute name to remove
     * @returns {boolean} True if attribute was removed successfully
     */
    removeAttribute(selectorId, attributeName) {
        const el = this.getElement(selectorId);
        if (el) {
            el.removeAttribute(attributeName);
            return true;
        }
        return false;
    },
    
    /**
     * Add event listener with automatic cleanup support
     * @param {string} selectorId - Element ID or selector
     * @param {string} eventType - Event type (e.g., 'click', 'change')
     * @param {Function} handler - Event handler function
     * @param {object} options - Event listener options
     * @returns {boolean} True if listener was added successfully
     */
    addEventListener(selectorId, eventType, handler, options = {}) {
        const el = this.getElement(selectorId);
        if (el) {
            // Use LifecycleManager if available for automatic cleanup
            if (window.LifecycleManager && typeof window.LifecycleManager.addEventListener === 'function') {
                window.LifecycleManager.addEventListener(el, eventType, handler, options);
            } else {
                el.addEventListener(eventType, handler, options);
            }
            return true;
        }
        return false;
    },
    
    /**
     * Remove event listener
     * @param {string} selectorId - Element ID or selector
     * @param {string} eventType - Event type
     * @param {Function} handler - Event handler function
     * @param {object} options - Event listener options
     * @returns {boolean} True if listener was removed successfully
     */
    removeEventListener(selectorId, eventType, handler, options = {}) {
        const el = this.getElement(selectorId);
        if (el) {
            // Use LifecycleManager if available for consistent cleanup
            if (window.LifecycleManager && typeof window.LifecycleManager.removeEventListener === 'function') {
                window.LifecycleManager.removeEventListener(el, eventType, handler, options);
            } else {
                el.removeEventListener(eventType, handler, options);
            }
            return true;
        }
        return false;
    },
    
    /**
     * Create element with common patterns
     * @param {string} tagName - Tag name (e.g., 'div', 'button')
     * @param {object} options - Element options
     * @param {string} options.className - CSS class name(s)
     * @param {string} options.id - Element ID
     * @param {string} options.text - Text content
     * @param {string} options.html - HTML content
     * @param {object} options.attributes - Key-value map of attributes
     * @param {object} options.styles - Key-value map of styles
     * @param {string[]} options.dataAttrs - Key-value map of data attributes
     * @returns {Element} Created DOM element
     */
    createElement(tagName, options = {}) {
        const element = document.createElement(tagName);
        
        if (options.className) {
            element.className = options.className;
        }
        
        if (options.id) {
            element.id = options.id;
        }
        
        if (options.text) {
            element.textContent = options.text;
        }
        
        if (options.html) {
            element.innerHTML = options.html;
        }
        
        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }
        
        if (options.dataAttrs) {
            Object.entries(options.dataAttrs).forEach(([key, value]) => {
                element.setAttribute(`data-${key}`, value);
            });
        }
        
        if (options.styles) {
            Object.entries(options.styles).forEach(([key, value]) => {
                element.style[key] = value;
            });
        }
        
        return element;
    },
    
    /**
     * Find parent element matching selector
     * @param {string|Element} startElement - Starting element or selector
     * @param {string} parentSelector - Parent selector to match
     * @param {number} maxDepth - Maximum depth to search (default: 10)
     * @returns {Element|null} Matching parent element or null
     */
    findParent(startElement, parentSelector, maxDepth = 10) {
        let element = typeof startElement === 'string' ? this.getElement(startElement) : startElement;
        
        if (!element) return null;
        
        let depth = 0;
        while (element && depth < maxDepth) {
            if (element.matches && element.matches(parentSelector)) {
                return element;
            }
            element = element.parentElement;
            depth++;
        }
        
        return null;
    },
    
    /**
     * Find child element matching selector
     * @param {string|Element} parentElement - Parent element or selector
     * @param {string} childSelector - Child selector to match
     * @returns {Element|null} Matching child element or null
     */
    findChild(parentElement, childSelector) {
        const parent = typeof parentElement === 'string' ? this.getElement(parentElement) : parentElement;
        return parent?.querySelector(childSelector) || null;
    },
    
    /**
     * Find all child elements matching selector
     * @param {string|Element} parentElement - Parent element or selector
     * @param {string} childSelector - Child selector to match
     * @returns {NodeList} Matching child elements
     */
    findChildren(parentElement, childSelector) {
        const parent = typeof parentElement === 'string' ? this.getElement(parentElement) : parentElement;
        return parent?.querySelectorAll(childSelector) || [];
    },
    
    /**
     * Dispatch custom event on element
     * @param {string|Element} targetElement - Target element or selector
     * @param {string} eventType - Event type
     * @param {object} detail - Event detail data
     * @param {object} options - Event options
     * @returns {boolean} True if event was dispatched successfully
     */
    dispatchEvent(targetElement, eventType, detail = null, options = {}) {
        const element = typeof targetElement === 'string' ? this.getElement(targetElement) : targetElement;
        if (!element) return false;
        
        const event = new CustomEvent(eventType, {
            detail,
            bubbles: true,
            cancelable: true,
            ...options
        });
        
        element.dispatchEvent(event);
        return true;
    },
    
    /**
     * Check if element exists in DOM
     * @param {string} selectorId - Element ID or selector
     * @returns {boolean} True if element exists
     */
    exists(selectorId) {
        return this.getElement(selectorId) !== null;
    },
    
    /**
     * Focus element
     * @param {string} selectorId - Element ID or selector
     * @returns {boolean} True if element was focused successfully
     */
    focus(selectorId) {
        const el = this.getElement(selectorId);
        if (el && typeof el.focus === 'function') {
            el.focus();
            return true;
        }
        return false;
    },
    
    /**
     * Enable/disable element
     * @param {string} selectorId - Element ID or selector
     * @param {boolean} enabled - True to enable, false to disable
     * @returns {boolean} True if element state was changed successfully
     */
    setEnabled(selectorId, enabled) {
        const el = this.getElement(selectorId);
        if (el) {
            el.disabled = !enabled;
            return true;
        }
        return false;
    },
    
    /**
     * Check if element is enabled
     * @param {string} selectorId - Element ID or selector
     * @returns {boolean} True if element is enabled
     */
    isEnabled(selectorId) {
        const el = this.getElement(selectorId);
        return el ? !el.disabled : false;
    },
    
    /**
     * Clear element value (for form inputs)
     * @param {string} selectorId - Element ID or selector
     * @returns {boolean} True if value was cleared successfully
     */
    clearValue(selectorId) {
        return this.setValue(selectorId, '');
    },
    
    /**
     * Get SELECTORS constant value by path
     * @param {string} path - Dot path to selector (e.g., 'PAGES.MAPPINGS')
     * @returns {string|null} Selector value or null if not found
     */
    getSelector(path) {
        if (!window.SELECTORS || !path) return null;
        
        return path.split('.').reduce((obj, key) => {
            return obj && obj[key] !== undefined ? obj[key] : null;
        }, window.SELECTORS);
    },
    
    /**
     * Get SELECTORS constants directly
     * @returns {Object} SELECTORS object
     */
    getSelectors() {
        return window.SELECTORS || {};
    }
};

// Make DOM helpers globally available
window.DOM = DOM;

// Log initialization
if (window.Logger) {
    Logger.debug('DOM', 'DOM helpers module loaded');
}