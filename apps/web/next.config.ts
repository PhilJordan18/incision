import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages export TypeScript sources (ARCHITECTURE §3).
  transpilePackages: ["@incision/database", "@incision/domain"],
  poweredByHeader: false,
  // AUTH-04 allows a 2 MiB file; leave bounded room for multipart/Server Action metadata.
  // The photo action separately enforces the file-byte limit before decoding.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;
