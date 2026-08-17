# PLAN (v6) — Section-scoped part loading for deep multi-part granthas

**Branch:** `bring-in-ramayana-govindaraja` (grantha-explorer worktree)
**Date:** 2026-08-17
**Status:** v6, incorporating the v5 evaluation. Resolves v5 **C1** (depth-1
multi-part editions — the blocker), **m1** (existing-test signature break),
**m2** (`endRef === null` guard in the sketch), **m3** (placement-invariant
purpose), **m4** (prefatory-only exclusion assumption). Supersedes v5.

---

## If you're an LLM evaluating this…

Bounded adversarial review. Verdict: **APPROVED** / **NEEDS_REVISION** with
Critical → Major → Minor, function references, concrete fixes. Re-verify
hardest: (1) the **depth-based dispatch** (C1) — `buildPartHierarchy` is used
only when `partLevel >= 0`; depth-1 multi-part texts (isavasya ×2,
mandukya-karika ×2) take the existing flat path, with a guard and an
isavasya-shaped test; (2) the **`endRef === null` guard** is explicit in both
the contract and the sketch (m2); (3) the **existing-test update** for the
`sectionPartsToLoad` signature is called out (m1); (4) the **placement
invariant's real purpose** is stated (m3) and the **prefatory-only assumption**
documented (m4).

---

## 1. Problem (unchanged)

Expanding a kāṇḍa group in the flow-mode folio fires ~111 concurrent part
fetches (measured: clicking `काण्डः २` fetches part76…part186, ~2.8s). Same risk
in the 3-pane `NavigationSidebar`. The slow path is **group expand**.

## 2. Root cause (unchanged)

`getPassageHierarchy` (`lib/data.ts:702-828`) builds placeholders keyed by
`part.id` (`first_ref.split(".")[0]` = kāṇḍa), collapsing a kāṇḍa's unloaded
parts into one group. `collectSections` (`lib/data.ts:885-937`) emits it as one
placeholder section; expanding loads all. `inheritedPartIds` (line 891-892)
glues a kāṇḍa's full partIds onto a loaded sarga section.

## 3. Core invariant (unchanged)

> **Main passages tile the ref space contiguously. Part `i`'s main-passage
> content is exactly `[first_ref_i, first_ref_{i+1})`.**

Prefatory/concluding passages attach by structural prefix, never by range.

## 4. Design

### 4.1 `partLevelFor(structure)` and the depth-1 guard (C1)

```ts
/** The part level (index of the deepest structural level above the passage
 *  level), or -1 for depth-1 texts that have no part level. */
export function partLevelFor(structure: StructureLevel[]): number {
  return getStructureDepth(structure) - 2;
}
```

- **depth ≥ 2** ⇒ `partLevel >= 0` (the only case `buildPartHierarchy` handles).
- **depth 1** ⇒ `partLevel = -1` — **never passed to `partRanges`/
  `sprefix`** (they are undefined for negative levels).
- **Guard:** `buildPartHierarchy` asserts `partLevel >= 0` (throw on depth-1
  input), so a future caller can't regress the four depth-1 editions.

### 4.2 `partRanges(parts, partLevel)` — single source of truth (M3 from v4)

```ts
export interface PartRange {
  part: PartSectionInfo;      // { file, first_ref }
  startRef: string;           // == part.first_ref
  endRef: string | null;      // next part's first_ref, or null for the last part
  startPrefix: number[];      // sprefix(startRef, partLevel) — precomputed
  endPrefix: number[] | null; // sprefix(endRef, partLevel), or null when endRef null
  endFinalSegment: number | null; // last dot-segment of endRef, or null when endRef null
}

export function partRanges(parts: PartSectionInfo[], partLevel: number): PartRange[]
```

- Precondition: `partLevel >= 0` (C1).
- Sort by `first_ref`; `endRef[i] = first_ref[i+1]`.
- **Guards (throw):** non-monotonic `first_ref`; duplicate `first_ref`;
  non-adjacent top-level skip (`endRef` top segment differs from `startRef` by
  > 1). Adjacent kāṇḍa boundaries and gita `0.1 → 1.1` (difference 1) do **not**
  throw.
- Does **not** check passage counts.

### 4.3 The shared predicate — `partBacksPrefix(range, P)` (m2: explicit null guard)

