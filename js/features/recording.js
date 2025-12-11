'use strict';

// --- UPDATED RECORDING HELPERS ---

// Start recording
window.startRecording = async (config = {}) => {
    try {
        const defaultConfig = {
            targetBaseUrl: 'https://example.com',
            filters: {
                urlPathPatterns: ['.*'],
                method: 'ANY',
                headers: {}
            },
            captureHeaders: {},
            requestBodyPattern: {},
            persist: true,
            repeatsAsScenarios: false,
            transformers: ['response-template'],
            transformerParameters: {}
        };
        
        const recordingConfig = { ...defaultConfig, ...config };

        await apiFetch(ENDPOINTS.RECORDINGS_START, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recordingConfig)
        });

        NotificationManager.success('Recording started!');
        window.isRecording = true;

        // Refresh the UI
        const indicator = document.getElementById(SELECTORS.RECORDING.INDICATOR);
        if (indicator) indicator.style.display = 'block';
        
    } catch (error) {
        Logger.error('RECORDING', 'Start recording error:', error);
        NotificationManager.error(`Failed to start recording: ${error.message}`);
    }
};

// Stop recording
window.stopRecording = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_STOP, {
            method: 'POST'
        });

        window.isRecording = false;
        window.recordedCount = 0;
        
        // Refresh the UI
        const indicator = document.getElementById(SELECTORS.RECORDING.INDICATOR);
        if (indicator) indicator.style.display = 'none';
        
        const count = response.mappings ? response.mappings.length : 0;
        NotificationManager.success(`Recording stopped! Captured ${count} mappings`);
        
// Refresh the mappings list
            const mappingsToRender = window.MappingsStore?.getAll ? window.MappingsStore.getAll() : window.allMappings || [];
            await fetchAndRenderMappings(mappingsToRender);

        return response.mappings || [];
    } catch (error) {
        Logger.error('RECORDING', 'Stop recording error:', error);
        NotificationManager.error(`Failed to stop recording: ${error.message}`);
        return [];
    }
};

// Get recording status
window.getRecordingStatus = async () => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_STATUS);
        return response.status || 'Unknown';
    } catch (error) {
        Logger.error('RECORDING', 'Recording status error:', error);
        return 'Unknown';
    }
};

// Create a recording snapshot
window.takeRecordingSnapshot = async (config = {}) => {
    try {
        const response = await apiFetch(ENDPOINTS.RECORDINGS_SNAPSHOT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const count = response.mappings ? response.mappings.length : 0;
        NotificationManager.success(`Snapshot created! Captured ${count} mappings`);

        return response.mappings || [];
    } catch (error) {
        Logger.error('RECORDING', 'Recording snapshot error:', error);
        NotificationManager.error(`Snapshot failed: ${error.message}`);
        return [];
    }
};

window.clearRecordings = async () => {
    if (!confirm('Clear all recorded requests?')) return;

    try {
        await apiFetch(ENDPOINTS.REQUESTS, { method: 'DELETE' });
        window.recordedCount = 0;

        const list = document.getElementById('recordings-list');
        if (list) {
            list.innerHTML = '';
        }

        if (typeof fetchAndRenderRequests === 'function') {
            await fetchAndRenderRequests();
        }

        NotificationManager.success('Recording log cleared.');
    } catch (error) {
        Logger.error('RECORDING', 'Clear recordings error:', error);
        NotificationManager.error(`Failed to clear recordings: ${error.message}`);
    }
};

