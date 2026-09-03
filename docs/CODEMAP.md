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
  alignment); `buildMatchString` (NFC + strip + whitespace collapse + virama
  elision, with original-index map), `extractEnclosedQuote` (delimited **…**/
  quote-pair span), `findQuotedSpan` returns the haystack span + source-side
  coordinates; `clampToGraphemeBoundaries` (via `Intl.Segmenter`) prevents
  splitting a syllable (no dotted circle); `MAX_LOOKBACK=60`,
  `MIN_MATCH_CHARS=10`, `MIN_SIMILARITY=0.7`

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

## Verse-quote blocks (`verse_quotes`) — mula-prose embedded citations

Prose-mula texts (vedarthasangraha) embed quoted verses. The producer
(grantha-data normalizer `wrap_verse_quotes`) wraps each quote in
`<!-- verse-quote -->` markers and stamps `passage.verse_quotes` as
`{start,end}` half-open offsets into `content.sanskrit.devanagari`; adjacent
blocks are separated by a blank line (each block = one distinct quote). The
renderer hang-indents each block and sub-indents even pādas of ≥4-pāda verses.

- `components/renderCommentary.tsx` — `renderMulaWithReferences` interleaves
  `.verse-quote` divs with `.flow-mula-prose` divs; `renderVerseQuote` splits
  pādas (per-pāda absolute offsets keep refs/highlights aligned);
  `renderMulaProse` renders prose + refs with the steel-blue source highlight.
- `components/FlowReader.tsx` — the mūla block is a `<div>` (not `<p>`) and
  passes `passage.verse_quotes` through.
- `lib/data.ts` — `Passage.verse_quotes?: {start,end}[]`.
- Producer rules: `grantha-data/tools/scripts/devanagari_normalize/normalize.py`
  (`wrap_verse_quotes` — ॥-anchor, standalone single-danda pāda, ref-change
  merge-split) and both converters' `verse_quotes` extraction.

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

## Citation-repair analysis + matcher parity

## Quote sidecar (`reference.quote`)

- Committed sidecars live under `public/data/sidecars/<grantha_id>/citation_quotes.json`
  — per-passage quote spans stamped into `reference.quote` by the converter.
  They annotate the `references[]`-bearing library JSON produced here (not the
  grantha-data markdown), so this repo owns them.
- `scripts/convert_structured_md.py:_quote_sidecar_for` reads a grantha's
  sidecar from `public/data/sidecars/<grantha_id>/` (via the explorer root);
  absent sidecar → no quote stamping (graceful).
- Regenerate from the grantha-data `citation-quotes` tool after materializing
  (`--out public/data/sidecars/<grantha_id>/citation_quotes.json`).


- `../grantha-data/tools/lib/grantha_data/citation_repair.py` — the Python
  citation-repair classifier (verbatim port of `lib/quotedMatch.ts`'s
  `findQuotedSpan`) + `classify`/`analyze`/`build_overlay`/`apply_overlay`;
  CLI `citation-repair`.
- `scripts/citation-matcher-conformance.mjs` — live-TS matcher bridge for the
  parity conformance test (`GRANTHA_MATCHER_NO_ICU=1` forces the manual
  grapheme scan).
- `scripts/convert_structured_md.py` — `_apply_citation_overlay` /
  `_load_citation_overlay` apply the corrections overlay (grantha-data
  `data/citation_corrections.yaml`) to emitted references; unmatched keys are
  loud diagnostics.
- Parity contract: `docs/CITATION_MATCHER_PARITY.md` (mirror of
  `../grantha-data/docs/CITATION_MATCHER_PARITY.md`) — any
  `lib/quotedMatch.ts` constant/rule change must ship the matching Python
  change + mirrored test.

## Edit mode (`?m=edit`) — code-review-style annotations

A hash mode where the reviewer selects text / clicks citations / annotates
lines, and comments persist to a timestamped session JSON in grantha-data.

- `app/page.tsx` — `mode === "edit"` branch renders `EditReader`.
- `components/review/EditReader.tsx` — wraps `FlowReader` in `ReviewModeProvider`,
  computes per-passage review marks (re-located by snippet), overlays the
  toolbar + right-hand comment list.
- `components/review/ReviewModeProvider.tsx` — loads/upserts the session
  (`fetchSession`/`upsertComment`/`setCommentStatus`/`startNewSession`),
  computes `detached` comments and review highlights.
- `components/review/ReviewSelectionToolbar.tsx` — the floating "add/edit
  comment" popup: kind picker, body, suggested locator; maps the selection to
  raw offsets via `lib/selectionToOffset.ts`.
- `components/review/ReviewCommentList.tsx` — right panel: status chips, done/
  dismiss, "new review", drift/detached badges.
- `components/review/reviewServer.ts` — HTTP client for the local review server.
- `lib/selectionToOffset.ts` — maps a DOM selection back to raw
  `content.sanskrit.devanagari` offsets via the renderer's
  `data-offset-start/end` annotations (exact, or widened, or loud error).
- `components/renderCommentary.tsx` — `annotated()` wraps every emitted slice
  in `data-offset-start/end` spans; `ReviewMarkSpec` paints `.review-mark` on
  the surface (threaded via `renderMulaWithReferences` /
  `renderCommentaryWithReferences` `reviewMarks` param).
- `scripts/review-server.mjs` — standalone dep-free Node server (port 4321)
  persisting sessions to `../grantha-data/structured_md/<grantha_id>/reviews/`;
  resolves `source_file` + `validation_hash` from the real md; hardened
  (127.0.0.1, origin allowlist, payload validation). Run with `npm run
  review:server`.
- Schema/handoff contract: `../grantha-data/docs/REVIEW_COMMENTS_SCHEMA.md`.

## Front matter + category dividers (flow reader)

How prefatory/concluding items decide their treatment, and the divider that
separates the three content categories. Purely per-item structural — no
grantha-level "prose text" flag.

- `components/FlowReader.tsx` — the `!isMain` (framing) branch checks
  `passage.verses` (the `<!-- verse -->` markers): non-empty → the verse-quote
  treatment via `renderMulaWithReferences`; empty → a centered
  `.frontmatter-plain` div (each source line its own block). A
  `categoryDivider` (`.section-divider`) is inserted before any passage whose
  `passage_type` differs from the immediately preceding sorted passage
  (prefatory → main → concluding).
- `components/renderCommentary.tsx` — `renderMulaWithReferences` renders the
  work's own verses (`<!-- verse -->`, `ownVerses`) as `.verse-quote.verse-own`
  blocks (indented, prose-mūla-sized, even-pāda sub-indent — the same
  treatment as embedded citations, semantically distinct), and the interleave
  blank-line separator counts them as verse boundaries.
- `app/globals.css` — `.frontmatter-plain` (centered, em-relative 0.9375em,
  each line its own block), `.verse-own` (semantic; styling from
  `.verse-quote`), and `.section-divider` (+ `::before`/`::after` hairlines,
  `.section-divider-dot`), mirroring the chapter-divider idiom.
- Tests: `components/FlowReader.test.tsx` (plain vs verse-tagged front matter,
  divider count/placement) and `tests/verse-quote-render.test.tsx` (own-verse
  verse-quote treatment + even-pāda sub-indent).
