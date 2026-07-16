# 智能檢車 專案進度摘要

最後更新：2026-07-16

給用途：帶到新電腦或新的 Claude Code 對話時，貼給我當開場背景，讓我快速接上進度。這份文件記錄的是**現況**，不是逐次變更的日誌——中途試過又改掉的做法（例如車牌透視校正、長方形模型輸入、拍照前觸發辨識）不會留在這裡，只留下最後定案的版本，避免未來讀到過時的細節。

## 專案基本資訊

- 任務規格文件：`智能檢車_開發任務清單與Prompt範本_審閱修正版.md`（repo 根目錄，繁體中文，Task 0~13；為整體架構藍圖，實務上有調整、與現況會有落差，以本文件為準）
- 專案程式碼：`D:\AI_Car_Guide\web`（React 19 + Vite + TypeScript PWA）
- GitHub repo：https://github.com/billyya365-code/ai-car-guide （公開 repo）
- 線上部署：https://billyya365-code.github.io/ai-car-guide/ （GitHub Pages，push 到 master 自動觸發 GitHub Actions 部署）
- Git 帳號：billyya365-code
- 本機 conda 環境：這台機器上實際可用的是 `car`、`car_ai`、`car_export`、`car_tfjs`（不是文件早期版本寫的 `ai-car-guide`，那個環境在這台機器不存在）。**`car_tfjs`** 是驗證過可以完整跑通 `best.pt → onnx → onnx2tf -dgc → tensorflowjs_converter` 全流程的環境（ultralytics 8.4.93、onnx2tf 1.28.8、tensorflow 2.19.1、tf_keras 2.19.0、tensorflowjs 4.22.0），之後重新匯出模型優先用這個。
- 車輪/車牌位置偵測模型原始檔：`car_yolo/yolov8_tfjs_model.zip`（已解壓進 `web/public/model/`）
- 車牌字元辨識模型原始檔：`car_plate_ocr/car_license_train_model.zip`（已解壓進 `web/public/char_model/`）——使用者自訓練的 YOLO11n 字元偵測模型，**33 類**（`0-9` 扣掉 `4`、`A-Z` 扣掉 `O`/`I`、不含分隔符號 `-`），正方形 **640x640** 輸入。缺少 `4`/`I`/`O`/`-` 是刻意設計（台灣車牌實務上不會出現這些字元/符號，非漏標）。

## 已完成任務

- **任務 0**：專案初始化，Vite+React+TS PWA 骨架。
- **任務 1**：YOLOv8 TFJS 模型驗證（WebGL / WASM 兩種後端皆通過），驗證頁面在 `/dev/model-spike`。
- **任務 2（資料標註與訓練）**：使用者已確認目前資料集堪用。
- **任務 3**：相機拍照元件（`CameraCapture.tsx`），4 個方位模板（前左/前右/後左/後右），每個方位各有「車輪」+「車牌」兩個引導框。
- **任務 3.5**：iOS 13+ 感測器權限，與相機權限在同一個使用者手勢同步呼叫堆疊內觸發。
- **部署**：GitHub Pages + GitHub Actions，HashRouter、`import.meta.env.BASE_URL` 處理子路徑資源載入。
- **任務 4**：`useGuidanceStateMachine`——提示優先權佇列（水平 > 直立 > 位置 > 距離 > 清晰度 > 車牌）。
- **任務 5**：`useGyroscopeGuard`——gamma ±25° / beta 60°~95°，含萬向鎖 bug 修正。
- **任務 6**：`useVisionGuidance`——載入模型、節流推論（8 FPS，`src/lib/frameScheduler.ts`）、位置/距離百分比比對，面積容錯目前放寬到 40%（測試用，待日後校準收緊）。
- **引導框座標校準**：`guideTemplates.ts` 已用黃金標準照校準過。

### 任務 7（車牌 OCR）—— 現況

原本用 Tesseract.js（辨識率極差、對斜角車牌無法招架），已完全換掉，改用「把車牌上每個字元當成獨立物件偵測類別」的 ANPR 常見作法：

