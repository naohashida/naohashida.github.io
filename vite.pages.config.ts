import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  root: resolve(import.meta.dirname, "github-pages-src"),
  publicDir: resolve(import.meta.dirname, "public"),
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "pages-dist"),
    emptyOutDir: true,
  },
});
