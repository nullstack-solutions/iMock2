# Cache Architecture Refactoring

## Overview

This document describes the new optimized cache architecture for iMock2, designed to handle high-latency environments (40-50s `/mappings` requests) with multi-user collaboration (20+ concurrent users).

## Problem Statement

### Old Architecture Issues

The previous implementation had several over-engineering problems:

1. **5-level data redundancy**:
   - `cache Map`
   - `optimisticQueue`
   - `optimisticShadowMappings`
   - `window.originalMappings`
   - `window.allMappings`

2. **Time-based garbage collection**:
   - TTL for mappings (30 seconds)
   - Cleanup intervals (every 5 seconds)
   - Validation intervals (every 60 seconds)
   - Max cache age (5 minutes)

3. **Complex synchronization**:
   - 3 separate interval timers
   - TTL-based state management
   - No proper conflict resolution

4. **Performance issues**:
   - Multiple full copies of data
   - ~680 lines of complex cache logic
   - High memory footprint

## New Architecture

### Core Principles

1. **Single Source of Truth** - One Map for storage, no redundant copies
2. **Pending-until-confirm** - Optimistic updates with explicit confirmation/rollback
3. **Incremental Sync** - 10-second incremental updates instead of 60-second full sync
4. **Conflict Resolution** - Last-write-wins with user notifications
5. **Service Cache** - Fast startup from persisted snapshot (format: { mappings: [...], timestamp: Date.now() })

### Components

#### 1. MappingsStore (`js/features/store.js`)

**Single Source of Truth** for all mappings.

```javascript
window.MappingsStore = {
  items: new Map(),       // id → Mapping (only one!)
  pending: new Map(),     // id → PendingOperation
  indexes: {              // Fast lookups
    byMethod: Map,
    byUrl: Map,
    byPriority: Map
  },
  metadata: {             // Sync coordination
    serverVersion,
    lastFullSync,
    lastIncrementalSync
  }
}
```

**Key Features**:
- Single Map storage (no triple copying)
- Indexed lookups for O(1) filtering
- Backward compatibility with `window.allMappings`
- ~400 lines (vs 680 in old system)

#### 2. SyncEngine (`js/features/sync-engine.js`)

**Manages synchronization** between client and server.

**Strategy**:
- **Cold Start**: Service Cache → Full Sync
- **Incremental**: Every 10 seconds (vs 60s before)
- **Full Sync**: Every 5 minutes or on demand
- **Cache Save**: Every 30 seconds if changed

**Timers**:
```javascript
{
  incrementalInterval: 10000,   // 10s - fast updates
  fullSyncInterval: 300000,     // 5min - consistency check
  cacheRebuildInterval: 30000,  // 30s - save if changed
}
```

**Benefits**:
- Faster updates from other users (10s vs 60s)
- No garbage collection needed
- Explicit sync control
- Timeout protection (5s incremental, 60s full)

#### 3. MappingsOperations (`js/features/operations.js`)

**Optimistic CRUD operations** with automatic rollback.

**Pattern**:
1. Apply change immediately (optimistic UI)
2. Send request to server
3. Confirm on success OR rollback on error

**Example - Create**:
```javascript
async create(mappingData) {
  // 1. Add with temp ID immediately
  MappingsStore.addPending({ type: 'create', ... })
  refreshUI()  // User sees it instantly

  // 2. Send to server
  const created = await api.post(...)

  // 3. Replace temp ID with real ID
  MappingsStore.confirmPending(tempId, created)
  refreshUI()
}
```

**Error Handling**:
```javascript
catch (error) {
  MappingsStore.rollbackPending(tempId)  // Automatic rollback
  refreshUI()
  showError(error)
}
```

### Conflict Resolution

When multiple users edit the same mapping:

```javascript
// Detect conflicts during incremental sync
if (localPending && serverUpdate) {
  const conflict = {
    local: localMapping,
    server: serverMapping,
    strategy: 'last-write-wins'
  }

  // Compare timestamps
  if (serverTimestamp > localTimestamp) {
    // Server wins - rollback local
    rollbackPending()
    notify("Your changes were overwritten by another user")
  } else {
    // Local wins - retry later
    keepPending()
  }
}
```

### Service Cache

**Fast startup mechanism** - saves snapshot as special WireMock mapping:

