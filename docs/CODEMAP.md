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

## Per-block mula presentation (`passage.kind`)

How a main passage decides whether to render as decorated verse or
undecorated prose. Presentation is a **total, pinned function** of the
passage's declared `kind` (the markdown heading word, stamped into the data by
both converters) — never inferred, never a silent default. See
`../grantha-data/docs/DESIGN_SCHOOL_NAMESPACES.md` for the type framing.

- `lib/data.ts` — the runtime type + mapping:
  - `Passage.kind` (declared kind, main passages only)
  - `presentationFor(kind)` — exhaustive switch, **throws** on an unknown kind
  - `KNOWN_PASSAGE_KINDS` — the pinned classification
  - `MULA_PRESENTATION` — wrapper/text classes per `"prose" | "verse"`
- `components/FlowReader.tsx` — the mūla block derives
  `mulaPresentation = MULA_PRESENTATION[presentationFor(passage.kind)]` and
  `mulaIsVerse`; applies them to the wrapper, font classes, and the `॥ N ॥`
  gating. `FlowReaderCompare` mūla rows are unreachable for mula-only texts.
- Consumer converter: `scripts/convert_structured_md.py` — `PassageData.kind`
  (leaf headings only), `_build_main_passage_entry` emits it on main passages.

## Edition kind (`edition_kind`) — the pane gate

Declared classification of an edition ("mula-only" | "commentarial") derived
at build time from commentary presence and stamped into committed data. Gates
the commentary pane/chrome; does not drive per-block presentation.

- `lib/data.ts` — `EditionKind`, `deriveEditionKind` (legacy fallback),
  `hasCommentary` unified onto the typed field; `loadGrantha` stamps
  `edition_kind` in both return paths (multipart `partialGrantha`, single-file
  `data`).
- Pane consumers: `app/page.tsx`, `components/TabletLayout.tsx`,
  `components/MobileLayout.tsx` (all via `hasCommentary`).
- Consumer producers: `scripts/convert_structured_md.py`
  (`build_envelope_json` gained `edition_kind`; `convert_grantha` computes it
  from per-part commentary), `scripts/import_editions.py` (same, multi-edition).

## Validators = type checker

- `scripts/validate-data.ts` — `checkPassageKinds` (kind presence +
  classification on main, none on framing), `checkEditionKindCoherence`
  (stamp vs per-part commentary; cross-file, run once over the library).
- `scripts/validate_data.py` — parallel Python: `_check_passage_kinds`,
  `_check_edition_kind_coherence`.
- Cross-converter equivalence: `../grantha-data/tools/lib/grantha_converter/test_v2_cross_converter.py`.

## On-disk presentation invariants (tests)

- `tests/integration/mula-presentation.test.ts` and
  `scripts/tests/test_presentation_facts.py` — pin `kind` + `edition_kind`
  over the committed `public/data/library` tree.
- `components/FlowReader.test.tsx` — prose vs verse rendering regression.
- `lib/data.test.ts` — `presentationFor` / `deriveEditionKind` units.
