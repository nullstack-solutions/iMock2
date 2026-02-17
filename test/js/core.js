'use strict';

// ===== CORE.JS - Base infrastructure =====
// Constants, API client, and shared UI helpers

// --- SCHEDULING & RENDER HELPERS ---
(function initialiseLifecycleManager() {
    const intervalIds = new Map();
    const timeoutIds = new Map();
    const rafIds = new Set();
    const eventListeners = new Map(); // Map<target, Set<{type, handler, options}>>

    const recordInterval = (id, name, delay) => intervalIds.set(id, { name, delay, createdAt: Date.now() });
    const recordTimeout = (id, name, delay) => timeoutIds.set(id, { name, delay, createdAt: Date.now() });

    const manager = {
        setInterval(handler, delay, name) {
            const id = window.setInterval(handler, delay);
            recordInterval(id, name, delay);
            return id;
        },
        setNamedInterval(name, handler, delay) {
            return this.setInterval(handler, delay, name);
        },
        clearInterval(id) {
            if (id !== undefined && id !== null) {
                window.clearInterval(id);
                intervalIds.delete(id);
            }
        },
        setTimeout(handler, delay, name) {
            const id = window.setTimeout(() => {
                timeoutIds.delete(id);
                handler();
            }, delay);
            recordTimeout(id, name, delay);
            return id;
        },
        clearTimeout(id) {
            if (id !== undefined && id !== null) {
                window.clearTimeout(id);
                timeoutIds.delete(id);
            }
        },
        requestAnimationFrame(handler) {
            const id = window.requestAnimationFrame(handler);
            rafIds.add(id);
            return id;
        },
        cancelAnimationFrame(id) {
            if (id !== undefined && id !== null) {
                window.cancelAnimationFrame(id);
                rafIds.delete(id);
            }
        },
        addEventListener(target, type, handler, options) {
            if (!target || !type || !handler) return;

            target.addEventListener(type, handler, options);

            if (!eventListeners.has(target)) {
                eventListeners.set(target, new Set());
            }
            eventListeners.get(target).add({ type, handler, options });
        },
        removeEventListener(target, type, handler, options) {
            if (!target || !type || !handler) return;

            target.removeEventListener(type, handler, options);

            const listeners = eventListeners.get(target);
            if (listeners) {
                for (const listener of listeners) {
                    if (listener.type === type && listener.handler === handler &&
                        JSON.stringify(listener.options) === JSON.stringify(options)) {
                        listeners.delete(listener);
                        break;
                    }
                }
                if (listeners.size === 0) {
                    eventListeners.delete(target);
                }
            }
        },
        clearAll() {
            intervalIds.forEach((_, identifier) => window.clearInterval(identifier));
            intervalIds.clear();
            timeoutIds.forEach((_, identifier) => window.clearTimeout(identifier));
            timeoutIds.clear();
            rafIds.forEach(identifier => window.cancelAnimationFrame(identifier));
            rafIds.clear();

            // Clean up all event listeners
            eventListeners.forEach((listeners, target) => {
                listeners.forEach(({ type, handler, options }) => {
                    target.removeEventListener(type, handler, options);
                });
            });
            eventListeners.clear();
        },
        getStats() {
            return {
                intervals: intervalIds.size,
                timeouts: timeoutIds.size,
                rafs: rafIds.size,
                eventTargets: eventListeners.size,
                details: {
                    intervals: Array.from(intervalIds.entries()),
                    timeouts: Array.from(timeoutIds.entries())
                }
            };
        }
    };

    window.LifecycleManager = manager;
    window.addEventListener('beforeunload', () => manager.clearAll());
})();

(function initialiseAppEvents() {
    if (window.AppEvents && typeof window.AppEvents.emit === 'function') {
        return;
    }

    const handlersByEvent = new Map();

    const addHandler = (eventName, handler) => {
        if (!handlersByEvent.has(eventName)) {
            handlersByEvent.set(eventName, new Set());
        }
        handlersByEvent.get(eventName).add(handler);
    };

    const removeHandler = (eventName, handler) => {
        const handlers = handlersByEvent.get(eventName);
        if (!handlers) return;
        handlers.delete(handler);
        if (handlers.size === 0) {
            handlersByEvent.delete(eventName);
        }
    };

    window.AppEvents = {
        on(eventName, handler) {
            if (!eventName || typeof handler !== 'function') {
                return () => {};
            }
            addHandler(eventName, handler);
            return () => removeHandler(eventName, handler);
        },
        off(eventName, handler) {
            if (!eventName || typeof handler !== 'function') {
                return;
            }
            removeHandler(eventName, handler);
        },
        emit(eventName, detail = {}) {
            const handlers = handlersByEvent.get(eventName);
            if (!handlers || handlers.size === 0) {
                return false;
            }
            const payload = { type: eventName, detail };
            [...handlers].forEach(handler => {
                try {
                    handler(payload);
                } catch (error) {
                    Logger.warn('CORE', `AppEvents handler failed for "${eventName}":`, error);
                }
            });
            return true;
        },
        listenerCount(eventName) {
            return handlersByEvent.get(eventName)?.size || 0;
        }
    };
})();

