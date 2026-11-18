import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  plugins: [react()],
  // Çizim işçisi (views/studio/compositor/program.worker.js) ES modülü olarak paketlenir.
  worker: { format: "es" },
  // Ses AudioWorklet modülü (views/studio/audioTap.worklet.js) ayrı dosya kalmalı: küçük
  // dosyalar data: adresine gömülür, CSP (script-src 'self') data: betiğini yasaklar.
  // 2.36.0: iki sayfa — index.html (Elitlig Araçlar) ve studio.html (Elitlig Stüdyo: yalnız Yayın
  // Stüdyosu). Ortak parçalar paylaşılır; stüdyo sayfası Araçlar'ın görünümlerini yüklemez.
  build: {
    outDir: "dist", emptyOutDir: true, target: "chrome120", sourcemap: false, assetsInlineLimit: (file) => (/\.worklet\.js$/.test(file) ? false : undefined),
    rollupOptions: { input: { index: fileURLToPath(new URL("./index.html", import.meta.url)), studio: fileURLToPath(new URL("./studio.html", import.meta.url)) } },
  },
  test: { globals: true, environment: "node", include: ["test/**/*.test.js"] },
});
