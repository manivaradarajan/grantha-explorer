# Grantha Data Flow — Consumer Side (grantha-explorer)

**Last updated:** 2026-08-16
**Status:** Living document. Read **first**: the canonical producer-side
description in `../grantha-data/docs/DATA_FLOW.md` (source → BUILD → converter →
on-disk shapes). This file documents only what the explorer does: ingestion
into `public/data/library/`, indexing, validation, and runtime loading.

Keep both docs current whenever the ingestion/loader/indexing flow changes.

---

## 1. Where the data comes from

The explorer consumes `grantha-data/structured_md/` in two ways:

1. **Directly by re-deriving** the library JSON with its own scripts
   (the current, active path — see §2). These are *parallel* to the
   grantha-data Bazel converter and are the source of the known
   divergences listed in the canonical doc and in
   `structured_md/bhagavad-gita/BUGS.md`.
2. In principle, from the published `grantha-data` release artifact
   (`data/` tree). Today the committed `public/data/library/` is produced by
   the local scripts.

The three on-disk shapes (`grantha` flat file, `edition-sub-envelope`+parts,
`grantha-envelope`+editions) are described in the canonical doc §5.

---

## 2. Ingestion scripts (run manually, not part of `npm run build`)

### 2.1 Flat + multipart single-edition — `scripts/convert_structured_md.py`

```
python3 scripts/convert_structured_md.py \
  --source ../grantha-data/structured_md/upanishads/taittiriya \
  --out public/data/library/upanishads/taittiriya/taittiriya-upanishad
```

- Reads all publishable `.md` files from `--source` (BUILD-gated via
  `scripts/_build_parser.py`).
- Emits `envelope.json` (`edition-sub-envelope`) + `partN.json`
  (`grantha-part`).
