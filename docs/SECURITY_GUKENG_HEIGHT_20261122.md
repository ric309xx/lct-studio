# 古坑底圖對位：高程基準修正

本輪只更新既有預覽分支，尚未發布 Netlify 正式站；Worker 1987fa55 與原始 R2 資料不改。

## 證據與換算

原始 config／座標匯出明示 EPSG:3826+8904（TWD97/TM2 121、TWVD2001 正高）。PIX4Dmatic 品質報告第1頁亦明示 TWGEOID2018h。對 config 的 ECEF transform 逆算，原點橢球高與原始正高均為 567.949 m，證實該定位把正高當成橢球高，尚未套用大地起伏。

下載 ISG 發布的 TWGEOID2018h（GRS80／TWD97，30秒格網，721×841，北到南／西到東），於來源原點雙線性內插 N=23.787085804753787 m，使用 h=H+N。四鄰值為23.6160、23.7410、23.6859、23.8074 m。完整原點、網格及診斷留在 ignored `.local/gukeng-integration-20261122/georeference/`，不將精確案件位置寫入公開前端設定。

- 網格 SHA256：`d70be09f793d1791633a23154fb17987a7bb47cb790e24abc79769d8b24526ff`
- 原始 tileset.json SHA256：`813c4e36d9c9d508c57cc90993788c3e9a4b5980fb8d86b067df4402f8a37b10`
- 只在真正讀取到相同 root bytes 時轉換，否則保持 pending 且不提供正高值；WeakMap 防止重複加高。
- 採本區原點固定 N 的剛體顯示位移，不縮放／旋轉或任意水平挪動。原始網格、計算 GLB、分區線、裁切與相機目標共用同一矩陣。原始面積／報告／DXF 資料不變；對外讀取高程扣回相同 N。
- 原版古坑頁 globe.show=false，沒有底圖接邊可驗收。整合後的 Cesium World Terrain 仍是較粗背景地形；NLSC 正射圖標示2023，與本次2026模型年代不同。高程轉換不代表背景地形或影像達到本次測量精度，也不以背景地形反推任意校正量。

## 來源與授權

C. Hwang, H.-J. Hsu, W.E. Featherstone, C.-C. Cheng, M. Yang, W. Huang, C.-Y. Wang, J.-F. Huang, K.-H. Chen, C.-H. Huang, H. Chen, W.-Y. Su (2018). *The hybrid geoid of Taiwan: TWGEOID18h*. V.1.0. GFZ Data Services. https://doi.org/10.5880/isg.2018.002

ISG 授權 CC BY 4.0；此處內插並取本區固定值，屬衍生計算，非原始作者另行驗收。說明與下載：https://new.isgeoid.polimi.it/Geoid/Asia/Taiwan/taiwan2018_g.html 。[PIX4D 對應基準說明](https://support.pix4d.com/hc/en-us/articles/360044174411)。未使用桃園控制點常數或通用加20公尺。

## 驗收狀態

新增雲端回歸：版本不符拒絕換算、只換算一次、剛體保距、正高往返，以及分區GLB／線／相機與模型使用相同位移。建置與實景對位仍待預覽完成後記錄，不能以來源修改宣稱已驗收。
