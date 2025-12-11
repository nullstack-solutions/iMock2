'use strict';

/**
 * Events Module
 * Provides a centralized event bus for inter-module communication
 * and standard event definitions
 */

/**
 * Simple Event Bus implementation for inter-module communication
 */
class EventBus {
    constructor() {
        this.listeners = new Map(); // Map<eventName, Set<listener>>
        this.onceListeners = new Map(); // Map<eventName, Set<listener>>
        this.maxListeners = 50; // Prevent memory leaks
    }

    /**
     * Register an event listener
     * @param {string} eventName - The name of the event
     * @param {Function} listener - The callback function
     * @param {Object} options - Additional options
     * @param {boolean} options.once - Whether to listen only once
     * @returns {Function} Unsubscribe function
     */
    on(eventName, listener, options = {}) {
        if (typeof eventName !== 'string' || typeof listener !== 'function') {
            throw new Error('Event name must be a string and listener must be a function');
        }

        const listeners = options.once ? this.onceListeners : this.listeners;
        
        if (!listeners.has(eventName)) {
            listeners.set(eventName, new Set());
        }

        const eventListeners = listeners.get(eventName);
        
        // Prevent memory leaks
        if (eventListeners.size >= this.maxListeners) {
            Logger.warn('EVENTS', `Maximum listeners (${this.maxListeners}) reached for event: ${eventName}`);
        }

        eventListeners.add(listener);

        Logger.debug('EVENTS', `Listener added for event: ${eventName}`, { once: options.once });

        // Return unsubscribe function
        return () => {
            eventListeners.delete(listener);
            if (eventListeners.size === 0) {
                listeners.delete(eventName);
            }
            Logger.debug('EVENTS', `Listener removed for event: ${eventName}`);
        };
    }

    /**
     * Register a one-time event listener
     * @param {string} eventName - The name of the event
     * @param {Function} listener - The callback function
     * @returns {Function} Unsubscribe function
     */
    once(eventName, listener) {
        return this.on(eventName, listener, { once: true });
    }

    /**
     * Remove an event listener
     * @param {string} eventName - The name of the event
     * @param {Function} listener - The callback function to remove
     */
    off(eventName, listener) {
        // Try regular listeners first
        const regularListeners = this.listeners.get(eventName);
        if (regularListeners) {
            regularListeners.delete(listener);
            if (regularListeners.size === 0) {
                this.listeners.delete(eventName);
            }
        }

        // Try once listeners
        const onceListeners = this.onceListeners.get(eventName);
        if (onceListeners) {
            onceListeners.delete(listener);
            if (onceListeners.size === 0) {
                this.onceListeners.delete(eventName);
            }
        }

        Logger.debug('EVENTS', `Listener removed for event: ${eventName}`);
    }

    /**
     * Emit an event to all registered listeners
     * @param {string} eventName - The name of the event
     * @param {*} data - The data to pass to listeners
     * @param {Object} options - Additional options
     * @param {boolean} options.async - Whether to execute listeners asynchronously
     */
    emit(eventName, data, options = {}) {
        const { async = false } = options;

        Logger.debug('EVENTS', `Emitting event: ${eventName}`, { data, async });

        // Get all listeners for this event
        const regularListeners = this.listeners.get(eventName);
        const onceListeners = this.onceListeners.get(eventName);

        const allListeners = [];
        
        if (regularListeners) {
            allListeners.push(...Array.from(regularListeners));
        }

        if (onceListeners) {
            allListeners.push(...Array.from(onceListeners));
            // Clear once listeners after execution
            this.onceListeners.delete(eventName);
        }

        if (allListeners.length === 0) {
            Logger.debug('EVENTS', `No listeners for event: ${eventName}`);
            return;
        }

        // Execute listeners
        const executeListeners = () => {
            for (const listener of allListeners) {
                try {
                    listener(data);
                } catch (error) {
                    Logger.error('EVENTS', `Error in event listener for ${eventName}:`, error);
                }
            }
        };

        if (async) {
            // Execute asynchronously to avoid blocking
            setTimeout(executeListeners, 0);
        } else {
            executeListeners();
        }
    }

    /**
     * Get the number of listeners for an event
     * @param {string} eventName - The name of the event
     * @returns {number} Number of listeners
     */
    listenerCount(eventName) {
        const regularCount = this.listeners.get(eventName)?.size || 0;
        const onceCount = this.onceListeners.get(eventName)?.size || 0;
        return regularCount + onceCount;
    }

    /**
     * Get all event names with listeners
     * @returns {string[]} Array of event names
     */
    eventNames() {
        const names = new Set();
        for (const eventName of this.listeners.keys()) {
            names.add(eventName);
        }
        for (const eventName of this.onceListeners.keys()) {
            names.add(eventName);
        }
        return Array.from(names);
    }

    /**
     * Remove all listeners for all events
     */
    removeAllListeners() {
        const eventCount = this.listeners.size + this.onceListeners.size;
        this.listeners.clear();
        this.onceListeners.clear();
        Logger.debug('EVENTS', `Removed all listeners for ${eventCount} events`);
    }

