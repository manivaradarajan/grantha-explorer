# Multi-Category Grantha Explorer: Investigation & UX Design Plan

**Status:** Plan — pending approval. **Do not implement.** Do not run the investigation until this
plan is approved. Execution proceeds in two gated phases (Phase 1 investigation → review → Phase 2
design → review) with findings written incrementally to an output file.

---

## Executive Summary

The Grantha Explorer currently treats itself as an "Upaniṣad explorer": the app title hardcodes
`उपनिषदः`, the text list is flat, and the app loads directly into a reading view. We are adding
substantially more texts (starting with Rāmānuja's works) and need the information architecture to
accommodate many categories of texts without a redesign each time.

A candidate design direction was developed in a prior session (see the pointer in the
Reference Design section below).

1. **A landing page becomes the app's default entry point.** It shows category filter chips
   (subtle outlined pills, single-select, no chip = all texts) and a flat, filtered text list.
2. **Selecting a text navigates to the existing reading view** (three-column desktop layout,
   responsive mobile/tablet layouts — unchanged).
3. **The wordmark becomes dynamic and interactive in the reading view**: it shows the active text's
   `text_type` as a breadcrumb (`ग्रन्थपरिशीलकः > उपनिषत्`) and the brand name acts as a "go home"
   link back to the landing page.
4. **The grantha selector in the reading view stays a flat list** (no chips, no section headers).
   Category switching is a deliberate "go home → filter → pick text" action.
5. **The data model is tag-aware from day one**: each text carries a `categories: string[]` array
   (overlapping allowed), even though the v1 UI only exposes single-select filtering.
6. **The wordmark uses `text_type`** (e.g. उपनिषत्, ब्रह्मसूत्रभाष्यम्), not the category, because a
   text has exactly one `text_type` and it remains stable across overlapping category memberships.

This plan governs the **execution** that validates, corrects, and documents this direction with
cited evidence — it does not pre-populate the output artifact.

---

## Execution Protocol

### Output Destination

- All findings and design must be written **incrementally** to a single markdown file:
  `docs/multi-category-ux-design.md`.
- Write each section to the file **as it is completed** — do not batch everything and write once at
  the end. The file is the cumulative, reviewable artifact; chat output is secondary.
- Do **not** pre-populate the file with the reference design (see `docs/reference-design-draft.md`).
  It must be derived from fresh, cited investigation.

### Evidence Standard

- Every claim in **Observed** must cite a specific file path. Minimum citation: `path/to/file.ts`.
  Where practical, narrower citations (line number, function name, component name, type name) are
  preferred. Acceptable forms:
  - `components/AppWordmark.tsx:19` — exact line
  - `lib/data.ts` `GranthaMetadata` interface — named type
  - `scripts/generate-granthas-json.ts` `scanDirectory()` — named function
  - `app/page.tsx:73–78` — line range
- If a claim cannot be cited to an exact location, it belongs in **Inference**, not Observed.
  Inference claims must state what they are based on.
- **Contradictions between files must be surfaced explicitly** with both citations — never silently
  resolved. Format:

  > **CONTRADICTION:** `fileA:line` says X, but `fileB:line` says Y. Assessment: …

- When a contradiction is a deliberate design choice rather than a bug, note it as such instead of
  flattening it.

### Bounded Data Investigation Strategy (`../grantha-data/structured_md`)

1. **Directory inventory first.** Produce a complete listing of every top-level and second-level
   subdirectory with file counts. Report this as the sample universe.
2. **Sample 3–5 structurally distinct files per category/author**, prioritizing files that differ in:
   - Part count (single-file vs multi-part)
   - Structure depth (1-level flat vs 3+-level nested)
   - Presence/absence of commentary editions
3. **Only go exhaustive within a category if the sample reveals real inconsistency** (e.g.
   conflicting `text_type` values, mixed envelope kinds within one category).
4. **The final report must state sampling coverage explicitly**, e.g.:

   > **Sampling coverage:** Checked 8 of 177 total markdown files (4.5%), spread across all 4
   > top-level categories. upanishads: 5 of 121 files (5 of 12 texts). brahma-sutras: 3 of 48 files.
   > bhagavad-gita: 2 of 19 files. vedarthasangraha: 1 of 1 files.

### Confidence Flagging

- Flag statements whose evidence coverage is incomplete **inline** with `⚠️ UNVERIFIED:` and state
  what was actually checked, e.g.:
  - `⚠️ UNVERIFIED: checked only 2 of 40 part files in brihadaranyaka/. Pattern may not hold across all parts.`
  - `⚠️ UNVERIFIED: category deduced from filesystem prefix; envelope.json text_type checked for only 4 of 14 texts.`
- Do **not** use unquantified hedges ("seems to", "appears that") in Observed claims. Either cite
  specific evidence, flag it `⚠️ UNVERIFIED`, or move it to Inference.
- Do **not** smooth over uncertainty in the writeup.

---

## Phase 1: Investigation (Sections 1, 2, 8, 9)

Phase 1 is **read-only** investigation of the `grantha-explorer` codebase and
`../grantha-data/structured_md`. No implementation. No file modification.

**Do not read `docs/reference-design-draft.md` during this phase.** Investigate and report findings
as if no prior design existed.

Write each section below to `docs/multi-category-ux-design.md` as it is completed, applying the
Evidence Standard, Confidence Flagging, and Bounded Data Investigation rules above.

### 1.1 Section 1 — What the current application actually does

Investigate and document:
- How the current Upaniṣad collection is represented
- How texts are discovered and loaded
- How the current text hierarchy is represented
- How navigation between texts works
- How the current "Upaniṣadaḥ" title is generated/rendered
- Where category/collection assumptions are embedded in the code
- How routing and URL state currently work
- How selection state is maintained
- How the UI determines which texts are available
- Whether the existing architecture already has abstractions that could naturally support categories

### 1.2 Section 2 — What assumptions are Upaniṣad-specific

Produce a table of assumptions with each row citing location and severity, organized by kind:
- **UI Hardcodes** (strings, labels, titles)
- **Type/Data Gaps** (missing fields, flat structures where hierarchy is needed)
- **Behavior Defaults** (fallback values, default selections)
- **Documentation** (READMEs, metadata)
- **Build/Config Assumptions** (order files, manifests)

### 1.3 Section 8 — What needs to change conceptually in the loading/navigation architecture

Survey each of: file discovery, manifests/indexes, routing, loading, state management, text
metadata, navigation, components, URL construction, caching, search/filtering, ordering. Identify
the **minimum conceptual changes** needed. Do **not** prematurely redesign the data architecture —
understand what exists first.

### 1.4 Section 9 — Important edge cases

Surface edge cases discovered during investigation, especially:
- Texts that don't fit the existing structural model
- Paths through the code that assume a single collection
- Browser back/forward, refresh, and deep-link behavior
- Missing or incomplete metadata

### 1.5 Phase 1 Stop Point

- Write Sections 1, 2, 8, 9 to `docs/multi-category-ux-design.md`.
- State sampling coverage explicitly.
- **STOP and wait for human feedback.** Do **not** proceed to Phase 2 until the Phase 1 findings
  are reviewed and confirmed. Apply any corrections to the file before advancing.

---

## Phase 2: Design (Sections 3–7, 10)

Phase 2 **explicitly builds on the confirmed Phase 1 findings**. Do not start until Phase 1 has been
reviewed and any corrections are incorporated.

**Before starting Phase 2, read `docs/reference-design-draft.md`.** Treat it as a candidate to
stress-test against your confirmed Phase 1 findings — not as a conclusion to confirm. Where Phase 1
evidence conflicts with the reference design, surface it explicitly using the CONTRADICTION format
from the Evidence Standard, and let the evidence win. Where you agree with the reference design,
justify the agreement with your own Phase 1 citations, not by deference to the reference design.

Append each section below to the same `docs/multi-category-ux-design.md`. The resulting file will
contain all ten output sections under clear Phase 1 / Phase 2 headings.

### 2.1 Section 3 — What the new multi-category mental model should be

Address the information architecture first — not "where to put a dropdown":
- Is "Upaniṣadaḥ" really a page title, a category selector, or both?
- Should category selection be part of the primary navigation?
- Is a dedicated category-selection page appropriate? Dropdown/popover/sidebar/navigation hierarchy?
- Should the selected category be reflected in the URL? Should users link directly to a category?
- What happens when additional categories are introduced?
- How should the UI communicate the distinction between a category, a work, and a structural
  subdivision within a work?
- Will different categories have different hierarchies or metadata?
- Does the existing left-column navigation model still make sense with many categories?
- Design for graceful addition of many future categories, not just Upaniṣads + Rāmānuja.

### 2.2 Section 4 — Assessment of the "click Upaniṣadaḥ" idea

Evaluate honestly, with willingness to **reject** it. Is clicking the wordmark the right abstraction
for category switching, or is it a symptom of a larger navigation problem? Consider its mental
model, discoverability, interaction cost, scalability, and fit with the existing explorer UI.

### 2.3 Section 5 — 2–4 alternative UX approaches

For each alternative cover: user mental model, discoverability, scalability, interaction cost,
visual complexity, URL/deep-link implications, relationship to the existing explorer UI,
implementation complexity, and how well it handles future categories.

### 2.4 Section 6 — Recommended approach

Recommend one approach with justification, referencing the confirmed Phase 1 findings (e.g. "the
codebase already has X at `file:line`, which supports approach Y").

### 2.5 Section 7 — How the user journey would work

Concrete walkthroughs:
- **Current:** open explorer → see Upaniṣads → select text → navigate structure
- **Future:** open explorer → choose Rāmānuja → see Rāmānuja's works → select work → navigate
- Arriving at a deep link directly
- Switching from Upaniṣads to Rāmānuja and back
- Refreshing, browser back/forward
- Adding a third category later
- A category containing works with a different structural organization

### 2.6 Section 10 — Open UX decisions to discuss

List as discussion points for the human stakeholder. Do **not** pre-resolve them in the document.

### 2.7 Phase 2 Output

Append Sections 3–7 and 10 to `docs/multi-category-ux-design.md`. Verify any "Observed" claims
carried over from Phase 1 still carry their citations.

---

## Key Constraints (preserved from the original brief)

1. **Do not implement yet.** This is a UX/design investigation. Do not modify files, write
   implementation code, or skip the investigation step.
2. **Separate facts from recommendations.** Every section distinguishes Observed (with citations),
   Inference (with basis), and Recommendation.
3. **Think about the information architecture first.** The fundamental question is not "where
   should we put a category dropdown?" — it is what the user's mental model of the application
   should be.
4. **Consider future scale.** Do not design only for Upaniṣads + Rāmānuja; the UX should not need
   redesigning for each new category.
5. **Consider the loading/data architecture.** Understand what exists before proposing changes;
   identify the minimum conceptual changes needed.
6. **Be willing to reject the clickable-title idea** if another approach is substantially better.
7. **Be a critical UX partner, not an agreeable implementer.**

---

## Final Output Checklist

Before presenting the completed `docs/multi-category-ux-design.md` for approval:

- [ ] Phase 1: Sections 1, 2, 8, 9 complete with evidence citations
- [ ] Phase 1: Sampling coverage explicitly stated
- [ ] Phase 1: `⚠️ UNVERIFIED` flags present where evidence is incomplete
- [ ] Phase 1: Contradictions between files surfaced, not silently reconciled
- [ ] Phase 1: Reviewed by human; corrections applied
- [ ] Phase 2: Sections 3–7, 10 build on confirmed Phase 1 findings
- [ ] Phase 2: Clickable-title idea honestly evaluated (willing to reject)
- [ ] Phase 2: 2–4 alternatives presented with full tradeoff analysis
- [ ] Phase 2: Concrete user-journey walkthroughs for all specified scenarios
- [ ] Phase 2: Open decisions listed as discussion points, not pre-resolved
- [ ] All Observed claims carry file-path citations
- [ ] Inference claims clearly distinguished, basis stated

---

## Reference Design (pointer)

A candidate reference design exists at `docs/reference-design-draft.md`.

**Do not read it during Phase 1.** It is introduced explicitly at the start of Phase 2 (see the
Phase 2 introduction above) as a candidate to stress-test against confirmed Phase 1 findings.
