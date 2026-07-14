# cleaner/ — Junk Cleaner engine

Modular, scan-only junk detector. **Deletion is a separate feature and
lives in its own module.** This engine only enumerates candidates.

## Layers

```
cleaner/
├── interfaces.py       ICleaner, ScanStatus, CleanerResult, ScanItem
├── safe_paths.py       Forbidden roots, symlink / junction detection
├── scanner_base.py     BaseCleaner — os.scandir walker (BFS, non-recursive)
├── scan_manager.py     ScanManager — ThreadPoolExecutor, progress, cancel
├── cleaners/
│   ├── windows_temp.py
│   ├── user_temp.py
│   ├── recycle_bin.py
│   ├── thumbnail_cache.py
│   ├── prefetch.py
│   ├── windows_update_cache.py
│   ├── browser_cache.py
│   ├── crash_dump.py
│   └── log_file.py
└── __init__.py         RPC handlers (cleaner.list, scan.start/status/cancel/results)
```

## Safety guarantees

* **Whitelisted targets** — each cleaner declares its own roots.
* **Forbidden roots** — any traversal that resolves inside
  `C:\Windows\System32`, `WinSxS`, `Fonts`, `Boot`, `Program Files`,
  `Program Files (x86)`, `ProgramData\Microsoft\Windows Defender`
  is refused, even if a cleaner is misconfigured.
* **No symlink following** — symlinks *and* Windows junctions (reparse
  points) are always skipped.
* **Never throws** — every `OSError` is captured into
  `CleanerResult.errors` and traversal continues.
* **No recursion** — the walker uses an explicit `deque` frontier so
  pathologically deep trees cannot overflow the interpreter stack.

## Performance

* `os.scandir` + cached `DirEntry.stat(follow_symlinks=False)` — one
  syscall per file.
* `ScanManager` runs cleaners in parallel on a bounded
  `ThreadPoolExecutor` (default 4 workers — I/O-bound work).
* Cancellation checked once per 4 directories (tight) and once per
  1000 files (extra safety on large flat folders).
* Progress emitted per root, capped at 99 % during the walk. The final
  100 % tick lands after post-processing so the UI settles cleanly.

## RPC contract

| Method | Purpose |
|---|---|
| `cleaner.list` | Metadata catalog for the UI category rows. |
| `cleaner.scan.start` | Start scan (`{ only?: string[] }`) → `{ taskId }`. |
| `cleaner.scan.status` | Snapshot (per-cleaner + aggregate + ETA). |
| `cleaner.scan.cancel` | Co-operative cancellation (`{ taskId }`). |
| `cleaner.scan.results` | Paged details rows for one cleaner. |

The frontend polls `cleaner.scan.status` (~4 Hz while running). Polling
is deliberate — it keeps the JSON-RPC stdio channel single-threaded and
avoids any transport-level notification protocol.

## Adding a new cleaner

1. Create a file in `cleaners/`.
2. Subclass `BaseCleaner`, set `id/name/description/category`,
   implement `targets()`.
3. Register it in `cleaners/__init__.py::all_cleaners()`.

The base class provides the walker, error capture, cancellation, and
progress emission. A new cleaner is typically ~20 lines.
