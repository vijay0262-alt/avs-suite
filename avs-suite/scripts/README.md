# scripts/

Cross-platform maintenance scripts written in Python so they run on any
developer OS. Node scripts live inside the workspace they belong to
(`apps/*/package.json`).

| Script | Purpose |
|---|---|
| `dev.py` | Start Vite + Electron together for local development |
| `bundle_backend.py` | Produce a PyInstaller bundle of the Python backend |
