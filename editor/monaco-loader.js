/**
 * Monaco Editor Lazy Loader
 *
 * Phase 1 Optimization: Lazy load Monaco Editor only when needed
 * Saves 3-5 MB if editor is not opened
 *
 * Based on industry best practices:
 * - React.lazy() pattern
 * - Monaco Editor official lazy loading documentation
 * - Prefetch on hover for better UX
 */

class MonacoLoader {
    static #instance = null;
    static #loadPromise = null;
    static #isLoading = false;
    static #isLoaded = false;
    static #CDN_SOURCES = [
        { label: 'jsDelivr', baseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' },
        { label: 'cdnjs', baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' },
        { label: 'unpkg', baseUrl: 'https://unpkg.com/monaco-editor@0.44.0/min/vs' }
    ];

    /**
     * Lazily load Monaco Editor
     * @returns {Promise<void>} Resolves when Monaco is fully loaded
     */
    static async load() {
        // Return immediately if already loaded
        if (this.#isLoaded) {
            console.log('✅ [Monaco Lazy Loader] Already loaded');
            return Promise.resolve();
        }

        // Return existing promise if already loading
        if (this.#loadPromise) {
            console.log('⏳ [Monaco Lazy Loader] Already loading, returning existing promise');
            return this.#loadPromise;
        }

        console.log('🚀 [Monaco Lazy Loader] Starting lazy load...');
        this.#isLoading = true;

        this.#loadPromise = this.#loadMonacoScripts()
            .then(() => {
                this.#isLoaded = true;
                this.#isLoading = false;
                console.log('✅ [Monaco Lazy Loader] Monaco loaded successfully');

                // Dispatch custom event for initialization hooks
                window.dispatchEvent(new CustomEvent('monaco:loaded'));
            })
            .catch(error => {
                this.#isLoading = false;
                this.#loadPromise = null; // Allow retry
                console.error('❌ [Monaco Lazy Loader] Failed to load Monaco:', error);
                throw error;
            });

        return this.#loadPromise;
    }

    /**
     * Prefetch Monaco Editor (non-blocking)
     * Useful for hover events on editor buttons
     */
    static prefetch() {
        if (this.#isLoaded || this.#isLoading) {
            return;
        }

        console.log('⚡ [Monaco Lazy Loader] Prefetching Monaco...');
        this.load().catch(error => {
            console.warn('⚠️ [Monaco Lazy Loader] Prefetch failed:', error);
        });
    }

    /**
     * Load Monaco scripts from CDN with fallback support
     * @private
     */
    static async #loadMonacoScripts() {
        const primarySource = this.#CDN_SOURCES[0];

        try {
            // 1. Load AMD loader script
            console.log(`📦 [Monaco Lazy Loader] Loading from ${primarySource.label}...`);
            await this.#loadScript(`${primarySource.baseUrl}/loader.js`, 'monaco-loader-script');

            // 2. Configure AMD paths
            window.require = window.require || {};
            window.require.paths = Object.assign({}, window.require.paths || {}, {
                vs: primarySource.baseUrl
            });

            // 3. Load Monaco editor main module
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Monaco loading timeout (30s)'));
                }, 30000);

                window.require(['vs/editor/editor.main'], () => {
                    clearTimeout(timeout);
                    console.log('✅ [Monaco Lazy Loader] Monaco editor.main loaded');
                    resolve();
                }, (error) => {
                    clearTimeout(timeout);
                    console.error('❌ [Monaco Lazy Loader] AMD require failed:', error);
                    reject(error);
                });
            });
        } catch (error) {
            console.error(`❌ [Monaco Lazy Loader] Primary source (${primarySource.label}) failed:`, error);

            // Try fallback sources
            for (let i = 1; i < this.#CDN_SOURCES.length; i++) {
                const fallbackSource = this.#CDN_SOURCES[i];
                try {
                    console.log(`🔄 [Monaco Lazy Loader] Trying fallback: ${fallbackSource.label}...`);
                    return await this.#loadWithFallback(fallbackSource);
                } catch (fallbackError) {
                    console.warn(`⚠️ [Monaco Lazy Loader] Fallback ${fallbackSource.label} failed:`, fallbackError);
                }
            }

            throw new Error('All Monaco CDN sources failed');
        }
    }

    /**
     * Load script with fallback source
     * @private
     */
    static async #loadWithFallback(source) {
        await this.#loadScript(`${source.baseUrl}/loader.js`, `monaco-loader-fallback-${source.label}`);

        window.require.paths = Object.assign({}, window.require.paths || {}, {
            vs: source.baseUrl
        });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Fallback ${source.label} timeout`));
            }, 30000);

            window.require(['vs/editor/editor.main'], () => {
                clearTimeout(timeout);
                resolve();
            }, (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Dynamically load a script
     * @private
     */
    static #loadScript(src, id) {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (document.getElementById(id)) {
                console.log(`✅ [Monaco Lazy Loader] Script ${id} already loaded`);
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.id = id;
            script.src = src;
            script.async = false; // Preserve execution order

            script.onload = () => {
                console.log(`✅ [Monaco Lazy Loader] Script loaded: ${src}`);
                resolve();
            };

            script.onerror = (error) => {
                console.error(`❌ [Monaco Lazy Loader] Script failed: ${src}`, error);
                document.head.removeChild(script);
                reject(new Error(`Failed to load script: ${src}`));
            };

            document.head.appendChild(script);
        });
    }

    /**
     * Check if Monaco is loaded
     */
    static isLoaded() {
        return this.#isLoaded;
    }

    /**
     * Check if Monaco is currently loading
     */
    static isLoading() {
        return this.#isLoading;
    }

    /**
     * Get load status
     */
    static getStatus() {
        return {
            isLoaded: this.#isLoaded,
            isLoading: this.#isLoading,
            hasPromise: this.#loadPromise !== null
        };
    }
}

// Export for use in other scripts
window.MonacoLoader = MonacoLoader;

// Log initialization
console.log('📦 Monaco Lazy Loader initialized');
console.log('💡 Usage: await MonacoLoader.load() or MonacoLoader.prefetch()');
