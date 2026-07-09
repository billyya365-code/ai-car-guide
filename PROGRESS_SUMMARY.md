# 智能檢車 專案進度摘要

最後更新：2026-07-09

給用途：帶到新電腦或新的 Claude Code 對話時，貼給我當開場背景，讓我快速接上進度。

## 專案基本資訊

- 任務規格文件：`D:\AI_Car_Guide\智能檢車_開發任務清單與Prompt範本_審閱修正版.md`（繁體中文，Task 0~13）
- 專案程式碼：`D:\AI_Car_Guide\web`（React + Vite + TypeScript PWA）
- GitHub repo：https://github.com/billyya365-code/ai-car-guide （公開 repo）
- 線上部署：https://billyya365-code.github.io/ai-car-guide/ （GitHub Pages，push 到 master 自動部署）
- 訓練好的 YOLOv8 模型原始檔：`D:\AI_Car_Guide\car_yolo`（已解壓縮進 `web/public/model/`）

## 已完成任務

- **任務 0**：專案初始化，Vite+React+TS PWA 骨架，鎖定版本（tfjs / opencv-js / tesseract.js），`platform/` 資料夾為未來 Capacitor 封裝預留。
- **任務 1**：YOLOv8 TFJS 模型驗證（WebGL / WASM 兩種後端皆通過），驗證頁面在 `/dev/model-spike`。
- **任務 2（資料標註與訓練）**：狀態不明確——文件宣稱已完成，但當初有發現疑慮並未實際重新確認，之後被用戶導向優先做任務 3，目前懸而未決。
- **任務 3**：相機拍照元件（`CameraCapture.tsx`），4 個方位模板（前左/前右/後左/後右），每個方位各有「車輪」+「車牌」兩個引導框。
- **任務 3.5**：iOS 13+ 感測器權限（DeviceMotionEvent/DeviceOrientationEvent.requestPermission），與相機權限在同一個使用者手勢同步呼叫堆疊內觸發。
- **部署**：GitHub Pages + GitHub Actions（`.github/workflows/deploy-pages.yml`），用 HashRouter（非 BrowserRouter）、`import.meta.env.BASE_URL` 處理子路徑資源載入。
- **真機除錯**：修過多輪相機 FOV/縮放/直式問題，最終結論是改用 `<video>` 的 `videoWidth/videoHeight` 而非 `track.getSettings()` 決定容器比例；後來又發現需要主動要求 `width/height: {ideal: 1920}` 解析度，否則畫質明顯偏低。
- **任務 4**：`useGuidanceStateMachine`（`src/hooks/useGuidanceStateMachine.ts`）——提示優先權佇列（水平 > 直立 > 位置 > 距離 > 清晰度 > 車牌），感測器不可用時水平/直立視為略過。驗證頁 `/dev/guidance-spike`。
- **任務 5**：`useGyroscopeGuard`（`src/platform/useGyroscopeGuard.ts`）——gamma ±25° / beta 60°~95°（依使用者實測回饋調整過閾值）。有修過一個「萬向鎖」bug：beta 遠離垂直時 gamma 會不穩定誤報，導致修正為「beta 不在範圍內時 gamma 一律視為通過」。
- **任務 6**：`useVisionGuidance`（`src/hooks/useVisionGuidance.ts`）——載入模型、節流推論（目標 8 FPS，用共用的 `src/lib/frameScheduler.ts` 而非各自 setInterval）、位置/距離百分比比對、模型載入失敗時降級。畫面上會同時顯示「黃金位置」（灰色虛線）與「即時偵測框」（藍綠色實線 + 信心分數）。
- **引導框座標校準**：用使用者提供的 4 張黃金標準照（`golden_photos/`，未提交 git，見下方注意事項）疊加 10% 格線後讀取座標，寫入 `guideTemplates.ts`；之後使用者又自行手動微調過幾次。
- **任務 7**：`useBlurDetection`（純 JS/Canvas 算拉普拉斯變異數，刻意不用 opencv.js 避免 15.6MB 的 WASM chunk）、`usePlateOCR`（僅預載 Tesseract.js `eng`、`triggerOnce` 有 lock、連續失敗 3 次後 `needsManualConfirmation` 逃生選項）。
- **其他修正**：除錯文字重疊（改用 flex 版面）、GitHub Actions 版本升級（解決 Node 20 deprecation 警告）、距離容錯從 10% 放寬到 40%（原本太嚴格導致卡在「請靠近一點」進不了車牌核對）。

## 尚未開始 / 待處理

- **任務 8**：自動快門（依 sensorPermission 決定是否啟用）。
- **任務 9**：補拍相機（一般取景模式，`CameraCapture` 的 `guideBoxes` 可留空支援這個情境，但流程本身還沒做）。
- **任務 10**：完整降級 UX（目前只有零星的 fallback，例如模型載入失敗顯示banner）。
- **任務 11**：model/opencv/tesseract 等重資源的正式預載策略（目前靠 code-splitting + lazy route 暫時處理）。
- **車輛資料查詢流程**：目前車牌號碼是 `CaptureGuidePage` 上一個手動輸入框（測試用），還沒有真正的車輛查詢/掃描機制帶入 `expectedPlateNumber`。
- **任務 2** 的實際狀態需要跟使用者確認是否要重新處理。

## 已知注意事項 / 待確認事項

- `golden_photos/` 資料夾**沒有**提交到 git（已加入 `.gitignore`）——裡面的黃金標準照含真實可辨識車牌，repo 是公開的。換電腦或重新整理環境時這個資料夾不會自動出現，需要另外處理。
- 位置/距離/方向（up/down/left/right、closer/farther）的判斷慣例是暫定的，尚未經過黃金標準照精確驗證，未來可能需要調整語意或容錯值。
- `useVisionGuidance` 的面積容錯目前是 40%（刻意放寬方便測試），之後如果座標校準更精確，可以考慮收緊。
- `@techstark/opencv-js` 仍是專案依賴（`CoreLibsCheck.tsx` 任務 0 診斷頁面還在用它驗證套件載入），但正式功能（模糊偵測）已經改成不依賴它，正式 build 不會把它打包進去。
- GitHub Actions 曾在 2026-07-09 遇到官方回報的 `degraded_performance` 事件，導致多次部署排隊異常久（10~20 分鐘），非專案本身問題，事後已恢復正常。

## 常用指令

```bash
cd D:/AI_Car_Guide/web
npm run dev          # 本機開發伺服器
npm run build         # 正式建置（部署前務必先跑一次確認無誤）
npm run preview       # 建置後本機預覽（測試 PWA/Service Worker 行為用這個，不要用 dev）
```

部署：push 到 `master` 會自動觸發 GitHub Actions 建置並部署到 GitHub Pages，不需要手動操作。
