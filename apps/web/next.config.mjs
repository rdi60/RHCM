/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@rhcm/shared"],
  reactStrictMode: true,
  // Produces a self-contained .next/standalone server (its own minimal
  // node_modules trace) — see apps/web/Dockerfile.
  output: "standalone",
};

export default nextConfig;
