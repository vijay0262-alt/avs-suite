# Phase 2C Performance Baseline

**Date**: 2026-07-20  
**Status**: IN PROGRESS

---

## Current Architecture Analysis

### Router Configuration
- **Lazy Loading**: ✅ Already implemented using `React.lazy()` for all pages
- **Code Splitting**: ✅ Each page is a separate chunk
- **Suspense**: ✅ Wrapped with `LoadingFallback` component
- **Router Type**: HashRouter (slower than BrowserRouter but more compatible)

### Current Loading Fallback
```tsx
export function LoadingFallback() {
  return (
    <div role="status" aria-live="polite" className="flex h-full min-h-[300px] items-center justify-center text-text-muted text-sm">
      Loading…
    </div>
  );
}
```
**Status**: Basic text-only loading indicator - needs skeleton UI

---

## Performance Metrics to Measure

### Frontend Metrics
- [ ] First Contentful Paint (FCP)
- [ ] Largest Contentful Paint (LCP)
- [ ] Time to Interactive (TTI)
- [ ] Module switch time
- [ ] Component render time
- [ ] Bundle size per module

### Backend Metrics
- [ ] RPC call latency
- [ ] Python execution time per module
- [ ] SQLite query performance
- [ ] IPC communication overhead
- [ ] Backend startup time

### System Metrics
- [ ] Electron startup time
- [ ] Memory usage (baseline and peak)
- [ ] CPU usage (idle and active)
- [ ] Disk I/O during operations

---

## Known Bottlenecks (Initial Assessment)

### High Priority
1. **Module Switching**: Lazy loading causes white screens during first load
2. **System Information**: Loads all data synchronously
3. **Startup Analyzer**: Sequential registry/folder scanning
4. **Performance Monitor**: High refresh rate causes CPU usage

### Medium Priority
1. **Disk Analyzer**: Scans entire PC by default
2. **Duplicate Finder**: Scans entire PC by default
3. **Junk Cleaner**: Rescans unchanged directories
4. **Health Score**: Waits for all modules before calculating

### Low Priority
1. **Settings**: Client-side only, minimal impact
2. **About**: Static content, minimal impact

---

## Optimization Targets

### Module Switching
- **Current**: ~500-1000ms (estimated)
- **Target**: <150ms
- **Strategy**: Preload frequently used modules, keep in memory

### System Information
- **Current**: ~2000ms (estimated)
- **Target**: <500ms initial load, <100ms refresh
- **Strategy**: Cache static data, refresh only dynamic values

### Startup Analyzer
- **Current**: ~3000ms (estimated)
- **Target**: <1000ms
- **Strategy**: Parallel scanning, caching

### Performance Monitor
- **Current**: ~5% CPU (estimated)
- **Target**: <2% CPU, <100 MB RAM
- **Strategy**: Reduce refresh rate, optimize chart rendering

---

## Implementation Plan

### Phase 1: Performance Profiling (Current)
- [ ] Create performance measurement utilities
- [ ] Measure baseline metrics
- [ ] Identify specific bottlenecks

### Phase 2: Module Switching Optimization
- [ ] Implement module preloading
- [ ] Add module caching
- [ ] Keep recently used modules in memory
- [ ] Implement skeleton loading states

### Phase 3: Background Data Loading
- [ ] Convert heavy modules to async loading
- [ ] Add progress indicators
- [ ] Implement cancellation support
- [ ] Never block UI thread

### Phase 4: Module-Specific Optimizations
- [ ] System Information: Static/dynamic separation
- [ ] Startup Analyzer: Parallel scanning
- [ ] Performance Monitor: Optimized refresh
- [ ] Disk Analyzer: Drive selection UX
- [ ] Duplicate Finder: Drive selection UX
- [ ] Junk Cleaner: Caching and parallel scanning
- [ ] Health Score: Incremental calculation

### Phase 5: Antivirus Investigation
- [ ] Investigate PyInstaller configuration
- [ ] Check for one-file vs one-folder build
- [ ] Add version information
- [ ] Document code signing requirements

### Phase 6: Final Testing & Reporting
- [ ] Measure post-optimization metrics
- [ ] Create benchmark comparison
- [ ] Generate performance report
- [ ] Document remaining bottlenecks

---

## Files to Modify

### Frontend
- `apps/pc-optimizer/src/router/index.tsx` - Module preloading
- `apps/pc-optimizer/src/components/LoadingFallback.tsx` - Skeleton UI
- `apps/pc-optimizer/src/features/*/` - Async data loading
- `apps/pc-optimizer/src/features/*/ViewModel.ts` - Caching logic

### Backend
- `backend/src/avs_backend/system_information/__init__.py` - Static/dynamic separation
- `backend/src/avs_backend/startup/__init__.py` - Parallel scanning
- `backend/src/avs_backend/performance/live_monitor.py` - Optimized refresh
- `backend/src/avs_backend/disk_analyzer/__init__.py` - Drive selection
- `backend/src/avs_backend/duplicate_finder/__init__.py` - Drive selection
- `backend/src/avs_backend/cleaner/__init__.py` - Caching

### Build
- `backend/pyinstaller.spec` - Antivirus investigation
- Build configuration files

---

## Next Steps

1. Create performance measurement utilities
2. Measure baseline metrics
3. Implement module preloading and caching
4. Add skeleton loading states
5. Optimize heavy modules with async loading
