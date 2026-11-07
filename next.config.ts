import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  distDir: process.env.FAVOURLOOP_BUILD_DIR || ".next",
};
export default config;
