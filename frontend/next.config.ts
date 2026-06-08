import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    resolveAlias: {
      canvas: "./src/lib/canvas-mock.ts",
    },
  },
};

export default nextConfig;
