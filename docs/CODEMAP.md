# Code Map

Index of non-obvious code locations — features whose implementation is spread
across files or doesn't match an obvious name.

## Reference hover tooltip

Hover-to-preview tooltip for cross-text citations.

- `components/ReferenceLink.tsx` — client component rendered per citation
  - `handleMouseEnter` → `openTooltip()` after `HOVER_DELAY_MS` (400ms)
  - `openTooltip` loads preview via `getPassagePreview` (`lib/references.ts`), then shows tooltip
  - `loadTooltipContent` builds card: title + locator header + preview text
  - Tooltip is a React portal to `document.body`, positioned via `useLayoutEffect` edge-anchored to the citation
- Styling: `.reference-tooltip` / `.tooltip-*` classes
- Wired into commentary rendering via `renderCommentaryWithReferences` and `renderMulaWithReferences` (`components/renderCommentary.tsx`)
