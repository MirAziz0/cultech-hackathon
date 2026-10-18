import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZamanQapısı AI",
    short_name: "ZamanQapısı",
    description: "Azərbaycan memarlıq irsinə virtual zaman səyahəti",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f0ffff",
    theme_color: "#007a87",
    lang: "az",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
