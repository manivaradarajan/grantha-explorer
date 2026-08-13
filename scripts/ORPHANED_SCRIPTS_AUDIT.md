# Orphaned Scripts Audit — grantha-explorer

**Date:** 2026-08-13
**Status:** Audit report only. **No scripts were deleted** — this list is for
sign-off before removal.

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

## Orphaned — delete candidates (awaiting sign-off)

| Script | Notes |
|---|---|
| `add_commentary_ids.py` | one-off migration; no refs |
| `add_markdown_headers.py` | referenced `granthas/` dir (now deleted); no refs |
| `conversion_script.py` | one-off; no refs |
| `convert-mundaka.py` | one-off; no refs |
| `devanagari_diff.py` | superseded by grantha-data `devanagari_tools`; no refs |
| `migrate_add_kind.py` | one-off kind migration; no refs |
| `update_metadata_parts.py` | one-off; no refs |
| `validate_refs.py` | only referenced by orphaned `test_ref_validators.py` |
| `validate_md_refs.py` | only referenced by orphaned `test_ref_validators.py` |
| `test_ref_validators.py` | NOT in pytest testpaths (`tests`, `scripts/tests`); orphaned test |
| `audit-abbreviations.ts` | one-off audit; no refs |
| `audit-unlinked-references.ts` | one-off audit; no refs |
| `cleanup-granthas-meta.ts` | one-off; no refs |
| `final-merge.ts` | one-off; no refs |
| `sort-granthas-meta.ts` | one-off; no refs |
| `sync-grantha-titles.ts` | one-off; no refs |
| `verify-sidebar-model.ts` | self-reference only |

## Also flagged (not in `scripts/`)

- `tests/grantha_converter_test/` — contains **only** `__pycache__` residue;
  the source `.py` tests were removed in commit `9ff85a9`
  ("remove stale grantha_converter fork and orphaned tooling"). Safe to delete.
- `tests/test_data/test_prefatory_material.md` — unreferenced by any live
  test; safe to delete.

## Already deleted this pass (approved in the plan)

- 6 root `.mjs` verification/debug scripts
- `granthas/vishvas-brh/` (superseded by grantha-data `structured_md/`)
- `tools/grantha_converter/` (pycache residue)
- root `test_data/` (empty)
