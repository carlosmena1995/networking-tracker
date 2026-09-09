import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev-mode overlay badge so the captured README screenshots show
  // the app itself and nothing else. No effect on production builds.
  devIndicators: false,
};

export default nextConfig;
