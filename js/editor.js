'use strict';

(function(global) {
    const window = global;

    let editorState = {
        originalMapping: null,
        currentMapping: null,
        isDirty: false
    };

    window.updateMapping = async () => {
        const editor = document.getElementById('json-editor');
        if (!editor) return;

        try {
            const data = JSON.parse(editor.value);
            const id = data.id || data.uuid;
            if (!id) throw new Error('No mapping ID');

            window.setMappingEditorBusyState(true, 'Saving...');
            await apiFetch(`/mappings/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });

            NotificationManager.success('Saved');
            if (window.updateOptimisticCache) window.updateOptimisticCache(data, 'update');
            window.hideModal('edit-mapping-modal');
        } catch (e) {
            NotificationManager.error(e.message);
        } finally {
            window.setMappingEditorBusyState(false);
        }
    };

    window.populateEditMappingForm = (mapping) => {
        editorState.currentMapping = mapping;
        const editor = document.getElementById('json-editor');
        if (editor) editor.value = JSON.stringify(mapping, null, 2);
    };

    window.setMappingEditorBusyState = (loading, label) => {
        const btn = document.getElementById('update-mapping-btn');
        if (btn) {
            btn.disabled = loading;
            const labelEl = btn.querySelector('.btn-label');
            if (labelEl && label) labelEl.textContent = loading ? label : 'Update Mapping';
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('edit-mapping-form');
        if (form) form.onsubmit = (e) => { e.preventDefault(); window.updateMapping(); };
    });

})(typeof window !== 'undefined' ? window : globalThis);