# Vedārtha Saṅgraha Ingestion — Phase 1 Investigation

**Scope:** Does the UI support a zero-edition grantha (no commentary concept at all)?
**Constraint:** Read-only investigation. No implementation.
**Established conventions:** Per `docs/multi-category-ux-design.md` evidence standard and Section 11
sequencing. This is the first non-commentary text: single-level structure (`पाठः`), flat refs
(`0.1, 0.2, 1..252`), a single source file, no commentary or multiple editions.

---

## Question 1 — `loadGrantha` edition resolution with empty/absent `editions`

**Path traced:** `lib/data.ts:287-304`

```typescript
const granthaEditions = granthaMetadata.editions;          // :287
let resolvedEditionId: string;
let granthaPath: string;

if (granthaEditions && granthaEditions.length > 0) {        // :291
  const selected =
    granthaEditions.find(e => e.edition_id === editionId) ||
    granthaEditions.find(e => e.isDefault) ||
    granthaEditions[0];
  if (!selected) {
    throw new Error(`Grantha ${granthaId} has an empty editions array`);  // :297
  }
  resolvedEditionId = selected.edition_id;
  granthaPath = selected.path;
} else {
  resolvedEditionId = granthaId;                            // :302
  granthaPath = granthaMetadata.path;                       // :303
}
```

**Verdict: SAFE.** For a single-file, single-edition grantha the index entry carries **no
`editions` field**, so `granthaMetadata.editions` is `undefined`. The `&&` guard at line 291
short-circuits to false → the `else` branch runs → `resolvedEditionId = granthaId`,
`granthaPath = granthaMetadata.path`. No throw, no undefined behavior.

The `throw` at line 297 ("empty editions array") is reachable **only** when `granthaEditions` is a
non-empty-truthy array of zero length — an impossible state given the `length > 0` guard at 291. It
is defensive dead code for that branch.

The actual empty/absent-editions case (the one Vedārtha Saṅgraha hits) resolves cleanly via the
`else`. Outcome: **defaults gracefully, does not throw.**

---

## Question 2 — `CommentarySelector` with zero available editions

**Path traced:** `components/CommentarySelector.tsx` + the calling guard in
`components/CommentaryPanel.tsx:48-50, 215`

Two independent guards prevent `CommentarySelector` from ever mounting for a zero-edition text:

1. **`CommentaryPanel.tsx:48-50`:**
   ```typescript
   const hasMultipleEditions =
     (grantha.editions && grantha.editions.length > 1) || false;
   ```
   With `grantha.editions === undefined`, this evaluates to `false`.

2. **`CommentaryPanel.tsx:215`:**
   ```tsx
   {hasMultipleEditions && grantha.editions && (
     <CommentarySelector editions={grantha.editions} ... />
   )}
   ```
   Both operands false → the `CommentarySelector` component is never instantiated.

**Verdict: SAFE.** The component is not rendered for a text with zero editions; there is no empty
dropdown and no error. The guard is `hasMultipleEditions` (requires `editions.length > 1`), which a
zero-edition grantha cannot satisfy.

(Even if it were force-rendered with `[]`, `CommentarySelector.tsx:35-38` resolves `selectedEdition`
to `editions[0]` → `undefined`, and the `Home`/`End` handler at `:109` would pass `-1` to
`optionRefs.current[-1]` → `undefined`; but this path is unreachable given the mount guard.)

---

## Question 3 — All three layouts with nothing to show in the commentary area

**Desktop** (`app/page.tsx:406-418`):

The right `Panel` is **always rendered**, `minSize={20} maxSize={40}`. Inside it,
`CommentaryPanel` runs with `grantha.commentaries || []` → `[]` → enters the empty-state branch at
`CommentaryPanel.tsx:193-206`, showing the `noCommentariesAvailable` string. The panel therefore
occupies **≥20% of viewport width** with an empty message. This is **pre-existing behavior**
identical to an Upaniṣad passage that has no commentary for the selected verse — not a
Vedārtha-Saṅgraha-specific regression.

