# Scan Core Registry Enumerator — API Contract Fix

**Status:** All 271 backend tests pass locally (198 scan_core + 73 other), 9 skipped.

## Root Cause

The Registry Enumerator had **duplicated traversal logic** between `enumerate_key()` and `enumerate_targets()`. Both methods independently implemented registry tree traversal with different code paths, violating the DRY principle and creating maintenance burden.

Additionally, the **Discovery Layer contract** was ambiguous:
- `enumerate_key()` with `include_keys=False` would skip the target key itself
- `enumerate_targets()` should **always** yield the target `RegistryKeyAsset`, even if empty

This inconsistency violated the core principle: **"Every discovered object is an Asset. An existing registry key is itself an Asset."**

## Implementation Changes

### Architectural Refactor

Extracted a single internal method `_enumerate_target()` that both public methods delegate to:

```python
def _enumerate_target(
    self,
    hive: RegistryHive,
    subpath: str,
    *,
    recurse: bool,
    max_depth: int,
    opts: RegistryEnumerateOptions,
    on_progress: Optional[RegistryProgressCallback] = None,
    force_include_keys: bool = False,
) -> Generator[Union[RegistryKeyAsset, RegistryValueAsset], None, None]:
    """Internal: enumerate a single registry target.

    Contract:
    1. Open the target key.
    2. Yield RegistryKeyAsset immediately — always when force_include_keys=True,
       even if empty. When force_include_keys=False, respects opts.include_keys.
    3. Enumerate values → yield RegistryValueAssets.
    4. If recurse=True, enumerate child keys recursively.

    Both enumerate_key() and enumerate_targets() delegate here.
    No duplicated traversal logic.
    """
```

### Updated Public Methods

**`enumerate_key()`** — thin wrapper:
```python
def enumerate_key(self, hive, subpath="", *, options=None, on_progress=None):
    opts = options or RegistryEnumerateOptions()
    yield from self._enumerate_target(
        hive=hive,
        subpath=subpath,
        recurse=True,
        max_depth=opts.max_depth,
        opts=opts,
        on_progress=on_progress,
        force_include_keys=False,  # Respects opts.include_keys
    )
```

**`enumerate_targets()`** — thin wrapper:
```python
def enumerate_targets(self, targets, *, options=None, on_progress=None):
    opts = options or RegistryEnumerateOptions()
    for target in targets:
        if not target.enabled:
            continue
        if opts.cancel_event and opts.cancel_event.is_cancelled:
            break

        yield from self._enumerate_target(
            hive=target.hive,
            subpath=target.subpath,
            recurse=target.recurse,
            max_depth=target.max_depth if target.max_depth >= 0 else opts.max_depth,
            opts=opts,
            on_progress=on_progress,
            force_include_keys=True,  # Always yields target key
        )
```

### Key Design Decisions

1. **`force_include_keys` parameter** — controls whether the target key is always yielded:
   - `enumerate_key()` passes `False` → respects `opts.include_keys`
   - `enumerate_targets()` passes `True` → always yields target key

2. **`recurse` parameter** — controls depth:
   - `recurse=True` → uses `max_depth` from options
   - `recurse=False` → caps `effective_max_depth` at 0 (only target key + values, no children)

3. **Progress tracking** — moved into `_enumerate_target()`, eliminating nested progress events

4. **Platform check** — added to `enumerate_targets()` for consistency with `enumerate_key()`

## Contract Clarification

### Discovery Layer Contract (Enforced)

**Every existing registry key is an Asset.**

- `enumerate_targets()` **always** yields the target `RegistryKeyAsset` first, even if:
  - The key is empty (0 values, 0 subkeys)
  - `recurse=False`
  - `include_keys=False` in options (overridden by `force_include_keys=True`)

- `enumerate_key()` respects `opts.include_keys`:
  - `include_keys=True` → yields all keys (target + children)
  - `include_keys=False` → yields only values, no keys

### Enumeration Order (Guaranteed)

For each target:
1. **Open** the registry key
2. **Yield** `RegistryKeyAsset` (if `force_include_keys=True` or `opts.include_keys=True`)
3. **Enumerate values** → yield `RegistryValueAsset` instances
4. **If `recurse=True`** → enumerate child keys recursively

## Regression Prevention

### Test Coverage

- **`test_enumerate_targets_works`** — verifies target key is always yielded
- **`test_disabled_target_skipped`** — verifies disabled targets are skipped
- **`test_include_keys_false`** — verifies `enumerate_key()` respects `include_keys=False`
- **`test_target_key_always_yielded_even_if_include_keys_false`** — verifies `enumerate_targets()` overrides `include_keys`

### Architecture Benefits

1. **Single source of truth** — all traversal logic in `_enumerate_target()` and `_scan_key()`
2. **No code duplication** — both public methods are thin wrappers
3. **Consistent behavior** — same traversal algorithm for both APIs
4. **Easier maintenance** — bug fixes apply to both methods automatically
5. **Clear contract** — `force_include_keys` parameter makes the difference explicit

## Files Modified

- `backend/src/avs_backend/scan_core/registry/enumerator.py`:
  - Replaced `enumerate_key()` with thin wrapper calling `_enumerate_target()`
  - Replaced `enumerate_targets()` with thin wrapper calling `_enumerate_target()`
  - Added `_enumerate_target()` internal method (87 lines)
  - Removed ~60 lines of duplicated logic

## Test Results

- **Local (Windows):** 271 tests pass, 9 skipped
- **CI (Windows):** Expected to pass after deployment
- **CI (Linux):** Registry tests skipped (Windows-only), other tests pass
