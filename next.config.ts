import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Content is read from /content at build time; plain static generation is enough.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // narration audio + photos are served from /public/monuments (synced from /content)
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
      {
        // iOS Quick Look only opens USDZ served with this MIME type
        source: "/monuments/:slug/models/:file(.*\\.usdz)",
        headers: [{ key: "Content-Type", value: "model/vnd.usdz+zip" }],
      },
    ];
  },
};

export default nextConfig;
