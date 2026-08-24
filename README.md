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

`npm install` also runs a `postinstall` step that points git at the
version-controlled hooks (`scripts/hooks/`, `core.hooksPath`). If hooks aren't
active, set them manually:

```bash
git config core.hooksPath scripts/hooks
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

### Regenerating the JSON library from `../grantha-data`

The committed `public/data/library/` is **re-derived** from the sibling
`grantha-data/structured_md/` checkout by the explorer's own Python scripts
(`scripts/convert_structured_md.py`, `scripts/import_editions.py`). These are
parallel to the grantha-data Bazel converter (see `docs/DATA_FLOW.md` §1–2).
Run them after any grantha-data edit; commit + push the result here.

Prereqs:

- The `grantha_data` shared library is importable (set
  `GRANTHA_DATA_TOOLS_LIB=<grantha-data>/tools/lib`, or `pip install -e .` in
  grantha-data). It is used for cross-text `references[]` extraction; when
  absent the converters run but omit references.
- `<grantha-data>` is the sibling checkout whose `structured_md/` you want.

1. **Multi-edition texts** (grantha-envelope + per-edition dirs) —
   `scripts/import_editions.py`, one run per text. Always pass
   `--default-edition` so the intended commentary stays default (alphabetical
   fallback would mis-select Śaṅkara editions):

   ```
   python3 scripts/import_editions.py \
     --source ../grantha-data/structured_md/upanishads/taittiriya \
     --library-root public/data/library --text-path upanishads/taittiriya \
     --default-edition taittiriya-upanishad
   ```

   | Text | `--text-path` | `--default-edition` |
   |---|---|---|
   | taittiriya | upanishads/taittiriya | taittiriya-upanishad |
   | aitareya | upanishads/aitareya | aitareya-upanishad |
   | brihadaranyaka | upanishads/brihadaranyaka | brihadaranyaka-upanishad |
   | chandogya | upanishads/chandogya | chhandogya-upanishad |
   | katha | upanishads/katha | katha-upanishad |
   | kena | upanishads/kena | kena-upanishad |
   | mundaka | upanishads/mundaka | mundaka-upanishad |
   | prashna | upanishads/prashna | prashna-upanishad |
   | isavasya | upanishads/isavasya | isavasya-upanishad-vedantadesika |
   | mandukya | upanishads/mandukya | mandukya-upanishad-rangaramanuja |
   | mandukya-karika | upanishads/mandukya-karika | mandukya-karika-bharadvajaramanujacharya |
   | brahma-sutra | brahma-sutra | brahma-sutra-sribhashya |

   **mandukya / mandukya-karika** are co-located in one source dir and must be
   imported one grantha at a time with `--grantha-id`:

   ```
   python3 scripts/import_editions.py \
     --source ../grantha-data/structured_md/upanishads/mandukya \
     --library-root public/data/library --text-path upanishads/mandukya \
     --default-edition mandukya-upanishad-rangaramanuja \
     --grantha-id mandukya-upanishad

   python3 scripts/import_editions.py \
     --source ../grantha-data/structured_md/upanishads/mandukya \
     --library-root public/data/library --text-path upanishads/mandukya-karika \
     --default-edition mandukya-karika-bharadvajaramanujacharya \
     --grantha-id mandukya-karika
   ```

2. **Flat + multipart single-edition texts** (edition-sub-envelope +
   `partN.json`) — `scripts/convert_structured_md.py`:

   ```
   python3 scripts/convert_structured_md.py \
     --source ../grantha-data/structured_md/upanishads/kaushitaki \
     --out public/data/library/upanishads/kaushitaki/kaushitaki-upanishad
   ```

   Texts: kaushitaki, svetasvatara, `../grantha-data/structured_md/bhagavad-gita/bhagavad-gita`
   → `public/data/library/bhagavad-gita/bhagavad-gita`,
   `../grantha-data/structured_md/ramayana/valmiki-ramayana` →
   `public/data/library/ramayana/valmiki-ramayana` (626 parts),
   `../grantha-data/structured_md/purana/vishnu-purana` →
   `public/data/library/purana/vishnu-purana` (126 parts),
   `../grantha-data/structured_md/vedarthasangraha` →
   `public/data/library/vedarthasangraha`.

   **vedarthasangraha must use this converter, not the producer CLI.** This
   path extracts the mula's `references[]` (the producer `md2json` emits none)
   and stamps `kind`/`edition_kind`; the parity test
   `scripts/tests/test_committed_reference_parity.py` fails if the committed
   artifact is regenerated with the wrong tool.

3. **Validate** — `npm run build` (prebuild regenerates `granthas.json` +
   `validate:data` + `validate:integrity`), or just
   `npm run validate:data`. The `schema_version` in the output comes from the
   producer `VERSION`; the mirrors stay byte-identical unless
   `grantha-data/formats/schemas/` changed (see `SCHEMAS.md`).

The grantha-data side also produces a flattened `json_library.zip` via Bazel
(`bazel build //structured_md:json_library_zip`) — a **gitignored build
artifact**, not the source of `public/data/library/`.

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