**目前的完整流程**（`usePlateOCR.ts` + `CameraCapture.tsx`）：
1. 自動快門只依賴水平/直立/位置/距離/清晰度這 5 項（不含車牌），拍到照片後**先暫存**成 `pendingCaptureImage`，不會立刻交給外層 callback。
2. 暫存的那一刻自動觸發一次車牌辨識：裁切車牌區域（12% padding）→ letterbox 成 640x640 → 丟進字元模型 → 跨類別 NMS 去重（`CROSS_CLASS_IOU_THRESHOLD=0.3`）→ 依已知車牌長度剔除信心分數最低的多餘字元（`pruneToExpectedLength`）→ 依 x 座標由左到右組字串 → 跟期望車牌比對。
3. 跳出「拍攝完成！」確認頁：**必須辨識成功（`isPlateOk === true`）或本來就沒填期望車牌，才能按下「確認，前往下一步」**；失敗只能點「重新辨識」或（連續失敗達上限後）「手動確認車牌」逃生選項，不能直接跳過。
4. 每個角度都**各自獨立**核對一次——按下確認換到下一角度時會呼叫 `usePlateOCR` 的 `reset()`，不會沿用前一角度已核對成功的結果（因為 `CameraCapture` 元件實例不會因換角度而重新掛載，狀態需要手動重置）。
5. **沒有透視校正**：早期做過「不校正 vs 梯形校正後」並排比較（`perspective.ts`/`plateCornerDetection.ts`），但後來確認新版模型準確率已經夠高，使用者要求整個移除，現在只跑單一路徑，程式碼更簡單、速度也更快。

**已解決、值得記住的技術債**（之後遇到類似狀況可以參考）：
- **onnx2tf 轉換 bug**：`onnx2tf` 預設會把 YOLO11n attention 模組（group=128）的分組卷積轉換錯誤，導致 tfjs 模型推論拋出 `Error in conv2d: depth of input (128) must match input depth for filter 1`。修法：匯出時加 `--disable_group_convolution`（`-dgc`）。
- **後端效能**：字元模型在純 JS `cpu` 後端要 15+ 秒才跑完一次推論，`wasm` 後端只要 0.4 秒。`src/lib/tfBackend.ts` 統一在載入模型前強制切到 `wasm`（不用 `webgl`——webgl 在部分手機上失敗的時間點比逾時保護還晚，會被 `Promise.race` 蓋掉真正的錯誤訊息）。
- **`onnx2tf` 校準檔 404**：`onnx2tf` 會自動下載一個校準用 npy 檔，但該 GitHub release 附件已被上游刪除。工作環境（`car_tfjs`）目前需要在專案根目錄手動放一個亂數產生、正確 shape 的替代檔案繞過，這個檔案沒加進 git，換電腦/重新匯出時可能要重新產生。
- **測試陷阱**：「期望車牌號碼」欄位如果填非車牌格式的測試字（例如 `test`），會因為 `pruneToExpectedLength()` 依欄位長度裁剪字元，把正確辨識結果誤裁成幾乎全錯——測試務必填真實車牌格式（例如 `RFX-2325`）。
- **模型類別數變動**：`web/src/lib/yolo.ts` 的 `CHAR_CLASS_NAMES` 必須跟模型實際訓練的類別順序完全一致，每次換模型都要重新確認（可用 `ultralytics.YOLO(pt).names` 讀出實際順序）。

**目前最優先待驗證**：以上這些都只在離線黃金標準照 + Node.js 腳本測試過，**還沒有透過 app 實際介面在裝置上完整測試過**（辨識準確率、確認頁流程順不順）。

### 任務 8（自動快門）—— 現況

- **`useStillnessDetector`**：主要判定依據是 `devicemotion` 的 `rotationRate` 三軸角速度皆低於 3°/秒；裝置沒有這個資料時自動退回備援判定（連續兩次 `deviceorientation` 讀值差 < 1°）。`sensorPermission` 為 `denied` 時完全不跑自動判定，直接顯示手動拍攝按鈕。
- **`AutoShutter`**：條件全通過後（水平/直立/位置/距離/清晰度），SVG 進度圈 1 秒填滿即觸發拍照（震動 + 音效），18 秒逾時會跳出手動拍攝逃生選項。
- **`CaptureGuidePage`**：嚴格依序 front_left→front_right→back_left→back_right，拍完一個角度、車牌核對通過並確認後才換下一個。
- **待實機驗證**：靜止判定手感、不同手機的 `rotationRate` 支援度、18 秒逃生機制體感是否恰當，都還沒有實機測試過。

### 任務 11（資源預載）+ 全站視覺設計 —— 已完成

