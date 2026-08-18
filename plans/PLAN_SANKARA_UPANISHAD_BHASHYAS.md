# Plan: Ingest the Śaṅkara Upaniṣad Bhāṣyas (all 10 texts) as separate editions

**Status:** ✅ **APPROVED** (rev 2 addressed all review findings;
`plans/PLAN_SANKARA_UPANISHAD_BHASHYAS_REVIEW.md` verdict: approved, with 4
optional non-blocking notes now folded into this plan — §4.1 exact-match +
ordering, §4.2 branch deletion, §4.4 kena default). Not yet implemented.
**Repos:** grantha-data (producer: BUILD restructure) → grantha-explorer
(consumer: importer flags, aitareya fix, guard, re-ingest, verify).
**Decisions already made (2026-08-17):**
- Both repos in scope.
- Sankara editions **included by default on both sides**; excluding later =
  one-line toggle on the producer side + one flag on the consumer side
  (see §3.2 / §4.1 — this rev makes the two consistent).
- Explorer exclusion mechanism: **`--exclude-editions` importer flag** (glob).
- **NEW (rev 2):** add a **`--grantha-id`** importer filter so co-located
  granthas (mandukya + mandukya-karika) import in one run instead of manual
  envelope surgery (§4.4). Resolves review M3 and the previous open question.

---

## 1. Goal

Ship Śaṅkara's bhāṣya on all 10 Upaniṣads where the source exists
(kaushitaki and svetasvatara have **no** Śaṅkara files — excluded) as
**separate editions of the existing granthas**, reusing the multi-edition
model already in place (isavasya / mandukya / brahma-sutra). The Śaṅkara
files live in `grantha-data/structured_md/upanishads/*/` today but are
**unpublished** — declared by no BUILD rule, so both explorer converters
already skip them ("preserved but not published"). This is purely additive.

The core ask: give the Śaṅkara files **their own BUILD group** per text so
they can be **optionally excluded later** without touching the Rangaramanuja
editions.

### Texts in scope

| Text | Śaṅkara files | Edition id(s) to add | Explorer today |
|---|---|---|---|
| taittiriya | 3 | `taittiriya-upanishad-sankara-bhashya` | single-edition |
| aitareya | 3 | `aitareya-upanishad-sankara-bhashya` | single-edition |
| brihadaranyaka | 6 | `brihadaranyaka-upanishad-sankara-bhashya` | single-edition |
| chandogya | 8 | `chhandogya-upanishad-sankara-bhashya` | single-edition |
| katha | 2 | `katha-upanishad-sankara-bhashya` | single-edition |
| kena | 8 (pada 4 + vakya 4) | `kena-upanishad-sankara-pada-bhashya`, `kena-upanishad-sankara-vakya-bhashya` | single-edition |
| mandukya | 4 | `mandukya-upanishad-sankara-bhashya` | multi-edition (2 eds) |
| mundaka | 3 | `mundaka-upanishad-sankara-bhashya` | single-edition |
| prashna | 6 | `prashna-upanishad-sankara-bhashya` | single-edition |
| isavasya | 1 | `isavasya-upanishad-sankara-bhashya` | multi-edition (2 eds) |
| kaushitaki | — | — | unchanged |
| svetasvatara | — | — | unchanged |

Each Śaṅkara file embeds the mūla + its own commentary
(`commentaries_metadata.commentary_id: sankara-bhashyam`; kena splits into
`sankara-pada-bhashyam` / `sankara-vakya-bhashyam`) with the **same**
`structure_levels` and `canonical_title` as the Rangaramanuja edition —
so each is a clean second/third edition of the existing grantha.

### Sayana — ignored, but NOT without a fix (review C1)
The aitareya Sāyaṇa deferral stays out of scope, **but** the code path that
implements it also silently strips the aitareya Śaṅkara edition's commentary.
This must be fixed as part of this work — see §4.2. Without the fix, the
aitareya Śaṅkara edition would publish with mūla but no bhāṣya (data loss).

---

## 2. Data model & layout after the change

Multi-edition layout (isavasya model), one grantha-envelope per text:

```
public/data/library/upanishads/taittiriya/
  envelope.json                          # kind: grantha-envelope, editions[]
  taittiriya-upanishad/                  # Rangaramanuja edition (isDefault, unchanged path)
    envelope.json                        #   kind: edition-sub-envelope, 3 parts
    part1..part3.json
  taittiriya-upanishad-sankara-bhashya/  # Śaṅkara edition
    envelope.json                        #   kind: edition-sub-envelope, 3 parts
    part1..part3.json
```

