import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages export TypeScript sources (ARCHITECTURE §3).
  transpilePackages: ["@incision/database", "@incision/domain"],
  poweredByHeader: false,
};

export default nextConfig;
