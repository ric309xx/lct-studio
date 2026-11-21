# 正式來源功能保留與重新建置驗收

2026/11/21，來源基準 d484d25fd09720387228e4ed5783fae02791ce3c；已驗收預覽 76770b4a2b1613eb28518671942c3f7b4fa9e3a9。

本次將 source baseline 的 integrationVerified 設為 true，表示原正式功能已整合並經雲端重建及預覽驗收，不表示 production 設定、Worker 認證切換或正式入口驗收已完成。正式發布仍需完成這些獨立條件。

- Git 已確認 d484d25 是本分支祖先；11/21 Netlify Published 仍為該提交。本機原始工作目錄沒有被重設或整批覆寫。
- LongdongGaussian.tsx 保留，與基準的差異僅為使用者要求的 Pix4Dmatic 顯示名稱。SuperSplat iframe／scene 指向原有同一展示，保留返回、Escape、另開展示及公開連結性質說明。使用者已決定維持知道連結即可觀看，不把它列為私有資料。
- 11/20 最新成功分支部署 6affff947cf6a0ac1162c7b7（76770b4），來源測試 77 通過、精確編譯 Worker 37 通過、前端 237 通過／1 略過，秘密掃描 26,389 檔無發現。雲端完整重建已完成，未以舊預編譯 Viewer 取代。
- 真實預覽已驗收管理員跨案件切換、三峽 ion／地形／套繪、龍洞 ion 比較／R2 網格、桃園 ion／R2／套繪／控制點照片、跨專案拒絕與各自登出。桃園原觀看密碼由使用者遺忘，其分享入口以管理員密碼強制 viewer 身分測試；不把此結果說成原觀看密碼已驗收。
- 龍洞雙區入口已確認分隔線可拖曳、交換、重設；公開高斯展示可開啟與返回。最新 Pix4Dmatic 按鈕文字精確匹配，靠左且與古坑按鈕同左緣；古坑快捷入口開原獨立站，沿用原認證。
- 兩個經使用者批准退役的分享入口已於預覽封鎖，不刪 ion 資產；其正式封鎖待新正式版發布後重測。

詳細實讀紀錄與畫面證據保存在主工作區 docs/SECURITY_ACCEPTANCE_20261120.md、docs/SECURITY_IMPROVEMENT_PLAN.md 及 docs/security-evidence-20261120/。最新發布協調紀錄為主工作區 docs/SECURITY_RELEASE_20261121.md。

完整 Worker 的正式部署、新 Secret／Session 切換、Production 有效 ion 值及發布後實際驗收仍待執行。舊 ion Token 撤銷保留至穩定後另行確認。不得將本文件作為上述步驟已完成的證據。
