# Plan: Bring in Tātparya-candrikā as the first subcommentary

**Status:** full text shipped — intro (`0.1`) + all 18 adhyāyas.
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
plural when the singular is present).

## Changes

### grantha-data (producer)
- `formats/schemas/grantha.schema.json` + `grantha-part.schema.json`: added
  optional `commentaries` (array of the `commentary` def), mutually exclusive
  with `commentary`.
- `tools/lib/grantha_converter/md_to_json.py`: emit plural when >1 non-empty
  commentary (was: keep-first + warn).
- `VERSION` 1.1.0 → 1.2.0; `CHANGELOG` entry (compatible schema addition).
- `structured_md/bhagavad-gita/bhagavad-gita/bhagavad-gita-01.md` + `-02.md`:
  added `tatparya-chandrika` to `commentaries_metadata` and authored the tika
  blocks, keyed by verse ref (intro `0.1`; adhyāya 1 keys `1.1, 1.11, 1.13,
  1.14, 1.19, 1.23, 1.25, 1.30, 1.40, 1.41, 1.42, 1.47`).
- `validation_hash` recomputed (Devanagari-only SHA-256).

### grantha-explorer (consumer)
- Re-synced schema mirrors (`grantha.schema.json`, `grantha-part.schema.json`)
  via `cp` from `grantha-data/formats/schemas/`.
- `scripts/convert_structured_md.py` + `scripts/import_editions.py`: replaced
  single-`target_commentary_id` with `_resolve_target_commentary_ids` (list) and
  plural emission; carried `parent_commentary_id` through. `SCHEMA_VERSION`
  1.0.0 → 1.2.0.
- Regen `public/data/library/bhagavad-gita/bhagavad-gita/` (19 parts).
- `lib/data.ts`: refreshed the stale `commentary`/`commentaries` comments.

## Verification

- grantha-data: both edited files pass frontmatter + hash + schema validation;
  all 19 parts convert and validate; converter test suite green.
- explorer: `validate:data` (101 files PASS), `verify-sidebar-model` PASS,
  `generate-granthas-json` OK, `tsc --noEmit` + `eslint` clean.
- Loader simulation: `gita-bhashyam.subcommentaries = [tatparya-chandrika
  (13 passages)]`.

## Follow-ups (not in this pilot)

- **Run-together word cleanup.** The tika prose contains glued words from two
  sources: (a) upstream meghamala text where words were joined, and (b) our
  footnote-digit stripping (`[०-९]`) removing a digit that sat between two words
  (e.g. `प्रश्नस्य` + `२` + `यत्र` → `प्रश्नस्ययत्र`). These need a word-boundary
  restoration pass. **The md files are safe for such a pass — verified:**
  - Structure is intact and both converters (grantha-data + explorer) parse it;
    the fix is prose-only edits inside `# Commentary:` / `# Verse` blocks.
  - An edited file with a recomputed hash passes frontmatter + hash + schema
    validation (tested on bhagavad-gita-03.md).
  - Constraints the pass must honor: preserve the `# Commentary: <RANGE>` refs,
    `<!-- commentary -->` / `<!-- /commentary -->` tags, verse-number markers
    (`॥ १ ॥`), and inline cross-refs (`रा.भा.1.19`, `मनुः8.350`). Distinguish
    genuine defects from legitimate long sandhi compounds (the bhashya's
    mangalācaraṇa has very long but correct compounds — do not split those).
  - After editing, recompute the hash with the canonical tool per file:
    `grantha-converter update-hash -i <file>` (grantha-data venv), then regen
    the explorer library.
- Convert inline cross-refs (`रा.भा.1.19`, `म.भा.`, `मनुः`, `अष्टा.`) into
  clickable `ref:` links (needs an abbreviation entry for `रा.भा.`).
- The tika's own mangalācaraṇa verses are included at the top of the `0.1`
  passage; a dedicated `intro` treatment is possible later.
- **ch13 verse-numbering:** the grantha's adhyāya 13 lacks the Arjuna question
  verse (35 in the tika/standard vs 34 in the grantha), so tika verses were
  remapped `N → N-1`. If the grantha's mula is ever corrected to include that
  verse, the ch13 tika keys need a +1 re-shift.
