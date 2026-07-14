# @avs/ui

AVS design-system.

* CSS custom properties in `src/styles/tokens.css` (light / dark / high-contrast / reduced-motion).
* Component primitives: `Button`, `Card`, `Badge`, `ProgressBar`, `StatTile`, `Skeleton`, `ThemeProvider`.
* Every component reads colours from `--avs-*` variables — never hard-coded.

Adding a new primitive: create the file under `src/components/`, export from `src/index.ts`, ensure it accepts a `className` prop and forwards through `clsx`.
