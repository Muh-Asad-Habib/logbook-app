import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // hasil build statis di frontend/out — disajikan oleh backend Express
  reactStrictMode: true,
  devIndicators: false, // Jangan menutupi tombol Beranda pada bottom-nav saat pengembangan.
  turbopack: { root: fileURLToPath(new URL("../", import.meta.url)) },
};

export default nextConfig;

