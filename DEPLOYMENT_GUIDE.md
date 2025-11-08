# Deploying to GitHub Pages

Your Next.js application is now configured for static export, which is required for deployment to GitHub Pages.

## Build Process

1.  **Build the application:**

    Run the following command to build the static site:

    ```bash
    npm run build
    ```

    This will create a new directory named `out` in your project root. This directory contains the complete static version of your site.

## Deployment

The `out` directory is what you need to deploy to GitHub Pages. The easiest way to do this is to use a GitHub Action to automate the process. Here is a basic workflow you can add to your repository at `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main # Or whichever branch you want to deploy from

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run build

      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./out
```

Once this workflow is in place, every push to your `main` branch will automatically build and deploy your site to the `gh-pages` branch, which GitHub Pages will then serve.

Your site will be available at:
`https://<your-username>.github.io/upanishad-explorer`
