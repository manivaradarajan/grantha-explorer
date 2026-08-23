# Code Map

Index of non-obvious code locations — features whose implementation is spread
across files or doesn't match an obvious name.

## Reference citation popover

Hover (peek) or click/tap (pinned) a cross-text citation to open a compact
floating "Look Up" popover anchored to the reference's on-screen rectangle.
Portaled to `document.body`, `position: fixed`, so it is never clipped by a
scroll container and never participates in layout. Exactly one popover at a
time; activating another reference updates it in place.

- `components/CitationPanel.tsx` — the popover + its mount
  - `CitationPanelHost` holds the single-popover state `{citation, mode:
    "peek" | "pinned", anchorEl}`; children may be a render-prop
    `(sourceHighlight) => …` so the reading surface steel-blue-marks the quoted
    span in the source while the popover is open
  - `useCitationPanel` consumed by `ReferenceLink`; `openCitation(request,
    anchorEl, mode)` carries `{reference, targetTitle, locatorLabel, linkable,
    availableGranthaIds, navigate, resolveRef, sourceLookback,
    sourceWindowStart, sourcePassageRef, sourceSpan}`
  - `CitationPopover`: positioning (below → above → `forced-*`, horizontal
    centered + viewport clamp via `--citation-viewport-margin`), pointer tail
    (clean placements only), `ResizeObserver` + resize/orientation/content
    repositioning, hover close-grace (`scheduleClose`/`cancelClose`), Escape +
    focus restore, scroll/outside dismiss, latest-wins `requestId`
  - Footer actions: "Copy citation" (`navigator.clipboard` +
    `formatCitation`/`buildHash`, inline checkmark ~1.6s, never dismisses) and
    "Open passage" (same navigation as the header title-action)
  - Size/style is pure CSS knobs on `.citation-popover` (app/globals.css):
    `--citation-width`, `--citation-max-width`, `--citation-viewport-margin`,
    `--citation-radius`, `--citation-shadow`, `--citation-bg`,
    `--citation-tail-size`, `--citation-clamp-lines`, `--citation-title-size`,
    `--citation-excerpt-size` — one place to re-skin
- `components/ReferenceLink.tsx` — the focusable trigger: hover peeks after
  `HOVER_OPEN_DELAY_MS` (150ms), click/tap/Enter/Space pins, focus pins (keyboard
  path); `renderPlain` gate (unresolved → plain text), `linkable` gate,
  `recordDiagnostic` on not-in-library click, `navigate`/`resolveRef`
  (`loadGrantha` → `resolveReferenceTarget` → `updateHash`)
- Mounted once per surface via `CitationPanelHost`: `components/FlowReader.tsx`
  (`:923` wrapper) and `components/CommentaryPanel.tsx` (`:211` root, covers
  desktop 3-pane, tablet, and the mobile bottom sheet)
- Styling: `.citation-popover` (+ `.below`/`.above`/`forced-*` placement
  classes), `.citation-tail`, `.citation-header`, `.citation-title-action`,
  `.citation-close`, `.citation-excerpt` (+ `.citation-excerpt-clamp`),
  `.citation-action`, `.citation-mark` (yellow preview highlight),
  `.citation-source-mark` (steel-blue source-text highlight)
- Wired into commentary rendering via `renderCommentaryWithReferences` /
  `renderMulaWithReferences` (`components/renderCommentary.tsx`), which thread
  `sourceLookback` (`buildSourceWindow`, `lib/quotedMatch.ts`) into each
  `ReferenceLink`
- `lib/quotedMatch.ts` — needle→haystack fuzzy quote match (Smith–Waterman local
  alignment); `buildMatchString` (NFC + strip + whitespace collapse, with
  original-index map), `extractEnclosedQuote` (delimited **…**/quote-pair span),
  `findQuotedSpan` returns the haystack span + source-side coordinates;
  `clampToGraphemeBoundaries` (via `Intl.Segmenter`) prevents splitting a
  syllable (no dotted circle); `MAX_COVERAGE=0.8` suppresses whole-passage
  highlights; `MAX_LOOKBACK=60`, `MIN_MATCH_CHARS=10`, `MIN_SIMILARITY=0.7`