- Passage-heading kinds are derived from each source file's `structure_levels`
  leaf keys (matching grantha-data's `get_all_structure_keys`) plus the
  `Prefatory` / `Concluding` framing kinds — see
  `passage_kinds_for` (`scripts/convert_structured_md.py`). The module-level
  `_PASSAGE_KINDS` is only a fallback for files without `structure_levels`,
  so a new passage kind needs no converter edit. (Resolves Bug #1.)
- `Adhikarana` is always recognized as a *structural* heading kind
  (`_STRUCTURAL_KINDS`) even though it is not a navigable `structure_levels`:
  the Brahma-sūtra sūtra refs (Adhyaya.Pada.Sutra) carry no adhikarana number,
  so `# Adhikarana <n>` must still segment content and anchor the
  `<!-- adhikarana-intro -->` fold without becoming a passage.
- `_first_main_ref` falls back to the first prefatory ref, so preface-only
  parts (e.g. the gitabhashya mangalācaraṇa) are kept in the envelope.
  (Resolves Bug #2.)
- Mula extraction stops at the first `# Commentary:` sub-heading so a
  Sanskrit-wrapped commentary block is not swept into the passage mula.
- Commentary emission: a part carrying exactly one non-empty commentary emits
  the singular `commentary`; a part carrying two or more (e.g. a bhāṣya plus a
  subcommentary that declares `parent_commentary_id`) emits the plural
  `commentaries` array. `_resolve_target_commentary_ids` returns every
  `commentary_id` in the file's own `commentaries_metadata` — there is no
  grantha-id-keyed special case, so the aitareya Śaṅkara edition ships its
  `sankara-bhashyam` while the Rangaramanuja edition ships only
  `rangaramanuja-muni-prakashika`. (Sayana is deferred by the flat converter's
  `_handle_aitareya_sayana` and never ships inline.)
- `SCHEMA_VERSION` (mirroring grantha-data's `VERSION`) is stamped on each
  part; re-sync the schema mirrors and bump it when the producer schema changes.
- **Cross-text references (pilot).** Each commentary passage's Devanagari is
  run through the shared producer-side library
  (`grantha_data.references`, extracted by `_extract_references`), emitting a
  schema-shaped `references[]` key when citations are found. The library lives
  in the sibling `grantha-data` checkout and is imported via the env-gated
  bootstrap (`scripts/grantha_data_bootstrap.py`): set
  `GRANTHA_DATA_TOOLS_LIB=<grantha-data>/tools/lib` (or have `grantha_data`
  installed) or the converter skips reference emission — best-effort, never
  blocks a conversion. Both converters also write a per-edition
  `references-report.json` (reference diagnostics: code, severity, source
  file, passage_ref, offsets, hint) next to the part files whenever any
  diagnostic was produced. See the pilot plan §4.1.2 / §8.1.

### 2.2 Multi-edition — `scripts/import_editions.py`

```
python3 scripts/import_editions.py \
  --source ../grantha-data/structured_md/upanishads/isavasya \
  --library-root public/data/library \
  --text-path upanishads/isavasya \
  --default-edition isavasya-upanishad-vedantadesika
```

- **Two source layouts** are supported by `discover_editions`:
  - **Flat** (existing): the text directory's own BUILD declares md2json rules;
    `grantha_id` per markdown file is authoritative.
  - **Recursive** (new): the text directory has no md2json BUILD but has
    one-level subdirectories each carrying a BUILD; each subdir's BUILD
    `grantha_id` is the edition_id and its declared `.md` files are aggregated
    under that edition. Example: `brahma-sutras/` with
    `{sribhashya,vedanta-sara,vedanta-deepam}/BUILD`. Discovery does not
    recurse deeper than `source_dir/*/BUILD`.
- `frontmatter_by_name` is keyed by `path.name`, so edition source filenames
  must be unique across subdirectories (true for brahma-sutra, whose editions
  use `<commentary>-NN-NN.md` prefixes).
- Groups editions into granthas by frontmatter `grantha_id`
  (`_group_editions_into_granthas`); editions whose id equals or extends the
  frontmatter `grantha_id` belong to that grantha, otherwise the edition is
  its own grantha (e.g. mandukya-karika).
- Writes a grantha-level `envelope.json` (`grantha-envelope`, `editions[]`
  with one `isDefault`), then per-edition directories each with an
  `edition-sub-envelope` + `partN.json`.
- Default edition precedence: `--default-edition` → `.default` marker file in
  the source dir → first alphabetically.
- Single-edition granthas found by this importer are **skipped** — they are
  the flat/multipart path in §2.1, not the edition-directory layout. When an
  exclusion leaves a text with a single edition, the importer writes nothing
  (no-op reversion to the flat layout) — a one-edition grantha-envelope is
  never produced.
- **`--exclude-editions PATTERN`** (repeatable, fnmatch against edition_id,
  e.g. `--exclude-editions '*sankara*'`) drops matching editions **before**
  grouping. Default: **include** everything the BUILD declares. This is the
  consumer-side switch for optionally dropping the Śaṅkara bhāṣya editions
  (the producer-side switch is removing the `:sankara_json` labels from
  `upanishads/BUILD`'s `all_upanishads_json`).
- **`--grantha-id ID`** (repeatable, **exact** match against the grouped
  grantha_id — not a prefix) restricts import to the named granthas. Applied
  to the grouped `granthas` dict immediately after `_group_editions_into_granthas`
  and before the per-grantha loop, so co-located granthas (e.g. mandukya +
  mandukya-karika in one source dir) can be imported one at a time without
  overwriting each other's envelopes.
- **Śaṅkara bhāṣya editions.** Each of the 10 upaniṣads with a Śaṅkara bhāṣya
  now declares it as a separate edition (same multi-edition model). `kena` has
  **two** Śaṅkara editions (pada + vakya). Re-ingest command per text passes
  `--default-edition <base-edition>` explicitly (alphabetical fallback would
  mis-select Śaṅkara for isavasya/mandukya).

### 2.3 Flat converter multi-grantha guard

`scripts/convert_structured_md.py` (`_collect_source_files`) now raises a clear
`ValueError` when a source dir's BUILD declares md2json rules for **more than
one distinct `grantha_id`** (e.g. a Rangaramanuja edition plus a Śaṅkara
edition), directing the user to `import_editions.py`. Without the guard, the
flat converter would union all declared files into a single
`edition_id == frontmatter grantha_id` stream, silently merging the Śaṅkara
files into the Rangaramanuja edition. Texts whose BUILD declares a single
grantha_id (kaushitaki, svetasvatara) remain flat-converter safe.

---

## 3. Indexing — `scripts/generate-granthas-json.ts`

Runs in `prebuild` (`npm run build` / `build:local`), and also at every
`npm run dev` start. Reads the `library/` tree and emits
`public/data/generated/granthas.json` (gitignored, regenerated on each build
and dev start). `npm run dev` is `tsx scripts/generate-granthas-json.ts &&
next dev` — it regenerates the index but does not run `validate:data` (that
stays on `prebuild`). A stale committed `granthas.json` cannot silently drop a
newly added grantha from dev.

- Dispatches on the explicit `kind` field of each `envelope.json` / flat file
  — **never infers shape from field presence**.
- `grantha-envelope` → resolves the default edition path, records `editions[]`
  on the index entry; also scans sibling `.json` files for co-located granthas
  (e.g. mandukya-karika).
- `edition-sub-envelope` → registers the directory path for its `grantha_id`
  (e.g. `ramayana/valmiki-ramayana`, 626 parts, one per sarga across all
  seven kāṇḍas).
- Flat `grantha` files → registered by `grantha_id`.
- Cross-references `granthas-meta.json` (titles, abbreviations) +
  `granthas-order.json` (display order) + `categories.json`
  (`text_categories` membership, `text_type_labels`). **A grantha appears in
  the UI only if it is present in `granthas-meta.json` AND on disk AND has a
  categories membership.**
- Unknown/missing `kind` → warns and recurses (fails open; a typo'd `kind`
  silently hides a grantha).

`lib/paths.ts` and `lib/data.ts` read the generated index — **never template a
path from `grantha_id`**. `resolveGranthaPath` throws on an unknown id.

---

## 4. Validation — `scripts/validate-data.ts` (and `validate:integrity`)

Runs in `prebuild` after indexing.

- Validates every `library/` JSON against the **mirrored** schemas
  (`grantha.schema.json`, `grantha-envelope.schema.json`,
  `grantha-part.schema.json`). These are read-only byte-identical copies of
  `grantha-data/formats/schemas/` (see `SCHEMAS.md`). **When the producer
  schema changes, re-sync the mirrors with `cp` before this passes.**
- Structure consistency: main-passage ref depth must equal
  `structure_levels` depth; ref segments numeric.
- Grantha-level envelopes: every `editions[].path` must resolve under
  `library/`.
- `scripts/validate_grantha_integrity.py` (via `npm run validate:integrity`)
  checks specific granthas.

---

## 5. Runtime loading — `lib/data.ts`, `hooks/useGranthaLoader.ts`

`loadGrantha(granthaId, editionId?)` (`lib/data.ts:300`):

1. Checks an in-memory cache keyed `granthaId::editionId` (editions coexist;
   foundation for a future side-by-side view).
2. Reads the index entry; for a multi-edition grantha resolves the selected
   edition: `editions.find(edition_id)` → `isDefault` → first. For
   single-edition, `edition_id = grantha_id` and the index path is used
   directly.
3. Directory (`envelope.json` present) → multipart: loads the parts matching
   the first part's structural id, merges prefatory/main/concluding,
   normalizes `commentary`/`commentaries` into a flat `commentaries[]`,
   merges by `commentary_id`, then nests subcommentaries under their parent
   (`nestSubcommentaries`, honoring `parent_commentary_id`).
4. Single file → flat grantha: same normalization + subcommentary nesting.

`hooks/useGranthaLoader.ts` wraps `loadGrantha` in TanStack Query
(`queryKey: ["grantha", granthaId, editionId ?? "default"]`), keeps the
previous edition visible during a switch (placeholderData), and exposes
`loadPart(firstRef)` for **lazy part loading** — it fetches `partN.json` on
demand and merges passages/commentary into the cached grantha in place.
`components/TextContent.tsx` triggers lazy loads via an IntersectionObserver
sentinel; `NavigationSidebar` renders placeholder groups for unloaded parts.

**The full runtime loading architecture — initial assembly, `useGranthaLoader`,
lazy-part triggers (section, sentinels, sidebar), and the compare-mode fan-out —
is documented in depth in `docs/LOADING_FLOW.md`. Keep that file current when
you change `lib/data.ts`, `hooks/useGranthaLoader.ts`, `hooks/useEditions.ts`,
`app/page.tsx`, `components/FlowReader.tsx`, `components/TextContent.tsx`, or
`components/NavigationSidebar.tsx`.**

---

## 6. URL hash routing and the UI

- State lives in the hash: `#<granthaId>:<verseRef>?e=<editionId>&co=1&sc=…`
  (`lib/hashUtils.ts`, `hooks/useVerseHash.ts`).
- `?e=` is the active **edition** (absent = default). `validateAndNormalizeHash`
  corrects an edition the grantha doesn't have to the default, and drops a
  stray `?e=` on single-edition granthas.
- `app/page.tsx` wires the hash to `useGranthaLoader`; switching grantha via
  `GranthaSelector` resets edition; `CommentarySelector` (shown only when the
  grantha has >1 edition) switches `?e=`. `CommentaryPanel` resolves the
  commentary passage for the selected ref, including `A.B.LO-HI` range refs
  (`commentaryPassageForRef`), and renders subcommentaries toggled by `?sc=`.
- **Cross-text references (pilot).** Commentary `references[]` (producer-emitted)
  render as links via the shared `renderCommentary.tsx` helper, which splits the
  raw Devanagari at each `[start, end)` offset and applies the markdown/DOMPurify
  transform per segment. `ReferenceLink` resolves a clicked/hovered citation
  against the target grantha (`loadGrantha` + `resolveReferenceTarget`,
  `lib/references.ts`): exact leaf, partial-locator section, whole-work root, or
  a runtime diagnostic. Cross-grantha reference links drop the edition;
  same-grantha references preserve it. See the pilot plan §5 / §7.

---

## 7. Adding a new text — checklist

1. Add/confirm the source in `grantha-data/structured_md/` + BUILD publication
   gate; confirm `text_type` is in the schema enum and `categories.json`
   `text_type_labels`.
2. Run the appropriate explorer converter (§2.1 or §2.2) into
   `public/data/library/`.
3. Re-sync schema mirrors if `formats/schemas/` changed.
4. Add/update `public/data/granthas-meta.json` (title, abbreviations),
   `public/data/granthas-order.json`, and `public/data/categories.json`
   (`text_categories`).
5. `npm run build` (prebuild regenerates `granthas.json` and validates).
6. New passage-heading kinds need **no** converter edit — kinds are derived
   from `structure_levels` (see §2.1).

### Example: Vālmīki Rāmāyaṇa (full corpus)

- Source: `grantha-data/structured_md/ramayana/valmiki-ramayana/` (626 parts,
  all seven kāṇḍas). The explorer ingests the full corpus under
  `public/data/library/ramayana/valmiki-ramayana/`.
- `text_type: ramayana` (new enum value in `grantha.schema.json` +
  `grantha-envelope.schema.json`; re-synced to the mirrors).
- `structure_levels: Kāṇḍa → Sarga → Śloka` (depth 3); passage kind `Shloka`
  derived from `structure_levels`, so no converter edit was needed.
- Each sarga's Govindarāja opening is a content-bearing `# Prefatory: K.N.0`
  praveśa passage (label प्रवेश; sarga 1.1's whole-work mangalācaraṇa is
  मङ्गलाचरणम्). Flow mode interleaves prefatory passages by ref so a praveśa
  renders before its sarga's first verse, and hides the label.
- Registered in all three data files; category `ramayana` (order 4) added to
  `categories.json`.
- All 626 part files carry the `ramayana-bhushana` commentary (Govindarāja).
  Twenty source sargas (documented in grantha-data `SOURCE_ISSUES.md`) are
  excluded from the producer, so the published corpus is 626 sargas; the
  excluded ones will slot back in at their kāṇḍa positions after re-extraction.

---

## 8. Known weaknesses (see also the canonical doc)

- Two parallel converters (grantha-data vs explorer) must be kept in sync.
- Manual 3-file registry sync before a grantha appears in the UI.
- `granthas.json` is gitignored and regenerated; a stale committed
  `granthas-meta.json`/`order` silently drops a grantha from the index.
