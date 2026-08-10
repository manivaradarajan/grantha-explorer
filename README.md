# Grantha Explorer

A contemplative reading environment for Sanskrit/Tamil sacred texts and their
commentarial traditions. Built for **sustained, distraction-free study** —
not engagement, novelty, or visual excitement.

Live site: https://manivaradarajan.github.io/grantha-explorer/

## What it does

Grantha Explorer renders a curated corpus of texts (currently the principal
Upaniṣads) with their commentaries side by side:

- **Mūla first.** The root verse is always visually primary; commentary is
  rendered in smaller, muted, visually distinct type.
- **Verse → translation → commentary → cross-references**, revealed by
  progressive disclosure rather than dumped all at once.
- **Multi-commentary comparison** — activate multiple commentaries per verse
  as checkboxes; long-form commentaries open in a dedicated scrolling pane
  beside a pinned verse (capped at 2 side-by-side columns).
- **Hash-based routing** encodes the full reading state (grantha, verse ref,
  active commentaries), so a shared link reproduces the sender's exact view
  and browser back/forward work for free.
- **Preserve place, aggressively.** Scroll position within commentary panes is
  restored across navigation.

The library is data-driven: texts and their structure live as versioned JSON
files in `public/data/library/`, so adding a grantha requires **no code
changes**.

## Design principles

See [`DESIGN.md`](DESIGN.md) for the full living design document. The core
rules:

1. Reading comes first — every screen answers "what should I read next?"
2. Mūla has visual priority, always.
3. Preserve place, aggressively.
4. Progressive disclosure, not information dump.
5. Zero cognitive load — no floating panels, gradients, or card-in-card.
6. Fixed typography hierarchy, never improvised per screen.

v1 deliberately excludes user accounts, search, and personal annotations.

## Tech stack

| Layer               | Choice                                            |
| ------------------- | ------------------------------------------------- |
| Framework           | Next.js 16 (static export, `output: 'export'`)    |
| Language            | TypeScript                                        |
| Styling             | Tailwind CSS                                      |
| UI                  | Custom components + Ant Design                    |
| Async state         | TanStack Query (grantha JSON, lazy-loaded parts)  |
| Navigation state    | URL hash (`lib/hashUtils.ts` + `hooks/useVerseHash`) |
| Persistent state    | `localStorage` (panel sizes, commentary fallback) |
| Layout              | `react-resizable-panels` (resizable 3-column)     |
| Data                | JSON in `public/data/`, versioned in Git          |
| Deployment          | GitHub Actions → GitHub Pages                     |

Full rationale: [`TECH-STACK.md`](TECH-STACK.md).

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. The `prebuild` step runs automatically before the
dev server: it scans `public/data/library/` and regenerates
`public/data/generated/granthas.json` (auto-generated — never edit it).

### Build & serve locally

```bash
npm run test:deploy    # build:local + serve, exactly like production
```

### Scripts

| Command                 | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `npm run dev`           | Dev server (runs data generation first)             |
| `npm run build`         | Production build with `basePath` (for GitHub Pages) |
| `npm run build:local`   | Build without `basePath` (local testing)            |
| `npm run serve`         | Serve the `out/` directory                          |
| `npm run test:deploy`   | `build:local` + `serve`                             |
| `npm run lint`          | ESLint (Next.js config)                             |
| `npm run validate:data` | Validate data files against JSON schemas            |
| `npm run validate:integrity` | Validate a grantha's files against its envelope |

## Project layout

```
app/                  Next.js app router (landing/reading view)
components/           MobileLayout, TabletLayout, CommentaryPanel,
                      NavigationSidebar, TextContent, GranthaSelector, ...
hooks/                useGrantha, useGranthaLoader, useVerseHash, useMediaQuery
lib/                  data loading, hash utils, reference parsing, i18n, paths
scripts/              data generation & validation (build-time)
public/data/
  library/            source texts (envelope.json + part files)
  granthas-meta.json  titles & metadata per grantha
  granthas-order.json custom display ordering
  generated/          auto-generated granthas.json (git-ignored)
.github/workflows/    GitHub Pages deploy workflow
```

## Data model

Texts live in `public/data/library/`, organised one directory per grantha:

- **Grantha-level** directories carry an `envelope.json` with `kind:
  "grantha-envelope"`, a `grantha_id`, and an `editions` array (the default
  edition's path is what the indexer resolves).
- **Multi-part** granthas use `kind: "edition-sub-envelope"` directories plus
  per-part JSON files (a structural section can span several part files).
- **Flat single-file** granthas are plain JSON with a `grantha_id` field.

JSON schemas live at the repo root: `grantha.schema.json`,
`grantha-envelope.schema.json`, `grantha-part.schema.json`. The build-time
indexer `scripts/generate-granthas-json.ts` reads the explicit `kind` field —
it never infers type from field presence.

### Adding a new grantha

1. Add the text's JSON files to `public/data/library/`.
2. Add its metadata to `public/data/granthas-meta.json`.
3. (Optional) Add its ID to `public/data/granthas-order.json` for a custom
   display position.
4. Commit and push — the deploy workflow rebuilds and redeploys automatically.

## Deployment

Deploying is a push to `main`. The GitHub Actions workflow
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) checks out,
installs, runs `npm run build` (which runs the data generator first), and
uploads `out/` to GitHub Pages via the official Pages actions.

Repository must have **Settings → Pages → Build and deployment → Source:
GitHub Actions**. See [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md) for full
setup, troubleshooting, and details.

## Related documents

- [`DESIGN.md`](DESIGN.md) — living design document (principles, interactions,
  v1 scope)
- [`TECH-STACK.md`](TECH-STACK.md) — tech choices and rationale
- [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md) — GitHub Pages setup & troubleshooting
