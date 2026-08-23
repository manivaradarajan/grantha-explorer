# Code Map

Index of non-obvious code locations — features whose implementation is spread
across files or doesn't match an obvious name.

## Reference citation panel

Click/tap a cross-text citation to open a docked, non-modal preview panel at
the bottom of the reading surface's scroll container. Replaces the old
hover-tooltip. No hover-to-reveal.

- `components/CitationPanel.tsx` — the panel + its mount
  - `CitationPanelHost` IS the flex-column wrapper: provider + `<div>{scrollArea}<CitationPanel/></div>`, so the context is an ancestor of the links and the panel is a block sibling of the scroll area (width tracks the container structurally)
  - `useCitationPanel` consumed by `ReferenceLink`; `openCitation(request)` carries `{reference, targetTitle, locatorLabel, linkable, availableGranthaIds, navigate, sourceLookback}`
  - `surfaceKey` prop: host closes the citation via effect when it changes (grantha/verse/sheet state) — single source of truth for `onExpandedChange`
  - `heightCapVh` (cap) + `minHeightVh` (floor so short passages still pop up) + `panelWidthClass` (match the reading column, not the window)
  - `requestId` latest-wins guard so a slow earlier fetch never overwrites a newer citation
  - Content loaded via `getPassagePreview` (`lib/references.ts`); quote highlight via `findQuotedSpan` (`lib/quotedMatch.ts`) when `sourceLookback` present
- `components/ReferenceLink.tsx` — pure click/tap trigger (no hover): `renderPlain` gate (unresolved → plain text), `linkable` gate, `recordDiagnostic` on not-in-library click, `navigate` (→ Promise<bool>)
- Docked in: `components/FlowReader.tsx` (`:923` wrapper; `panelWidthClass={contentWidthClass}`; mobile fixed via `.flow-reader { height: 100dvh }`) and `components/CommentaryPanel.tsx` (`:211` root), which also serves the mobile sheet (`components/BottomSheet.tsx` grows `h-[80vh]` → `h-[85vh]` via `heightClass` when a citation is open — `components/MobileLayout.tsx`)
- Styling: `.citation-panel` (max-height collapse + flex column + width/center), `.citation-header`, `.citation-source` (header-as-navigate-button, hover-tinted), `.citation-close`, `.citation-content`, `.citation-mark`
- Wired into commentary rendering via `renderCommentaryWithReferences` / `renderMulaWithReferences` (`components/renderCommentary.tsx`), which thread `sourceLookback` (`buildSourceWindow`, `lib/quotedMatch.ts`) into each `ReferenceLink`
- `lib/quotedMatch.ts` — needle→haystack fuzzy quote match (Smith–Waterman local alignment); `buildMatchString` (NFC + strip + whitespace collapse, with original-index map), `findQuotedSpan` returns the haystack span to highlight; `clampToGraphemeBoundaries` (via `Intl.Segmenter`) prevents splitting a syllable (no dotted circle); span edges trimmed of punctuation/dandas; `MAX_COVERAGE=0.8` suppresses whole-passage highlights as noise (coverage measured against content, stripping inline verse-number chrome like " ॥ १-४-८ ॥"); `MAX_LOOKBACK=60`, `MIN_MATCH_CHARS=10`, `MIN_SIMILARITY=0.7`
