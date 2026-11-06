import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

// Two targets from one codebase:
//   npm run build           -> installable PWA in dist/ (GitHub Pages)
//   npm run build:artifact  -> Claude artifact in dist-artifact/ (one HTML page + data files)
// base "./" so either build works from any sub-path.
export default defineConfig(({ mode }) => {
  const artifact = mode === "artifact";
  return {
    base: "./",
    define: { "import.meta.env.VITE_TARGET": JSON.stringify(artifact ? "artifact" : "pwa") },
    resolve: artifact ? { alias: { "virtual:pwa-register": fileURLToPath(new URL("./src/lib/pwa-stub.ts", import.meta.url)) } } : {},
    plugins: [
      react(),
      !artifact &&
        VitePWA({
          registerType: "autoUpdate",
          includeAssets: ["icon.svg", "levels.json", "sample-questions.json", "adventures/*.json"],
          manifest: {
            name: "Study RPG",
            short_name: "Study RPG",
            description: "Answer your own exam questions to fight your way through an adventure.",
            theme_color: "#1d2421",
            background_color: "#1d2421",
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
    build: artifact
      ? {
          outDir: "dist-artifact",
          cssCodeSplit: false,
          modulePreload: false,
          rollupOptions: { output: { format: "iife", inlineDynamicImports: true, entryFileNames: "app.js", assetFileNames: "app[extname]" } },
        }
      : {},
    test: { environment: "node" },
  } as never;
});
