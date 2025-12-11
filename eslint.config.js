// @ts-check

const eslintPluginImock2 = require('./eslint-plugin-imock2.js');

/** @type {import('@types/eslint').Linter.Config} */
module.exports = [
  {
    plugins: {
      'imock2': eslintPluginImock2
    },
    rules: {
      'imock2/no-legacy-mappings': 'error',
      'no-implicit-globals': 'error',
      'no-undef': 'error',
      'no-unused-vars': 'warn'
    },
    // Include all JS files in the project
    files: ['**/*.js', '**/*.html'],
    // Use browser environment for iMock2
    languageOptions: {
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        AbortController: 'readonly',
        // iMock2 specific globals
        MappingsStore: 'readonly',
        MappingsOperations: 'readonly',
        Logger: 'readonly',
        Utils: 'readonly',
        UIComponents: 'readonly',
        MonacoLoader: 'readonly',
        ENDPOINTS: 'readonly',
        SELECTORS: 'readonly',
        LifecycleManager: 'readonly',
        Icons: 'readonly',
        TemplateManager: 'readonly',
        renderList: 'readonly',
        apiFetch: 'readonly',
        showPage: 'readonly',
        showModal: 'readonly',
        hideModal: 'readonly',
        openAddMappingModal: 'readonly',
        showNotification: 'readonly',
        refreshMappingTabSnapshot: 'readonly',
        computeMappingTabTotals: 'readonly',
        fetchAndRenderMappings: 'readonly',
        updateUptime: 'readonly',
        updateConnectionStatus: 'readonly',
        updateDataSourceIndicator: 'readonly',
        normalizeWiremockSettings: 'readonly',
        readWiremockSettings: 'readonly',
        normalizeWiremockBaseUrl: 'readonly',
        buildScenarioStateEndpoint: 'readonly',
        toggleSidebar: 'readonly',
        initializeSidebarPreference: 'readonly',
        debounce: 'readonly',
        FeaturesState: 'readonly',
        mappingIndex: 'readonly',
        mappingTabTotals: 'readonly',
        requestTabTotals: 'readonly',
        pendingDeletedIds: 'readonly',
        deletionTimeouts: 'readonly',
        isDemoMode: 'readonly',
        demoModeAnnounced: 'readonly',
        demoModeLastError: 'readonly',
        cacheLastUpdate: 'readonly',
        wiremockBaseUrl: 'readonly',
        customHeaders: 'readonly',
        startTime: 'readonly',
        uptimeInterval: 'readonly',
        allRequests: 'readonly',
        allScenarios: 'readonly',
        isRecording: 'readonly',
        recordedCount: 'readonly',
        lastWiremockSuccess: 'readonly',
        wiremockConnectionState: 'readonly',
        cacheSyncState: 'readonly'
      },
      ecmaVersion: 2021,
      sourceType: 'script'
    }
  }
];