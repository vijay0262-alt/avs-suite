# Module — `<name>`

> Copy this file into `docs/modules/<name>.md` when starting a new
> feature. Fill every section before opening the first PR.

## Purpose

One-paragraph description of what this module does and for whom.

## RPC surface

| Method | Params | Result | Notes |
|---|---|---|---|
| `<module>.<verb>` | ... | ... | ... |

## UI entry points

* Sidebar: `<yes/no>` (`nav.<key>` in i18n)
* Command palette: `<yes/no>`
* Dashboard widget: `<yes/no>`

## Edition gating

Requires: `FEATURES.<KEY>` — declared in
`packages/shared/src/featureFlags/index.ts`.

## Windows APIs used

* Registry keys: ...
* WMI queries: ...
* Files touched: ...
* Elevation required: ...

## Failure modes

Describe each `RpcError` this module may raise and the recommended UX
response.

## Tests

* Unit (ViewModel): `apps/pc-optimizer/src/features/<name>/__tests__/`
* Integration (Python): `backend/tests/test_<name>.py`
* E2E: `tests/e2e/<name>.spec.ts`
