# Project Instructions

The canonical project instructions are in `CLAUDE.md`.

Read `CLAUDE.md` before making changes and follow its requirements.

**Data-flow prerequisite:** before touching `scripts/`, `lib/data.ts`, or any
data loading/ingestion, read `docs/DATA_FLOW.md` (this repo, consumer side) and
`../grantha-data/docs/DATA_FLOW.md` (canonical producer side), and keep them
current whenever that flow changes.

**Loading-flow prerequisite:** before touching `lib/data.ts`,
`hooks/useGranthaLoader.ts`, `hooks/useEditions.ts`, `app/page.tsx`,
`components/FlowReader.tsx`, `components/TextContent.tsx`, or
`components/NavigationSidebar.tsx`, read `docs/LOADING_FLOW.md` (runtime
loading + lazy-part architecture) and keep it current in the same change.

## Code map

`docs/CODEMAP.md` indexes non-obvious code locations — features whose
implementation is spread across files or doesn't match an obvious name.

**Before searching for a feature by description** (e.g. "find the code
that does X"), check `docs/CODEMAP.md` first. If it's not there, search
normally.

**After completing any task that involved understanding a feature's
implementation across multiple files or functions**, before ending the
turn: check if that feature is already in `docs/CODEMAP.md`.
- If it's not there and took more than one search/grep to fully locate,
  add a short entry using the existing format (function names, file
  paths — avoid exact line numbers, they go stale).
- If it IS there and you changed the referenced code, update the entry
  in the same edit.

Keep entries short: file, function names, one line each. This file is
read often — don't let it balloon into full documentation.

## Build/test tooling boundary (Bazel vs npm)

The repo runs a deliberate two-toolchain setup. Bazel owns the
**artifact-producing, deterministic, cross-repo** surface; npm owns the
**interactive/test** surface.

**Bazel owns** (`bazel test //...`, `bazel build //:static_export`):
- Data + build pipeline: `//scripts:generate_granthas_json` (indexer),
  `//:validate_data`, `//:validate_schema_mirrors`, `//:verify_sidebar_model`,
  `//:typecheck`, and the next static-export build.
- **Hermetic data regeneration**: `bazel run //data:materialize` regenerates
  `public/data/library/` from the `@grantha_data` runfiles (the Bazel-owned
  replacement for the manual npm converter invocations — see
  `docs/DATA_FLOW.md` §2). `//data:determinism_check` (a `bazel test`) proves
  the pipeline is deterministic (two fresh runs byte-identical) and *reports*
  committed-vs-fresh drift explicitly — drift is NOT gated, because the
  committed tree may legitimately lag the current citation bimap (see the
  parity-test docs and `test_committed_reference_parity.py`).
- Python helpers and cross-repo deps via
  `@grantha_data//tools/lib/grantha_data` (local_path_override → sibling).
- Before touching `BUILD.bazel`, `MODULE.bazel`, `scripts/BUILD.bazel`, or the
  `.bazelrc`/`pnpm-workspace.yaml`, understand that changing these affects both
  toolchains.

**npm owns** (never move to Bazel — either not supported well there or
intrinsically non-hermetic):
- `npm test` (vitest; rules_js has a known double-React issue with symlinked
  node_modules, see aspect-build/rules_js#362 — do not attempt to re-wrap).
- The converter test suites under `scripts/tests/` (`pytest tests
  scripts/tests`) — developer-facing regression tests of the npm-owned
  converters. Run them with
  `GRANTHA_DATA_TOOLS_LIB=../grantha-data/tools/lib` (the worktree checkout)
  and, for the review-server tests, `GRANTHA_PYTHON=` the worktree venv python
  (see below).
- `npm run dev`, `npm run review:server` / `review:dev`, playwright e2e,
  eslint, git hooks.
- `scripts/validate-reference-sweep.ts` — needs the producer `structured_md`
  source tree; it is **intentionally npm-only** (running it under Bazel without
  the producer tree would be a vacuous pass).

**Two lockfiles:** `package-lock.json` (npm) and `pnpm-lock.yaml` (Bazel,
generated from the npm lock via `npx pnpm import`). Keep them in sync when
bumping dependencies; do not add a Bazel vitest target as a workaround.

**Known gotchas:**
- The worktree layout uses a shared venv (`~/git-worktrees/.venvs/<idea>/`),
  NOT `grantha-data/.venv/`. The review server (`review-server.mjs`) defaults
  its candidate-scan python to `grantha-data/.venv/bin/python`; in a worktree
  that doesn't exist, so it falls back to system `python3` and the
  review-server candidate tests 500. Pin `GRANTHA_PYTHON` to the worktree venv
  python when running them:
  `GRANTHA_PYTHON=~/git-worktrees/.venvs/bazel-in-explorer/bin/python3`.
- The committed `public/data/library/` may lag the current citation bimap
  (e.g. `vishnu-purana` references). `test_committed_reference_parity.py`
  fails on this by design; the Bazel `//data:determinism_check` reports it as
  drift (not a gate). To re-sync: `bazel run //data:materialize`, review the
  diff, and commit the regenerated library.

**Tracked follow-up (deferred):** the upstream consolidation — port the
explorer's converters (`convert_structured_md.py`, `import_editions.py`,
`_build_parser.py`, `grantha_data_bootstrap.py`) into grantha-data's Bazel
rules so the explorer is a pure consumer of `@grantha_data` JSON and the
converters are deleted. Deferred because it requires porting the multi-edition
`grantha-envelope` layout + `references[]` extraction upstream and matching the
committed library byte-for-byte (a fragile key-ordering contract), best done
once the cross-text `references[]` pilot is stable.

**Git hooks:** the repo uses version-controlled hooks under
`scripts/hooks/`, activated automatically by `postinstall`. On a fresh
clone run `npm install` (already the first README step) — or the manual
fallback `git config core.hooksPath scripts/hooks`.