- 8 currently-single-edition texts migrate single → multi-edition (their
  Rangaramanuja edition dirs keep the same `…/<grantha_id>/` path).
- isavasya / mandukya gain a 3rd edition; their grantha-envelopes change.
- kaushitaki / svetasvatara stay single-edition (no Śaṅkara files).
- **No registry changes**: editions ride the existing `grantha_id`s already
  present in `granthas-meta.json` / `granthas-order.json` / `categories.json`.

---

## 3. Producer — grantha-data

### 3.1 Per-text BUILD: add a separate Śaṅkara rule + `sankara_json` filegroup

For each of the 10 texts, add to `structured_md/upanishads/<text>/BUILD`
alongside the existing rules (which are left untouched):

```python
# taittiriya example (multipart; isavasya uses grantha_md2json_single for its 1 file)
grantha_md2json_multipart(
    name = "sankara-bhashya",
    grantha_id = "taittiriya-upanishad-sankara-bhashya",   # edition id
    markdown_files = [
        "taittiriya-upanishad-sankara-bhashya-01.md",
        "taittiriya-upanishad-sankara-bhashya-02.md",
        "taittiriya-upanishad-sankara-bhashya-03.md",
    ],
)

filegroup(
    name = "sankara_json",
    srcs = [":sankara-bhashya"],
    visibility = ["//visibility:public"],
)
```

- **kena** gets **two** rules: `…-sankara-pada-bhashya` (4 files) and
  `…-sankara-vakya-bhashya` (4 files), both listed in `sankara_json`.
- The existing `json_files` filegroup is untouched — it still contains only
  the Rangaramanuja/other commentary rules. The Śaṅkara group is distinct.
- **Name collision check:** the `json_files` auto-alias only fires when
  `name == "md2json"` (see `grantha_converter.bzl`), so `name =
  "sankara-bhashya"` will not collide.

### 3.2 Category BUILD: include the Śaṅkara group by default (consistent posture — review M1)

`structured_md/upanishads/BUILD`:
- Add `filegroup(name = "all_upanishads_sankara_json", srcs = [//…:<text>:sankara_json …])`.
- **Add** the per-text `:sankara_json` labels to `all_upanishads_json` so the
  Śaṅkara editions are part of the default release artifact.

This makes the producer posture **consistent** with the consumer (§4.1):
both include Śaṅkara by default. The "optionally exclude later" toggle is:
producer — remove the `sankara_json` labels from `all_upanishads_json`;
consumer — pass `--exclude-editions '*sankara*'`. (Rev 1 had the producer
excluding by default while §1/§6 claimed "included by default" — resolved:
**canonical default is included on both sides**, since the explorer serves the
release-pipeline artifact per `grantha-data/docs/DATA_FLOW.md`.)

### 3.3 Docs (grantha-data)
- `docs/DATA_FLOW.md`: document the separate `sankara_json` group, that it
  IS aggregated into `all_upanishads_json` by default, the exclusion toggle,
  and that the explorer ingests Śaṅkara editions by default.

---

## 4. Consumer — grantha-explorer

### 4.1 `scripts/import_editions.py`: add `--exclude-editions` and `--grantha-id`

Add two CLI flags:
1. `--exclude-editions` (repeatable, glob via `fnmatch` against edition_id,
   e.g. `--exclude-editions '*sankara*'`).
2. `--grantha-id <id>` (repeatable) — restrict import to the named granthas.
   **Exact match** against the grouped grantha_id (review note 1): the value
   must equal the grantha_id, NOT be a prefix. So `--grantha-id mandukya-upanishad`
   matches only the upanishad grantha and `--grantha-id mandukya` matches
   **nothing** (it would not silently capture `mandukya-karika`). If prefix
   matching is ever wanted it must be an explicit separate flag; for this work
   exact matching is specified. This makes co-located grantha dirs (mandukya +
   mandukya-karika) importable in one run, targeting each grantha without
   cross-overwrite (review M3).

Behavior (default **includes** everything the BUILD declares):
1. After `discover_editions`, filter the `editions` dict by `--exclude-editions`
   (applies to edition_ids, i.e. the BUILD `grantha_id`s). Warn and list each
   excluded edition_id.
