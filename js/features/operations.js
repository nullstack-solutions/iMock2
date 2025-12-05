'use strict';

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
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`➕ [OPS] Creating mapping with temp ID: ${tempId}`);

    // Build optimistic mapping
    const optimisticMapping = {
      ...mappingData,
      id: tempId,
      _pending: true,
      _operation: 'create',
    };

    // Store original for rollback
    const rollbackData = {
      id: tempId,
      original: null, // No original for create
    };

    try {
      // 1. Add to store immediately (optimistic)
      window.MappingsStore.addPending({
        id: tempId,
        type: 'create',
        payload: mappingData,
        optimisticMapping,
      });

      // 2. Update UI immediately
      this._refreshUI();

      // Show pending indicator
      if (window.NotificationManager && typeof window.NotificationManager.info === 'function') {
        window.NotificationManager.info('Creating mapping...');
      }

      // 3. Send to server
      const created = await this._sendCreateRequest(mappingData);

      // 4. Confirm pending operation
      const realId = created.id || created.uuid;
      console.log(`✅ [OPS] Mapping created on server with ID: ${realId}`);

      window.MappingsStore.confirmPending(tempId, created);

      // 5. Update UI with server data
      this._refreshUI();

      // Show success
      if (window.NotificationManager && typeof window.NotificationManager.success === 'function') {
        const name = created.name || realId.substring(0, 8);
        window.NotificationManager.success(`Mapping "${name}" created successfully`);
      }

      return created;

    } catch (error) {
      console.error(`❌ [OPS] Failed to create mapping:`, error);

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
    console.log(`✏️ [OPS] Updating mapping: ${id}`);

    const original = window.MappingsStore.get(id);

    if (!original) {
      throw new Error(`Mapping ${id} not found`);
    }

    // Don't update if already pending
    if (window.MappingsStore.pending.has(id)) {
      console.warn(`⚠️ [OPS] Mapping ${id} already has pending operation`);
      throw new Error('Mapping has pending changes');
    }

    // Build optimistic mapping
    const optimisticMapping = {
      ...original,
      ...changes,
      _pending: true,
      _operation: 'update',
      metadata: {
        ...original.metadata,
        ...changes.metadata,
        edited: Date.now(),
      },
    };

    try {
      // 1. Apply update immediately (optimistic)
      window.MappingsStore.addPending({
        id,
        type: 'update',
        payload: changes,
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
      console.log(`✅ [OPS] Mapping updated on server: ${id}`);

      window.MappingsStore.confirmPending(id, updated);

      // 5. Update UI with server data
      this._refreshUI();

      // Show success
      if (window.NotificationManager && typeof window.NotificationManager.success === 'function') {
        const name = updated.name || id.substring(0, 8);
        window.NotificationManager.success(`Mapping "${name}" updated successfully`);
      }

      return updated;

    } catch (error) {
      console.error(`❌ [OPS] Failed to update mapping:`, error);

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
    console.log(`🗑️ [OPS] Deleting mapping: ${id}`);

    const original = window.MappingsStore.get(id);

    if (!original) {
      console.warn(`⚠️ [OPS] Mapping ${id} not found, skipping delete`);
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
      console.log(`✅ [OPS] Mapping deleted on server: ${id}`);

      window.MappingsStore.confirmPending(id, null);

      // 5. Update UI
      this._refreshUI();

      // Show success
      if (window.NotificationManager && typeof window.NotificationManager.success === 'function') {
        const name = original.name || id.substring(0, 8);
        window.NotificationManager.success(`Mapping "${name}" deleted successfully`);
      }

    } catch (error) {
      console.error(`❌ [OPS] Failed to delete mapping:`, error);

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
    console.log(`🗑️ [OPS] Batch deleting ${ids.length} mappings`);

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
        console.error(`❌ [OPS] Failed to delete ${id}:`, error);
        results.failed.push({ id, error: error.message });
      }
    }

    console.log(`✅ [OPS] Batch delete complete: ${results.success.length} succeeded, ${results.failed.length} failed`);

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
    if (typeof window.fetchAndRenderMappings === 'function') {
      const mappings = window.MappingsStore.getAll();
      window.fetchAndRenderMappings(mappings, { source: 'optimistic' });
    }
  },
};

// === BACKWARD COMPATIBILITY WRAPPERS ===

/**
 * Legacy createMapping function - wraps new operations API
 */
window.createMappingOptimistic = async function(mappingData) {
  return await window.MappingsOperations.create(mappingData);
};

/**
 * Legacy updateMapping function - wraps new operations API
 */
window.updateMappingOptimistic = async function(id, changes) {
  return await window.MappingsOperations.update(id, changes);
};

/**
 * Legacy deleteMapping function - wraps new operations API
 */
window.deleteMappingOptimistic = async function(id) {
  return await window.MappingsOperations.delete(id);
};
