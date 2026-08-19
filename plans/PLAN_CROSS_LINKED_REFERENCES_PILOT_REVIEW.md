# Review (round 4): Cross-Linked References — One-Level Link Graph (E2E Pilot)

**Reviewer:** senior-engineer pass, 2026-08-18 (round 4)
**Verdict:** **Approved — no blockers.** Round-3 findings are correctly and
completely closed, and the §4.1.1 rule is now internally consistent and
self-correcting. Remaining items below are precision/documentation notes, not
design changes. Safe to implement.

---

## 0. Round-3 disposition (verified)

- **M1 (range gated on dash glyph)** → fixed. §4.1.1 now has four explicit
  `seg_count == hint_depth + 1` sub-bullets distinguished by trailing glyph
  (`-` ascending → range; `.` → over-depth dotted; `-` non-ascending →
  ambiguous; otherwise depth overflow). The dash-vs-dot distinction that §4.1
  step 4 preserves is now actually *used* by the rule. Correct.
- **M2a (`अग्नि.र.` ref_structure)** → §4.2 hint example corrected to 3 levels
  (`[adhyaya, anuvaka, mantra]`), with level names explicitly flagged "to
  confirm". Matches the source's three-segment `अग्नि.र.१-१०-६`. Correct.
- **M2b (non-ascending `+1` branch)** → explicit bullet added, and it now has a
  genuinely useful interpretation (see note N1 below). Correct.
- **Minors** → verification flag on the Śānti-parva claim (Phase-2 step added),
  `महा.भा.शां.` named in reconciliation, part-`first_ref` re-flagged
  `isSection: false`, non-final-level range limitation documented, §4.1 step 5
  cross-ref added, two new golden tests (`test_dotted_over_depth_locator_is_not_a_range`,
  `test_non_ascending_dash_is_not_a_range`). All present.

---

## 1. Notes (optional, non-blocking)

### N1 — A nice property of the non-ascending branch deserves one sentence

With the *correct* 3-level `अग्नि.र.` hint, `1-10-6` hits the
`seg_count == hint_depth` branch (level separators → `1.10.6`) and never reaches
the non-ascending branch. The non-ascending branch only fires when the
`ref_structure` hint is **wrong**. That means bullet 4 (`lo > hi`) is effectively
a *hint-drift detector*, not a locator-classifier. Stating this one line in
§4.1.1 would make clear why the bullet reads "usually a mis-stated
`ref_structure` or a citation typo" — and would justify a stronger diagnostic
code than the generic `REF-AMBIGUOUS-LOCATOR` (e.g. flag it as "check the bimap
depth"). Not required; just documentation.

### N2 — "Conservative reading" never sets `unresolved`; say so

For all the `REF-AMBIGUOUS-LOCATOR` branches, the emitted reference keeps
`unresolved: false` (the abbreviation *did* resolve), with a possibly-wrong
`locator`, and the runtime depth-overflow/unresolved check catches it. That is
the correct outcome and is the whole point of decision #2's cross-validation,
but it is never stated. One sentence in §4.2's `REF-AMBIGUOUS-LOCATOR` row
("emits `unresolved: false`; runtime is the authority") closes a reader's
"is this an error or not?" question.

### N3 — `?diagnostics=refs` vs `#diagnostics` are two un-reconciled entry points

§6.2 says the prod override is `?diagnostics=refs` (URL), while §6.5's page is a
`#diagnostics` hash route. In a hash-routed SPA these are different surfaces: a
`?` query on the *document* URL is dropped on internal navigation, and a `?` on
the *hash* (`#grantha:ref?diagnostics=refs`) is what `parseHash` actually reads.
State which one `?diagnostics=refs` is (recommend: a hash query parsed by the
same leading branch as `#diagnostics`), and note the localStorage persistence
already makes it moot after first toggle. This ambiguity predates round 4 and
has not been flagged before.

### N4 — The range machinery is unexercised by live data; justify retaining it

The pilot now carries a 6-branch disambiguation rule, `locator_end`, and a
`TODO(references)` range-aware-UI marker — none of which has a live instance in
the isavasya-vd corpus. Retention is defensible (ranges *do* exist elsewhere in
the corpus — e.g. brihadaranyaka's `8.4.7-11` range refs — and reserving
`locator_end` now avoids a schema bump later), but the plan should record the
"defer ranges entirely, treat all `-` as separators" alternative and why it was
rejected, so the scope isn't mistaken for accidental growth. One paragraph in
§4.1.1.

### N5 — §5 case 2(a) wording: "equals the locator prefix" should be "equals the locator"

For a partial locator `1.1`, the section marker to match has ref `1.1` — the
locator itself, not some longer "prefix" of it. The phrase "ref equals the
locator prefix" is loose; "ref equals the locator" is what the rule means.
Trivial, but §5 is the normative runtime spec and should be unambiguous.

### N6 — Whole-work `display_text` vs `start`/`end` span

§3 shows `शत.ब्रा.` → whole-work with the reference object, but the span
boundary (does `start`/`end` cover `शत.ब्रा.` excluding the parens, consistent
with the enumeration sub-spans) is implied, not stated. One line confirming
whole-work spans follow the same "exclude the parens" convention as ranges/
enumerations removes a renderer edge case.

---

## 2. What is final-quality

- The three-state schema + the "`locator: null` & `grantha_id: null` rejected"
  invariant.
- Single abbreviation authority with explicit delete end-state and a
  superset-and-same-id consistency check.
- The §4.1.1 dash-glyph-gated rule, which is now correct, total (no unhandled
  `seg_count`/glyph combination), and self-correcting against hint drift.
- The honest scoping (synthetic tests for the range branch; Bazel path out of
  pilot; verification flags where domain facts are asserted).
- The review loop itself: every finding in rounds 1–3 maps to a concrete,
  verifiable change in §0.

---

## 3. Bottom line

Implement. The six notes are documentation/precision edits (N5 is a one-word
fix), none change architecture. If only N5 and N2 are folded in before coding
starts, the rest can land with the Phase-6 docs pass.