**Tablet** (`components/TabletLayout.tsx:171-183`):

Same structure: `Panel defaultSize={panelSizes[1]} minSize={30} maxSize={60}` always rendered;
`CommentaryPanel` shows the empty state. A `commentaryCollapsed` toggle (header button,
`TabletLayout.tsx:124-149`) lets the user hide it, but the **default is open**. Pre-existing
behavior; the collapsed state is user-initiated, not automatic.

**Mobile** (`components/MobileLayout.tsx:159-185`):

`BottomSheet` is always mounted but hidden until `commentaryOpen === true` (controlled by the
`co=1` URL param). When opened, the inner `CommentaryPanel` (with `hideHeader`) shows the empty
state. The bottom-sheet title/subtitle at `MobileLayout.tsx:163-164` read
`grantha.commentaries?.[0]?.commentary_title` → `undefined` → falls back to `"Commentary"`. No crash,
no broken layout.

**Verdict: SAFE per layout, but a pre-existing UX weakness on desktop/tablet.** All three render
correctly. The only negative is that on desktop and tablet the empty commentary panel permanently
squeezes the reading pane (≥20–30% width) for a text that will never have commentary. This is
**pre-existing behavior**, not introduced by this ingestion.

---

## Question 4 — The flat single-file loader path (dead code until now)

**Path traced:** `lib/data.ts:425-447`

```typescript
} else {
  // It's a single-file grantha
  const singleFileResponse = await fetch(getAssetPath(`/data/library/${granthaPath}`));  // :427
  if (!singleFileResponse.ok) {
    throw new Error(`Failed to load single-file grantha: ${granthaId}`);                 // :430
  }
  const data: any = await singleFileResponse.json();                                     // :433
  // Convert commentaries from object to array if needed
  if (data.commentaries && !Array.isArray(data.commentaries)) {                          // :436
    data.commentaries = Object.values(data.commentaries);
  }
  data.edition_id = resolvedEditionId;                                                   // :442
  data.editions = granthaEditions;                                                       // :443
  granthaCache.set(cacheKey, data);                                                      // :445
  return data;                                                                           // :446
}
```

**Activation context:** this path is currently **dead code** — all 80 library JSON files are
`envelope.json` or `partN.json`; no flat single-file grantha exists (Phase 1 Contradiction 3).
Vedārtha Saṅgraha, published as `vedarthasangraha.json` via the `grantha_md2json_single` Bazel
rule (output name `{grantha_id}.json`), would be its first production exercise.

**Trace against a real single-file grantha shape** (mūla-only, per `grantha.schema.json`):

| Concern | Trace result |
|---|---|
| `isMultiPart` detection (`lib/data.ts:307` `!granthaPath.endsWith('.json')`) | A path like `vedarthasangraha/vedarthasangraha.json` ends with `.json` → `isMultiPart = false` → **correctly enters the single-file branch** |
| Fetch (`:427`) | `/data/library/vedarthasangraha/vedarthasangraha.json`; 404 throws with a clear message |
| `data.commentaries` handling (`:436`) | Guard: converts object→array; if absent, `undefined` passes through. Downstream `CommentaryPanel.tsx:48` `grantha.commentaries \|\| []` handles it |
| `data.editions` stamping (`:443`) | `granthaEditions` is `undefined` for a single-edition grantha → `data.editions = undefined` → correct (matches the `else` branch in Question 1) |
| Schema conformance | `grantha.schema.json:63-66`: `commentary` is optional — "Absent if this is a mūla-only edition." A mūla-only flat file without `commentary` is schema-valid |
| `text_type` value | `prakarana` is **NOT** in the schema enum `["upanishad","smriti","sutra","purana","stotra","other"]` (`grantha.schema.json:38-41`) — Contradiction 1. The file is structurally valid but the `text_type` value fails schema validation if enforced. Prerequisite: widen the enum (Section 11, Step 1) |
| `Grantha` type vs runtime | Type declares `commentaries: Commentary[]` (`lib/data.ts:117`) but runtime data has `undefined` for a mūla-only file. `CommentaryPanel.tsx:48` handles via `\|\| []` — safe at runtime |

