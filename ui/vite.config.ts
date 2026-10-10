/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Relative base: the build works at any GitHub Pages path (/<repo>/) and from a local folder.
// Set CADENCE_BASE=/icmp_traffic_analysis/ to pin an absolute base instead.
export default defineConfig({
  base: process.env.CADENCE_BASE ?? "./",
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/d3-")) return "charts-vendor";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
