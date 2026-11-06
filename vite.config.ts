import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// base "./" so the build works from any sub-path (e.g. GitHub Pages /study-rpg/).
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "levels.json", "sample-questions.json", "adventures/*.json"],
      manifest: {
        name: "Study RPG",
        short_name: "Study RPG",
        description: "Answer your own exam questions to fight your way through an adventure.",
        theme_color: "#1c1a24",
        background_color: "#1c1a24",
        display: "standalone",
        orientation: "any",
        start_url: ".",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json,webmanifest}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  test: { environment: "node" },
} as never);