2. Filter **before** `_group_editions_into_granthas`, so the grantha-envelope
   `editions[]` reflects only the retained editions.
3. **Single-edition collapse is a no-op, not a one-edition envelope (review M2):**
   `import_grantha` skips any grantha with **fewer than two** editions
   (`import_editions.py:471`, `if len(edition_ids) < 2`). So a text whose
   editions all reduce to one (e.g. taittiriya with `*sankara*` excluded →
   only `taittiriya-upanishad`) writes **no grantha-envelope at all** and
   reverts to (leaves untouched) the flat single-edition layout. This is
   correct/intended — the importer never publishes single-edition granthas
   (rev 1 §5.5's "envelope has 1 edition" expectation was wrong).
4. **Apply `--grantha-id` to the grouped dict immediately after
   `_group_editions_into_granthas`, BEFORE the per-grantha loop** (review note
   3). The `< 2`-edition skip lives *inside* that loop (`import_editions.py:471`),
   so the grantha filter must be applied to the grouped `granthas` dict up front;
   a grantha not matching any filter is skipped there. Behaviorally the
   orderings agree, but filtering the grouped dict right after grouping keeps
   the code obvious.

### 4.2 Fix `_resolve_target_commentary_ids` — aitareya Śaṅkara edition (review C1)

`_resolve_target_commentary_ids` (convert_structured_md.py:1160) special-cases
aitareya on **`grantha_id` alone**, returning
`["rangaramanuja-muni-prakashika"]` for ANY aitareya file. The Śaṅkara edition
files also carry `grantha_id: aitareya-upanishad` but
`commentary_id: sankara-bhashyam`, so both the importer (`_write_edition`,
import_editions.py:384) and the flat path would strip the Śaṅkara commentary —
publishing mūla with no bhāṣya.

**Fix:** key the Sayana deferral on the file's **own** commentary set, not the
grantha_id. Concretely, the special-case must only force the Rangaramanuja
target when the file's `commentaries_metadata` includes
`rangaramanuja-muni-prakashika`; a Śaṅkara file (whose metadata is
`sankara-bhashyam`) must fall through to the generic
"use every commentary_id from the file's own frontmatter" path. (The Sayana
*deferral* logic in `convert_grantha` is flat-path-only and stays as-is.)

**Review note 2 — prefer deleting the branch outright:** the published
Rangaramanuja file's `commentaries_metadata` is exactly
`[rangaramanuja-muni-prakashika]`, so the generic "return the file's own ids"
path already yields the correct target; the `grantha_id == aitareya-upanishad`
branch is redundant for current data. Implementation should therefore
**delete the branch** (with a test that aitareya still emits only
`rangaramanuja-muni-prakashika` for the Rangaramanuja edition, plus the Śaṅkara
regression test below) rather than re-guard it — less special-case surface to
reason about. If deletion is infeasible (e.g. a future sayana-bearing
Rangaramanuja file), fall back to the narrowed-guard wording above.

**Regression test required:** importing
`aitareya-upanishad-sankara-bhashya-01.md` must emit
`commentary_id: sankara-bhashyam` (see §5.6).

### 4.3 `scripts/convert_structured_md.py`: guard against edition mixing

The flat (single-edition) converter's `_collect_source_files` unions **all**
`markdown_file(s)` declared in the BUILD across rules. Once a text's BUILD
declares >1 distinct `grantha_id` (Rangaramanuja + Śaṅkara), running the flat
converter would silently merge Śaṅkara files into the Rangaramanuja edition.

Add a guard in `_collect_source_files` (or `convert_grantha`): if the
directory's BUILD declares md2json rules for **more than one distinct
`grantha_id`**, raise a clear error:

```
<dir> declares multiple edition grantha_ids (...); this text must be
ingested with scripts/import_editions.py (multi-edition layout), not
the flat converter.
```

**Implementation note (review m3):** read `_build_parser.parse_build_rules`
(not `_build_declared_files`, which returns a filename union set and loses the
grantha_id grouping) and count distinct keys. `svetasvatara` / `kaushitaki`
(single grantha_id in BUILD) remain flat-converter safe.

### 4.4 Re-ingest the 10 texts via `import_editions.py`

For the 8 single-edition texts and the 2 multi-edition texts, run the
importer per text. **Always pass `--default-edition` explicitly** so the
Rangaramanuja (or Vedāntadeśika for isavasya) edition stays default:

| Text | `--text-path` | `--default-edition` |
|---|---|---|
| taittiriya | upanishads/taittiriya | taittiriya-upanishad |
| aitareya | upanishads/aitareya | aitareya-upanishad |
| brihadaranyaka | upanishads/brihadaranyaka | brihadaranyaka-upanishad |
| chandogya | upanishads/chandogya | chhandogya-upanishad |
| katha | upanishads/katha | katha-upanishad |
| kena | upanishads/kena | kena-upanishad || mundaka | upanishads/mundaka | mundaka-upanishad |
| prashna | upanishads/prashna | prashna-upanishad |
| isavasya | upanishads/isavasya | isavasya-upanishad-vedantadesika |
| mandukya | upanishads/mandukya | mandukya-upanishad-rangaramanuja |

**kena default confirmed (review note 4):** the Rangaramanuja rule's BUILD
`grantha_id` is `kena-upanishad` (verified — the on-disk edition_id is also
`kena-upanishad`), so `--default-edition kena-upanishad` correctly targets the
Rangaramanuja edition and does not collide with the base grantha id. The Śaṅkara
editions are `kena-upanishad-sankara-pada-bhashya` / `kena-upanishad-sankara-vakya-bhashya`,
which group under the same grantha.

Example:
```
python3 scripts/import_editions.py \
  --source ../grantha-data/structured_md/upanishads/taittiriya \
  --library-root public/data/library --text-path upanishads/taittiriya \
  --default-edition taittiriya-upanishad
```

Expected per text: grantha-envelope (editions[] = Rangaramanuja isDefault +
Śaṅkara) + edition dirs. The Rangaramanuja `partN.json` files should be
**byte-identical** to the current flat-converter output (both paths share
`parse_body` / `build_part_json` / `build_envelope_json`; ordering by
`part_num` is the same) — verify with `git diff` against a backup.

**mandukya (co-located granthas) — using `--grantha-id` (review M3, rev 1 §4.4 simplified):**
```
# Import only the mandukya-upanishad grantha (excludes mandukya-karika).
python3 scripts/import_editions.py \
  --source ../grantha-data/structured_md/upanishads/mandukya \
  --library-root public/data/library --text-path upanishads/mandukya \
  --default-edition mandukya-upanishad-rangaramanuja \
  --grantha-id mandukya-upanishad

# mandukya-karika is left untouched (its dir/envelope stays as-is).
```
`mandukya-karika/` in the library is **not** rewritten — the flag keeps the
two granthas' envelopes separate and reproduces the current split layout
without manual envelope editing. This removes the rev-1 "hand-append a stub"
surgery entirely.

**schema_version note (review m1):** the live `isavasya/envelope.json` and
`mandukya/envelope.json` are `schema_version: 1.0.0`; the importer stamps
`1.2.0`. Re-ingesting these two texts therefore bumps their grantha-envelopes
to `1.2.0` (and restamps edition stubs — e.g. the live entries use
`commentator.roman: ""`, the importer writes the Śaṅkara `roman` name). This
is **intentional** and schema-valid (`validate:data` accepts it) — acknowledge
it in the commit and diff review. No schema *shape* change is involved.

### 4.5 Validation wiring
- `validate:integrity` paths in `package.json` point at `…/<grantha_id>/`
  (the Rangaramanuja edition dirs) — these paths are **unchanged** by the
  migration, so the script stays valid. Optionally add one Śaṅkara integrity
  check (e.g. `…/taittiriya-upanishad-sankara-bhashya`) as a smoke test.
- The indexer handles grantha-envelope → editions[] with no change.
- `lib/paths.ts` / `lib/data.ts` read the generated index — no change.

### 4.6 Stale docstring fix (review m4)
`_group_editions_into_granthas`'s docstring (import_editions.py:304) claims the
mandukya karika's frontmatter `grantha_id` "is the upanishad's". In fact the
karika files carry `grantha_id: mandukya-karika`. The grouping still works
(karikas group under `mandukya-karika`), but fix the stale comment as part of
this work — it misled the §4.4 analysis.

### 4.7 Docs (grantha-explorer)
- `docs/DATA_FLOW.md`: document `--exclude-editions`, `--grantha-id`, the
  flat-converter multi-grantha guard, the aitareya `_resolve_target_commentary_ids`
  fix, and the Śaṅkara editions.

---

## 5. Verification

1. **grantha-data**: `bazel build` the new `sankara_json` targets; confirm they
   ARE now aggregated into `all_upanishads_json` (§3.2); pytest converter
   suite green.
2. **explorer regen**: `npm run build` (prebuild regenerates `granthas.json`
   + `validate:data` incl. schema + `verify-sidebar-model` + integrity;
   `next build`).
3. **Byte-stability**: `git diff` confirms the 8 Rangaramanuja edition dirs'
   `partN.json` are unchanged vs the pre-migration output.
   **chandogya caveat (review m5):** `_collect_source_files` has a
   duplicate-`part_num` alphabetical fallback that `_discover_flat` lacks;
   currently moot (chandogya `part_num`s are unique 1–8), but **assert** the
   byte-identical claim during verification rather than assume it.
4. **Default editions**: each text's grantha-envelope `isDefault` is the
   Rangaramanuja edition (Vedāntadeśika for isavasya).
5. **Exclusion round-trip (review M2, corrected expectation):**
   - **isavasya** (3 editions) with `--exclude-editions '*sankara*'` → envelope
     has **2** editions (vedantadesika, srivatsanarayana), no Śaṅkara dir. Then
     re-ingest without the flag to restore. This is the real two-edition
     demonstration of the flag.
   - **taittiriya** with `--exclude-editions '*sankara*'` → single edition
     remaining → importer writes **nothing** (skips `< 2`); the flat
     single-edition layout is left untouched. Document this as the intended
     no-op, not a bug.
6. **New tests (review m2):**
   - Unit: `--exclude-editions` filter, including the `< 2`-edition skip
     interaction (taittiriya collapses to a no-op).
   - Unit: `--grantha-id` filter (mandukya imports only the upanishad grantha).
   - Unit: flat-converter multi-grantha guard (a BUILD declaring >1 grantha_id
     raises).
   - Regression: aitareya Śaṅkara file imports with `commentary_id:
     sankara-bhashyam` (review C1).
7. `npx tsc --noEmit`, `npm run lint`, `npm test`, `pytest tests scripts/tests`.
8. Manual (`npm run dev`): each text's edition switcher (`?e=`) shows
   Rangaramanuja (default) + Śaṅkara; opening a verse renders mūla + Śaṅkara
   bhāṣya; kena shows pada + vakya editions; aitareya's Śaṅkara edition shows
   its bhāṣya (not stripped).

---

## 6. Known risks / review notes

- **kena** has **two** Śaṅkara editions (pada + vakya bhashya) — the only text
  with more than one Śaṅkara edition; `sankara_json` lists both rules.
- **mandukya** co-located-karika layout is handled by `--grantha-id` (§4.4);
  no manual envelope surgery. The `mandukya-karika` library dir is untouched.
- **Default edition ordering**: alphabetical grouping would pick Śaṅkara for
  isavasya (s < s < v) and kuranarayana for mandukya, so `--default-edition`
  is mandatory (§4.4) — the plan always passes it.
- **Flat-converter guard** is load-bearing: without it, running the flat
  converter on a migrated text corrupts the edition (merges Śaṅkara into
  Rangaramanuja). Do not skip §4.3.
- **Aitareya commentary fix** is load-bearing: without it, the Śaṅkara edition
  publishes with no bhāṣya (review C1). Do not skip §4.2.
- **No schema change**: editions, `commentary`/`commentaries`, structure
  levels, and `SCHEMA_VERSION` are all already supported — no producer schema
  bump, no explorer schema-mirror re-sync. However, re-ingesting isavasya /
  mandukya bumps their grantha-envelopes `schema_version` 1.0.0 → 1.2.0 and
  restamps stubs (review m1) — intentional, schema-valid, and reviewed in the
  diff.
- **Producer + consumer defaults are now consistent** (review M1): both include
  Śaṅkara by default. The two "exclude" toggles (§3.2, §4.1) are independent
  switches that must both be documented so future exclusions are applied on
  both sides.
- **Round-trip expectation corrected** (review M2): a text collapsing to one
  edition is a no-op reversion to flat, not a one-edition envelope.

---

## 7. Out of scope / deferred
- Sāyaṇa editions/deferral (all) — ignored per instruction, but the aitareya
  commentary-strip fix (§4.2) IS in scope.
- kaushitaki / svetasvatara Śaṅkara (no source files).
- Importing the producer's `all_upanishads_sankara_json` filegroup as a
  separately-named release target (it is aggregated into `all_upanishads_json`
  by default per §3.2).
