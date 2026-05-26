import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // pdfjs-dist ships its worker as an ESM file; we resolve it with `?url`
  // imports inside src/utils/pdfjs.ts so Vite bundles it correctly in both
  // dev and production builds. No special Vite config is required.
  server: {
    port: 5173,
    open: false,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
