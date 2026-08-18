# Review: Plan — Ingest the Śaṅkara Upaniṣad Bhāṣyas (all 10 texts) as separate editions

**Reviewed:** 2026-08-17
**Plan revision:** 2 (`PLAN_SANKARA_UPANISHAD_BHASHYAS.md`, "rev 2")
**Verdict:** **APPROVED** — proceed to implementation. All rev-1 findings
(Critical + 3 Major + 5 Minor) are addressed and verified against the code.
Only a handful of optional, non-blocking notes remain.

---

## Rev-2 resolution summary (verified, not assumed)

| Rev-1 finding | Rev-2 disposition | Verified |
|---|---|---|
| **C1** aitareya Śaṅkara commentary stripped | §4.2 fix: key the special-case on the file's own `commentaries_metadata` instead of `grantha_id` | ✅ Correct — `_resolve_target_commentary_ids` is called with `frontmatter["grantha_id"]` in both paths (`convert_structured_md.py:1344`, `import_editions.py:384`), and the Śaṅkara files carry `commentary_id: sankara-bhashyam` |
| **M1** producer default inconsistent | §3.2 now adds `sankara_json` labels into `all_upanishads_json` (included by default on both sides) | ✅ Consistent; §1/§3.2/§6/§7 now agree |
| **M2** §5.5 round-trip expectation wrong | §4.1.3 + §5.5 corrected: `<2`-edition granthas are skipped (no-op), not one-edition envelopes | ✅ Matches `import_editions.py:471` |
| **M3** mandukya manual envelope surgery | Replaced with a `--grantha-id` importer filter (§4.1, §4.4) | ✅ Correct — see verification note below |
| **m1** schema_version 1.0.0→1.2.0 drift | §4.4 acknowledged as intentional, schema-valid | ✅ `import_editions.py:56` stamps `1.2.0`; live isavasya/mandukya envelopes are `1.0.0` |
| **m2** no new tests | §5.6 adds 4 test classes (exclude, grantha-id, guard, aitareya regression) | ✅ |
| **m3** guard needs `parse_build_rules` | §4.3 names `_build_parser.parse_build_rules` and the union-set caveat | ✅ Correct — `_build_declared_files` returns a `set`; distinct grantha_ids must come from `parse_build_rules` |
| **m4** stale `_group_editions_into_granthas` docstring | §4.6 fixes it | ✅ karika files carry `grantha_id: mandukya-karika`, so grouping is by that id, not "the upanishad's" |
| **m5** chandogya byte-identical caveat | §5.3 asserts rather than assumes | ✅ |

---

## New item I verified this round: the `--grantha-id` filter actually works

`_group_editions_into_granthas` groups mandukya into **two** granthas: the
upanishad editions (`…-rangaramanuja`, `…-kuranarayana`, `…-sankara-bhashya`
all start with `mandukya-upanishad-`, whose frontmatter `grantha_id` is
`mandukya-upanishad`) and the karikas (`mandukya-karika-bharadvajaramanujacharya`
/ `…-kuranarayana`, frontmatter `grantha_id: mandukya-karika`). Without a
filter the importer would write both grantha-envelopes to the same
`dest_dir/envelope.json`, so §4.4's `--grantha-id mandukya-upanishad` run with
`--text-path upanishads/mandukya` correctly isolates the upanishad grantha and
leaves `upanishads/mandukya-karika/` untouched. The approach is sound.

Also verified: the aitareya Sayana deferral is **already a no-op** today — the
Rangaramanuja file's body contains no `sayana-bhashya` blocks (sayana lives in a
separate, BUILD-undeclared `aitareya-upanishad-sayana-01-01.md`), so
`_handle_aitareya_sayana` finds nothing to defer. The migration therefore loses
no Sayana deferral, and §4.2's "deferral logic stays as-is" claim holds.

---

## Remaining notes (optional, non-blocking)

1. **`--grantha-id` matching semantics underspecified.** §4.1 says "restrict
   import to the named granthas" but not whether it is exact or prefix-matched
   against the *grouped* grantha_id. The mandukya example needs exact matching
   on `mandukya-upanishad` (not `mandukya`). Specify exact (or
   `fnmatch`/prefix) matching in the implementation so `--grantha-id mandukya`
   doesn't silently capture `mandukya-karika` too.
2. **aitareya special-case may be deletable, not just narrowed.** Since the
   published Rangaramanuja file's `commentaries_metadata` is exactly
   `[rangaramanuja-muni-prakashika]`, the generic "return the file's own ids"
   path already yields the correct target; the `grantha_id == aitareya-upanishad`
   branch is redundant for current data. §4.2's conservative fix is correct, but
   consider deleting the branch outright (with a test) rather than re-guarding
   it — less special-case surface to reason about.
3. **`--grantha-id` vs `<2`-skip ordering.** §4.1 lists the exclude filter
   (steps 1–2), the `<2` skip (step 3), then the `--grantha-id` filter (step 4).
   The skip currently lives *inside* the grantha loop (`import_editions.py:471`),
   so the `--grantha-id` filter must be applied to the grouped dict *before* that
   loop, not after. Behaviorally both orderings skip the same granthas, but the
   implementation should filter the `granthas` dict immediately after
   `_group_editions_into_granthas` to keep the code obvious.
4. **kena `--default-edition` value.** §4.4's table lists `kena-upanishad` as
   the default, but kena's Śaṅkara editions are
   `kena-upanishad-sankara-pada-bhashya` / `…-vakya-bhashya`, and the
   Rangaramanuja edition's edition_id is `kena-upanishad` (from its BUILD
   `grantha_id`). This is consistent (the Rangaramanuja rule's grantha_id is
   `kena-upanishad`), just confirm the default target is the Rangaramanuja
   `kena-upanishad` and not a base id that happens to collide.

---

## What remains correct and load-bearing (unchanged from rev-1 assessment)

- Flat-converter guard (§4.3) — `_collect_source_files` unions all declared
  files and stamps `edition_id = frontmatter["grantha_id"]`, so a BUILD with >1
  grantha_id *would* merge Śaṅkara into Rangaramanuja without the guard.
- Aitareya fix (§4.2) — without it, the Śaṅkara edition publishes mūla-only.
- `--default-edition` always passed (§4.4) — alphabetical fallback mis-selects
  isavasya and mandukya.
- `validate:integrity` paths (`package.json`) point at `…/<grantha_id>/` edition
  dirs and are unchanged.
- kaushitaki / svetasvatara genuinely have no Śaṅkara files.
- `json_files` auto-alias only fires for `name == "md2json"`, so the
  `sankara-bhashya` rule won't collide.