```javascript
{
  id: '__imock_cache_v2__',
  request: { method: 'GET', url: '/__imock/cache/v2' },
  response: {
    jsonBody: {
      mappings: [...mappings],  // Array of mapping objects
      timestamp: Date.now()
    }
  }
}
```

**Benefits**:
- Instant UI (no 40-50s wait)
- TTL: 1 hour
- Auto-rebuild every 30s if changed
- Other users benefit immediately

## Performance Comparison

| Metric | Old Architecture | New Architecture | Improvement |
|--------|-----------------|------------------|-------------|
| **Data Copies** | 5 redundant copies | 1 Map | -80% memory |
| **Incremental Sync** | 60 seconds | 10 seconds | 6x faster |
| **Full Sync** | Every 60s | Every 5min | Less network |
| **Code Complexity** | ~680 lines | ~400 lines | -40% code |
| **Startup Time** | 40-50s (cold) | <1s (cache hit) | 50x faster |
| **Timers** | 3 timers | 3 timers (smarter) | Same count, better logic |
| **Conflict Handling** | None | Last-write-wins | ✅ Multi-user |

## Migration Guide

### For Developers

Old code using `window.allMappings` continues to work:

```javascript
// ❌ Old (deprecated but works)
window.allMappings.push(newMapping)

// ✅ New (recommended)
await MappingsOperations.create(newMapping)
```

### Backward Compatibility

The new architecture provides compatibility layer:

```javascript
// Reactive properties
Object.defineProperty(window, 'allMappings', {
  get: () => MappingsStore.getAll()  // Always fresh
})

// Legacy functions still work
window.createMappingOptimistic()  // Wraps MappingsOperations.create()
window.updateMappingOptimistic()  // Wraps MappingsOperations.update()
window.deleteMappingOptimistic()  // Wraps MappingsOperations.delete()
```

## Configuration

All timeouts are configurable in `SyncEngine.config`:

```javascript
SyncEngine.config = {
  incrementalInterval: 10000,    // How often to check for changes
  fullSyncInterval: 300000,      // How often to do full refresh
  cacheRebuildInterval: 30000,   // How often to save cache
  cacheMaxAge: 3600000,          // Cache TTL (1 hour)
  maxRetries: 3,                 // Retry attempts
  retryDelay: 2000,              // Delay between retries
}
```

## Testing Scenarios

### 1. Cold Start (First Load)
```
1. User opens iMock2
2. Load from Service Cache (<1s)
3. Show cached UI immediately
4. Full sync in background (40-50s)
5. Update UI when fresh data arrives
```

### 2. Optimistic Create
```
1. User creates mapping
2. Shows in UI immediately (temp ID)
3. POST to server
4. Replace temp ID with real ID
5. Other users see it in 10s (incremental sync)
```

### 3. Conflict Resolution
```
User A                          User B
Edit mapping X                  Edit mapping X
Save (local pending)            Save (to server first)
                                ← Incremental sync detects conflict
Server version is newer
Rollback local changes
Show notification: "Overwritten by User B"
```

### 4. High Latency Scenario
```
Network: 40-50s for /mappings

With Old: Wait 40s → Show UI → Wait 60s → Refresh → ...
With New: Cache <1s → Show UI → Sync 40s background → Incremental 10s → ...

User Experience: 50x faster startup!
```

## Benefits for Teams

### For 20+ Users

1. **Fast Updates**: See changes from others in 10s (vs 60s)
2. **No Conflicts**: Last-write-wins with clear notifications
3. **Fast Startup**: Service Cache shared by all users
4. **Reliable**: Auto-rollback on errors

### For High Latency

1. **Instant UI**: Service Cache loads <1s
2. **Background Sync**: Full sync doesn't block UI
3. **Incremental**: Only 5s timeout for updates
4. **Offline Resilient**: Pending operations queue up

## Future Enhancements

Possible improvements (not implemented yet):

1. **WebSocket Support**: Real-time updates instead of polling
2. **Operational Transform**: Better conflict resolution
3. **Diff-based Sync**: Only send changed fields
4. **Compression**: Compress Service Cache snapshot
5. **IndexedDB**: Persistent browser cache

## Conclusion

The new architecture:

✅ **Solves real problem**: High latency + multi-user
✅ **Eliminates over-engineering**: No TTL/GC for config data
✅ **Better performance**: 50x faster startup, 6x faster sync
✅ **Simpler code**: -40% lines, clearer structure
✅ **Backward compatible**: Old code keeps working

Perfect balance between **simplicity** and **functionality** for the actual use case.
