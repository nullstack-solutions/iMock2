'use strict';

/**
 * Lifecycle Management Module
 * Provides enhanced lifecycle management for timers, intervals, and event listeners
 * with debugging capabilities and resource cleanup
 */

(function initialiseLifecycleManager() {
    const intervals = new Map(); // Map<id, {name?, delay, createdAt}>
    const timeouts = new Map(); // Map<id, {name?, delay, createdAt}>
    const rafIds = new Set();
    const eventListeners = new Map(); // Map<target, Set<{type, handler, options}>>

    const manager = {
        /**
         * Creates an interval with optional debugging information
         * @param {Function} handler - The function to execute
         * @param {number} delay - The delay in milliseconds
         * @returns {number} The interval ID
         */
        setInterval(handler, delay) {
            const id = window.setInterval(handler, delay);
            intervals.set(id, { delay, createdAt: Date.now() });
            Logger.debug('LIFECYCLE', `Interval created: ${id} (${delay}ms)`);
            return id;
        },

        /**
         * Clears an interval with debugging information
         * @param {number} id - The interval ID to clear
         */
        clearInterval(id) {
            if (id !== undefined && id !== null) {
                window.clearInterval(id);
                const intervalInfo = intervals.get(id);
                intervals.delete(id);
                Logger.debug('LIFECYCLE', `Interval cleared: ${id}${intervalInfo ? ` (${intervalInfo.delay}ms, ${Date.now() - intervalInfo.createdAt}ms ago)` : ''}`);
            }
        },

        /**
         * Creates a timeout with optional debugging information
         * @param {Function} handler - The function to execute
         * @param {number} delay - The delay in milliseconds
         * @returns {number} The timeout ID
         */
        setTimeout(handler, delay) {
            const id = window.setTimeout(handler, delay);
            timeouts.set(id, { delay, createdAt: Date.now() });
            Logger.debug('LIFECYCLE', `Timeout created: ${id} (${delay}ms)`);
            return id;
        },

        /**
         * Clears a timeout with debugging information
         * @param {number} id - The timeout ID to clear
         */
        clearTimeout(id) {
            if (id !== undefined && id !== null) {
                window.clearTimeout(id);
                const timeoutInfo = timeouts.get(id);
                timeouts.delete(id);
                Logger.debug('LIFECYCLE', `Timeout cleared: ${id}${timeoutInfo ? ` (${timeoutInfo.delay}ms, ${Date.now() - timeoutInfo.createdAt}ms ago)` : ''}`);
            }
        },

        /**
         * Requests an animation frame with debugging information
         * @param {Function} handler - The function to execute
         * @returns {number} The animation frame ID
         */
        requestAnimationFrame(handler) {
            // Используем window.requestAnimationFrame если доступен, иначе fallback
            const raf = window.requestAnimationFrame ||
                        function(cb) { return setTimeout(cb, 16); };
            const id = raf(handler);
            rafIds.add(id);
            Logger.debug('LIFECYCLE', `Animation frame requested: ${id}`);
            return id;
        },

        /**
         * Cancels an animation frame with debugging information
         * @param {number} id - The animation frame ID to cancel
         */
        cancelAnimationFrame(id) {
            if (id !== undefined && id !== null) {
                const caf = window.cancelAnimationFrame || clearTimeout;
                caf(id);
                rafIds.delete(id);
                Logger.debug('LIFECYCLE', `Animation frame cancelled: ${id}`);
            }
        },

        /**
         * Adds an event listener with debugging information
         * @param {EventTarget} target - The target element
         * @param {string} type - The event type
         * @param {Function} handler - The event handler
         * @param {Object} options - Event listener options
         */
        addEventListener(target, type, handler, options) {
            if (!target || !type || !handler) {
                Logger.warn('LIFECYCLE', 'addEventListener called with missing parameters', { target, type, handler: !!handler });
                return;
            }

            target.addEventListener(type, handler, options);

            if (!eventListeners.has(target)) {
                eventListeners.set(target, new Set());
            }
            eventListeners.get(target).add({ type, handler, options });
            
            const targetInfo = target.id || target.className || target.tagName || 'unknown';
            Logger.debug('LIFECYCLE', `Event listener added: ${type} on ${targetInfo}`);
        },

        /**
         * Removes an event listener with debugging information
         * @param {EventTarget} target - The target element
         * @param {string} type - The event type
         * @param {Function} handler - The event handler
         * @param {Object} options - Event listener options
         */
        removeEventListener(target, type, handler, options) {
            if (!target || !type || !handler) {
                Logger.warn('LIFECYCLE', 'removeEventListener called with missing parameters', { target, type, handler: !!handler });
                return;
            }

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
            
            const targetInfo = target.id || target.className || target.tagName || 'unknown';
            Logger.debug('LIFECYCLE', `Event listener removed: ${type} on ${targetInfo}`);
        },

        /**
         * Creates a named interval for easier debugging
         * @param {string} name - The name of the interval
         * @param {Function} handler - The function to execute
         * @param {number} delay - The delay in milliseconds
         * @returns {number} The interval ID
         */
        setNamedInterval(name, handler, delay) {
            const id = window.setInterval(handler, delay);
            intervals.set(id, { name, delay, createdAt: Date.now() });
            Logger.debug('LIFECYCLE', `Named interval created: ${name || id} (${delay}ms)`);
            return id;
        },

        /**
         * Gets statistics about active timers and listeners
         * @returns {Object} Statistics object with active timers details
         */
        getStats() {
            const intervalDetails = Array.from(intervals.entries()).map(([id, info]) => ({
                id,
                name: info.name || `interval-${id}`,
                delay: info.delay,
                age: Date.now() - info.createdAt
            }));

            const timeoutDetails = Array.from(timeouts.entries()).map(([id, info]) => ({
                id,
                name: info.name || `timeout-${id}`,
                delay: info.delay,
                age: Date.now() - info.createdAt
            }));

            const listenerDetails = Array.from(eventListeners.entries()).map(([target, listeners]) => {
                const targetInfo = target.id || target.className || target.tagName || 'unknown';
                return {
                    target: targetInfo,
                    eventTypes: Array.from(listeners).map(l => l.type),
                    count: listeners.size
                };
            });

            return {
                activeIntervals: intervals.size,
                activeTimeouts: timeouts.size,
                activeAnimationFrames: rafIds.size,
                activeEventListeners: eventListeners.size,
                details: {
                    intervals: intervalDetails,
                    timeouts: timeoutDetails,
                    animationFrames: Array.from(rafIds),
                    eventListeners: listenerDetails
                }
            };
        },

        /**
         * Clears all active timers, animation frames, and event listeners
         */
        clearAll() {
            Logger.debug('LIFECYCLE', 'Clearing all lifecycle resources');
            
            const clearedIntervals = intervals.size;
            const clearedTimeouts = timeouts.size;
            const clearedAnimationFrames = rafIds.size;
            const clearedEventListeners = eventListeners.size;

            intervals.forEach((_, id) => window.clearInterval(id));
            intervals.clear();
            
            timeouts.forEach((_, id) => window.clearTimeout(id));
            timeouts.clear();
            
            rafIds.forEach(id => window.cancelAnimationFrame(id));
            rafIds.clear();

            // Clean up all event listeners
            eventListeners.forEach((listeners, target) => {
                listeners.forEach(({ type, handler, options }) => {
                    target.removeEventListener(type, handler, options);
                });
            });
            eventListeners.clear();

            Logger.debug('LIFECYCLE', `Cleared ${clearedIntervals} intervals, ${clearedTimeouts} timeouts, ${clearedAnimationFrames} animation frames, ${clearedEventListeners} event listeners`);
        }
    };

    window.LifecycleManager = manager;
    
    // Global cleanup on page unload
    window.addEventListener('beforeunload', () => {
        Logger.info('LIFECYCLE', 'Page unloading, cleaning up resources');
        
        try {
            // Clean up all timers and intervals through LifecycleManager
            manager.clearAll();
            
            // Clean up cache intervals if available
            if (window.CacheIntervals && typeof window.CacheIntervals.stop === 'function') {
                Logger.info('LIFECYCLE', 'Stopping cache intervals');
                window.CacheIntervals.stop();
            }
            
            // Clean up sync engine if available
            if (window.SyncEngine && typeof window.SyncEngine.stop === 'function') {
                Logger.info('LIFECYCLE', 'Stopping sync engine');
                window.SyncEngine.stop();
            }
            
            // Clean up pending deletions if available
            if (typeof window.cleanupPendingDeletions === 'function') {
                Logger.info('LIFECYCLE', 'Cleaning up pending deletions');
                window.cleanupPendingDeletions();
            }
            
            // Clean up deletion timeouts and pending deleted IDs
            if (window.deletionTimeouts instanceof Map) {
                Logger.info('LIFECYCLE', 'Cleaning up deletion timeouts');
                for (const timeout of window.deletionTimeouts.values()) {
                    clearTimeout(timeout);
                }
                window.deletionTimeouts.clear();
            }
            
            if (window.pendingDeletedIds instanceof Set) {
                Logger.info('LIFECYCLE', 'Clearing pending deleted IDs');
                window.pendingDeletedIds.clear();
            }
            
            // Clean up uptime tracking if available
            if (typeof window.stopUptime === 'function') {
                Logger.info('LIFECYCLE', 'Stopping uptime tracking');
                window.stopUptime();
            }
            
            // Clean up health check if available
            if (typeof window.stopHealthCheck === 'function') {
                Logger.info('LIFECYCLE', 'Stopping health check');
                window.stopHealthCheck();
            }
            
            // Clean up any pending optimistic updates
            if (window.optimisticShadowMappings && window.optimisticShadowMappings.clear) {
                Logger.info('LIFECYCLE', 'Clearing optimistic shadow mappings');
                window.optimisticShadowMappings.clear();
            }
            
            // Clean up CacheService if available
            if (window.CacheService && typeof window.CacheService.clear === 'function') {
                Logger.info('LIFECYCLE', 'Clearing CacheService');
                window.CacheService.clear();
            }
            
            // Clean up element cache if available
            if (window.elementCache && window.elementCache.clear) {
                Logger.info('LIFECYCLE', 'Clearing element cache');
                window.elementCache.clear();
            }
            
            // Clean up auto-refresh interval if available
            if (window.autoRefreshInterval) {
                Logger.info('LIFECYCLE', 'Clearing auto-refresh interval');
                clearInterval(window.autoRefreshInterval);
                window.autoRefreshInterval = null;
            }
            
            // Clean up BroadcastChannels if available (from main.js)
            if (typeof window.cacheRefreshChannel !== 'undefined' && window.cacheRefreshChannel) {
                Logger.info('LIFECYCLE', 'Closing cache refresh BroadcastChannel');
                try {
                    window.cacheRefreshChannel.close();
                } catch (error) {
                    Logger.warn('LIFECYCLE', 'Failed to close cache refresh BroadcastChannel:', error);
                }
            }
            
            if (typeof window.optimisticUpdateChannel !== 'undefined' && window.optimisticUpdateChannel) {
                Logger.info('LIFECYCLE', 'Closing optimistic update BroadcastChannel');
                try {
                    window.optimisticUpdateChannel.close();
                } catch (error) {
                    Logger.warn('LIFECYCLE', 'Failed to close optimistic update BroadcastChannel:', error);
                }
            }
            
            Logger.info('LIFECYCLE', 'Cleanup completed successfully');
        } catch (error) {
            Logger.error('LIFECYCLE', 'Error during cleanup:', error);
        }
    });
})();

/**
 * Debounce function to limit the rate at which a function gets called
 * @param {Function} fn - The function to debounce
 * @param {number} wait - The delay in milliseconds (default: 150)
 * @param {Object} options - Configuration options
 * @param {boolean} options.leading - Execute on the leading edge
 * @param {boolean} options.trailing - Execute on the trailing edge
 * @returns {Function} The debounced function with cancel and flush methods
 */
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

Logger.debug('LIFECYCLE', 'Lifecycle module loaded');