# Deployment Guide

This application is configured for static export to GitHub Pages. All API functionality has been replaced with build-time data generation to enable true static hosting.

## Table of Contents

- [How It Works](#how-it-works)
- [Local Testing](#local-testing)
- [GitHub Pages Deployment](#github-pages-deployment)
- [Troubleshooting](#troubleshooting)
- [Technical Details](#technical-details)

## How It Works

### Build Process

The application uses a two-step build process:

1. **Pre-build (Automatic)**: `scripts/generate-granthas-json.ts` runs automatically before every build
   - Scans `public/data/library/` for available grantha files
   - Reads `public/data/granthas-meta.json` for metadata
   - Reads `public/data/granthas-order.json` for ordering
   - Generates `public/data/generated/granthas.json` with all available granthas
   - **This file is auto-generated - DO NOT EDIT manually**
   - The entire `generated/` directory is gitignored

2. **Build**: Next.js generates static HTML/CSS/JS files
   - Configured with `output: 'export'` for static site generation
     - Outputs to the `out/` directory

## Local Testing

### Development Server

To run the application in a local development environment with hot-reloading:

```bash
npm run dev
```

The application will be available at: **http://localhost:3000/**

### Quick Test (Production Build)

To test the production build locally:

```bash
npm run test:deploy
```

This command will:

1. Build the app
2. Automatically start a local server
3. Display the URL (typically http://localhost:3000)

Then open your browser to **http://localhost:3000/** (note: no subdirectory needed)

### Manual Testing

If you need more control:

```bash
# Build for local testing
npm run build:local

# Serve the static files
npm run serve
```

### Why Two Different Builds?

- **Local testing** (`npm run build:local`): Builds without basePath, serves at `http://localhost:3000/`
- **Production** (`npm run build`): Builds with basePath `/aistudio`, serves at `https://manivaradarajan.github.io/grantha-explorer/`

This ensures local testing works correctly at the root URL while production deploys to the correct subdirectory.

## GitHub Pages Deployment

### Prerequisites

- A GitHub repository for this project
- GitHub Actions enabled (enabled by default on all repositories)

### Step-by-Step Setup

#### 1. Push Your Code to GitHub

If you haven't already:

```bash
git add .
git commit -m "Configure for GitHub Pages deployment"
git push origin main
```

#### 2. Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** (in the repository menu)
3. Click **Pages** (in the left sidebar under "Code and automation")
4. Under "Build and deployment":
   - **Source**: Select "Deploy from a branch"
   - **Branch**: Select `gh-pages` and `/ (root)`
   - Click **Save**

> **Note**: The `gh-pages` branch will be created automatically by the GitHub Action on first deployment.

#### 3. Verify GitHub Actions Workflow

The deployment workflow is configured at the **repository root** in `.github/workflows/deploy-upanishad-explorer.yml` (since this is a monorepo). Verify it exists and contains:

```yaml
name: Deploy Upanishad Explorer to GitHub Pages

on:
  push:
    branches:
      - main
    paths:
      - "ai-workflow/upanishad-explorer/claude-designed/**"
      - ".github/workflows/deploy-upanishad-explorer.yml"

permissions:
  contents: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ai-workflow/upanishad-explorer/claude-designed

    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run build

      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./ai-workflow/upanishad-explorer/claude-designed/out
```

**Note:** The workflow uses `working-directory` to run commands in the app subdirectory and `paths` to only trigger when files in this directory change.

#### 4. Trigger Deployment

The deployment happens automatically when you push changes to files in `ai-workflow/upanishad-explorer/claude-designed/` to the `main` branch. To manually trigger:

```bash
# Make a small change (e.g., update README)
git commit --allow-empty -m "Trigger deployment"
git push origin main
```

#### 5. Monitor Deployment

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. You should see your workflow running
4. Wait for it to complete (usually 1-2 minutes)
5. Look for a green checkmark indicating success

#### 6. Access Your Deployed Site

Once deployment completes, your site will be available at:

```
https://<your-username>.github.io/<repository-name>/
```

Replace `<your-username>` and `<repository-name>` with your actual GitHub username and repository name.

For this repository:

- Your site is at: `https://manivaradarajan.github.io/grantha-explorer/`

> **Note**: It may take a few minutes for the site to be available after the first deployment.

### Updating Your Deployed Site

Simply push changes to the `main` branch:

```bash
git add .
git commit -m "Update content"
git push origin main
```

The GitHub Action will automatically rebuild and redeploy your site.

## Troubleshooting

### Build Fails with "Cannot find module" Error

**Problem**: TypeScript can't find a deleted API route.

**Solution**: Clear the Next.js cache and rebuild:

```bash
rm -rf .next out
npm run build
```

```bash
npm run test:deploy
```

This builds without the basePath for local testing.

### GitHub Pages Shows 404 or Blank Page

**Possible causes**:

1. **Branch not configured**: Ensure GitHub Pages is set to deploy from `gh-pages` branch
2. **First deployment**: Wait 5-10 minutes for GitHub to propagate the site
3. **Wrong URL**: Make sure you're accessing `https://manivaradarajan.github.io/aistudio/` (with the trailing slash)

**To check**:

```bash
# Verify the gh-pages branch exists
git fetch origin
git branch -r | grep gh-pages
```

### "Loading granthas..." Stuck Forever

**Problem**: The `granthas.json` file wasn't generated or isn't accessible.

**Solution**: Verify the build process:

```bash
# Check if prebuild script runs
npm run build

# Verify the file was created
ls -la out/data/generated/granthas.json
```

### Changes to Data Files Don't Appear

**Problem**: You edited `public/data/generated/granthas.json` directly.

**Solution**:

- **Don't edit** `public/data/generated/granthas.json` - it's auto-generated!
- The entire `generated/` directory is gitignored and rebuilt every time
- Instead, edit the source files:
  - `public/data/granthas-meta.json` - grantha metadata
  - `public/data/granthas-order.json` - display order
  - `public/data/library/*.json` - individual grantha files
- Then rebuild to regenerate `granthas.json`:
  ```bash
  npm run build
  ```

## Technical Details

### Static Export Configuration

The app is configured in `next.config.js`:

```javascript
const nextConfig = {
  output: "export", // Enable static export
  basePath: "/aistudio", // GitHub Pages subdirectory (repository name)
  reactStrictMode: true,
  images: {
    unoptimized: true, // Required for static export
  },
};
```

For local testing, the basePath is conditionally disabled using the `NEXT_PUBLIC_NO_BASE_PATH` environment variable.

### Generated Files

The following files and directories are auto-generated and should **not** be edited manually:

- `public/data/generated/` - Contains all build-time generated files
  - `granthas.json` - Generated by `scripts/generate-granthas-json.ts`
  - **Ignored by git** - The entire `generated/` directory is in `.gitignore`
  - Only exists during build, never committed
- `.next/` directory - Next.js build cache
- `out/` directory - Static export output

### Build Scripts Reference

| Command                 | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Start development server                          |
| `npm run build`         | Production build with basePath (for GitHub Pages) |
| `npm run build:local`   | Local build without basePath (for testing)        |
| `npm run serve`         | Serve the `out/` directory                        |
| `npm run test:deploy`   | Build locally + serve (one command)               |
| `npm run validate:data` | Validate data files against schema                |

### Directory Structure

```
public/data/
├── README.md                   # Source: Documentation about data files
├── granthas-meta.json          # Source: Grantha metadata (tracked in git)
├── granthas-order.json         # Source: Display order (tracked in git)
├── generated/                  # Generated files (NOT in git - entire dir ignored)
│   └── granthas.json          # Auto-generated available granthas list
└── library/                    # Source: Grantha texts (tracked in git)
    ├── isavasya-upanishad.json
    ├── kena-upanishad.json
    └── ...

out/                           # Generated static site (NOT in git)
├── index.html
├── _next/                     # Next.js assets
└── data/                      # Copied from public/data/
    └── generated/
        └── granthas.json      # Generated file ends up here
```

**Note**: The `generated/` subdirectory clearly separates build-time generated files from source files. The entire directory is gitignored to prevent accidental commits of generated content.

### Adding New Granthas

1. Add the grantha JSON file to `public/data/library/`
2. Add metadata to `public/data/granthas-meta.json`
3. (Optional) Add to `public/data/granthas-order.json` for custom ordering
4. Build - the new grantha will be automatically included in `granthas.json`
5. Deploy - push to main branch to trigger automatic deployment

No code changes required!
