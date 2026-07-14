# Theming

The visual language is defined **once** in
`packages/shared/src/tokens/index.ts` and mirrored as CSS variables in
`packages/ui/src/styles/tokens.css`.

* Tailwind classes reference the CSS variables (see
  `apps/pc-optimizer/tailwind.config.js`). Never add hex colours to
  Tailwind directly.
* `<ThemeProvider>` writes `data-theme="light" | "dark"` on `<html>`;
  the CSS variables swap. No React re-render required.
* `prefers-reduced-motion` and `forced-colors: active` are honoured.

## Adding a colour

1. Add the token to `packages/shared/src/tokens/index.ts`.
2. Add the CSS variable to `packages/ui/src/styles/tokens.css` (both
   `:root` and `:root[data-theme='dark']`).
3. Reference it in Tailwind config if it needs a utility class.
