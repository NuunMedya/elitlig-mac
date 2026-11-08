import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  plugins: [react()],
  // Ses AudioWorklet modülü (views/studio/audioTap.worklet.js) ayrı dosya kalmalı: küçük
  // dosyalar data: adresine gömülür, CSP (script-src 'self') data: betiğini yasaklar.
  build: { outDir: "dist", emptyOutDir: true, target: "chrome120", sourcemap: false, assetsInlineLimit: (file) => (/\.worklet\.js$/.test(file) ? false : undefined) },
  test: { globals: true, environment: "node", include: ["test/**/*.test.js"] },
});
