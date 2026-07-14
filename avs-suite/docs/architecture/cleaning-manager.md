# CleaningManager — Safe-clean engine

The **CleaningManager** turns a completed scan result into a set of
file deletions with strict safety guarantees. It mirrors the
[`ScanManager`](./module-architecture.md) shape so consumers learn
one mental model.

## Responsibilities

* Parallel execution of cleaners via a bounded `ThreadPoolExecutor`.
* Per-cleaner + aggregate progress, current-file tracking, ETA.
* Co-operative cancellation via a shared `threading.Event`.
* Retry with backoff for transient I/O errors (locked files, races).
* Persist every completed run to SQLite (`HistoryStore`).
* Never accept file paths from the renderer — candidates are always
  resolved through the `ScanManager` snapshot for the given
  `scan_task_id`.

## Two-phase safe-clean

```
┌────────────┐   preview()   ┌──────────────┐   execute()   ┌──────────────┐
│ scan_task  │ ────────────▶ │ CleaningPreview│ ─────────────▶│ CleaningTask │
└────────────┘               └──────────────┘               └──────────────┘
                                     ▲                              │
                                     │                              ▼
                                     └─── snapshot(cleaningTaskId)  polling
```

`preview()` runs every candidate path through
`ICleaner.validate()`. `execute()` re-runs validation and, for every
file, applies a **second** safety check immediately before deletion
(defence in depth against races between preview and delete).

## Safety guarantees (enforced twice)

| Rule | Where enforced |
|---|---|
| Path must be inside one of the cleaner's declared `targets()` | `validate()` **and** `_delete_one()` |
| Path must not sit under a forbidden Windows root (`System32`, `WinSxS`, `Program Files`, `Fonts`, `Boot`, `Windows Defender`) | Both phases |
| Symlinks / reparse points are never followed | Both phases |
| Only regular files are removed — directories are rejected | Validation |
| File must exist and be statable | Both phases |
| Every `OSError` is captured, never propagated | `_delete_one` |
| `PermissionError` triggers up to **3 retries** with 50 / 150 / 300 ms backoff | `_delete_one` |
| File that vanishes between stat and unlink is silently skipped (race with another process) | `_delete_one` |

## Threading model

* One worker thread per cleaner, capped at `DEFAULT_MAX_WORKERS = 4`.
* Cleaners run in parallel; files inside a single cleaner are removed
  sequentially so error accounting is deterministic per category.
* Cancellation is checked at every file, so worst-case latency to
  abort is one file-delete (< 1 ms typical).
* The `_lock` guards the `_task` singleton so `execute()`,
  `snapshot()`, `cancel()` are safe from any thread.

## HistoryStore

Small SQLite table (WAL mode) at `<AVS_DB_DIR>/cleaning-history.sqlite`
(falls back to `~/.avs/` in dev):

```
cleaning_log (
  id, started_at, finished_at, cleaner_id, cleaner_name, category,
  action, result, files_removed, bytes_recovered,
  files_skipped, files_failed, duration_ms, errors_json
)
```

Indexes on `started_at DESC`, `category`, `result` cover every UI
query. Error payloads are stored as JSON (`{count, sample: [..100]}`)
so a huge error list never bloats the row.

## RPC surface

| Method | Params | Result |
|---|---|---|
| `cleaner.clean.preview` | `{ taskId, only?: string[] }` | Per-cleaner counts + warnings |
| `cleaner.clean.execute` | `{ taskId, only?: string[] }` | `{ cleaningTaskId }` |
| `cleaner.clean.status`  | `{ cleaningTaskId? }` | Live snapshot |
| `cleaner.clean.cancel`  | `{ cleaningTaskId }` | `{ cancelled }` |
| `cleaner.clean.logs`    | `{ query?, category?, result?, offset?, limit? }` | Paged history |

`taskId` (from `cleaner.scan.start`) is the source of truth — the
renderer cannot inject arbitrary paths.

## What this module does NOT do

* **Undo.** `rollback_supported()` returns `False` for every built-in
  cleaner. A future rollback log lands in a separate ADR.
* **Registry cleaning.** Out of scope.
* **Scheduled cleaning.** Out of scope.
* **Recycle Bin API deletion via `SHFileOperation`.** The
  `RecycleBinCleaner` currently uses `os.remove` per-file; a
  Windows-native shell integration lands with the "empty via shell"
  refinement.
