# Code Map

Index of non-obvious code locations — features whose implementation is spread
across files or doesn't match an obvious name.

## Reference hover tooltip

Hover-to-preview tooltip for cross-text citations.

- `components/ReferenceLink.tsx` — client component rendered per citation
  - `handleMouseEnter` → `openTooltip()` after `HOVER_DELAY_MS` (400ms)
  - `openTooltip` loads preview via `getPassagePreview` (`lib/references.ts`), then shows tooltip
  - `loadTooltipContent` builds card: title + locator header + preview text; when `sourceLookback` is set, `findQuotedSpan` (`lib/quotedMatch.ts`) fuzzy-matches the source window against the preview and highlights the quoted span (`<mark class="reference-tooltip-mark">`)
  - Tooltip is a React portal to `document.body`, positioned via `useLayoutEffect` edge-anchored to the citation
- Styling: `.reference-tooltip` / `.tooltip-*` classes; `.reference-tooltip-mark` for the quote highlight
- Wired into commentary rendering via `renderCommentaryWithReferences` and `renderMulaWithReferences` (`components/renderCommentary.tsx`), which thread `sourceLookback` (`rawText.slice(max(0, ref.start - MAX_LOOKBACK), ref.start)`) into each `ReferenceLink`
- `lib/quotedMatch.ts` — needle→haystack fuzzy quote match (Smith–Waterman local alignment); `buildMatchString` (NFC + strip + whitespace collapse, with original-index map), `findQuotedSpan` returns the haystack span to highlight; `clampToGraphemeBoundaries` (via `Intl.Segmenter`) prevents splitting a syllable (no dotted circle); span edges trimmed of punctuation/dandas; `MAX_COVERAGE=0.8` suppresses whole-passage highlights as noise (coverage measured against content, stripping inline verse-number chrome like " ॥ १-४-८ ॥"); `MAX_LOOKBACK=60`, `MIN_MATCH_CHARS=10`, `MIN_SIMILARITY=0.7`
