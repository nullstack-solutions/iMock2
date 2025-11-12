'use strict';

// ==========================================
// Filter Presets UI
// ==========================================

/**
 * Render filter presets
 */
window.renderFilterPresets = () => {
    const container = document.getElementById('filter-presets-list');
    if (!container) return;

    const presets = window.FilterPresetsManager.getAllPresets();
    container.innerHTML = '';

    const presetEntries = Object.entries(presets);

    // Show hint if no presets
    if (presetEntries.length === 0) {
        container.innerHTML = '<span class="filter-presets-hint">No saved presets. Set filters and click 💾 to save.</span>';
        return;
    }

    // Render all saved presets
    presetEntries.forEach(([presetId, preset]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'filter-preset-btn';
        button.onclick = () => window.FilterPresetsManager.applyPreset(presetId, 'mappings');
        button.title = `Apply ${preset.name}`;

        button.innerHTML = `
            <span class="preset-icon">${preset.icon || '⭐'}</span>
            <span class="preset-name">${preset.name}</span>
            <span class="preset-delete" onclick="event.stopPropagation(); deletePreset('${presetId}');" title="Delete preset">×</span>
        `;

        container.appendChild(button);
    });
};

/**
 * Show save preset dialog
 */
window.showSavePresetDialog = () => {
    const name = prompt('Enter preset name:');
    if (!name || !name.trim()) return;

    const icon = prompt('Enter emoji icon (optional):') || '⭐';
    const filters = window.FilterPresetsManager.getCurrentFiltersAsPreset('mappings');

    // Check if any filters are active
    if (!filters.method && !filters.query && !filters.status) {
        if (typeof NotificationManager !== 'undefined') {
            NotificationManager.warning('No active filters to save');
        }
        return;
    }

    const presetId = `custom-${Date.now()}`;
    window.FilterPresetsManager.saveCustomPreset(presetId, {
        name: name.trim(),
        icon: icon.trim(),
        filters: filters
    });
};

/**
 * Delete a custom preset
 * @param {string} presetId - Preset ID
 */
window.deletePreset = (presetId) => {
    if (!confirm('Delete this preset?')) return;
    window.FilterPresetsManager.deleteCustomPreset(presetId);
};

// ==========================================
// Filter Pills UI
// ==========================================

/**
 * Render active filter pills
 */
window.renderFilterPills = () => {
    const container = document.getElementById('filter-pills-container');
    const wrapper = document.getElementById('filter-pills');
    if (!container || !wrapper) return;

    const method = document.getElementById('filter-method')?.value || '';
    const query = document.getElementById('filter-url')?.value || '';
    const status = document.getElementById('filter-status')?.value || '';

    const hasFilters = Boolean(method || query || status);

    // Show/hide pills container
    wrapper.style.display = hasFilters ? 'flex' : 'none';

    if (!hasFilters) {
        container.innerHTML = '';
        return;
    }

    // Build pills
    const pills = [];

    if (method) {
        pills.push({
            label: 'Method',
            value: method,
            onRemove: () => {
                document.getElementById('filter-method').value = '';
                window.applyFilters();
            }
        });
    }

    if (query) {
        pills.push({
            label: 'Search',
            value: query,
            onRemove: () => {
                document.getElementById('filter-url').value = '';
                window.applyFilters();
            }
        });
    }

    if (status) {
        pills.push({
            label: 'Status',
            value: status,
            onRemove: () => {
                document.getElementById('filter-status').value = '';
                window.applyFilters();
            }
        });
    }

    // Render pills
    container.innerHTML = pills.map((pill, index) => `
        <div class="filter-pill">
            <span class="filter-pill-label">${pill.label}:</span>
            <span class="filter-pill-value">${pill.value}</span>
            <button type="button" class="filter-pill-remove" onclick="window.removeFilterPill(${index})" title="Remove filter">
                ×
            </button>
        </div>
    `).join('');

    // Store pill removal callbacks
    window._filterPillCallbacks = pills.map(p => p.onRemove);
};

/**
 * Remove filter pill by index
 * @param {number} index - Pill index
 */
window.removeFilterPill = (index) => {
    if (window._filterPillCallbacks && window._filterPillCallbacks[index]) {
        window._filterPillCallbacks[index]();
    }
};

/**
 * Update pills when filters change
 */
const originalApplyFilters = window.applyFilters;
window.applyFilters = () => {
    if (typeof originalApplyFilters === 'function') {
        originalApplyFilters();
    }
    if (typeof window.renderFilterPills === 'function') {
        window.renderFilterPills();
    }
};

// Initialize presets and pills on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof window.renderFilterPresets === 'function') {
            window.renderFilterPresets();
        }
        if (typeof window.renderFilterPills === 'function') {
            window.renderFilterPills();
        }
    });
} else {
    // DOM already loaded
    if (typeof window.renderFilterPresets === 'function') {
        window.renderFilterPresets();
    }
    if (typeof window.renderFilterPills === 'function') {
        window.renderFilterPills();
    }
}

console.log('✅ Filter Presets and Pills UI loaded');
