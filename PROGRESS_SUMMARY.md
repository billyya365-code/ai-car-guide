# 智能檢車 專案進度摘要

最後更新：2026-07-13

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

- **OCR 引擎換成自訓練字元偵測 YOLO 模型**（`usePlateOCR.ts` 整個重寫）：不再用傳統文字 OCR，而是把車牌上每個字元當成獨立物件偵測類別（業界 ANPR 常見作法）。裁切車牌 → letterbox 640x640 → 丟進字元模型 → 跨類別 NMS 去重 → 依 x 座標由左到右排序組字串。
- **`tesseract.js` 依賴已完全移除**（`npm uninstall`，`CoreLibsCheck.tsx` 診斷項目也拿掉了）。
- **字元偵測模型本身有 bug，已修復**：原始 `car_plate_ocr/` 匯出的 tfjs 模型每次推論都會拋出 `Error in conv2d: depth of input (128) must match input depth for filter 1`。根因是 onnx2tf 把 YOLO11n attention 模組（`model.10`，group=128）跟偵測頭 `cv3` 分支的深度可分離卷積轉換錯誤。修法：用 `onnx2tf --disable_group_convolution`（`-dgc`）重新跑一次 `best.pt → onnx → SavedModel → tfjs_graph_model` 全流程，並比對新舊模型在同一組輸入下的輸出數值（誤差 3e-5，純浮點誤差），確認修復無副作用。目前 `web/public/char_model/`、`car_plate_ocr/car_license_train_model.zip` 都已是修復後版本。
- **效能問題**：字元模型在純 JS `cpu` 後端要 16 秒才跑完一次推論（實測），`wasm` 後端只要 0.4 秒。原本 app 只註冊 `webgl`/`cpu`，若手機 webgl 初始化失敗會直接掉到最慢的 cpu 後端且無錯誤訊息。新增 `src/lib/tfBackend.ts`，`useVisionGuidance`/`usePlateOCR` 載入模型前都固定改用 `wasm`（放棄嘗試 webgl——webgl 在部分手機上是計算到一半才失敗，因為失敗時間點比 15 秒逾時保護還晚，`Promise.race` 會讓逾時錯誤先蓋掉 webgl 真正的錯誤，導致「偵測到 webgl 錯誤才降級」的邏輯根本沒機會執行）。
- **透視校正 + 動態角點偵測：目前「不校正」與「校正後」兩組同時跑，並排比較**：離線用單張黃金標準照測試時（`golden_photos/front_right`）「不校正」準確率明顯較高（信心 0.96 vs 0.87），一度整個刪除這兩個檔案；但使用者要求恢復並同時顯示兩組結果方便實機比較，所以又把 `src/lib/perspective.ts`、`src/lib/plateCornerDetection.ts`、`guideTemplates.ts` 的 `PLATE_SKEW_CORNERS` 加回來。現在 `usePlateOCR.ts` 的 `triggerOnce` 對同一張裁切圖分別跑「原圖直接辨識」（`noWarp`）與「先做透視校正再辨識」（`withWarp`）兩次完整流程，`isPlateOk` 只要任一組吻合即算通過，辨識窗格會並排顯示兩組結果（逐字元、NMS 前候選數、前處理後縮圖）方便肉眼比較取捨。
- **手動觸發車牌辨識**：自動連續觸發在部分手機上會不斷重複逾時、使用者看不到進度，已改成「辨識車牌」按鈕 + 跳出窗格顯示結果（成功/失敗/錯誤訊息、期望 vs 實際文字、逐字元分數、除錯圖片），並提供重新辨識/手動確認/關閉三個操作。
- **除錯 overlay**：裁切像素、逐字元辨識結果與信心分數、NMS 前候選數（`debugPreNmsCount`，用來分辨「模型沒看到」還是「有看到但被門檻濾掉」）、tfjs 目前使用的後端名稱（webgl/wasm/cpu）、原始裁切與前處理後圖片縮圖、辨識錯誤訊息。
- **分隔符號（"-"）與雜訊處理**（`usePlateOCR.ts`）：實測發現分隔符號區域常被模型誤判成鄰近數字（例如誤讀成 0/8），改成直接濾掉模型輸出的 `-` 類別偵測結果（`isSeparatorChar`），車牌比對本來就已經忽略非英數字元，不受影響；顯示用的「實際讀到」文字改成依期望車牌的分隔符號位置固定插入 `-`（`formatRecognizedTextForDisplay`）。另外新增 `pruneToExpectedLength()`：已知期望車牌長度時，組出來的字元數比期望多就依信心分數剔除最低分的字元，門檻則從診斷用的 0.15 調回 0.3（正確字元的信心分數實測可以低到 0.52，門檻不能太高）。
- **目前最優先待驗證**：準確率本身（不只是速度/是否卡住）還需要更多實機測試資料確認——下一步應該請使用者在多個角度/光線條件下實測「辨識車牌」按鈕，比較「不校正」與「校正後」兩組結果哪個比較準，看 debugCharDetections 是否穩定讀對大部分字元。

- **其他修正**：除錯文字重疊（flex 版面）、GitHub Actions 版本升級、距離容錯放寬到 40%。

## 尚未開始 / 待處理

- **【最優先】驗證字元辨識準確率**：模型卡住/逾時的問題已解決（模型 bug 修復 + 強制 wasm 後端 + 移除有害的透視校正），現在改成手動「辨識車牌」按鈕觸發。需要多角度/多光線條件實測，確認 `debugCharDetections` 能不能穩定讀對大部分字元，`CHAR_SCORE_THRESHOLD` 目前暫時調到 0.15 只是為了診斷用，之後要依實測結果調回合理值。
- OCR 相關測試旗標尚未收尾，正式上線前要處理：
  - `CameraCapture.tsx` 的 OCR 觸發改成使用者手動點擊「辨識車牌」按鈕，目前完全不檢查水平/直立/位置/距離/清晰度，之後要考慮是否要求先通過這些守門才能點擊。
  - `usePlateOCR.ts` 的 `ENABLE_MANUAL_CONFIRMATION_LOCK` 目前是 `false`（方便連續重試測試），之後要改回 `true`。
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
