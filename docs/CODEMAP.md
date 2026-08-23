# Code Map

Index of non-obvious code locations — features whose implementation is spread
across files or doesn't match an obvious name.

## Reference citation panel

Click/tap a cross-text citation to open a non-modal preview card that floats
over the bottom of the reading surface's scroll container (absolute overlay —
the reading column keeps its full height, text scrolls beneath). Replaces the
old hover-tooltip. No hover-to-reveal. Dismissed by ✕, Escape, or clicking
anywhere outside the card.

- `components/CitationPanel.tsx` — the panel + its mount
  - `CitationPanelHost` IS the flex-column wrapper: provider + `<div>{scrollArea}<CitationPanel/></div>`, so the context is an ancestor of the links and the panel is an absolutely positioned child of the wrapper. Children may be a render-prop `(sourceHighlight) => …` so the reading surface can steel-blue-mark the quoted span in the source while the card is open
  - `useCitationPanel` consumed by `ReferenceLink`; `openCitation(request)` carries `{reference, targetTitle, locatorLabel, linkable, availableGranthaIds, navigate, sourceLookback, sourcePassageRef, sourceSpan}`
  - `surfaceKey` prop: host closes the citation via effect when it changes (grantha/verse/sheet state) — single source of truth for `onExpandedChange`
  - Card size is pure CSS: `--citation-width` / `--citation-max-height` / `--citation-min-height` custom properties on `.citation-panel` (app/globals.css) — one place to tune width/height; panes/tablet (`commentary-pane`) and the mobile sheet (`bottom-sheet`) override the height vars
  - `requestId` latest-wins guard so a slow earlier fetch never overwrites a newer citation
  - Content loaded via `getPassagePreview` (`lib/references.ts`); quote highlight via `findQuotedSpan` (`lib/quotedMatch.ts`) when `sourceLookback` present
- `components/ReferenceLink.tsx` — pure click/tap trigger (no hover; `external-reference` = unresolvable-in-library, fully inert on hover): `renderPlain` gate (unresolved → plain text), `linkable` gate, `recordDiagnostic` on not-in-library click, `navigate` (→ Promise<bool>)
- Docked in: `components/FlowReader.tsx` (`:923` wrapper; CSS `--citation-width` — 42rem, inset narrower than the reading column; mobile fixed via `.flow-reader { height: 100dvh }`) and `components/CommentaryPanel.tsx` (`:211` root), which also serves the mobile sheet (`components/BottomSheet.tsx` grows `h-[80vh]` → `h-[85vh]` via `heightClass` when a citation is open — `components/MobileLayout.tsx`)
- Styling: `.citation-panel` (absolute float-over at the host bottom + flex column + centered max-width + warm-paper card surface with rounded top and elevation), `.citation-header`, `.citation-source` (header-as-navigate-button, hover-tinted; full-bleed titlebar hover; title/locator at body text size; `.citation-source-icon` = open arrow), `.citation-close`, `.citation-content`, `.citation-mark` (yellow preview highlight), `mark.citation-source-mark` (steel-blue source-bhashya highlight while the card is open)
- Wired into commentary rendering via `renderCommentaryWithReferences` / `renderMulaWithReferences` (`components/renderCommentary.tsx`), which thread `sourceLookback` + `sourceWindowStart` (`buildSourceWindow`, `lib/quotedMatch.ts`) into each `ReferenceLink`; the open citation's quoted span is marked in the source via the host's render-prop `(sourceHighlight) => …`
- `lib/quotedMatch.ts` — needle→haystack fuzzy quote match (Smith–Waterman local alignment); `buildMatchString` (NFC + strip + whitespace collapse, with original-index map), `extractEnclosedQuote` (last `**…**`/`‘…’` pair near the window end — the exact quoted span, matched first; whole window falls back), `buildSourceWindow` returns `{text, start}`; `findQuotedSpan` returns the haystack span to highlight; `clampToGraphemeBoundaries` (via `Intl.Segmenter`) prevents splitting a syllable (no dotted circle); span edges trimmed of punctuation/dandas; `MAX_COVERAGE=0.8` suppresses whole-passage highlights as noise (coverage measured against content, stripping inline verse-number chrome like " ॥ १-४-८ ॥"); `MAX_LOOKBACK=60`, `MIN_MATCH_CHARS=10`, `MIN_SIMILARITY=0.7`
