import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, target: "chrome120", sourcemap: false },
  test: { globals: true, environment: "node", include: ["test/**/*.test.js"] },
});