- **`src/lib/usePreloadResources.ts`**：歡迎畫面背景依序（不同時）預載兩個 TFJS 模型（各約 12MB），讀 `model.json` 的 `weightsManifest` 算出實際權重檔清單，用 HEAD 請求加總位元組數，`fetch()` + `ReadableStream` 邊讀邊算進度、顯示百分比。純粹是預熱瀏覽器快取，`useVisionGuidance`/`usePlateOCR` 仍各自呼叫自己的 `tf.loadGraphModel()`，失敗不阻擋使用者。原規格的 Mock API 部分先跳過（等任務 9 真的啟動再做）。
- **視覺設計**：選定「檢驗證書」風格（正式、可信），色票取自使用者指定的參考圖（`#5E7892` 灰藍 / `#A7B7C6` 淺灰藍 / `#F3EFDF` 奶油白 / `#BDCFAA` 鼠尾草綠 / `#8E9E83` 深橄欖綠）。`index.css` 重寫 CSS 變數（淺/深色主題皆有，含 `data-theme` 手動切換覆蓋）、襯線標題字體、共用元件類別（`.btn`/`.card`/`.field`/`.badge`/`.photo-grid`/`.progress-track` 等）。相機取景畫面另有專屬的 `.btn-camera-primary`/`.btn-camera-secondary`（固定深色疊層，不跟著主題變動），主要動作用金色呼應「證書用印」意象，跟自動快門進度圈同色；偵測框對準/未對準的綠/橘色（交通號誌慣例）維持不變。
- **範圍內沒有動到**：`ResultPage.tsx`（任務 9 佔位頁）、`ModelSpikePage.tsx`/`GuidanceStateMachineSpikePage.tsx`（開發診斷頁）。
- **待驗證**：`npm run build`/`npm run lint` 皆通過，但還沒有實機/瀏覽器截圖驗證過實際視覺呈現效果。

## 尚未開始 / 待處理

- **任務 9（結果渲染與補拍 UX）：使用者已決定暫緩**，等後端 API 規格確定後再做。已確認需求細節：後端回傳 `known_damage`（綠框）/`detected_damage`（紅框）、使用者點擊漏檢處開一般取景相機拍特寫、上傳資料要預留 `consentTimestamp`/`retentionPolicy` 欄位。目前 `CameraCapture` 沒有 `guideBoxes` 時完全沒有自動快門也沒有手動拍照按鈕，任務 9 的一般取景相機屆時需要補一個手動快門按鈕。
- **任務 10**：完整降級 UX。目前只有零星的 fallback（`AutoShutter` 對 `sensorPermission: denied` 已有基本降級），還沒有正式的 `PermissionErrorBoundary`/`usePermissionGuard`，相機權限被拒/感測器權限被拒目前沒有分開的專門錯誤畫面。
- **車輛資料查詢流程**：車牌號碼目前是 `CaptureGuidePage` 上手動輸入框（測試用），還沒有真正的車輛查詢/掃描機制帶入 `expectedPlateNumber`。
- **測試旗標收尾**：`usePlateOCR.ts` 的 `ENABLE_MANUAL_CONFIRMATION_LOCK` 目前是 `false`（方便連續重試測試），正式上線前要改回 `true`。

## 已知注意事項 / 待確認事項

- `golden_photos/`、`test_pic/`、`data/`（含本機訓練用的 best.pt/.tflite 等原始檔）都**沒有**提交到 git（已加入 `.gitignore`），換電腦時不會自動出現，需要另外處理／重傳。`car_plate_ocr/*.pt`、`*.onnx` 也已加入 `.gitignore`（只有匯出的 tfjs zip 保留備份）。
- 位置/距離/方向的判斷慣例是暫定的，尚未經過黃金標準照精確驗證。
- `@techstark/opencv-js` 仍是專案依賴（`CoreLibsCheck.tsx` 任務 0 診斷頁面還在用它驗證套件載入），正式功能（模糊偵測）已不依賴它。
- 傳截圖給 Claude Code 測試的既定流程：使用者把手機截圖放進 `D:\AI_Car_Guide\car_plate_ocr\`（或口頭告知路徑），該類資料夾多半在 `.gitignore` 內，不會外流。

## 常用指令

```bash
cd D:/AI_Car_Guide/web
npm run dev          # 本機開發伺服器
npm run build         # 正式建置（部署前務必先跑一次確認無誤）
npm run preview       # 建置後本機預覽（測試 PWA/Service Worker 行為用這個，不要用 dev）
```

部署：push 到 `master` 會自動觸發 GitHub Actions 建置並部署到 GitHub Pages，不需要手動操作。

換電腦時：`git clone` 這個 repo 後，`char_model/`、`model/` 都已隨 git 一起帶過去（zip 有備份在 `car_yolo/`、`car_plate_ocr/`），但 `data/`、`golden_photos/`、`test_pic/` 需另外手動搬移或重新蒐集。
