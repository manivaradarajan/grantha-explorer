// Enables React's `act()` environment detection in jsdom tests, silencing the
// "The current testing environment is not configured to support act(...)"
// warning when rendering React components in vitest's jsdom environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
