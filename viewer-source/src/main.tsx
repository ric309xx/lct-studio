import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./styles.css";
import { App } from "./App";
import {Ion,Resource} from 'cesium';

// ion 主權杖留在伺服器；資產與子資源均經同網域 Cookie 授權。
Ion.defaultAccessToken='';
Ion.defaultServer=new Resource({url:new URL('/api/viewer-ion/',window.location.origin).href});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
