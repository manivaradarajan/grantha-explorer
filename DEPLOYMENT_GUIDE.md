# Deployment Guide for Grantha Explorer

This application is configured for static export to GitHub Pages. All API functionality has been replaced with build-time data generation to enable true static hosting.

## Table of Contents

- [How It Works](#how-it-works)
- [Local Development & Testing](#local-development--testing)
- [GitHub Pages Deployment](#github-pages-deployment)
- [Troubleshooting](#troubleshooting)
- [Technical Details](#technical-details)

## How It Works

### Build Process

The application uses a two-step build process:

1.  **Pre-build (Automatic)**: The `scripts/generate-granthas-json.ts` script runs automatically before every build and development server start.
    - It scans `public/data/library/` for grantha files.
    - It reads metadata and ordering information from `public/data/`.
    - It generates `public/data/generated/granthas.json` with a complete list of all available granthas.
    - **This file is auto-generated - DO NOT EDIT manually**. The entire `generated/` directory is ignored by Git.

2.  **Build**: Next.js generates static HTML/CSS/JS files into the `out/` directory, configured with `output: 'export'`.

## Local Development & Testing

### Development Server

To run the application in a local development environment with hot-reloading:

```bash
npm run dev
```

This single command will first generate the data files and then start the server. The application will be available at: **http://localhost:3000/**

### Testing the Production Build Locally

To build and serve the static site exactly as it would be deployed, but for local viewing:

```bash
npm run test:deploy
```

This command builds the app without the production `basePath` and automatically starts a local server. Open your browser to the URL it provides (typically **http://localhost:3000/**).

## GitHub Pages Deployment

Deployment is fully automated via GitHub Actions.

### Step 1: Push Your Code to the `main` Branch

The workflow is triggered automatically whenever you push to the `main` branch.

```bash
git add .
git commit -m "Update content and features"
git push origin main
```

### Step 2: Configure Repository Settings (First-Time Setup Only)

You only need to do this once for the repository.

1.  Go to your repository on GitHub.
2.  Click **Settings** > **Pages**.
3.  Under "Build and deployment", set the **Source** to **GitHub Actions**.

### Step 3: Monitor Deployment

1.  Go to the **Actions** tab in your GitHub repository.
2.  You will see the "Deploy Grantha Explorer to GitHub Pages" workflow running.
3.  Wait for it to complete with a green checkmark (usually 1-2 minutes).

### Step 4: Access Your Deployed Site

Once deployment is successful, your site will be live at:

**https://manivaradarajan.github.io/grantha-explorer/**

> **Note**: It may take a few minutes for the site to become available after the very first deployment.

## Troubleshooting

### GitHub Pages Shows 404 or Blank Page

- **Check the Action Log**: Go to the **Actions** tab and click on the latest workflow run. Check for any red X's or error messages.
- **Verify Settings**: Ensure your repository's **Settings > Pages** is set to deploy from **GitHub Actions**.
- **Wrong URL**: Make sure you are using the correct URL, including the repository name: `.../grantha-explorer/`.

### "Failed to fetch granthas list" Locally

**Problem**: The data generation script didn't run before the server started.

**Solution**: This shouldn't happen with the current `npm run dev` script. If it does, stop the server (`Ctrl+C`) and run the script manually, then restart:

```bash
npx tsx scripts/generate-granthas-json.ts
npm run dev
```

### Changes to Data Files Don't Appear on Deployed Site

**Problem**: You might be editing a generated file instead of a source file.

**Solution**:

- **DO NOT EDIT** any file inside `public/data/generated/`. It is auto-generated and ignored by Git.
- Instead, edit the **source files** in `public/data/library/` or `public/data/granthas-meta.json`.
- Commit and push your changes to `main`. The GitHub Action will automatically rebuild the data and deploy the new site.

## Technical Details

### Static Export Configuration (`next.config.js`)

The app is configured for both local development and GitHub Pages deployment:

```javascript
const nextConfig = {
  output: "export", // Enable static export
  basePath: isProd ? "/grantha-explorer" : "", // GitHub Pages subdirectory
  assetPrefix: isProd ? "/grantha-explorer/" : "",
  images: {
    unoptimized: true, // Required for static export
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? "/grantha-explorer" : "",
  },
};
```

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)

The deployment workflow is defined in `.github/workflows/deploy.yml`. It uses the official GitHub Actions for Pages to build and deploy the contents of the `out/` directory.

### Build Scripts Reference

| Command                 | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `npm run dev`           | Start development server (with data generation) |
| `npm run build`         | Production build with `basePath` (for GitHub)   |
| `npm run build:local`   | Build without `basePath` (for local testing)    |
| `npm run serve`         | Serve the `out/` directory locally              |
| `npm run test:deploy`   | Run `build:local` + `serve` in one command      |
| `npm run validate:data` | Validate data files against the defined schema  |

### Adding New Granthas

The system is designed to be data-driven. To add a new text:

1.  Add the new grantha's JSON file to `public/data/library/`.
2.  Add its metadata to `public/data/granthas-meta.json`.
3.  (Optional) Add its ID to `public/data/granthas-order.json` to set a custom display order.
4.  Commit and push the changes. The deployment workflow will handle the rest. No code changes are required
