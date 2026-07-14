# Coding Standards

## TypeScript

* `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.
* Prefer `type` for aliases, `interface` for public structural contracts.
* No `any`. Use `unknown` + narrowing.
* `import type` for type-only imports.
* Public APIs must have TSDoc; internal helpers get a one-line comment.

## React

* Function components only.
* Components < 50 lines. If it grows, extract sub-components or move
  logic into a ViewModel.
* Hooks live in `hooks/`; feature-local hooks live under
  `features/<name>/hooks/`.
* No side effects in render. Use `useEffect` sparingly; prefer event
  handlers.

## Styling

* Never hard-code colours, radii, shadows, or motion values. Use
  Tailwind classes referencing CSS variables (`bg-surface`,
  `text-text-primary`).
* Compose class names with `clsx`.

## Testing

* Every ViewModel gets a Vitest spec.
* Every user-visible flow gets a Playwright spec.
* Python: `pytest` under `backend/tests/`.

## Commits

Conventional Commits (`feat`, `fix`, `docs`, `refactor`, `test`,
`chore`) with an optional scope (`pc-optimizer`, `ui`, `backend`, ...).

## Never do

* Don't call Node/Electron APIs from renderer code — go through the
  preload bridge.
* Don't call Windows APIs from JavaScript — go through JSON-RPC to
  Python.
* Don't inline emoji as icons. Use Heroicons.
* Don't add unrelated refactors to a feature PR.
