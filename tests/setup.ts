// Enables React's `act()` environment detection in jsdom tests, silencing the
// "The current testing environment is not configured to support act(...)"
// warning when rendering React components in vitest's jsdom environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// jsdom does not implement `window.matchMedia` (used by `useMediaQuery`).
// Default `matches` to false so ReferenceLink takes the touch/coarse path in
// tests; tests that need the desktop path override `window.matchMedia`.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
