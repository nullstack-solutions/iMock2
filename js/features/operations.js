'use strict';

function normalizeScenarioNameValue(value) {
  if (value == null) {
    return { original: value, normalized: value, changed: false, cleared: false, hadWhitespace: false };
  }
  const original = typeof value === 'string' ? value : String(value);
  const hadWhitespace = /\s/.test(original);
  const normalized = original.trim().replace(/\s+/g, '_');
  const cleared = Boolean(original) && !normalized;
  const changed = normalized !== original;
  return { original, normalized, changed, cleared, hadWhitespace };
}

function normalizeScenarioNameField(mapping, { notify } = {}) {
  if (!mapping || typeof mapping !== 'object') return { changed: false };
  if (!Object.prototype.hasOwnProperty.call(mapping, 'scenarioName')) return { changed: false };

  const normalizer = typeof window.Utils?.normalizeScenarioName === 'function'
    ? window.Utils.normalizeScenarioName
    : normalizeScenarioNameValue;

  const result = normalizer(mapping.scenarioName);
  if (!result?.changed || !result?.hadWhitespace) return { changed: false };

  if (result.cleared) {
    delete mapping.scenarioName;
    notify?.('Scenario name contained only whitespace and was cleared');
  } else {
    mapping.scenarioName = result.normalized;
    notify?.(`Scenario name cannot contain spaces. Replaced with "${result.normalized}"`);
  }

  return { changed: true, original: result.original, normalized: result.normalized, cleared: result.cleared };
}

/**
 * MappingsOperations - Optimistic CRUD operations for mappings
 *
 * Pattern:
 * 1. Apply change immediately (optimistic UI)
 * 2. Send request to server
 * 3. Confirm on success or rollback on error
 *
 * Features:
 * - Automatic rollback on error
 * - Retry logic with exponential backoff
 * - Conflict detection
 * - User notifications
 */

