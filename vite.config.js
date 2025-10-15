import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { visualizer } from 'rollup-plugin-visualizer';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_DEV_SERVER_PORT = 5173;
const resolvedDevServerPort = Number(process.env.VITE_DEV_SERVER_PORT) || DEFAULT_DEV_SERVER_PORT;
const resolvedWiremockTarget =
  process.env.VITE_WIREMOCK_URL || `http://localhost:${process.env.VITE_WIREMOCK_PORT || 8080}`;

const wiremockUrl = new URL(resolvedWiremockTarget);
const wiremockPort = wiremockUrl.port
  ? Number(wiremockUrl.port)
  : wiremockUrl.protocol === 'https:'
    ? 443
    : 80;
const devServerPort = wiremockPort === resolvedDevServerPort ? DEFAULT_DEV_SERVER_PORT : resolvedDevServerPort;

export default defineConfig(({ mode }) => ({
  root: '.',
  base: './',
  plugins: [
    visualizer({
      open: mode !== 'production' && process.env.CI !== 'true',
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.info', 'console.debug']
      }
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor/json-editor.html')
      },
      output: {
        manualChunks: {
          vendor: ['./js/vendor-js-yaml.min.js'],
          core: ['./js/core.js', './js/managers.js', './js/editor.js', './js/demo-data.js'],
          features: [
            './js/features.js',
            './js/features/state.js',
            './js/features/utils.js',
            './js/features/filters.js',
            './js/features/cache.js',
            './js/features/mappings.js',
            './js/features/requests.js',
            './js/features/scenarios.js',
            './js/features/recording.js',
            './js/features/management.js',
            './js/features/request-api.js',
            './js/features/near-misses.js',
            './js/features/wiremock-extras.js',
            './js/features/demo.js'
          ],
          editor: [
            './editor/monaco-enhanced.js',
            './editor/monaco-template-library.js',
            './editor/performance-optimizations.js'
          ]
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    assetsInlineLimit: 4096,
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 500
  },
  server: {
    port: devServerPort,
    open: true,
    cors: true,
    proxy: {
      '/__admin': {
        target: resolvedWiremockTarget,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('Proxying:', req.method, req.url);
          });
        }
      }
    },
    hmr: {
      overlay: true
    }
  },
  preview: {
    port: 8081,
    open: true
  },
  optimizeDeps: {
    exclude: ['js-yaml']
  },
  css: {
    postcss: {},
    modules: {
      localsConvention: 'camelCase'
    }
  },
  logLevel: 'info',
  clearScreen: true
}));