window.debounce = function debounce(fn, wait = 150, options = {}) {
    let timeoutId;
    let lastArgs;
    let lastThis;
    let result;
    const { leading = false, trailing = true } = options;

    const invoke = () => {
        timeoutId = undefined;
        if (trailing && lastArgs) {
            result = fn.apply(lastThis, lastArgs);
            lastArgs = lastThis = undefined;
        }
    };

    return Object.assign(function debounced(...args) {
        lastArgs = args;
        lastThis = this;

        if (timeoutId === undefined) {
            if (leading) {
                result = fn.apply(lastThis, lastArgs);
                lastArgs = lastThis = undefined;
            }
            timeoutId = window.setTimeout(invoke, wait);
        } else {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(invoke, wait);
        }

        return result;
    }, {
        cancel() {
            if (timeoutId !== undefined) {
                window.clearTimeout(timeoutId);
            }
            timeoutId = undefined;
            lastArgs = lastThis = undefined;
        },
        flush() {
            if (timeoutId !== undefined) {
                window.clearTimeout(timeoutId);
                invoke();
            }
            return result;
        }
    });
};

(function initialiseRenderList() {
    const pendingFrames = new WeakMap();

    function toElement(markup) {
        if (typeof markup !== 'string' || !markup.trim()) {
            return null;
        }
        const template = document.createElement('template');
        template.innerHTML = markup.trim();
        return template.content.firstElementChild;
    }

    window.renderList = function renderList(container, items, options = {}) {
        if (!(container instanceof Element) || !Array.isArray(items)) {
            return;
        }
        const { renderItem, getKey, getSignature, onItemChanged, onItemRemoved } = options;
        if (typeof renderItem !== 'function') {
            return;
        }

        const existingNodes = new Map();
        Array.from(container.children).forEach(node => {
            if (node instanceof HTMLElement && node.dataset && node.dataset.id) {
                existingNodes.set(node.dataset.id, node);
            }
        });

        const fragment = document.createDocumentFragment();

        items.forEach(item => {
            const key = typeof getKey === 'function' ? getKey(item) : (item && (item.id || item.uuid));
            if (!key) {
                return;
            }
            const keyString = String(key);
            const signature = typeof getSignature === 'function' ? getSignature(item) : keyString;
            const existing = existingNodes.get(keyString);

            if (existing && existing.dataset.renderSignature === signature) {
                existing.dataset.renderSignature = signature;
                fragment.appendChild(existing);
                existingNodes.delete(keyString);
                return;
            }

            const previousSignature = existing ? existing.dataset.renderSignature || null : null;
            if (existing && typeof onItemChanged === 'function' && previousSignature !== signature) {
                try {
                    onItemChanged(keyString, item, signature);
                } catch (callbackError) {
                    Logger.warn('UI', 'renderList onItemChanged failed:', callbackError);
                }
            }

            const markup = renderItem(item);
            const node = toElement(markup);
            if (!node) {
                existingNodes.delete(keyString);
                return;
            }
            node.dataset.id = keyString;
            node.dataset.renderSignature = signature;
            fragment.appendChild(node);
            existingNodes.delete(keyString);
        });

        existingNodes.forEach((node, key) => {
            node.remove();
            if (typeof onItemRemoved === 'function') {
                try {
                    onItemRemoved(String(key), node);
                } catch (callbackError) {
                    Logger.warn('UI', 'renderList onItemRemoved failed:', callbackError);
                }
            }
        });

        const scheduleRender = () => {
            container.replaceChildren(fragment);
        };

        if (window.LifecycleManager && typeof window.LifecycleManager.requestAnimationFrame === 'function') {
            const pending = pendingFrames.get(container);
            if (pending) {
                window.LifecycleManager.cancelAnimationFrame(pending);
            }
            const handle = window.LifecycleManager.requestAnimationFrame(() => {
                scheduleRender();
                pendingFrames.delete(container);
            });
            if (handle !== null) {
                pendingFrames.set(container, handle);
            }
        } else if (typeof window.requestAnimationFrame === 'function') {
            const handle = window.requestAnimationFrame(scheduleRender);
            pendingFrames.set(container, handle);
        } else {
            scheduleRender();
        }
    };
})();

const ensureCustomHeaderObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.keys(value).reduce((acc, key) => {
        const normalizedKey = String(key).trim();
        if (!normalizedKey) {
            return acc;
        }
        acc[normalizedKey] = value[key];
        return acc;
    }, {});
};

const migrateLegacySettings = (rawSettings) => {
    if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
        return {};
    }

    const normalized = { ...rawSettings };
    const customHeaders = ensureCustomHeaderObject(normalized.customHeaders);

    if (typeof normalized.authHeader === 'string' && normalized.authHeader.trim()) {
        const authValue = normalized.authHeader.trim();
        if (!Object.prototype.hasOwnProperty.call(customHeaders, 'Authorization')) {
            customHeaders.Authorization = authValue;
        }
        delete normalized.authHeader;
        if (!normalized.customHeadersRaw || typeof normalized.customHeadersRaw !== 'string' || !normalized.customHeadersRaw.trim()) {
            try {
                normalized.customHeadersRaw = JSON.stringify(customHeaders, null, 2);
            } catch (error) {
                Logger.warn('API', 'Failed to serialize migrated custom headers:', error);
                normalized.customHeadersRaw = '';
            }
        }
    }

    normalized.customHeaders = customHeaders;

    if (typeof normalized.customHeadersRaw !== 'string') {
        normalized.customHeadersRaw = '';
    }

    normalized.autoConnect = normalized.autoConnect !== false;
    return normalized;
};

window.normalizeWiremockSettings = (settings) => migrateLegacySettings(settings);

window.readWiremockSettings = () => {
    try {
        const raw = localStorage.getItem('wiremock-settings');
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        return migrateLegacySettings(parsed);
    } catch (error) {
        Logger.warn('UI', 'Failed to read stored settings, returning empty object:', error);
        return {};
    }
};

// Helper to build the documented scenario state endpoint
window.buildScenarioStateEndpoint = (scenarioName) => {
    const rawName = typeof scenarioName === 'string' ? scenarioName : '';
    if (!rawName.trim()) {
        return '';
    }

    return `${ENDPOINTS.SCENARIOS}/${encodeURIComponent(rawName)}/state`;
};

// --- GLOBAL STATE ---
let wiremockBaseUrl = '';
// Use centralized default if available, fallback to hardcoded value
let requestTimeout = window.DEFAULT_SETTINGS?.requestTimeout ? parseInt(window.DEFAULT_SETTINGS.requestTimeout) : 69000;
window.customHeaders = ensureCustomHeaderObject(window.DEFAULT_SETTINGS?.customHeaders || {});
window.startTime = null; // Make globally accessible for uptime tracking
window.uptimeInterval = null; // Make globally accessible for uptime tracking
let autoRefreshInterval = null;

// Global feature-level state
window.allRequests = [];
window.allScenarios = [];
window.isRecording = false;
window.recordedCount = 0;

window.normalizeWiremockBaseUrl = (hostInput, portInput) => {
    let rawHost = (hostInput || '').trim() || 'localhost';
    let port = (portInput || '').trim();
    let scheme = 'http', hostname = '';
    try {
        const url = new URL(rawHost.includes('://') ? rawHost : `http://${rawHost}`);
        scheme = url.protocol.replace(':', '') || 'http';
        hostname = url.hostname;
        port ||= url.port;
    } catch (e) {
        const m = rawHost.match(/^([^:/]+)(?::(\d+))?$/);
        hostname = m ? m[1] : rawHost;
        port ||= m?.[2];
    }
    return `${scheme}://${hostname || 'localhost'}:${port || (scheme === 'https' ? '443' : '8080')}/__admin`;
};

