/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Use basePath for GitHub Pages deployment, empty for local testing
  basePath: process.env.NEXT_PUBLIC_NO_BASE_PATH === 'true' ? '' : '/aistudio',
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
