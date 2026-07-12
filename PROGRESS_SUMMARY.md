# 智能檢車 專案進度摘要

最後更新：2026-07-12

給用途：帶到新電腦或新的 Claude Code 對話時，貼給我當開場背景，讓我快速接上進度。

## 專案基本資訊

- 任務規格文件：`智能檢車_開發任務清單與Prompt範本_審閱修正版.md`（repo 根目錄，繁體中文，Task 0~13；為整體架構藍圖，實務上有調整、與現況會有落差，以 PROGRESS_SUMMARY 為準）
- 專案程式碼：`D:\project\web`（React 19 + Vite + TypeScript PWA）
- GitHub repo：https://github.com/billyya365-code/ai-car-guide （公開 repo）
- 線上部署：https://billyya365-code.github.io/ai-car-guide/ （GitHub Pages，push 到 master 自動部署）
- Git 帳號：billyya365-code
- 本機 conda 環境：`ai-car-guide`（Python 3.13）——本專案的 Python 套件都裝在這個環境，不要裝進 base
- 車輪/車牌位置偵測模型原始檔：`car_yolo/yolov8_tfjs_model.zip`（已解壓進 `web/public/model/`）
- 車牌字元辨識模型原始檔：`car_plate_ocr/car_license_train_model.zip`（已解壓進 `web/public/char_model/`）——使用者自訓練的 YOLO11n 字元偵測模型（36 類：0-9、A-Z 扣掉 O、"-"）

## 已完成任務

- **任務 0**：專案初始化，Vite+React+TS PWA 骨架。
- **任務 1**：YOLOv8 TFJS 模型驗證（WebGL / WASM 兩種後端皆通過），驗證頁面在 `/dev/model-spike`。
- **任務 2（資料標註與訓練）**：使用者已確認目前資料集堪用，之後可能會訓練更好的資料集再通知。
- **任務 3**：相機拍照元件（`CameraCapture.tsx`），4 個方位模板（前左/前右/後左/後右），每個方位各有「車輪」+「車牌」兩個引導框。
- **任務 3.5**：iOS 13+ 感測器權限，與相機權限在同一個使用者手勢同步呼叫堆疊內觸發。
- **部署**：GitHub Pages + GitHub Actions，HashRouter、`import.meta.env.BASE_URL` 處理子路徑資源載入。
- **任務 4**：`useGuidanceStateMachine`——提示優先權佇列（水平 > 直立 > 位置 > 距離 > 清晰度 > 車牌）。
- **任務 5**：`useGyroscopeGuard`——gamma ±25° / beta 60°~95°，含萬向鎖 bug 修正。
- **任務 6**：`useVisionGuidance`——載入模型、節流推論（8 FPS，`src/lib/frameScheduler.ts`）、位置/距離百分比比對。
- **引導框座標校準**：`guideTemplates.ts` 已用黃金標準照校準過。

### 任務 7（車牌 OCR）—— 本輪 session 大幅重寫

原本用 Tesseract.js，實測辨識率非常差（亂碼、結果一直跳動、最多只能穩定讀到 2-3 碼），且對 45 度斜角拍攝的車牌變形完全無法招架。已完整換掉：

- **OCR 引擎換成自訓練字元偵測 YOLO 模型**（`usePlateOCR.ts` 整個重寫）：不再用傳統文字 OCR，而是把車牌上每個字元當成獨立物件偵測類別（業界 ANPR 常見作法）。裁切車牌 → 動態抓角點 → 去斜 → letterbox 640x640 → 丟進字元模型 → 跨類別 NMS 去重 → 依 x 座標由左到右排序組字串。
- **`tesseract.js` 依賴已完全移除**（`npm uninstall`，`CoreLibsCheck.tsx` 診斷項目也拿掉了）。
- **透視校正基礎建設**（新檔案）：
  - `src/lib/perspective.ts`：`warpQuadToRect()`，純手刻 8 參數透視變換 + 雙線性取樣（沒用 opencv.js，維持專案一貫避免大型 WASM chunk 的原則）。
  - `src/lib/plateCornerDetection.ts`：`detectPlateQuad()`，純影像處理動態抓車牌四角（Sobel 邊緣 + Hough 直線偵測 + 角點排序），不用另外訓練關鍵點模型就能適應拍攝角度誤差。
  - `guideTemplates.ts` 新增 `PLATE_SKEW_CORNERS`：目前只有 `front_right` 有實測校準值，其餘 3 個方位（front_left/back_left/back_right）還是 identity（無校正）佔位，待補。動態偵測失敗時（信心 < 0.35）才會退回這組固定校準值。
