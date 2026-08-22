# Grantha Explorer — project context for Claude Code

## What this is

A Next.js contemplative reading environment for Sanskrit/Tamil sacred texts and
their commentarial traditions (Upaniṣads, Bhagavad Gītā, Brahma-sūtra bhāṣyas,
Rāmānuja's writings). Mūla text is always visually primary; commentaries open
in a dedicated pane; per-verse URLs are hash-based. See `DESIGN.md` for the
product principles and `SCREENS.md` for screen behavior.

## Data-flow documentation — read before data work

The pipeline that turns source texts into what the UI renders is documented in
three places and **must be kept current**:

1. **`docs/DATA_FLOW.md`** (this repo) — the consumer-side runtime: how
   `public/data/library/` JSON is ingested, indexed, validated, and loaded
   (`lib/data.ts`, `hooks/useGranthaLoader.ts`), plus the URL-hash/edition flow
   and the "adding a new text" checklist.
2. **`../grantha-data/docs/DATA_FLOW.md`** (canonical, producer-side) — how
   `structured_md/` sources become JSON: BUILD publication gate, Bazel
   converter, on-disk shapes (flat single-file / multipart single-edition /
   multi-edition).
3. **`docs/LOADING_FLOW.md`** (this repo) — the runtime loading architecture:
   initial assembly, `useGranthaLoader`, lazy-part triggers (section,
   scroll sentinels, sidebar), and the compare-mode fan-out.

**Read the relevant docs before touching `scripts/`, `lib/data.ts`, or any data
loading.** When you change the ingestion, loader, indexer, on-disk data shapes,
or runtime loading behavior, update the relevant doc(s) in the same change.
In particular, changes to `lib/data.ts`, `hooks/useGranthaLoader.ts`,
`hooks/useEditions.ts`, `app/page.tsx`, `components/FlowReader.tsx`,
`components/TextContent.tsx`, or `components/NavigationSidebar.tsx` must keep
`docs/LOADING_FLOW.md` current. Known converter bugs and divergences are
tracked in `../grantha-data/structured_md/<text>/BUGS.md` (e.g.
`bhagavad-gita/BUGS.md`).

## Keeping README.md current (critical step)

`README.md` documents how to regenerate `public/data/library/` from the
sibling `grantha-data` checkout (the `import_editions.py` /
`convert_structured_md.py` / producer-CLI commands, the `--default-edition`
table, and the flat single-file copy step). **Whenever you change the ingestion
scripts, the on-disk shapes, or the regeneration procedure, update README.md in
the same change** — including the `grantha-data` README section on the Bazel
build outputs if the handoff changes. A stale README leaves the next engineer
with a wrong mental model of how to update the committed JSON library.

## Architecture at a glance

- **Data:** `public/data/library/` (source of truth on disk, committed) +
  `public/data/granthas-meta.json` (titles/abbreviations),
  `granthas-order.json` (display order), `categories.json` (categories + text
  type labels). `public/data/generated/granthas.json` is **generated at
  prebuild** and gitignored — never edit it.
- **Schemas:** `grantha*.schema.json` at the repo root are **read-only
  mirrors** of `grantha-data/formats/schemas/`. Never edit here; re-sync with
  `cp` (see `SCHEMAS.md`).
- **Build:** `npm run build` runs `prebuild` → `scripts/generate-granthas-json.ts`
  (index) then `scripts/validate-data.ts` (schema validation); `validate:integrity`
  checks specific granthas.
- **Runtime:** hash `#<granthaId>:<verseRef>?e=<editionId>&co=1&sc=…` drives the
  view (`lib/hashUtils.ts`, `hooks/useVerseHash.ts`). `app/page.tsx` wires the
  hash to `useGranthaLoader`, which lazily loads multi-part content and
  caches per `granthaId::editionId`.

## Conventions

- Edition identity: `?e=` selects an edition; absent = default. Single-edition
  granthas use `edition_id == grantha_id`.
- Cross-grantha reference links drop the edition; same-grantha references
  preserve it.
- When a grantha has no commentary, the commentary pane is hidden (two-panel
  layout).
- Do not reintroduce scroll-driven focus tracking (see DESIGN.md — it was
  implemented, tested, and reverted; the flow reader has a documented
  `replaceState` carve-out, panes mode does not).
- Run `npm run lint` and the tests (`pytest tests scripts/tests`,
  `npm run validate:data`) after changes that touch data or scripts.

## Where things live

- `app/`, `components/`, `hooks/`, `lib/` — the Next.js app.
- `scripts/` — ingestion (`convert_structured_md.py`, `import_editions.py`),
  indexing (`generate-granthas-json.ts`), validation (`validate-data.ts`,
  `validate_data.py`, `validate_grantha_integrity.py`). See
  `docs/DATA_FLOW.md` for the full picture.
- `tests/`, `scripts/tests/` — pytest suites (see `pytest.ini`).
- `plans/`, `prds/`, `docs/` — design and planning artifacts; some are
  historical/actualized (see `scripts/ORPHANED_SCRIPTS_AUDIT.md` for cleanup
  tracking).

## Key principles (from DESIGN.md)

1. Reading comes first; mūla has visual priority, always.
2. Preserve place aggressively — scroll position and open state must survive
   cross-reference jumps.
3. Progressive disclosure: verse → translation → commentary → more
   commentaries → cross-references → variants.
4. Commentary chip activation is additive; comparison column cap is 2.
5. No user accounts, no search, no personal notes in v1 — state lives in
   URL/localStorage.