// --- API CLIENT WITH TIMEOUT SUPPORT ---
window.apiFetch = async (endpoint, options = {}) => {
    const controller = new AbortController();
    const timeoutSettings = Utils.safeCall(window.readWiremockSettings) || {};
    const currentTimeout = timeoutSettings.requestTimeout ? parseInt(timeoutSettings.requestTimeout) : (window.DEFAULT_SETTINGS?.requestTimeout ? parseInt(window.DEFAULT_SETTINGS.requestTimeout) : 69000);
    const timeoutId = setTimeout(() => controller.abort(), currentTimeout);
    const fullUrl = `${window.wiremockBaseUrl}${endpoint}`;
    const method = options.method || 'GET';
    
    const headers = { 
        'Content-Type': 'application/json', 
        ...ensureCustomHeaderObject(timeoutSettings.customHeaders || window.customHeaders), 
        ...options.headers,
    };

    // Reduce logging verbosity for periodic endpoints to prevent memory leaks
    const isPeriodicEndpoint = endpoint === window.ENDPOINTS?.HEALTH || endpoint === window.ENDPOINTS?.MAPPINGS;
    const verboseLogging = !isPeriodicEndpoint;

    // Minimal logging for periodic health checks to reduce memory usage
    if (verboseLogging) {
        Logger.api(`${method} ${endpoint}`);
    }

    try {
        const response = await fetch(fullUrl, { ...options, signal: controller.signal, headers });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const errorText = await response.text();
            if (verboseLogging) {
                Logger.error('API', `HTTP ${response.status}: ${errorText || response.statusText}`, { endpoint, method });
            }
            const error = new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            error.status = response.status; // Add status property for reliable error handling
            error.statusText = response.statusText;
            throw error;
        }
        const responseData = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();

        // Only log success for non-periodic endpoints
        if (verboseLogging) {
            Logger.api(`${method} ${endpoint} - OK`);
        }

        try {
            if (endpoint === window.ENDPOINTS?.HEALTH || endpoint === window.ENDPOINTS?.MAPPINGS) {
                const timestamp = Date.now();
                window.lastWiremockSuccess = timestamp;
                if (window.AppEvents && typeof window.AppEvents.emit === 'function') {
                    window.AppEvents.emit('wiremock:success', { endpoint, method, timestamp });
                }
            }
        } catch (_) {}
        return responseData;
    } catch (error) {
        clearTimeout(timeoutId);
        // Minimal error logging to reduce memory usage
        if (verboseLogging) {
            Logger.error('API', `${method} ${endpoint} - ${error.name}: ${error.message}`);
        }
        if (error.name === 'AbortError') throw new Error(`Request timeout after ${currentTimeout}ms`);
        throw error;
    }
};

// --- CORE UI HELPERS ---

window.showPage = (pageId, element) => {
    Logger.info('UI', `Switching to tab: ${pageId}`);

    document.querySelectorAll('.main-content > div[id$="-page"]').forEach(p => p.classList.add('hidden'));
    const targetPage = document.getElementById(SELECTORS.PAGES[pageId.toUpperCase()]);
    if (!targetPage) { Logger.warn('UI', `Page not found: ${pageId}`); return; }
    targetPage.classList.remove('hidden');
    document.querySelectorAll('.sidebar .nav-item').forEach(i => i.classList.remove('active'));
    if (element) element.classList.add('active');

    // Update URL with active tab
    if (window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        const oldTab = url.searchParams.get('tab');
        url.searchParams.set('tab', pageId);
        const newUrl = url.toString();
        Logger.api(`showPage: ${oldTab} → ${pageId}`);
        Logger.api(`showPage URL: ${newUrl}`);
        window.history.replaceState({}, '', newUrl);
    } else {
        Logger.warn('UI', 'history.replaceState not available');
    }
};

// Sidebar collapse helpers
const SIDEBAR_COLLAPSED_CLASS = 'sidebar-collapsed';
const SIDEBAR_STATE_STORAGE_KEY = 'imock-sidebar-state';

const applySidebarState = (shouldCollapse, { persist = true } = {}) => {
    if (!document.body) return;
    document.body.classList.toggle(SIDEBAR_COLLAPSED_CLASS, shouldCollapse);
    const toggleButton = document.querySelector('.sidebar-toggle');
    if (toggleButton) {
        const label = shouldCollapse ? 'Expand sidebar' : 'Collapse sidebar';
        toggleButton.setAttribute('aria-expanded', String(!shouldCollapse));
        toggleButton.setAttribute('aria-label', label);
        toggleButton.setAttribute('title', label);
        toggleButton.querySelector('use')?.setAttribute('href', shouldCollapse ? '#icon-sidebar-expand' : '#icon-sidebar-collapse');
    }
    if (persist) try { localStorage.setItem(SIDEBAR_STATE_STORAGE_KEY, shouldCollapse ? 'collapsed' : 'expanded'); } catch (e) { Logger.warn('UI', 'Unable to persist sidebar state:', e); }
};

window.toggleSidebar = () => {
    const isCollapsed = document.body?.classList.contains(SIDEBAR_COLLAPSED_CLASS);
    applySidebarState(!isCollapsed);
};