window.MappingsOperations = {
  /**
   * Create a new mapping (optimistic)
   */
  async create(mappingData) {
    const normalizedPayload = { ...(mappingData || {}) };
    normalizeScenarioNameField(normalizedPayload, { notify: (msg) => window.NotificationManager?.warning?.(msg) });

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    Logger.info('OPS', `Creating mapping with temp ID: ${tempId}`);

    // Build optimistic mapping
    const optimisticMapping = {
      ...normalizedPayload,
      id: tempId,
      _pending: true,
      _operation: 'create',
    };

    try {
      // 1. Add to store immediately (optimistic)
      window.MappingsStore.addPending({
        id: tempId,
        type: 'create',
        payload: normalizedPayload,
        optimisticMapping,
      });

      // 2. Update UI immediately
      this._refreshUI();

      // Show pending indicator
      if (window.NotificationManager && typeof window.NotificationManager.info === 'function') {
        window.NotificationManager.info('Creating mapping...');
      }

      // 3. Send to server
      const created = await this._sendCreateRequest(normalizedPayload);

      // 4. Confirm pending operation
      const realId = created.id || created.uuid;
      Logger.info('OPS', `Mapping created on server with ID: ${realId}`);

      window.MappingsStore.confirmPending(tempId, created);

      // 5. Update UI with server data
      this._refreshUI();

      // 6. Broadcast update to other tabs/windows
      this._broadcastUpdate('created', created);

      // Show success
      if (window.NotificationManager && typeof window.NotificationManager.success === 'function') {
        const name = created.name || created.id.substring(0, 8);
        window.NotificationManager.success(`Mapping "${name}" created successfully`);
      }

      return created;

    } catch (error) {
      Logger.error('OPS', 'Failed to create mapping:', error);

      // Rollback
      window.MappingsStore.rollbackPending(tempId, null);

      this._refreshUI();

      // Show error
      if (window.NotificationManager && typeof window.NotificationManager.error === 'function') {
        window.NotificationManager.error(`Failed to create mapping: ${error.message}`);
      }

      throw error;
    }
  },

  /**
   * Update an existing mapping (optimistic)
   */
  async update(id, changes) {
    Logger.info('OPS', `Updating mapping: ${id}`);

    const original = window.MappingsStore.get(id);

    if (!original) {
      throw new Error(`Mapping ${id} not found`);
    }

    // Don't update if already pending
    if (window.MappingsStore.pending.has(id)) {
      Logger.warn('OPS', `Mapping ${id} already has pending operation`);
      throw new Error('Mapping has pending changes');
    }

    const normalizedChanges = { ...(changes || {}) };

    // Build optimistic mapping
    const optimisticMapping = {
      ...original,
      ...normalizedChanges,
      _pending: true,
      _operation: 'update',
      metadata: {
        ...original.metadata,
        ...normalizedChanges.metadata,
        edited: Date.now(),
      },
    };

    normalizeScenarioNameField(optimisticMapping, { notify: (msg) => window.NotificationManager?.warning?.(msg) });

    try {
      // 1. Apply update immediately (optimistic)
      window.MappingsStore.addPending({
        id,
        type: 'update',
        payload: normalizedChanges,
        optimisticMapping,
        original, // Store for rollback
      });

      // 2. Update UI immediately
      this._refreshUI();

      // Show pending indicator
      if (window.NotificationManager && typeof window.NotificationManager.info === 'function') {
        window.NotificationManager.info('Saving changes...');
      }

      // 3. Send to server
      const updated = await this._sendUpdateRequest(id, optimisticMapping);

      // 4. Confirm pending operation
      Logger.info('OPS', `Mapping updated on server: ${id}`);

      window.MappingsStore.confirmPending(id, updated);

      // 5. Update UI with server data
      this._refreshUI();

      // 6. Broadcast update to other tabs/windows
      this._broadcastUpdate('updated', updated);

      // Show success
      if (window.NotificationManager && typeof window.NotificationManager.success === 'function') {
        const name = updated.name || id.substring(0, 8);
        window.NotificationManager.success(`Mapping "${name}" updated successfully`);
      }

      return updated;

    } catch (error) {
      Logger.error('OPS', 'Failed to update mapping:', error);

      // Rollback to original
      window.MappingsStore.rollbackPending(id, original);

      this._refreshUI();

      // Show error
      if (window.NotificationManager && typeof window.NotificationManager.error === 'function') {
        window.NotificationManager.error(`Failed to update mapping: ${error.message}`);
      }

      throw error;
    }
  },

  /**
   * Delete a mapping (optimistic)
   */
  async delete(id) {
    Logger.info('OPS', `Deleting mapping: ${id}`);

    const original = window.MappingsStore.get(id);

    if (!original) {
      Logger.warn('OPS', `Mapping ${id} not found, skipping delete`);
      return;
    }

    // Build optimistic mapping (marked as deleted)
    const optimisticMapping = {
      ...original,
      _deleted: true,
      _pending: true,
      _operation: 'delete',
    };

    try {
      // 1. Mark as deleted immediately (optimistic)
      window.MappingsStore.addPending({
        id,
        type: 'delete',
        payload: null,
        optimisticMapping,
        original, // Store for rollback
      });

      // 2. Update UI immediately (hide the mapping)
      this._refreshUI();

      // Show pending indicator
      if (window.NotificationManager && typeof window.NotificationManager.info === 'function') {
        const name = original.name || id.substring(0, 8);
        window.NotificationManager.info(`Deleting "${name}"...`);
      }

      // 3. Send delete to server
      await this._sendDeleteRequest(id);

      // 4. Confirm deletion
      Logger.info('OPS', `Mapping deleted on server: ${id}`);

      window.MappingsStore.confirmPending(id, null);

      // 5. Update UI
      this._refreshUI();

      // 6. Broadcast update to other tabs/windows
      this._broadcastUpdate('deleted', original);

      // Show success
      if (window.NotificationManager && typeof window.NotificationManager.success === 'function') {
        const name = original.name || id.substring(0, 8);
        window.NotificationManager.success(`Mapping "${name}" deleted successfully`);
      }

    } catch (error) {
      Logger.error('OPS', 'Failed to delete mapping:', error);

      // Rollback - restore the mapping
      window.MappingsStore.rollbackPending(id, original);

      this._refreshUI();

      // Show error
      if (window.NotificationManager && typeof window.NotificationManager.error === 'function') {
        window.NotificationManager.error(`Failed to delete mapping: ${error.message}`);
      }

      throw error;
    }
  },

  /**
   * Batch delete multiple mappings
   */
  async batchDelete(ids) {
    Logger.info('OPS', `Batch deleting ${ids.length} mappings`);

    const results = {
      success: [],
      failed: [],
    };

    // Delete in sequence (could be parallel but sequential is safer)
    for (const id of ids) {
      try {
        await this.delete(id);
        results.success.push(id);
      } catch (error) {
        Logger.error('OPS', `Failed to delete ${id}:`, error);
        results.failed.push({ id, error: error.message });
      }
    }

    Logger.info('OPS', `Batch delete complete: ${results.success.length} succeeded, ${results.failed.length} failed`);

    // Show summary
    if (window.NotificationManager) {
      if (results.failed.length === 0) {
        window.NotificationManager.success(`Deleted ${results.success.length} mappings`);
      } else {
        window.NotificationManager.warning(`Deleted ${results.success.length} mappings, ${results.failed.length} failed`);
      }
    }

    return results;
  },

  // === PRIVATE METHODS ===

  async _sendCreateRequest(mappingData) {
    // Remove temp/internal fields
    const cleanData = this._cleanMappingData(mappingData);

    const response = await fetch(`${window.wiremockBaseUrl}/mappings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cleanData),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Server error: ${response.status} ${error}`);
    }

    return await response.json();
  },

  async _sendUpdateRequest(id, mappingData) {
    // Remove temp/internal fields
    const cleanData = this._cleanMappingData(mappingData);

    const response = await fetch(`${window.wiremockBaseUrl}/mappings/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cleanData),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Server error: ${response.status} ${error}`);
    }

    // PUT may return empty body
    const text = await response.text();
    return text ? JSON.parse(text) : cleanData;
  },

  async _sendDeleteRequest(id) {
    const response = await fetch(`${window.wiremockBaseUrl}/mappings/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Server error: ${response.status} ${error}`);
    }
  },

  _cleanMappingData(mapping) {
    const clean = { ...mapping };

    // Remove internal fields
    delete clean._pending;
    delete clean._operation;
    delete clean._deleted;

    return clean;
  },

  _refreshUI() {
    // Refresh UI with current store state
    if (!window.MappingsStore) {
      Logger.warn('OPS', 'MappingsStore not available for UI refresh');
      return;
    }

    // Note: window.originalMappings and window.allMappings are now getters from MappingsStore
    // No need to manually update them - they automatically reflect store state

    // Update backward compatibility helpers
    if (typeof window.refreshMappingTabSnapshot === 'function') {
      window.refreshMappingTabSnapshot();
    }

    // Apply filters and render (this will read from MappingsStore via getters and render)
    if (window.FilterManager && typeof window.FilterManager.applyMappingFilters === 'function') {
      window.FilterManager.applyMappingFilters();
      // Flush to execute immediately (FilterManager uses debounce)
      if (typeof window.FilterManager.flushMappingFilters === 'function') {
        window.FilterManager.flushMappingFilters();
      }
    } else {
      // Fallback: render without filters
      Logger.warn('OPS', 'FilterManager not available, rendering without filters');
      const mappings = window.MappingsStore.getAll();
      if (typeof window.fetchAndRenderMappings === 'function') {
        window.fetchAndRenderMappings(mappings, { source: 'optimistic' });
      }
    }
  },

  _broadcastUpdate(operation, mapping) {
    // Broadcast update to other tabs/windows via BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('imock-optimistic-updates');
        channel.postMessage({
          type: 'mapping-' + operation,
          operation: operation,
          mapping: mapping,
          source: 'mappings-operations',
          timestamp: Date.now()
        });
        Logger.debug('OPS', `Broadcasted ${operation} update:`, mapping.id);
      } catch (error) {
        Logger.warn('OPS', 'Failed to broadcast update:', error);
      }
    }

    // Also update localStorage for cross-tab communication (fallback)
    try {
      const key = 'imock-optimistic-update';
      const data = {
        type: 'mapping-' + operation,
        operation: operation,
        mapping: mapping,
        source: 'mappings-operations',
        timestamp: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(data));
      // Remove after short delay to prevent stale data
      setTimeout(() => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 1000);
    } catch (error) {
      Logger.warn('OPS', 'Failed to update localStorage:', error);
    }
  },

};