```ts
/**
 * Whether a part backs a part-level node with structural prefix P.
 *
 * Contract: true iff node prefix P lies within the part's main-passage ref
 * interval [startRef, endRef). Lower bound: sprefix(startRef) <= P, exact
 * because first_ref is by definition the part's first main passage. Upper
 * bound: when endRef is null (last part) the interval is open above — hi is
 * always true. Otherwise P <= sprefix(endRef) — a CLOSED bound, since the
 * part's last passage is endRef - 1 — EXCEPT that when endRef's final segment
 * is 1 (endRef is the first passage of its own section), the part ends in the
 * previous node, so require P < sprefix(endRef).
 *
 * Node prefixes are enumerated from real data only (part first_refs + loaded
 * passage refs), so phantom prefixes never materialize.
 */
export function partBacksPrefix(range: PartRange, P: number[]): boolean
```

Implementation (the `endRef === null` guard is now explicit — m2):

```
lo = comparePrefix(range.startPrefix, P)  // range.startPrefix <= P
hi = true
if range.endPrefix !== null:
  hi = comparePrefix(P, range.endPrefix)  // P <= endPrefix
  if range.endFinalSegment === 1:
    hi = comparePrefix(P, range.endPrefix) < 0
return lo && hi
```

**Verified table** (unchanged, correct):

| part | startRef → endRef | finalSeg | backs | excludes |
|---|---|---|---|---|
| BA part2 | `3.3.20 → 3.4.15` | 15 | `(3,3)`,`(3,4)` | `(3,5)` |
| BA part4 | `3.5.13 → 4.1.1` | 1 | `(3,5)`,`(3,6)` | `(4,1)` |
| BA part5 | `4.1.1 → 5.1.1` | 1 | `(4,1)…(4,6)` | `(5,1)` |
| BA part12 | `7.1.1 → 8.1.1` | 1 | `(7,1)…(7,15)` | `(8,1)` |
| gita part1 | `0.1 → 1.1` | 1 | `(0)` | `(1)` |

### 4.4 `buildPartHierarchy` — HEAD-ONLY placeholder enumeration (C1 from v4, unchanged)

```ts
export function buildPartHierarchy(
  structure: StructureLevel[],
  parts: PartSectionInfo[],
  loadedMainPassages: Passage[],
  loadedFirstRefs: ReadonlySet<string>,
): PassageGroup[]
```

Algorithm:

1. `partLevel = partLevelFor(structure)`; **assert `partLevel >= 0`** (C1).
2. `ranges = partRanges(parts, partLevel)`.
3. Build the container tree down to the part level.
4. **Enumerate node prefixes** from the union of part `first_ref`s and loaded
   MAIN passage refs (via `sprefix`), **excluding prefatory-only parts**.
   **Head-only:** a multi-section part enumerates only its head (from
   `first_ref`); middle sections appear after its part loads. **(m4) The
   prefatory-only exclusion relies on the prefatory part being the first
   (hence eager-loaded) part** — an *unloaded* prefatory-only part is
   unidentifiable from `first_ref`s alone and its head would be an empty
   placeholder; this is harmless today because the gita `0.1` part is first and
   always eager-loaded. Documented, not guarded.
5. **Assign parts by `partBacksPrefix`**; a part that backs no node in a
   well-formed corpus is impossible (its own head node is always enumerated —
   see m3).
6. **Attach loaded passages** by `passage.ref` structural path; loaded node
   `partIds` from `passage.part_id`. Prefatory/concluding attach by
   `dropLastRefComponent(ref)` prefix.
