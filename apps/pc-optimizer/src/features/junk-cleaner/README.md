# features/junk-cleaner

Junk Cleaner MVP — **scan only**, deletion is a separate module and
ships in the next milestone.

## Layout

```
features/junk-cleaner/
├── JunkCleanerPage.tsx         The View — thin, reads from ViewModel
├── JunkCleanerViewModel.ts     MVVM state machine + poll driver
├── junkCleaner.service.ts      Typed RPC wrapper (dependency-injected)
├── junkCleaner.types.ts        DTOs mirroring backend JSON
├── components/
│   ├── CategoryRow.tsx         One row per cleaner (icon / label / status / bytes)
│   ├── DetailsTable.tsx        Virtualised (react-window) results table
│   └── ScanProgress.tsx        Total junk / files / current cleaner / ETA
└── __tests__/
    └── JunkCleanerViewModel.test.ts   Vitest suite (7 scenarios)
```

## Data flow

```
Page  ──useViewModel──▶  JunkCleanerViewModel
                            │
                            │  service.startScan / getStatus / cancel
                            ▼
                        junkCleanerService  (window.avs.rpc)
                            │
                            ▼
                        Electron preload → IPC → Python child (JSON-RPC)
```

* The View never calls RPC directly — everything goes through the
  ViewModel so we can stub the service in tests.
* Polling frequency: 250 ms while a scan is running.
* Details are chunk-loaded 500 rows at a time and rendered by
  `react-window` for constant memory / paint time even at 1M+ rows.

## Edition gating

Requires `FEATURES.JUNK_CLEANER_BASIC` (Free tier and above).
Deeper heuristics (registry scanning, application caches) will be
introduced in later builds behind `FEATURES.JUNK_CLEANER_DEEP` (Pro+).

## Testing

Backend: `backend/tests/test_cleaner_engine.py` and
`backend/tests/test_scan_manager.py` (13 tests total).
Frontend: `__tests__/JunkCleanerViewModel.test.ts` (7 tests).
