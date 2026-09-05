import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // hasil build statis di frontend/out — disajikan oleh backend Express
  reactStrictMode: true,
  turbopack: { root: fileURLToPath(new URL("../", import.meta.url)) },
};

export default nextConfig;

