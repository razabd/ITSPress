import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone diperlukan untuk deployment via Docker (image lebih kecil)
  output: "standalone",
  reactCompiler: true,
  turbopack: {
    resolveAlias: {
      canvas: "./src/lib/canvas-mock.ts",
    },
  },
};

export default nextConfig;
