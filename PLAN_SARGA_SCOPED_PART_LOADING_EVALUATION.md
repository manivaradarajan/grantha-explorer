# Evaluation (v6) — PLAN_SARGA_SCOPED_PART_LOADING.md

**Reviewer:** LLM design review (bounded adversarial)
**Date:** 2026-08-17
**Scope:** v6 of the section-scoped part-loading refactor. Re-verifies the
depth-based dispatch, the explicit `endRef === null` guard, the existing-test
updates, and the stated purposes of the placement invariant / prefatory-only
assumption against the real corpus.
**Verdict:** **APPROVED**

All prior Criticals and Majors are resolved, and the design is now internally
consistent and implementable. The four depth-1 multi-part editions that were the
v5 blocker are correctly routed to the flat path; the `partBacksPrefix`
predicate (correct since v4) is unchanged; the test spec is complete and
coherent, including fixtures and assertions for every boundary case that prior
rounds exposed. The following Minor items are non-blocking and can be folded in
during implementation.

---

## Findings this round

### Minor

#### m1 — §4.5's defensive branch is mislabeled; a deep single-file text must not take the flat path.

```ts
if structure present AND partLevel >= 0:     // depth >= 2
  if grantha.parts: main = buildPartHierarchy(...)
  else: existing depth-1-flat fallback for a non-multi-part deep text (defensive)
```

The `else` arm of the depth-≥2 branch says "depth-1-flat fallback" for a *deep*
text without parts. That is wrong wording: a depth-≥2 text without parts must
keep the existing `buildNestedGroups` hierarchical path (no placeholders), not
the flat path — otherwise its hierarchy would be flattened. The branch is
unreachable today (verified: the only single-file grantha in the index,
`vedarthasangraha`, is depth-1 *and* curated), so this is a documentation fix,
not a behavior fix. Reword to "existing `buildNestedGroups` hierarchical path
(no placeholders)".

#### m2 — `comparePrefix` is referenced in the §4.3 sketch but never defined.

The predicate pseudocode calls `comparePrefix(number[], number[])`, but the
codebase only has the string-tuple `compareRefs` (`lib/data.ts:583`) and the
inline `cmpRefs` in `verify-sidebar-model.ts:53`. Add/name a small numeric-tuple
prefix comparator (or note that `partRanges` precomputes tuples so a lexical
`compareRefs`-style walk over `number[]` suffices). Trivial, but the plan is now
detailed enough that every referenced helper should exist by name.

#### m3 — §4.4 step 7's placement invariant is now correctly labeled tautological but still adds a no-op code path.

The invariant ("every part's head node exists after enumeration") cannot fire on
a well-formed corpus because enumeration unions all part `first_ref`s (§4.4 step
4), so every head is always present. The plan now states this explicitly
(step 7, "will not fire on a well-formed corpus"), which is honest — but it is
dead code whose only value is future-proofing. Acceptable as defense-in-depth;
flagging only so it isn't mistaken for a meaningful check later. (If it were a
pure assertion, consider a `dev`-only throw.)

---

## Re-verification of v5 findings — status

- **v5-C1 (depth-1 multi-part editions break on `partLevel = −1`): RESOLVED.**
  §4.1 defines `partLevelFor` returning −1 for depth-1; §4.4 step 1 asserts
  `partLevel >= 0`; §4.5 dispatches on **depth, not parts**; §6 guards
  `app/page.tsx` to skip when `partLevel < 0`; §4.2 documents the
  `partLevel >= 0` precondition. The four depth-1 editions (isavasya ×2,
  mandukya-karika ×2, all `structure_levels: [Mantra]` with
  `parts: [{first_ref: "1"}]` — re-confirmed from the envelopes) take the
  unchanged flat path. Fixture (§7.1 Isavasya-shaped) and tests #2, #22, #31
  cover it.
- **v5-m1 (existing `sectionPartsToLoad` tests break on the 4th arg): RESOLVED.**
  §5 and §7.6 test #28 / §7.9 explicitly list the 5 tests (`data.test.ts:338-385`)
  gaining the `partLevel` argument.
- **v5-m2 (`endRef === null` in the sketch): RESOLVED.** §4.3 pseudocode guards
  `if range.endPrefix !== null`; test #12 exercises the open-ended case.
- **v5-m3 (placement invariant vacuous): RESOLVED.** §4.4 step 7 states its true
  purpose (enumeration/assignment agreement guard), explicitly not an
  empty-part detector. (See m3 above.)
- **v5-m4 (prefatory-only exclusion assumption): RESOLVED.** §4.4 step 4 documents
  the reliance on the prefatory part being first/eager-loaded; §6.2 mirrors it.
  The gita `0.1` part is indeed first and the only part matching section `"0"`
  in `loadGrantha`'s eager group (verified), so the assumption holds.

## Predicate & boundary cases — final confirmation (re-verified, all pass)

| part | startRef → endRef | finalSeg(endRef) | backs | excludes |
|---|---|---|---|---|
| BA part2 | `3.3.20 → 3.4.15` | 15 | `(3,3)`,`(3,4)` | `(3,5)` |
| BA part4 | `3.5.13 → 4.1.1` | 1 | `(3,5)`,`(3,6)` | `(4,1)` |
| BA part5 | `4.1.1 → 5.1.1` | 1 | `(4,1)…(4,6)` | `(5,1)` |
| BA part12 | `7.1.1 → 8.1.1` | 1 | `(7,1)…(7,15)` | `(8,1)` |
| gita part1 | `0.1 → 1.1` | 1 | `(0)` | `(1)` |

The `finalSegment === 1` exclusion correctly handles both the aligned
Rāmāyaṇa (every `first_ref` ends in `.1`, so each sarga's part backs only its
own sarga) and the Gita depth-2 prefatory transition. The head-only enumeration
decision (v4-C1) is now documented end-to-end and consistent with
`collectSections`' unchanged branches.

## Bottom line

The plan has converged. The predicate is correct, the depth-based dispatch
protects the four depth-1 editions, `partLevel` is threaded to both consumers
through a shared `partRanges`, the zero-passage check is correctly split between
validator (data defect) and a documented placement assertion, and the test spec
covers every boundary case raised across six review rounds. The three Minors
(m1 wording, m2 helper name, m3 no-op assertion) are non-blocking. Approve for
implementation; fold in m1–m3 while coding.
