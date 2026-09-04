import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 ist ein natives Node-Modul — vom Turbopack/Webpack-Bundling
  // ausnehmen, damit es zur Laufzeit direkt über require() geladen wird statt
  // gebündelt zu werden (sonst schlägt der Build fehl).
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
