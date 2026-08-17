# Plan: Bring in Tātparya-candrikā as the first subcommentary

**Status:** full text shipped and committed — intro (`0.1`) + all 18 adhyāyas
(619 gloss passages). Both PRs open; **awaiting CI + merge** (see "Next steps").
**Repos:** ramanuja (source) → grantha-data (authoring, schema, producer converter)
→ grantha-explorer (schema mirror, consumer converter, regen, verify).

## Goal

Ship Deśika's *Tātparya-candrikā* (a ṭīkā on Rāmānuja's Gītābhāṣya) as the
**first subcommentary** in the `bhagavad-gita` grantha. The explorer already had
the full runtime plumbing (`parent_commentary_id`, `nestSubcommentaries`,
`CommentaryPanel`/`FlowReader` `?sc=` toggles) — this was a data + pipeline
milestone, not a UI one.

## Data model

A part carries the **plural `commentaries[]` array** when it has two or more
commentaries, and the singular `commentary` when exactly one (backward compat).
The subcommentary entry declares `parent_commentary_id: gita-bhashyam`; the
runtime nests it under the parent at load. A part must never emit both
`commentary` and `commentaries` (the loader's `normalizeCommentaries` drops the
plural when the singular is present). See the schema TODO below: the singular
field is slated for removal.

## What shipped

### grantha-data (producer) — commits `9ec11a9`, `e10fb85`, `3cef0b9`
- **Schema `1.1.0 → 1.2.0`**: added optional `commentaries` array (mutually
  exclusive with `commentary`) on `grantha.schema.json` and
  `grantha-part.schema.json`. `VERSION` + `CHANGELOG` updated.
- **Converter** `md_to_json.py`: emits plural when >1 non-empty commentary;
  `# Commentary:` heading regex widened to accept range refs (`1.26-39`).
- **Data**: `bhagavad-gita-01.md` … `-19.md` carry the tika, keyed to the verse
  range each gloss covers; `validation_hash` recomputed. `SOURCE_ISSUES.md`
  documents the run-together-word TODO and known issues.
- **Dev  digits PRESERVED**: the meghamala footnote markers (`[०-९]`) are kept
  verbatim (not stripped), per review. Only parts 1 (71 markers) and 15
  (ch14 `॥१४॥`) were affected by the earlier stripping; both restored.
- **Build fix**: `link_markup.py` was imported by `devanagari_extractor.py` /
  `md_to_json.py` but not packaged in the Bazel `BUILD` (pre-existing on main),
  failing all Bazel tests. Added a `link_markup` `py_library` + deps.
- **Docs**: `docs/DATA_FLOW.md` updated.

### grantha-explorer (consumer) — commit `ddce6e1`
- Schema mirrors re-synced from grantha-data `1.2.0`.
- `convert_structured_md.py` / `import_editions.py`: plural emission,
  `parent_commentary_id` passthrough, range-ref acceptance; `SCHEMA_VERSION`
  → `1.2.0`; plural-branch test added.
- `lib/data.ts`: `commentaryPassageForRef` matches 2-part ranges via a shared
  `refInRange` helper.
- `useGranthaLoader.ts`: lazy part-load merges into the nested parent and
  re-nests afterwards.
- `FlowReader.tsx`: टीका toggle under prefatory/concluding passages too;
  shared `renderSubcommentaries` helper.
- Regenerated `public/data/library/bhagavad-gita` (19 parts, 619 tika passages).
- Docs: `docs/DATA_FLOW.md`, `plans/PLAN_BRING_IN_TATPARYACHANDRIKA.md`,
  `WORKTREES.md` registry row.

## Verification (all green)

- grantha-data: 19/19 parts pass frontmatter + hash + schema; **all 18 Bazel
  tests in `//tools/lib/grantha_converter/...` pass**; pytest converter suite
  green.
- explorer: `validate:data` 101 PASS, sidebar model PASS, `tsc` + `eslint`
  clean.
- Loader simulation: `gita-bhashyam.subcommentaries = [tatparya-chandrika
  (619 passages)]`; every verse of all 18 adhyāyas resolves to its tika.

---

## Next steps (current worktree state)

1. **grantha-data PR #5** (`bring-in-tatparyachandrika` → main):
   https://github.com/manivaradarajan/grantha-data/pull/5 — CI was failing on
   the `link_markup` Bazel packaging; fixed and pushed (`3cef0b9`). **Confirm
   the rerun goes green, then merge (data first).**
2. **grantha-explorer PR #1**:
   https://github.com/manivaradarajan/grantha-explorer/pull/1 — depends on the
   data PR's schema (`commentaries[]`). **Merge after #5 lands.**
3. **Schema TODO (breaking → MAJOR)**: eliminate the singular `commentary` field
   and always emit the plural `commentaries` array. Marked with TODO comments in
   both schema files. When done: bump VERSION MAJOR, re-sync explorer mirrors,
   regen all library granthas.
4. **Register the other two worktrees** in `WORKTREES.md` (registry currently
   has only this one): `bring-in-ramayana-govindaraja` and
   `sribhashya-into-explorer`. Keep them on their own branches; commit + PR each
   when individually ready (heavy overlap on shared infra files — schema,
   `md_to_json.py`, `lib/data.ts` — so land sequentially, not one big merge).
5. **Reconcile explorer main's pre-existing uncommitted changes** before/after
   merging the branch into `main`: the main checkout has local edits to
   `scripts/convert_structured_md.py` and `.local/` that may conflict.

## Open items / deferred (see also `SOURCE_ISSUES.md`)

- **Run-together word cleanup** (the big one). The tika prose has glued words
  from the upstream meghamala dump (e.g. `प्रश्नस्ययत्र`). The Devanagari
  footnote digits are now **preserved**, so the cleanup pass should remove the
  digits *and* restore the word boundaries they sat between in one step
  (e.g. `प्रश्नस्य` + `२` + `यत्र` → `प्रश्नस्य यत्र`). Must distinguish real
  defects from legitimate long sandhi compounds (the bhashya's maṅgalācaraṇa
  is correct — don't split). Recompute hashes via
  `grantha-converter update-hash -i <file>`, then regen the explorer library.
- **Clickable cross-refs**: convert `रा.भा.1.19`, `म.भा.`, `मनुः 8.350`,
  `अष्टा.3.3.142` etc. to `ref:` links (needs an abbreviation entry for
  `रा.भा.` in `granthas-meta.json`).
- **Tika's own maṅgalācaraṇa**: currently folded into the top of the `0.1`
  passage; a dedicated `intro` treatment is possible later.
- **ch13 verse numbering**: the grantha's adhyāya 13 has 34 verses vs the
  tika's 35 (missing the Arjuna question verse); tika keys remapped `N → N-1`.
  If the mula is ever corrected, re-shift ch13 keys +1 and remove the remap.
- **ASCII punctuation artifacts** in the tika prose (`निर्माण. मुखेन`,
  `व्याचिख्यासु:,`) — fold into the run-together cleanup.
