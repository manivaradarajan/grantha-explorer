/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === "production";
// Respect the NEXT_PUBLIC_NO_BASE_PATH flag for local serving
const useBasePath = isProd && process.env.NEXT_PUBLIC_NO_BASE_PATH !== 'true';
const repositoryName = "grantha-explorer"; // Define this once!

const nextConfig = {
  output: "export",
  reactStrictMode: true,

  // Your repository name - now conditional
  basePath: useBasePath ? `/${repositoryName}` : "",
  assetPrefix: useBasePath ? `/${repositoryName}/` : "",

  // Disable server-based image optimization
  images: {
    unoptimized: true,
  },

  // Expose the basePath to your application code
  env: {
    NEXT_PUBLIC_BASE_PATH: useBasePath ? `/${repositoryName}` : "",
  },
};

module.exports = nextConfig;
