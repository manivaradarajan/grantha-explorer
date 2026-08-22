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

**Git hooks:** the repo uses version-controlled hooks under
`scripts/hooks/`, activated automatically by `postinstall`. On a fresh
clone run `npm install` (already the first README step) — or the manual
fallback `git config core.hooksPath scripts/hooks`.
