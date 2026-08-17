# Bring brahma-sutra into grantha-explorer — Handoff Plan

**Status:** ✅ Committed to `sribhashya-into-explorer` in both repos (2026-08-16).
**Last updated:** 2026-08-16.
**Branch:** `sribhashya-into-explorer` (in both repos).
**Worktrees:**
- grantha-data:  `/Users/mani/git-worktrees/grantha-data/sribhashya-into-explorer`
- grantha-explorer: `/Users/mani/git-worktrees/grantha-explorer/sribhashya-into-explorer`

---

## 0. RESUME HERE (after weeks away)

**What this is:** bringing the Brahma-sūtras with Rāmānuja's three commentaries
(Śrībhāṣya default, Vedāntasāra, Vedāntadīpa) into the explorer as a
multi-edition grantha-envelope. **Fully implemented, verified, and committed.**
No further code work is required unless you want to pick up the deferred items
below.

```sh
# Both worktrees are on the branch `sribhashya-into-explorer` (in each repo).
cd ~/git-worktrees/grantha-explorer/sribhashya-into-explorer
git status -sb                 # should be clean (committed)
npm install                    # one-time per worktree
npm run dev -- -p 3020         # run on 3020 to avoid colliding with other servers
# open http://localhost:3020/#brahma-sutra:1.1.1?m=flow
#   grantha selector: ब्रह्मसूत्रम्; editions: श्रीभाष्यम् / वेदान्तदीपः / श्रीवेदान्तसारः
```

**Data regen (only if you change `structured_md/` sources):**
```sh
# grantha-data worktree: after editing source .md, re-run the transform on that edition
python3 tools/scripts/sribhashya_converter/transform_sribhashya_markup.py \
  --dir structured_md/brahma-sutras/<edition> \
  --grantha-id brahma-sutra --commentary-id <edition> \
  --commentary-title <देवनागरी टाइटल> --canonical-title ब्रह्मसूत्रम् \
  --drop-structure-level Adhikarana

# explorer worktree: regenerate the library from the (already-committed) sources
rm -rf public/data/library/brahma-sutra
python3 scripts/import_editions.py \
  --source ../grantha-data/structured_md/brahma-sutras \
  --library-root public/data/library --text-path brahma-sutra \
  --default-edition brahma-sutra-sribhashya
npm run build                  # prebuild regenerates index + validates
```

**What's left / deferred (none blocking):**
- Adhikarana is **not** a navigable sidebar level — the sūtra refs (1.1.1 =
  Adhyaya.Pada.Sutra) carry no adhikarana number, so `structure_levels` is 3
  levels. Adhikarana context survives as a folded intro lead-in on each
  adhikarana's first sūtra. A dedicated Adhikarana UI is future work.
- Source dir rename `structured_md/brahma-sutras/` → `brahma-sutra/` (frontmatter
  already singular). Deferred cleanup.
- `_STRUCTURAL_KINDS` ("Adhikarana") is global to the converter (widened heading
  kind set) — safe, verified no other corpus file uses it.
- Teardown when eventually merging to main: `git worktree remove` both worktrees,
  then update the registry in `WORKTREES.md` and commit on main (see §9).

---

## 1. Goal & architecture

The grantha is **`brahma-sutra`** (the base sutra text, `text_type: sutra`,
canonical title **ब्रह्मसूत्रम्**). It is a **multi-edition grantha-envelope**
(isavasya model) whose editions are Rāmānuja's three commentaries, each
*embedding the sutra mūla* + its own commentary:

```
public/data/library/brahma-sutra/
  envelope.json                     # kind: grantha-envelope, editions[]
  brahma-sutra-sribhashya/          # edition: Śrībhāṣya  (commentary_id: sribhashya, isDefault)
    envelope.json                   #   kind: edition-sub-envelope, 16 parts
    part1..part16.json
  brahma-sutra-vedanta-sara/        # edition: Vedāntasāra (commentary_id: vedanta-sara)
  brahma-sutra-vedanta-deepam/      # edition: Vedāntadīpa (commentary_id: vedanta-deepam)
```

Future (not now): subcommentary editions with `commentary_of: <parent
commentary_id>` (e.g. `brahma-sutra-srutaprakasika` with `commentary_of:
sribhashya`); other direct commentaries (śaṅkara, bhāskara). The schema + UI
already support all of this (`edition_stub.commentary_of`,
`commentary.parent_commentary_id`, `nestSubcommentaries`, `?e=`/`?sc=`).

