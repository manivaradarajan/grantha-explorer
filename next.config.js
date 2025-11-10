/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === "production";
const repositoryName = "grantha-explorer"; // Define this once!

const nextConfig = {
  output: "export",
  reactStrictMode: true,

  // Your repository name
  basePath: isProd ? `/${repositoryName}` : "",
  assetPrefix: isProd ? `/${repositoryName}/` : "",

  // Disable server-based image optimization
  images: {
    unoptimized: true,
  },

  // === NEW PART: Expose the basePath to your application code ===
  env: {
    // This value will be available as process.env.NEXT_PUBLIC_BASE_PATH
    NEXT_PUBLIC_BASE_PATH: isProd ? `/${repositoryName}` : "",
  },
};

module.exports = nextConfig;
