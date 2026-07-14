# Contributing to AVS Suite

Thank you for contributing. This document lists the minimum quality bars
every change must satisfy before merging.

## Workflow

1. Create a feature branch from `main`: `feat/<scope>-<short-desc>`.
2. Follow the [coding standards](./docs/standards/coding-standards.md).
3. Add / update unit tests (Vitest) and, for user-visible flows, e2e specs
   (Playwright).
4. Run `yarn lint && yarn typecheck && yarn test` locally.
5. Open a PR against `main`. CI must be green.

## Commit convention

Conventional Commits:

```
feat(pc-optimizer): add junk cleaner scan progress widget
fix(ui): correct focus ring contrast in dark mode
docs(core): document MVVM ViewModel lifecycle
```

## Code review checklist

- [ ] No Windows-specific logic in React components
- [ ] Public APIs typed and documented (TSDoc)
- [ ] Strings routed through `@avs/shared/i18n`
- [ ] Edition-gated features consult `@avs/shared/featureFlags`
- [ ] New folders include a `README.md`
- [ ] No hard-coded colors, spacing, or font sizes — use design tokens
