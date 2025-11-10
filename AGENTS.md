# Repository Guidelines

- Keep modal presentation CSS-driven. Do not add inline height or width mutations from JavaScript helpers; prefer utility classes and existing stylesheets for layout adjustments.
- Avoid synchronous layout reads (e.g., `window.innerHeight`, `getBoundingClientRect`, `offsetHeight`) inside modal open/close flows. If viewport measurements are required, cache them during `resize` events and reuse the cached values.
- Stabilise modal content with CSS techniques such as skeleton states or minimum-height classes rather than JavaScript style mutations. Extend the existing `modal-content--mapping-editor` pattern when adding new modals that need placeholders.