window.initializeSidebarPreference = () => {
    let storedState = null;
    try { storedState = localStorage.getItem(SIDEBAR_STATE_STORAGE_KEY); } catch (e) { Logger.warn('UI', 'Unable to read sidebar state from storage:', e); }
    applySidebarState(storedState === 'collapsed', { persist: false });
};

const resolveModalElement = (modalId) => {
    if (!modalId) { Logger.warn('UI', 'Modal ID is required to resolve modal element'); return null; }
    const element = document.getElementById(modalId);
    if (!element) Logger.warn('UI', `Modal element not found for id: ${modalId}`);
    return element;
};

window.showModal = (modalId) => {
    const modal = resolveModalElement(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput) LifecycleManager.requestAnimationFrame(() => firstInput.focus());
};

window.openAddMappingModal = () => {
    if (window.TemplateManager?.openGalleryForTarget) {
        window.TemplateManager.openGalleryForTarget('create-inline');
        return;
    }

    const trigger = document.querySelector('[data-template-trigger][data-template-target="create-inline"]');
    if (trigger) {
        trigger.click();
    } else {
        window.showModal('template-gallery-modal');
    }
};

window.hideModal = (modal) => {
    const modalElement = typeof modal === 'string' ? resolveModalElement(modal) : modal;
    if (!modalElement) return;
    modalElement.classList.add('hidden');
    modalElement.style.display = 'none';
    modalElement.querySelector('form')?.reset();
    if (modalElement.id === 'edit-mapping-modal') {
        if (typeof UIComponents?.clearCardState === 'function') {
            UIComponents.clearCardState('mapping', 'is-editing');
        }
        // Clear Monaco Editor content to prevent showing previous mapping
        if (window.editor && typeof window.editor.setValue === 'function') {
            try {
                window.editor.setValue('');
            } catch (e) {
                Logger.warn('UI', 'Failed to clear editor:', e);
            }
        }
    }
};

window.showTab = (tabName, button) => {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    button.classList.add('active');

    // Update URL with active tab
    if (window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tabName);
        window.history.replaceState({}, '', url.toString());
    }
};

const applyThemeToDom = (theme) => {
    if (!document.body) return;
    document.body.setAttribute('data-theme', theme);
    const iconTargets = [document.getElementById('theme-icon'), document.getElementById('editor-theme-icon')].filter(Boolean);
    if (iconTargets.length) {
        const target = theme === 'dark' ? '#icon-sun' : '#icon-moon';
        iconTargets.forEach(icon => { icon.setAttribute('href', target); icon.setAttribute('xlink:href', target); });
    }
};

const persistThemePreference = (preference) => {
    localStorage.setItem('theme', preference);
    try { localStorage.setItem('wiremock-settings', JSON.stringify({ ...Utils.safeCall(window.readWiremockSettings) || {}, theme: preference })); } catch (_) {}
};

window.toggleTheme = () => {
    if (!document.body) return;
    const newTheme = (document.body.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
    applyThemeToDom(newTheme);
    persistThemePreference(newTheme);
    if (window.NotificationManager) NotificationManager.show(`Switched to ${newTheme} theme`, 'success');
};

window.changeTheme = () => {
    const themeSelect = document.getElementById('theme-select');
    if (!themeSelect) return;
    const selectedTheme = themeSelect.value;
    const themeToApply = selectedTheme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : selectedTheme;
    applyThemeToDom(themeToApply);
    persistThemePreference(selectedTheme);
    if (window.NotificationManager) NotificationManager.show(`Theme changed to ${selectedTheme}`, 'success');
};

window.initializeTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const themeToApply = savedTheme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : savedTheme;
    applyThemeToDom(themeToApply);
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = savedTheme;
};

// Initialize theme only after DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTheme);
} else {
    initializeTheme();
}

// --- MODAL EVENTS ---

// Close modal when clicking outside
LifecycleManager.addEventListener(document, 'click', (e) => {
    if (e.target.classList.contains('modal')) {
        hideModal(e.target);
    }
});

// Close modal with Escape key
LifecycleManager.addEventListener(document, 'keydown', (e) => {
    if (e.key === 'Escape') {
        const visibleModal = document.querySelector('.modal:not(.hidden)');
        if (visibleModal) {
            hideModal(visibleModal);
        }
    }
});

// --- DOM ELEMENT CACHE (minimal) ---
window.elementCache = new Map();
window.invalidateElementCache = (id) => id ? window.elementCache.delete(id) : window.elementCache.clear();

Logger.info('UI', 'Core.js loaded - Constants, API client, basic UI functions');
