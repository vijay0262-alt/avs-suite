# database/

Runtime SQLite files live here (in dev). At runtime the Electron main
process points the backend at `<userData>/database/` so end users never
see this folder — it exists only so a fresh clone has a place for local
development databases.