**⚠️ UNVERIFIED — ingestion-quality risk:** the loader uses `data: any` (`:433`) and trusts the
JSON shape with no runtime validation. A malformed flat file (missing `passages`,
`structure_levels`, or `canonical_title`) would surface as a component-render error downstream (e.g.
`getAllPassagesForNavigation` spreading undefined at `lib/data.ts:496-506`). This is a data-quality
concern to catch at ingestion/validation time, not a loader bug.

**Verdict: structurally ready.** The loader works against a real single-file grantha shape; the only
hard prerequisite is the `text_type` enum widening for `prakarana` before schema validation passes.

---

## Question 5 — Verdict: genuine gap or implicitly handled?

| Concern | Status | Evidence |
|---|---|---|
| Edition resolution (no editions) | **Handled** | `lib/data.ts:301-303` — `else` branch, no throw |
| CommentarySelector rendering | **Handled** | `CommentaryPanel.tsx:50, 215` — gated by `hasMultipleEditions`, never mounts |
| CommentaryPanel empty state | **Handled** | `CommentaryPanel.tsx:193-206` — explicit "no commentaries" branch |
| Desktop/tablet panel space waste | **Pre-existing** (not a Vedārtha gap) | Identical behavior for any Upaniṣad passage without commentary; `minSize` on `Panel` in `page.tsx:407`, `TabletLayout.tsx:172` |
| Mobile bottom sheet | **Handled** | `MobileLayout.tsx:163-164` — title falls back to `"Commentary"` |
| Flat single-file loader | **Ready** | `lib/data.ts:425-447` — first activation, structurally sound |
| `text_type` enum for `prakarana` | **Schema prerequisite** | `grantha.schema.json:38-41`; value `prakarana` confirmed in `vedarthasangraha-01.md` frontmatter |
| Indexer discovery of a flat `.json` | **Traced, unverified live** | `generate-granthas-json.ts:136-143` flat-file handler reads `grantha_id` from content; `⚠️ UNVERIFIED` — no flat file has been indexed to date |

**Final verdict: NOT a genuine gap requiring new UI work.** The zero-edition grantha is fully
supported by existing guards and fallbacks:

- Loader resolves absent editions cleanly (Question 1).
- Commentary selector never renders for zero editions (Question 2).
- All three layouts render a correct empty state (Question 3).
- The single-file loader path is structurally ready for first use (Question 4).

**Minimum fix scope, if any:** none required to ship Vedārtha Saṅgraha. The one optional
improvement — auto-collapsing the commentary panel when `grantha.commentaries.length === 0` — is
out of scope for this pass; it is a pre-existing UX weakness affecting any commentary-less text and
should not gate this ingestion.

**Prerequisites that must be satisfied in Phase 2 before ingestion:**
1. Widen the `text_type` enum to include `prakarana` (Section 11, Step 1) — otherwise schema
   validation rejects the file.
2. Add the `vedarthasangraha` entry to `granthas-meta.json` (absent today — verified in prior
   investigation).
3. Ensure the generated index `path` for the flat file ends in `.json` so `isMultiPart` resolves to
   the single-file branch.
4. Wire the new category into `validate:integrity` (currently 10 hardcoded Upaniṣad directories,
   Phase 1 §9.5) so this text ships validated.

---

## Sampling / coverage note

All claims are traced directly from the cited source files (`lib/data.ts`, `CommentaryPanel.tsx`,
`CommentarySelector.tsx`, `page.tsx`, `TabletLayout.tsx`, `MobileLayout.tsx`,
`grantha.schema.json`). No sampled subset — these are full-file reads of the relevant functions and
components. The single `⚠️ UNVERIFIED` item (indexer discovering a flat file for the first time) is
flagged inline above.
