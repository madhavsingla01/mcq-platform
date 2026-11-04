# AGENTS.md — QuizFocus Design Engineering Guidelines

This repository follows high-craft design engineering and animation principles derived from Emil Kowalski's philosophy:

- **Installed Skills**: Check `.agents/skills/` for `emil-design-eng`, `animate`, `apple-design`, `mobile-native`, `review-animations`, `animation-performance`, `ask-sonner`, `pick-ui-library`, and `break-ui`.
- **Motion Standards**:
  - Always use `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`, and `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`.
  - UI animations must remain $\le 300\text{ms}$.
  - Never animate layout properties (`width`, `height`, `margin`, `padding`, `top`, `left`). Animate `transform` and `opacity` only.
  - Scale from `0.95`, never `scale(0)`.
  - Popovers scale from trigger (`transform-origin: var(--transform-origin, top)`), modals stay centered.
- **Mobile Native Polish**:
  - `-webkit-tap-highlight-color: transparent`
  - `touch-action: manipulation`
  - All input/textarea/select elements must have `font-size: 16px` minimum to prevent iOS zoom
  - `:active { transform: scale(0.97); }` on buttons and options
  - Gate `:hover` with `@media (hover: hover) and (pointer: fine)`
- **Notifications**:
  - Use `sonner` via `toast.success()`, `toast.error()`, `toast.promise()` with dark G2 squircle styling.
