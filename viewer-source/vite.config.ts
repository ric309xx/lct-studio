import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import {fileURLToPath} from 'node:url';

const cesiumStaticDirectory = "cesium-1.143.0";

export default defineConfig({
  envPrefix:'LCT_PUBLIC_',
  // Exclude raw control coordinates even if Rollup emits an unreachable
  // dynamic-import chunk after removing the local diagnostic branch.
  resolve: {alias: process.env.VITE_LOCAL_HEIGHT_AUDIT==='1'?[]:[{
    find:'./heightFrameAudit',replacement:fileURLToPath(new URL('./src/disabledHeightAudit.ts',import.meta.url))
  }]},
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
    {
      name:'private-viewer-data',apply:'build',enforce:'post',
      transform(_code,id){
        const name=id.split(/[\\/]/).pop()??'';
        if(!['taoyuan1006Parcels.json','taoyuan1010Parcels.json','taoyuan1013Parcels.json','taoyuan1013Cl2Parcels.json','taoyuan1015Parcels.json','taoyuanDriplineMetrics.json','caseMapGeometry.json','caseCaptureDates.json','shuanglingGround.json','taoyuan17Ground.json','taoyuan255Ground.json'].includes(name))return;
        const fallback=name.includes('Parcels')?'[]':'{}';
        return {code:`export default window.LCT_VIEWER_BOOTSTRAP?.data?.[${JSON.stringify(name)}]??${fallback};`,map:null};
      }
    },
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