**Mūla model:** embedded per edition (matches isavasya/gita). A shared base
mūla grantha is deferred (grantha-data issue #4).

---

## 1a. Structure-levels decision (2026-08-16)

The source frontmatter originally declared **4 levels** (Adhyaya→Pada→
Adhikarana→Sutra), but the sūtra refs are **3 segments** (`1.1.1` =
Adhyaya.Pada.Sutra) — the adhikarana number is not in the ref. Materializing
the Adhikarana level as navigable broke `verify-sidebar-model` (each sūtra
became an empty placeholder "अधिकरणम् N" section; 533 check failures →
`npm run build` failed).

**Resolution (user decision):** make `structure_levels` **Adhyaya→Pada→Sutra**
in all 48 source files, and keep `# Adhikarana <n>` recognized by the explorer
converter as a structural-only heading kind (`_STRUCTURAL_KINDS`), so it still
segments content and the `<!-- adhikarana-intro -->` fold fires. Adhikarana
context survives as the folded intro lead-in on each adhikarana's first sūtra.
A dedicated Adhikarana UI representation is deferred (§7).

**Consequences:**
- The transform script now drops the Adhikarana level via
  `--drop-structure-level Adhikarana`.
- The sidebar renders Adhyaya→Pada→Sutra (16 sections), all checks green.
- See §8a for the executed state and rerun commands.

---

## 2. Current state (verified 2026-08-16)

### grantha-data worktree (on `sribhashya-into-explorer`)
| Path | State |
|---|---|
| `structured_md/brahma-sutras/sribhashya/*.md` (16) | **Modified** — re-marked to gita model, but `grantha_id: brahma-sutras` (plural, WRONG → must be `brahma-sutra`), `canonical_title: श्रीभाष्यम्` (WRONG → must be ब्रह्मसूत्रम्), `part_num: 1` for all (non-unique), `text_type: sutra` ✓, `commentaries_metadata` ✓ |
| `tools/scripts/sribhashya_converter/transform_sribhashya_markup.py` | **New (untracked)** — one-off transform; hardcodes `GRANTHA_ID="brahma-sutras"`, `COMMENTARY_ID="sribhashya"`, `COMMENTARY_TITLE="श्रीभाष्यम्"`; does NOT handle `canonical_title` or `part_num` |
| `structured_md/brahma-sutras/sribhashya/BUILD` | Unchanged: `grantha_id = "sribhashya"` (→ must be `brahma-sutra-sribhashya`) |
| `structured_md/brahma-sutras/vedanta-sara/` (16 md) | Untouched (verified identical structure: 545 sutras, mūla-first-line+danda-ref) |
| `structured_md/brahma-sutras/vedanta-deepam/` (16 md) | Untouched (identical structure) |
| `structured_md/brahma-sutras/BUILD` | Category aggregator (filegroup), unchanged |

All three editions: 16 content files each, `part_num: 1` everywhere,
`text_type: brahma-sutra-bhashya` (original), author रामानुजः, same 4-level
structure (Adhyaya→Pada→Adhikarana→Sutra), 156 adhikaranas, 545 sutras.
Adhikarana prose counts differ (sribhashya 27, vedanta-sara 1, vedanta-deepam 0)
— the transform only emits `<!-- adhikarana-intro -->` when prose exists.

### grantha-explorer worktree (on `sribhashya-into-explorer`)
| Path | State |
|---|---|
| `scripts/convert_structured_md.py` | **Modified** — added `_ADHIKARANA_INTRO_RE` + `pending_adhikarana_intro` fold (32-line diff). Verified: all 545 sutras fold adhikarana-intro into first-sutra commentary intro; 37 pytest pass. ✓ CORRECT, keep |
| `public/data/library/brahma-sutras/brahma-sutras/` | **New (untracked)** — single-edition output (WRONG container, grantha_id plural). To be deleted |
| `public/data/granthas-meta.json` | **Modified** — added `brahma-sutras` (plural, WRONG → remove). Existing `brahma-sutra` key (title ब्रह्मसूत्रम्) already present ✓ |
| `public/data/granthas-order.json` | **Modified** — appended `brahma-sutras` (plural, WRONG → change to `brahma-sutra`) |
| `public/data/categories.json` | **Modified** — added `brahma-sutras` category (WRONG → `brahma-sutra`) + `text_categories.brahma-sutras` |
| `plans/adhikarana-mockup.html` | New — design mockup (keep) |

---

## 3. Review findings (must-fix)

Final objective review (2026-08-16) against actual code surfaced:

1. **CRITICAL — grantha-envelope title.** `_write_grantha_envelope` stamps
   `canonical_title` from the first edition's frontmatter. Since the default
   edition (sribhashya) has `canonical_title: श्रीभाष्यम्`, the grantha would
   be mislabeled as the Śrībhāṣya. **Fix:** transform must set
   `canonical_title: ब्रह्मसूत्रम्` (base) in ALL editions; per-edition names
   (`श्रीभाष्यम्`/`श्रीवेदान्तसारः`/`वेदान्तदीपः`) live in
   `commentaries_metadata.commentary_title`.
2. **MAJOR — `part_num` non-unique.** All files are `part_num: 1`; converter
   falls back to filename order (works by luck). **Fix:** transform assigns
   `part_num: 1..16` per edition.
3. **MAJOR — recursive importer is new code.** The flat→recursive
   `discover_editions` change is the only untested path. `frontmatter_by_name`
   is keyed by `path.name` — safe only because the three editions use distinct
   filename prefixes (`sribhashya-`, `vedanta-sara-`, `vedanta-deepam-`).
   Default edition via `--default-edition brahma-sutra-sribhashya` (drop the
   `.default` marker concern).
4. Registry edits used plural `brahma-sutras` — must be `brahma-sutra`.
5. Confirmed OK: `_group_editions_into_granthas` groups
   `brahma-sutra-<edition>` → `brahma-sutra`; `_edition_stub_meta` reads
   `commentaries_metadata[0]` for stub title/commentator.

---

## 4. Part 1 — grantha-data

### 4.1 Generalize the transform script
File: `tools/scripts/sribhashya_converter/transform_sribhashya_markup.py`.

Add CLI args (with defaults for sribhashya) and wire through the constants:
- `--grantha-id` (default `brahma-sutra`)
- `--commentary-id` (default `sribhashya`)
- `--commentary-title` (default `श्रीभाष्यम्`)
- `--canonical-title` (default `ब्रह्मसूत्रम्`)
- `--part-num-base` (assign part_num 1..N per file, replacing the non-unique 1s)

Frontmatter builder must now also:
- set `canonical_title: <--canonical-title>` (currently untouched → add `_CANONICAL_TITLE` regex)
- assign sequential `part_num` per file (add `_PART_NUM` regex; the script already processes files individually, so derive index from `_first_main_ref`/filename order — the file's `part_num` should be its 1-based position in the edition's 16 files, i.e. 1→01-01, 2→01-02, … 16→04-04)
- keep `grantha_id`, `text_type: sutra`, `commentaries_metadata` as-is

### 4.2 Re-run on sribhashya
```
python3 tools/scripts/sribhashya_converter/transform_sribhashya_markup.py \
  --dir structured_md/brahma-sutras/sribhashya \
  --grantha-id brahma-sutra --commentary-id sribhashya \
  --commentary-title श्रीभाष्यम् --canonical-title ब्रह्मसूत्रम्
```
(Reset the 16 files to HEAD first: `git checkout -- …/sribhashya/*.md`, since
they are already transformed and `is_transformed` skips them.)

Verify: frontmatter `grantha_id: brahma-sutra`, `canonical_title: ब्रह्मसूत्रम्`,
`part_num: 1..16`, `commentaries_metadata.commentary_title: श्रीभाष्यम्`.

### 4.3 Transform vedanta-sara + vedanta-deepam
```
python3 …/transform_sribhashya_markup.py --dir …/vedanta-sara \
  --grantha-id brahma-sutra --commentary-id vedanta-sara \
  --commentary-title श्रीवेदान्तसारः --canonical-title ब्रह्मसूत्रम्
python3 …/transform_sribhashya_markup.py --dir …/vedanta-deepam \
  --grantha-id brahma-sutra --commentary-id vedanta-deepam \
  --commentary-title वेदान्तदीपः --canonical-title ब्रह्मसूत्रम्
```

### 4.4 Update BUILD grantha_ids (edition identity)
- `sribhashya/BUILD`: `grantha_id = "sribhashya"` → `"brahma-sutra-sribhashya"`
- `vedanta-sara/BUILD`: → `"brahma-sutra-vedanta-sara"`
- `vedanta-deepam/BUILD`: → `"brahma-sutra-vedanta-deepam"`

Frontmatter `grantha_id` stays `brahma-sutra` in all three (the importer uses
frontmatter for grantha grouping, BUILD for edition identity).

### 4.5 Docs
- `formats/GRANTHA_MARKDOWN.md`: document `<!-- adhikarana-intro -->`.
- `docs/DATA_FLOW.md` (grantha-data): note brahma-sutra multi-edition + the
  adhikarana-intro fold semantics + `brahma-sutras`→`brahma-sutra` dir rename
  pending.

---

## 5. Part 2 — grantha-explorer

### 5.1 Recursive `discover_editions` in `scripts/import_editions.py`
Currently `discover_editions(source_dir)` scans `source_dir.glob("*.md")` (flat)
and reads `source_dir/BUILD`. Extend to:
- If `source_dir` has BUILD: keep flat behavior (backward compatible).
- Else if `source_dir` has subdirectories each with a BUILD: treat each
  subdir's BUILD as declaring its edition (`grantha_id` = edition_id), and
  aggregate all `.md` files across subdirs into `editions[edition_id]`.
- Keep `frontmatter_by_name` keyed by `path.name`; document the assumption
  that edition filenames are unique across subdirs (true here).
- Do NOT recurse into arbitrary depths (one level: `source_dir/*/BUILD`).

### 5.2 Generate the grantha-envelope
Delete the wrong single-edition output first:
```
rm -rf public/data/library/brahma-sutras
```
Then run the importer over the brahma-sutras source dir (which now contains
the three edition subdirs):
```
python3 scripts/import_editions.py \
  --source /Users/mani/git-worktrees/grantha-data/sribhashya-into-explorer/structured_md/brahma-sutras \
  --library-root public/data/library \
  --text-path brahma-sutra \
  --default-edition brahma-sutra-sribhashya
```
Expected: `library/brahma-sutra/envelope.json` (grantha-envelope, 3 editions,
sribhashya isDefault) + per-edition dirs (edition-sub-envelope + 16 parts).

### 5.3 Registry (revert plural → singular)
- `granthas-meta.json`: remove `brahma-sutras` key; keep existing
  `brahma-sutra` (title ब्रह्मसूत्रम्). Optionally remove stale
  `sri-bhashya` key (it was the commentary-as-grantha; now the commentary is an
  edition). `sri-bhashya` removal is optional/cleanup.
- `granthas-order.json`: replace `brahma-sutras` entry → `brahma-sutra`.
- `categories.json`: rename category `brahma-sutras` → `brahma-sutra`;
  `text_categories.brahma-sutras` → `text_categories.brahma-sutra =
  ["brahma-sutra"]`.

### 5.4 Build + validate
```
npm run build        # prebuild regenerates granthas.json + validates
npm run validate:data
```
Verify: envelope `canonical_title == ब्रह्मसूत्रम्`; each edition stub's
`commentary_title` correct; 3 editions in index; default = sribhashya.

---

## 6. Part 3 — verify
- `npx tsc --noEmit`, `npm run lint`, `pytest tests scripts/tests` — all green.
- Manual (npm run dev): grantha selector shows ब्रह्मसूत्रम्; edition switcher
  (`?e=`) shows Rāmānuja's three (default Śrībhāṣya); adhikarana-intro renders
  as a lead-in before each adhikarana's first sutra; 3-level sidebar navigation
  (Adhyaya→Pada→Sutra — see §1a; a dedicated Adhikarana UI representation is
  deferred).
- Re-run the sribhashya converter smoke test to confirm the 545 sutra /
  545 commentary passage invariant (verified: sribhashya 545/545,
  vedanta-sara 545/545, vedanta-deepam 545/539 — deepam has 6 sūtras without
  a commentary passage, a data property, not a regression).

---

## 7. Deferred (explicitly not in this pass)
- Source dir rename `structured_md/brahma-sutras/` → `brahma-sutra/` (user:
  later cleanup step).
- Shared base-mūla grantha (grantha-data issue #4, cross-referenced mūla).
- śaṅkara/bhāskara editions; srutaprakasika subcommentary (convention only).
- `sri-bhashya` stale meta-key cleanup (optional).
- Dedicated Adhikarana UI representation (navigation/grouping; the intro fold
  is the interim carrier — see §1a).

---

## 8a. Executed state (2026-08-16)

Part 1 (grantha-data) — DONE, **committed**:
- `tools/scripts/sribhashya_converter/transform_sribhashya_markup.py`
  generalized: `--grantha-id --commentary-id --commentary-title
  --canonical-title --part-num-base --drop-structure-level`; stamps
  `canonical_title`, sequential `part_num`, and drops `structure_levels`
  levels via a YAML-parse + re-serialize (robust to indent/script changes,
  promotes the dropped level's children).
- All 48 files (3 editions × 16) transformed: `grantha_id: brahma-sutra`,
  `canonical_title: ब्रह्मसूत्रम्`, `part_num: 1..16`,
  `structure_levels` Adhyaya→Pada→Sutra, per-edition
  `commentaries_metadata`.
- BUILD grantha_ids: `brahma-sutra-sribhashya` / `brahma-sutra-vedanta-sara`
  / `brahma-sutra-vedanta-deepam`.
- Docs: GRANTHA_MARKDOWN.md §3.9, DATA_FLOW.md (brahma-sutra note,
  structure-levels, adhikarana-intro, pending rename).

Part 2 (grantha-explorer) — DONE, **committed**:
- `scripts/import_editions.py` `discover_editions` now recurses one level into
  per-edition subdirectories (each subdir BUILD = edition; recurses only when
  the source dir has no top-level `.md` files); flat layout unchanged; warns on
  cross-subdir collisions; BUILD parsed once.
- `scripts/convert_structured_md.py` `passage_kinds_for` recognizes
  `Adhikarana` as a structural-only heading kind (`_STRUCTURAL_KINDS`);
  `pending_adhikarana_intro` fold fixed (cleared on each interior heading,
  folded before the intro-only hoist).
- `public/data/library/brahma-sutra/` generated (grantha-envelope + 3 edition
  sub-envelopes + 16 parts each); wrong plural `brahma-sutras/` deleted.
- Registry: `brahma-sutra` (singular) in meta (already present), order,
  categories; stale `sri-bhashya` meta key removed.
- `lib/data.ts` initial multi-part combine dedups prefatory/concluding by ref;
  FlowReader/Compare/Folio keys are kind-prefixed (`prefatory-0.1` vs
  `concluding-0.1`) — resolves the duplicate-key bug when a grantha reuses a
  ref for its opening and closing anchors.
- Edition labels are single-line "title - author" across panes/flow/mobile.
- Docs: DATA_FLOW.md (recursive discovery, Adhikarana heading kind).

Part 3 (verify) — DONE:
- `npm run build` green (prebuild: index + validate-data 153 PASS +
  verify-sidebar-model ALL PASS + integrity; next build ok).
- `npx tsc --noEmit` ✓, `npm run lint` ✓, `pytest tests scripts/tests`
  (37 passed, 2 skipped) ✓, grantha-data `pytest
  tools/scripts/sribhashya_converter/` (19 passed) ✓.
- Browser e2e (Playwright): single/3-way compare flow, opening adhyāya 4
  (the dup-key repro), panes 4.1.1, isavasya flat-compare — zero console errors.

Remaining (see §0): manual UI polish for a dedicated Adhikarana representation
(deferred), `brahma-sutras`→`brahma-sutra` source dir rename (deferred).

---

## 9. Teardown (when the idea merges to main)

```sh
# 1. Ensure both worktrees are committed & pushed.
cd ~/git-worktrees/grantha-explorer/sribhashya-into-explorer && git status -sb
cd ~/git-worktrees/grantha-data/sribhashya-into-explorer   && git status -sb

# 2. Merge the branches into each repo's main, then remove the worktrees.
#    (In the grantha-explorer repo — the data repo mirrors this.)
git -C ~/git-worktrees/grantha-explorer/sribhashya-into-explorer checkout main
git -C ~/git-worktrees/grantha-explorer/sribhashya-into-explorer merge sribhashya-into-explorer
git -C ~/git-worktrees/grantha-explorer/sribhashya-into-explorer worktree remove \
  ~/git-worktrees/grantha-explorer/sribhashya-into-explorer
# Repeat for the grantha-data worktree.

# 3. Update the WORKTREES.md registry (remove the row) and commit on main.
```

---

## 8. Known risks / notes
- The recursive importer was the one untested new code path (Part 2.1);
  verified against both the flat (isavasya) and recursive (brahma-sutras)
  layouts and covered by the build gates.
- All three editions share the SAME 545 sutra mūla (identical refs) — expected
  under the embedded model; mūla is duplicated across editions by design.
- `grantha_markdown_validator.py` (explorer) is stale and rejects even the
  current gita files — not a gate; rely on `validate-data.ts` + the converter.
- The `brahma-sutras`→`brahma-sutra` naming must be consistent across: source
  frontmatter, BUILD edition_ids, library paths, meta/order/categories.
