# Accessibility

The application ships to a broad audience including users with
motor, visual, and cognitive impairments. Non-negotiable:

* **Keyboard navigation** — every interactive element reachable with
  `Tab` and operable with `Enter` / `Space`. Focus ring uses
  `--avs-focus-ring` (never removed with `outline: none` unless a
  `focus-visible` alternative is provided).
* **Colour contrast** — WCAG 2.1 AA (4.5:1 for body text, 3:1 for large
  text and UI components). Dark mode palette is tuned; new colours must
  pass an automated check.
* **High-contrast mode** — Windows `forced-colors: active` is honoured
  (see `tokens.css`).
* **Reduced motion** — `prefers-reduced-motion` disables durations.
* **Scalable text** — no fixed pixel font sizes on body copy; use
  `rem`-based Tailwind scale.
* **Semantic HTML** — buttons are `<button>`, headings follow document
  order (`h1` per page), forms use `<label>`.
* **ARIA** — used only when semantic HTML cannot express the state
  (progress bars use `role="progressbar"`, error boundary uses
  `role="alert"`).
* **Screen readers** — every icon-only button has an accessible name
  (`aria-label` or visually-hidden text).
