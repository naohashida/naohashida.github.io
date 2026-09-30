import { copyFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = import.meta.dirname;
const publicDir = resolve(projectRoot, "public");

export default defineConfig({
  base: "/public/",
  root: resolve(projectRoot, "github-pages-src"),
  publicDir: false,
  plugins: [
    react(),
    {
      name: "publish-root-index",
      closeBundle() {
        const generatedIndex = resolve(publicDir, "index.html");
        copyFileSync(generatedIndex, resolve(projectRoot, "index.html"));
        unlinkSync(generatedIndex);
      },
    },
  ],
  build: {
    outDir: publicDir,
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: "app-build/app.js",
        chunkFileNames: "app-build/[name].js",
        assetFileNames: "app-build/[name][extname]",
      },
    },
  },
});
