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
