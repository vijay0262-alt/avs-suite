# logs/

Local development log files. In a packaged build, logs go to
`<userData>/logs/avs-*.log` with rotation (5 MiB × 5 archives).

Configuration lives in `apps/pc-optimizer/electron/logger/logger.ts`
(TypeScript / electron-log) and
`backend/src/avs_backend/common/logging_setup.py` (Python / logging).
