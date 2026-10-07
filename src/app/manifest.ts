import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SAKURAGI CRM Pro",
    short_name: "SAKURAGI CRM",
    description: "CRM for managing the complete sales cycle across the team.",
    start_url: "/",
    display: "standalone",
    // Where supported (Chrome / Edge on desktop), the installed app gets a
    // tab strip like a browser; elsewhere it stays a normal app window.
    display_override: ["tabbed", "standalone"] as unknown as MetadataRoute.Manifest["display_override"],
    background_color: "#ffffff",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
