import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

const cesiumStaticDirectory = "cesium-1.143.0";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/viewer-[hash].js",
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith(".css")
            ? "assets/viewer-[hash][extname]"
            : "assets/[name]-[hash][extname]"
      }
    }
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: "node_modules/cesium/Build/Cesium/Workers", dest: cesiumStaticDirectory },
        { src: "node_modules/cesium/Build/Cesium/ThirdParty", dest: cesiumStaticDirectory },
        { src: "node_modules/cesium/Build/Cesium/Assets", dest: cesiumStaticDirectory },
        { src: "node_modules/cesium/Build/Cesium/Widgets", dest: cesiumStaticDirectory }
      ]
    })
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify(
      `${process.env.VITE_BASE_PATH ?? "/"}${cesiumStaticDirectory}`
    )
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true
  }
});