7. **Placement invariant (m3 — purpose stated):** assert that every part's head
   node (the node for `sprefix(first_ref)`) exists after enumeration. This is
   **not** an empty-part detector (that is the validator's job) — it is a
   defense-in-depth guard that enumeration and assignment agree, catching a
   future enumeration bug. It will not fire on a well-formed corpus; state this
   so an implementer doesn't treat it as catching empty parts.
8. Numeric ordering at every level.

### 4.5 Depth-based dispatch in `getPassageHierarchy` (C1 — the fix)

`getPassageHierarchy` dispatches on **depth, not parts**:

```
partLevel = partLevelFor(structure)
if structure present AND partLevel >= 0:     // depth >= 2
  if grantha.parts: main = buildPartHierarchy(...)
  else: existing depth-1-flat fallback for a non-multi-part deep text (defensive)
else:                                        // depth 1 (with or without parts)
  existing flat path (unchanged)             // isavasya ×2, mandukya-karika ×2
```

This removes the §5-vs-§7.5 contradiction: a depth-1 multi-part text (four real
editions) keeps today's flat path; only depth ≥ 2 multi-part texts enter the new
builder. **No regression to the four working editions.**

### 4.6 Node states / consumer changes / granularity (unchanged from v5)

- **Loaded node:** `passages` + `partIds` = all backing parts.
- **Unloaded node (head):** no passages; `partIds` = all backing parts.
- **Containers:** never carry `partIds`.
- Consumer changes: `collectSections` unchanged; `FlowReaderFolio.buildOutlineTree`
  registers unloaded tail parts of loaded sections (computing `loadedFirstRefs`
  internally); `NavigationSidebar.ensureSectionLoaded` drops the
  `passages.length > 0` early-return; `toggleGroup` unchanged.
- Granularity: parts-per-section bounded (1–2), meaningful for head sections and
  boundary-straddling sections; sections-per-part unbounded. Loading a section
  fetches at most its intersecting parts — never a whole kāṇḍa.

## 5. `sectionPartsToLoad` — threaded, depth-guarded (M3 from v4 + C1)

```ts
export function sectionPartsToLoad(
  parts: PartSectionInfo[],
  verseRef: string,
  loadedRefs: ReadonlySet<string>,
  partLevel: number,          // required; >= 0
): string[]
```

- `ranges = partRanges(parts, partLevel)`; `S = sprefix(verseRef, partLevel)`.
- Return the first_ref of every part with `partBacksPrefix(range, S)` true and
  `first_ref` not in `loadedRefs`.
- **Callers:** `app/page.tsx:220` passes `partLevelFor(currentGrantha.structure_levels)`.
  This effect only runs for multi-part granthas; add a guard: if `partLevel < 0`,
  skip (depth-1 — nothing to section-load). **(m1) Existing `data.test.ts`
  `sectionPartsToLoad` tests (5 of them, `:338-385`) must gain the `partLevel`
  argument.**
- Examples: `3.4.1` → `["3.3.20","3.4.15"]`; `3.4.15` → same; `4.3.1` →
  `["4.1.1"]`; `5.1.1` → `["5.1.1"]`.

## 6. Edge cases (updated for C1)

1. **Last part open-ended** — `endPrefix = null`; `partBacksPrefix` hi = true
   (m2).
2. **Prefatory-only part** — in `loadedFirstRefs`; excluded from enumeration;
   relies on being the first/eager-loaded part (m4).
3. **Adjacent kāṇḍa boundary** — no throw.
4. **Non-adjacent top-level skip** — throw.
5. **Depth-1 multi-part editions** (isavasya ×2, mandukya-karika ×2) — **flat
   path, never `buildPartHierarchy`** (C1).
6. **Depth-1 single-part** — flat path (unchanged).
7. **Curated sections** — bypass; untouched.
8. **Multi-section parts** — head-only placeholders.
9. **Duplicate/non-monotonic first_refs** — throw.
10. **Zero-passage part** — validator check (`validate_grantha_integrity.py`).

## 7. Test spec (updated for C1/m1–m4)

### 7.1 Fixtures
- **Ramayana-shaped**: `[Kāṇḍa, Sarga, Shloka]`, 75 parts all `id:"1"`, part1 loaded.
- **Gita-shaped**: `[Adhyaya, Verse]`, 18 + prefatory `0.1`.
- **Brihadaranyaka-shaped (misaligned)**: `[Adhyaya, Brahmana, Mantra]`, parts
  `3.1.1`(→3.3.19), `3.3.20`(→3.4.14), `3.4.15`(→3.5.12), `3.5.13`(→4.1.1),
  long-span `4.1.1`(→5.1.1).
- **Isavasya-shaped (C1)**: `[Mantra]` (depth 1), `parts=[{file, first_ref:"1"}]`,
  one part loaded.

### 7.2 `partLevelFor` tests
1. depth-3 (kāṇḍa→sarga→śloka) → 1; depth-2 (adhyāya→verse) → 0; **depth-1
   (mantra) → -1** (C1).
2. **isavasya-shaped dispatch**: `getPassageHierarchy` with `[Mantra]` + parts →
   flat path (passages at top level), no `buildPartHierarchy`, no throw.

### 7.3 `partRanges` unit tests
3. Ranges tile; prefixes precomputed; last `endPrefix = null`.
4. Throws on duplicate / non-monotonic first_refs.
5. Adjacent kāṇḍa boundary does NOT throw (`1.77.1 → 2.1.1`); gita `0.1 → 1.1`
   does NOT throw.
6. Non-adjacent skip throws (`1.77.1 → 3.1.1`).
7. Throws on `partLevel < 0` (C1).

### 7.4 `partBacksPrefix` unit tests (m2 — null guard)
8. part2: backs `(3,3)`,`(3,4)`; not `(3,5)`.
9. part4: backs `(3,5)`,`(3,6)`; not `(4,1)`.
10. part5: backs `(4,1)…(4,6)`; not `(5,1)`.
11. part12: backs `(7,1)…(7,15)`; not `(8,1)`.
12. **Open-ended (`endRef = null`): backs everything ≥ start — exercises the
    null guard (m2).**

### 7.5 `buildPartHierarchy` unit tests
13. Loaded part → passages at the sarga leaf; `partIds=["1.1.1"]`.
14. **Regression**: unloaded sargas separate placeholder leaves, `partIds.length
    === 1` each.
15. Multiple kāṇḍas → separate top-level groups.
16. All loaded → no placeholders; nothing loaded → all placeholders.
17. Gita depth-2: adhyāya placeholders; prefatory `0.1` → no अध्यायः 0.
18. Numeric ordering.
19. BA boundary: brāhmaṇa 3.4 (unloaded) → `partIds=["3.3.20","3.4.15"]`.
20. BA head-only: nothing loaded → `4.1 → ["4.1.1"]`; `4.2…4.6` absent; after
    part5 loads, they appear; `5.1 → ["5.1.1"]`.
21. BA partial load: brāhmaṇa 3.3 with part1 only → passages `3.3.1…19` AND
    `partIds=["3.1.1","3.3.20"]`.
22. **Depth-1 input throws** (guard, C1).
23. Placement invariant: a missing head node throws (defense-in-depth, m3).

### 7.6 `sectionPartsToLoad` tests (m1 — partLevel arg)
24. Aligned ramayana: `1.18.5` → `["1.18.1"]`; skip loaded; no-match → `[]`.
25. BA tail: `3.4.1` → `["3.3.20","3.4.15"]`; `3.4.15` → same.
26. BA middle: `4.3.1` → `["4.1.1"]`.
27. BA exclusive boundary: `5.1.1` → `["5.1.1"]`.
28. **Existing 5 tests updated to pass `partLevel` (m1).**

### 7.7 `getSidebarFlatModel` integration
29. Ramayana, sarga 1.1 loaded → every section `partIds.length === 1`; loaded
    section `1.1` has exactly `["1.1.1"]`.
30. BA partial load — no loaded passage dropped: brāhmaṇa 3.3 (part1 only) →
    section has ALL `3.3.1…3.3.19` AND `partIds=["3.1.1","3.3.20"]`.
31. **isavasya-shaped depth-1**: flat model has no sections, `flatPassages` =
    the mantras (C1, no regression).

### 7.8 Verification harness + validator
32. Rewrite `verify-sidebar-model.ts` partIds check to the new invariant.
33. Promote the no-dropped-passage assertion (test #30) into the harness.
34. Validator: zero-passage-integrity check in `validate_grantha_integrity.py`.

### 7.9 Existing tests
- Current `data.test.ts` (77), `hashUtils`, `references` pass unchanged except:
  the 5 `sectionPartsToLoad` tests gain `partLevel` (m1), and any asserting the
  old placeholder grouping (update deliberately).

## 8. Verification (manual/Playwright)

- `npm test`, `npx tsc --noEmit`.
- Playwright: folio kāṇḍa-2 expand fetches exactly 1 part (ramayana); gita
  adhyāya expand fetches 1; BA brāhmaṇa 4.1 expand fetches part5; BA 3.4
  deep-link loads parts 2+3; BA 3.3 partial-load shows mantras + fetchable tail;
  gita `0.1` no अध्यायः 0; **isavasya & mandukya-karika render normally (depth-1
  flat path — no regression).**
- `scripts/validate_data.py`, `npx tsx scripts/validate-data.ts`,
  `verify-sidebar-model.ts` (updated), `validate_grantha_integrity.py` green.

## 9. Docs

- `DEFERRED.md` #14 → resolve.
- `docs/DATA_FLOW.md` (both repos): section-scoped loading, head-only
  placeholders, depth-based dispatch, misalignment handling.
- This plan supersedes v5; note C1/m1–m4 resolutions.

## 10. Migration safety (unchanged)

On-disk data untouched. Touches: `lib/data.ts` (`partLevelFor`, `partRanges`,
`partBacksPrefix`, `buildPartHierarchy`, `getPassageHierarchy`,
`sectionPartsToLoad`), `app/page.tsx`, `FlowReaderFolio.tsx`,
`NavigationSidebar.tsx`, `verify-sidebar-model.ts`,
`validate_grantha_integrity.py`, `lib/data.test.ts`. Rollback = revert one
commit. Not producer-only.

## 11. Open questions for the reviewer

1. Depth-based dispatch (C1): confirmed as the fix — no depth-1 multi-part text
   enters the new builder; the guard makes future misuse fail loudly.
2. m4's reliance on the prefatory part being first/eager-loaded: acceptable as a
   documented assumption, or should a future pass add a producer-side marker?
3. `part.id` dead-field cleanup: defer (follow-up) — confirmed acceptable.
