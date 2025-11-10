/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  // Tell Next.js to generate a static site
  output: "export",
  reactStrictMode: true,

  // Your repository name
  basePath: isProd ? "/grantha-explorer" : "",
  assetPrefix: isProd ? "/grantha-explorer/" : "",

  // Disable server-based image optimization
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