- **除錯 overlay 大幅強化**（`CameraCapture.tsx`）：新增裁切像素、逐字元辨識結果與信心分數、角點校正來源（動態偵測/固定校準/無校正）、原始裁切與前處理後圖片縮圖預覽、以及**辨識錯誤訊息顯示**。
- **最新一筆修正（commit `0ba238d`，已 push，尚未經使用者實機驗證）**：OCR 流程曾出現「卡住不動、無錯誤訊息、30 秒以上沒反應」的問題，已加上：
  1. `debugLastError` 欄位，catch 到的例外會直接顯示在除錯 overlay。
  2. `withTimeout()` 包住模型載入與偵測結果解析兩個步驟，15 秒逾時會拋出明確錯誤，不會再無限卡住。
  - **這是目前最優先要確認的事項**——換電腦後第一件事應該是請使用者在新環境／手機上無痕模式重新測試一次，看這次 overlay 到底顯示什麼（逾時訊息 or 其他 JS 例外）。

- **其他修正**：除錯文字重疊（flex 版面）、GitHub Actions 版本升級、距離容錯放寬到 40%。

## 尚未開始 / 待處理

- **【最優先】驗證 commit `0ba238d` 的除錯訊息**：確認字元模型 OCR 卡住的真正原因（模型下載/推論逾時？還是被吞掉的例外？），拿到 `debugLastError` 實際內容後才能對症下藥。
- 校準剩餘 3 個方位的 `PLATE_SKEW_CORNERS`（front_left / back_left / back_right）——`data/test_pic/` 底下已有對應參考照（右前.jpg/左前.jpg/左後.jpg/右後.jpg，未進 git）可用。
- 評估透視校正 + 動態角點偵測這兩層，對「新的字元偵測模型」到底是有幫助還是反而傷準確度——這兩層原本是針對 Tesseract 的弱點做的，新模型對斜角的容忍度還沒驗證過。
- OCR 相關測試旗標尚未收尾，正式上線前要處理：
  - `CameraCapture.tsx` 的 OCR 觸發 `useEffect` 目前繞過完整 5 項守門（只看 `isSharpOk`），標記 🧪 待恢復成 `isLevelOk && isUprightOk && isPositionOk && isDistanceOk && isSharpOk`。
  - `usePlateOCR.ts` 的 `ENABLE_MANUAL_CONFIRMATION_LOCK` 目前是 `false`（方便連續重試測試），之後要改回 `true`。
  - `TEST_RETRY_COOLDOWN_MS`（目前 3000ms）測試完要重新考慮是否保留/調整。
- **任務 8**：自動快門（依 sensorPermission 決定是否啟用）。
- **任務 9**：補拍相機（一般取景模式）。
- **任務 10**：完整降級 UX（目前只有零星的 fallback）。
- **任務 11**：model/opencv 等重資源的正式預載策略（目前靠 code-splitting + lazy route 暫時處理）。
- **車輛資料查詢流程**：車牌號碼目前是 `CaptureGuidePage` 上手動輸入框（測試用），還沒有真正的車輛查詢/掃描機制帶入 `expectedPlateNumber`。

## 已知注意事項 / 待確認事項

- `golden_photos/`、`test_pic/`、`data/`（含本機訓練用的 best.pt/.tflite 等原始檔）都**沒有**提交到 git（已加入 `.gitignore`），換電腦時不會自動出現，需要另外處理／重傳。
- 位置/距離/方向的判斷慣例是暫定的，尚未經過黃金標準照精確驗證。
- `useVisionGuidance` 的面積容錯目前是 40%（刻意放寬方便測試）。
- `@techstark/opencv-js` 仍是專案依賴（`CoreLibsCheck.tsx` 任務 0 診斷頁面還在用它驗證套件載入），正式功能（模糊偵測）已不依賴它。
- 傳截圖給 Claude Code 測試的既定流程：使用者把手機截圖放進 `D:\project\data\test_pic\`（該資料夾在 `.gitignore` 內，不會外流）。

## 常用指令

```bash
cd D:/project/web
npm run dev          # 本機開發伺服器
npm run build         # 正式建置（部署前務必先跑一次確認無誤）
npm run preview       # 建置後本機預覽（測試 PWA/Service Worker 行為用這個，不要用 dev）
```

部署：push 到 `master` 會自動觸發 GitHub Actions 建置並部署到 GitHub Pages，不需要手動操作。

換電腦時：`git clone` 這個 repo 後，`char_model/`、`model/` 都已隨 git 一起帶過去（zip 有備份在 `car_yolo/`、`car_plate_ocr/`），但 `data/`、`golden_photos/`、`test_pic/` 需另外手動搬移或重新蒐集。
