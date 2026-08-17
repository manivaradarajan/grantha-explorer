# Grantha Data Flow — Consumer Side (grantha-explorer)

**Last updated:** 2026-08-13
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
- `_first_main_ref` falls back to the first prefatory ref, so preface-only
  parts (e.g. the gitabhashya mangalācaraṇa) are kept in the envelope.
  (Resolves Bug #2.)
- Mula extraction stops at the first `# Commentary:` sub-heading so a
  Sanskrit-wrapped commentary block is not swept into the passage mula.
- Commentary emission: a part carrying exactly one non-empty commentary emits
  the singular `commentary`; a part carrying two or more (e.g. a bhāṣya plus a
  subcommentary that declares `parent_commentary_id`) emits the plural
  `commentaries` array. `_resolve_target_commentary_ids` lists the ids; the
  aitareya case still emits only Rangaramanuja (Sayana is deferred separately).
- `SCHEMA_VERSION` (mirroring grantha-data's `VERSION`) is stamped on each
  part; re-sync the schema mirrors and bump it when the producer schema changes.

### 2.2 Multi-edition — `scripts/import_editions.py`

```
python3 scripts/import_editions.py \
  --source ../grantha-data/structured_md/upanishads/isavasya \
  --library-root public/data/library \
  --text-path upanishads/isavasya \
  --default-edition isavasya-upanishad-vedantadesika
```

- The `structured_md/<text>/BUILD` file is the authoritative edition
  declaration (`grantha_id` per markdown file).
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
  the flat/multipart path in §2.1, not the edition-directory layout.

---

## 3. Indexing — `scripts/generate-granthas-json.ts`

Runs in `prebuild` (`npm run build` / `build:local`). Reads the `library/`
tree and emits `public/data/generated/granthas.json` (gitignored, regenerated
each build).

- Dispatches on the explicit `kind` field of each `envelope.json` / flat file
  — **never infers shape from field presence**.
- `grantha-envelope` → resolves the default edition path, records `editions[]`
  on the index entry; also scans sibling `.json` files for co-located granthas
  (e.g. mandukya-karika).
- `edition-sub-envelope` → registers the directory path for its `grantha_id`.
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
- Cross-grantha reference links drop the edition (`ReferenceLink`); same-grantha
  references preserve it.

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

---

## 8. Known weaknesses (see also the canonical doc)

- Two parallel converters (grantha-data vs explorer) must be kept in sync.
- Manual 3-file registry sync before a grantha appears in the UI.
- `granthas.json` is gitignored and regenerated; a stale committed
  `granthas-meta.json`/`order` silently drops a grantha from the index.