    /**
     * Remove all listeners for a specific event
     * @param {string} eventName - The name of the event
     */
    removeEventListeners(eventName) {
        const regularCount = this.listeners.get(eventName)?.size || 0;
        const onceCount = this.onceListeners.get(eventName)?.size || 0;
        
        this.listeners.delete(eventName);
        this.onceListeners.delete(eventName);
        
        Logger.debug('EVENTS', `Removed ${regularCount + onceCount} listeners for event: ${eventName}`);
    }

    /**
     * Get statistics about the event bus
     * @returns {Object} Statistics object
     */
    getStats() {
        const stats = {
            totalEvents: 0,
            totalListeners: 0,
            events: {}
        };

        for (const [eventName, listeners] of this.listeners) {
            stats.totalEvents++;
            stats.totalListeners += listeners.size;
            stats.events[eventName] = {
                regular: listeners.size,
                once: 0
            };
        }

        for (const [eventName, listeners] of this.onceListeners) {
            if (!stats.events[eventName]) {
                stats.totalEvents++;
                stats.events[eventName] = { regular: 0, once: 0 };
            }
            stats.totalListeners += listeners.size;
            stats.events[eventName].once = listeners.size;
        }

        return stats;
    }
}

// Create global event bus instance
window.EventBus = new EventBus();

// Convenience methods for backward compatibility and easier access
window.on = (eventName, listener, options) => window.EventBus.on(eventName, listener, options);
window.once = (eventName, listener) => window.EventBus.once(eventName, listener);
window.off = (eventName, listener) => window.EventBus.off(eventName, listener);
window.emit = (eventName, data, options) => window.EventBus.emit(eventName, data, options);

// DON'T overwrite native browser methods - use separate EventBus methods
// Enhanced event methods with better error handling
window.EventBus.addEventListener = (eventName, listener, options) => {
    try {
        return window.EventBus.on(eventName, listener, options);
    } catch (error) {
        Logger.error('EVENTS', 'Failed to add event listener:', error);
        return () => {}; // Return noop function
    }
};

window.EventBus.removeEventListener = (eventName, listener) => {
    try {
        window.EventBus.off(eventName, listener);
    } catch (error) {
        Logger.error('EVENTS', 'Failed to remove event listener:', error);
    }
};

window.EventBus.dispatchEvent = (eventName, data, options) => {
    try {
        window.EventBus.emit(eventName, data, options);
    } catch (error) {
        Logger.error('EVENTS', 'Failed to dispatch event:', error);
    }
};

/**
 * Event Helper Functions
 */
window.EventHelpers = {
    /**
     * Create a debounced event emitter
     * @param {string} eventName - The event name
     * @param {number} delay - Debounce delay in milliseconds
     * @param {Object} options - Debounce options
     * @returns {Function} Debounced emit function
     */
    createDebouncedEmitter(eventName, delay = 150, options = {}) {
        return window.debounce((data) => {
            window.emit(eventName, data);
        }, delay, options);
    },

    /**
     * Create a throttled event emitter
     * @param {string} eventName - The event name
     * @param {number} delay - Throttle delay in milliseconds
     * @returns {Function} Throttled emit function
     */
    createThrottledEmitter(eventName, delay = 150) {
        let lastEmit = 0;
        return (data) => {
            const now = Date.now();
            if (now - lastEmit >= delay) {
                window.emit(eventName, data);
                lastEmit = now;
            }
        };
    },

    /**
     * Create a conditional event emitter
     * @param {string} eventName - The event name
     * @param {Function} condition - Function that returns true if event should be emitted
     * @returns {Function} Conditional emit function
     */
    createConditionalEmitter(eventName, condition) {
        return (data) => {
            if (condition(data)) {
                window.emit(eventName, data);
            }
        };
    },

    /**
     * Wait for an event to occur
     * @param {string} eventName - The event name to wait for
     * @param {number} timeout - Optional timeout in milliseconds
     * @returns {Promise} Promise that resolves when event occurs
     */
    waitForEvent(eventName, timeout) {
        return new Promise((resolve, reject) => {
            let timeoutId;
            
            const cleanup = window.once(eventName, (data) => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                resolve(data);
            });

            if (timeout) {
                timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error(`Timeout waiting for event: ${eventName}`));
                }, timeout);
            }
        });
    },

    /**
     * Create an event chain - emit multiple events in sequence
     * @param {Array} events - Array of {eventName, data, delay} objects
     * @param {Function} callback - Optional callback when chain completes
     */
    createEventChain(events, callback) {
        let index = 0;
        
        const emitNext = () => {
            if (index >= events.length) {
                if (callback) callback();
                return;
            }

            const { eventName, data, delay } = events[index++];
            window.emit(eventName, data);

            if (delay && delay > 0) {
                setTimeout(emitNext, delay);
            } else {
                emitNext();
            }
        };

        emitNext();
    }
};

// Initialize event system
Logger.debug('EVENTS', 'Events module loaded', window.EventBus.getStats());