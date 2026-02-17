'use strict';

const monacoInitializer = new MonacoInitializer();
let monacoInitializationPromise = null;
let monacoReadyEventDispatched = false;

function dispatchMonacoReadyEvent() {
    if (monacoReadyEventDispatched) {
        return;
    }
    monacoReadyEventDispatched = true;

    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
        return;
    }

    let readyEvent = null;
    if (typeof window.CustomEvent === 'function') {
        readyEvent = new CustomEvent('monaco:ready', { detail: { initializer: monacoInitializer } });
    } else if (typeof document !== 'undefined' && typeof document.createEvent === 'function') {
        readyEvent = document.createEvent('Event');
        readyEvent.initEvent('monaco:ready', false, false);
        readyEvent.detail = { initializer: monacoInitializer };
    }

    if (readyEvent) {
        window.dispatchEvent(readyEvent);
    }
}

function bootstrapMonacoInitializer() {
    if (!monacoInitializationPromise) {
        try {
            monacoInitializationPromise = monacoInitializer.initialize();
        } catch (error) {
            console.error(error);
            monacoInitializationPromise = Promise.reject(error);
        }

        monacoInitializationPromise
            .then(dispatchMonacoReadyEvent)
            .catch((error) => {
                console.error(error);
            });
    }

    return monacoInitializationPromise;
}

// Phase 1 Optimization: Lazy initialization
// Monaco is initialized only when actually needed (when editor is opened)
// This saves 3-5 MB if editor is not used

// Initialize Monaco when monaco:loaded event is dispatched
window.addEventListener('monaco:loaded', () => {
    console.log('🚀 [Lazy Init] monaco:loaded event received, initializing editor...');
    bootstrapMonacoInitializer();
});

// Expose bootstrap function for manual initialization
window.bootstrapMonacoInitializer = bootstrapMonacoInitializer;

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.monacoInitializer = monacoInitializer;
    window.renderHistoryModal = renderHistoryModal;
}
