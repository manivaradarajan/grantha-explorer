# Orphaned Scripts Audit — grantha-explorer

**Date:** 2026-08-13
**Status:** Updated after deletion — the 15 confirmed orphans below were
**deleted** (see commit). `verify-sidebar-model.ts` and `devanagari_diff.py`
were kept by decision. This file now records what was removed and why, so the
rationale survives in history.

Audit method: for each `scripts/*.py` / `scripts/*.ts`, searched the whole repo
(excluding `node_modules`, `.next`, `.venv`, `__pycache__`, `.git`, and the
script's own file) for references in code, tests, docs, and config. A script is
"orphaned" if it is referenced only by other orphaned scripts.

## Live (do NOT delete)

| Script | Why live |
|---|---|
| `_build_parser.py` | imported by `convert_structured_md.py`, `import_editions.py` |
| `convert_structured_md.py` | flat/multipart converter; imported by `import_editions.py` |
| `import_editions.py` | multi-edition importer (DEFERRED.md) |
| `generate-granthas-json.ts` | `package.json` prebuild |
| `validate-data.ts` | `package.json` prebuild |
| `validate_data.py` | imported by `scripts/tests/test_kind_discriminator.py` |
| `validate_grantha_integrity.py` | `package.json` validate:integrity; imports `ref_validator_utils` |
| `grantha_markdown_validator.py` | `tests/test_grantha_markdown_validator.py` + GRANTHA_MARKDOWN.md |
| `hide_editor_comments.py` | `tests/test_hide_editor_comments.py` |
| `ref_validator_utils.py` | imported by `validate_grantha_integrity.py` |
| `check_title_resolution.py` | referenced in `DEFERRED.md` item 11 (active check) |

## Kept by decision (reusable, not one-off)

| Script | Why kept |
|---|---|
| `verify-sidebar-model.ts` | Verifies `getSidebarFlatModel` / curated-section invariants across the library. Not wired to CI, but a reusable verification harness for the sidebar model. |
| `devanagari_diff.py` | Standalone Devanagari-only diff. Superseded by the richer `grantha-data/tools/scripts/devanagari_tools/devanagari_diff.py`, but kept as a lightweight local tool. |

## Deleted (confirmed orphans) — 15 scripts

| Script | What it did | Why deleted |
|---|---|---|
| `conversion_script.py` | Converted `../../simple/data/*.json` (pre-explorer "simple" nested format) into flat `public/data/*.json` granthas. | Input `simple/` dir gone; texts now come from `structured_md`. |
| `convert-mundaka.py` | Same "simple" format, mundaka only → `mundaka-upanishad.json`, with a data-loss report. | Same — source gone; mundaka ingested via `structured_md`. |
| `add_commentary_ids.py` | Added missing `commentary_id` to `<!-- commentary: {"passage_ref": ...} -->` comments in `*.converted.md` files. | Targets deleted vishvas `.converted.md` files and the redundant `passage_ref` comment form the spec now ignores. |
| `add_markdown_headers.py` | Replaced frontmatter of brihadaranyaka `*.converted.md` files in `granthas/vishvas-brh` with proper YAML. | Whole `granthas/vishvas-brh/` tree deleted; source MD owned by grantha-data. |
| `migrate_add_kind.py` | Added `kind` discriminator + back-filled `schema_version` across library JSON, with hardcoded `EXPECTED_COUNTS`. | Migration done (validators read `kind` directly). Re-running would fail — hardcoded counts no longer match the grown library. |
| `update_metadata_parts.py` | Renamed `adhyayas` → `id` in old `metadata.json` `parts[]`. | `metadata.json` format replaced by `envelope.json`. |
| `cleanup-granthas-meta.ts` | Added placeholder `granthas-meta.json` entries from `ref:` links, deduped, sorted. | One-off; placeholders later hand-curated. |
| `sort-granthas-meta.ts` | Sorted `granthas-meta.json` by key. | One-off; file maintained directly now. |
| `final-merge.ts` | Merged duplicate abbreviation keys (`brihadaranyaka`/`chandogya`/`bhagavad-gita`→`gita`) in the meta file. | One-off; duplicates already merged. |
| `sync-grantha-titles.ts` | Synced `canonical_title` from **flat** library files into `granthas-meta.json`. | Flat-file era only; library now envelope/part-based; titles resolve at runtime. |
| `validate_md_refs.py` | Checked refs were monotonically increasing in `*.converted.md` files. | Input (`granthas/vishvas-brh`) deleted. |
| `validate_refs.py` | Same check for `part*.json`, reading the legacy plural `commentaries` field. | Superseded by live `validate_grantha_integrity.py`. |
| `test_ref_validators.py` | `unittest` suite for the two validators above. | Not collected — `pytest.ini` testpaths = `tests`, `scripts/tests`; this sat in `scripts/` root. Dead tests for dead validators. |
| `audit-abbreviations.ts` | Audited `(ref:...)` links against `granthas-meta.json` abbreviations. | One-off audit; outcome shipped (references/aliases feature). |
| `audit-unlinked-references.ts` | Found untagged Devanagari citations in library JSON. | One-off audit; no references. |

## Also flagged (not in `scripts/`)

- `tests/grantha_converter_test/` — contains **only** `__pycache__` residue;
  the source `.py` tests were removed in commit `9ff85a9`
  ("remove stale grantha_converter fork and orphaned tooling"). Safe to delete.
- `tests/test_data/test_prefatory_material.md` — unreferenced by any live
  test; safe to delete.

## Already deleted in an earlier pass (approved)

- 6 root `.mjs` verification/debug scripts
- `granthas/vishvas-brh/` (superseded by grantha-data `structured_md/`)
- `tools/grantha_converter/` (pycache residue)
- root `test_data/` (empty)
