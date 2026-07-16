# 智能檢車 專案進度摘要

最後更新：2026-07-16

給用途：帶到新電腦或新的 Claude Code 對話時，貼給我當開場背景，讓我快速接上進度。

## 專案基本資訊

- 任務規格文件：`智能檢車_開發任務清單與Prompt範本_審閱修正版.md`（repo 根目錄，繁體中文，Task 0~13；為整體架構藍圖，實務上有調整、與現況會有落差，以 PROGRESS_SUMMARY 為準）
- 專案程式碼：`D:\project\web`（React 19 + Vite + TypeScript PWA）
- GitHub repo：https://github.com/billyya365-code/ai-car-guide （公開 repo）
- 線上部署：https://billyya365-code.github.io/ai-car-guide/ （GitHub Pages，push 到 master 自動部署）
- Git 帳號：billyya365-code
- 本機 conda 環境：目前這台機器上實際可用的是 `car`、`car_ai`、`car_export`、`car_tfjs`（不是文件早期版本寫的 `ai-car-guide`，那個環境在這台機器上不存在）。**`car_tfjs`** 是目前驗證過可以完整跑通 `best.pt → onnx → onnx2tf -dgc → tensorflowjs_converter` 全流程的環境（ultralytics 8.4.93、onnx2tf 1.28.8、tensorflow 2.19.1、tf_keras 2.19.0、tensorflowjs 4.22.0），之後重新匯出模型優先用這個。
- 車輪/車牌位置偵測模型原始檔：`car_yolo/yolov8_tfjs_model.zip`（已解壓進 `web/public/model/`）
- 車牌字元辨識模型原始檔：`car_plate_ocr/car_license_train_model.zip`（已解壓進 `web/public/char_model/`）——使用者自訓練的 YOLO11n 字元偵測模型。**2026-07-16 更新為 33 類**（0-9 扣掉 4、A-Z 扣掉 O/I、不含 "-"；長方形 640x256 輸入），原本的 36 類版本（含 "-"、4、I）已淘汰，細節見下方任務 7 補充。

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
- **字元模型輸入改成長方形（640x256）而非正方形（640x640）**：車牌本身又寬又扁，塞進正方形輸入會浪費快一半解析度在黑邊上。用 `data/best.pt` 重新以 `imgsz=[256,640]` 匯出（同一套 onnx2tf `-dgc` 流程），已用 Node.js 驗證新舊模型輸出數值一致（誤差量級同前）。`web/src/lib/yolo.ts` 的 `computeLetterboxLayout`/`drawLetterboxed`/`detectionToVideoPercent`/`decodeYoloOutput` 都已把單一 `targetSize`/`inputSize` 參數改成 `targetWidth`/`targetHeight` 分開指定，車輪/車牌模型（`useVisionGuidance.ts`、`ModelSpikePage.tsx`）維持傳相同寬高（640x640）不受影響，字元模型（`usePlateOCR.ts`）改用 `CHAR_INPUT_WIDTH=640`/`CHAR_INPUT_HEIGHT=256`。
  - 🧪 重新匯出時踩到一個 onnx2tf 上游問題：`onnx2tf` 會自動下載一個校準用的 npy 檔（`calibration_image_sample_data_20x128x128x3_float32.npy`），但該 GitHub release 的附件已經被上游刪除，導致 404 後续又因舊快取檔案是 pickle 格式讀取失敗。目前是在專案根目錄手動放一個亂數產生、正確 shape 的替代檔案繞過（純粹給 onnx2tf 內部做 NCHW/NHWC 健全性檢查用，不影響轉換結果），這個檔案沒有加進 git，換電腦/重新匯出時如果又遇到同樣錯誤，需要重新產生。
- **台灣車牌不會出現英文字母 I、O**（容易與數字 1、0 搞混）：`usePlateOCR.ts` 新增 `remapImpossibleChar()`，模型如果讀到 I 就直接改成 1、讀到 O 就直接改成 0（而不是濾掉整個字元，那樣該位置會整個消失）。
- **目前最優先待驗證**：準確率本身（不只是速度/是否卡住）還需要更多實機測試資料確認——下一步應該請使用者在多個角度/光線條件下實測「辨識車牌」按鈕，比較「不校正」與「校正後」兩組結果哪個比較準，看 debugCharDetections 是否穩定讀對大部分字元，並確認長方形輸入是否真的改善了緊密排列數字的辨識率。

- **其他修正**：除錯文字重疊（flex 版面）、GitHub Actions 版本升級、距離容錯放寬到 40%。

### 任務 7 補充（2026-07-16）—— 換上重新訓練的字元模型，準確率大幅提升

使用者重新訓練了一個新版 `best.pt`，並提供了一個能在 Colab 上用 `ultralytics` 直接 `predict()` 成功辨識車牌的參考腳本。過程中發生了幾件事：

- **新模型少了 3 個類別**：讀出來的 `model.names` 只有 33 類，比舊模型少了 `"-"`、`I`、**`4`**。前兩個本來就在 app 端被濾掉/remap，但 `4` 一開始被誤判為訓練資料缺陷（很嚴重，因為台灣車牌通常會用到 4）。**使用者確認這是刻意的**：新式車牌本來就不會出現數字 4（跟不會出現 I/O 是同一類考量），不是漏標。
- **診斷過程中一度懷疑是 NMS/IoU 門檻設定問題**：懷疑我們的 `iouThreshold=0.45`（低於 ultralytics `predict()` 預設的 0.7）跟額外加的跨類別 NMS（`CROSS_CLASS_IOU_THRESHOLD=0.3`）過度激進、把緊鄰字元誤判成重複而濾掉。實際拿黃金標準照（`front_right`，真實車牌 RFX-2325）+ 當時**仍是舊模型**做 A/B 測試，五種門檻組合（含完全比照 ultralytics 預設、完全不做跨類別 NMS）**結果全部相同**，證明 IoU 門檻從來不是問題——之前的結論（模型本身對緊密排列數字的辨識力不足）依然成立，這次測試沒有推翻它。
- **真正的關鍵發現**：Colab 腳本測試用的 `best.pt` 其實跟這次新提供的是同一個檔案。改用**新模型**測試同一張黃金標準照，並且這次不是餵「原始裁切」（未校正、近似正方形 147x124，硬塞進 640x256 長方形畫布會留下大量無意義黑邊），而是餵「**透視校正拉正後**」的圖（依 `computeQuadOutputSize` 算出的自然比例 124x58，寬扁形狀，完全符合 640x256 畫布），新模型完美讀出 `RFX2325`（信心 0.89~0.99），跟 Colab 結果一致，也跟 Python `ultralytics.predict()` 直接讀原始裁切的結果一致。
  - 換句話說：這次準確率大幅提升主要來自**新模型本身訓練得更好**，但要發揮這個優勢，「校正後」（`withWarp`）那組結果的重要性提高了——「不校正」（`noWarp`）那組對近似正方形的原始裁切依然不適合直接塞進長方形畫布。
  - 用其餘 3 個角度（`front_left`/`back_left`/`back_right`）的黃金標準照測試「不校正」路徑，結果都不理想（例如 `front_left` 讀成 `RX3322`，漏了 `F`）——這是**既有、非本次新增的落差**：這 3 個角度目前 `PLATE_SKEW_CORNERS` 都還是恆等變換（沒有真正校正過），跟前一版模型時的情況相同，之後仍需要比照 `front_right` 的方式量測校準。
- **已完成的變更**：
  - `web/src/lib/yolo.ts` 的 `CHAR_CLASS_NAMES` 改成新的 33 類清單（順序取自模型 `names`）。
  - `web/src/hooks/usePlateOCR.ts` 移除了 `isSeparatorChar`／`remapImpossibleChar`（已變成永遠不會命中的死碼，因為新模型的類別清單裡本來就不包含 `-`/`I`/`O`）。
  - 用 `car_tfjs` conda 環境重跑 `best.pt --imgsz=[256,640] → onnx (opset 13) → onnx2tf -dgc → tensorflowjs_converter` 全流程，數值驗證：同一張圖餵給 onnxruntime 直接推論 vs. 轉換後的 tfjs 模型，結果一致（確認轉換過程沒有引入誤差），且跟 Python `ultralytics.predict()` 的結果也吻合。
  - `web/public/char_model/`、`car_plate_ocr/car_license_train_model.zip`、`data/best.pt`、`data/best.onnx` 都已更新為新版。
  - `.gitignore` 新增 `car_plate_ocr/*.pt`、`car_plate_ocr/*.onnx`（原始權重檔不進 git，只有匯出的 tfjs zip 保留備份，跟 `data/` 的既有慣例一致）。
  - 已跑過 `npm run build`/`npm run lint` 確認無誤。
- **待驗證**：這次只用離線黃金標準照 + Node.js 腳本驗證過（見上方），還沒有透過 app 實際介面在裝置上重新測試（辨識車牌按鈕、`debugCharDetections` 顯示等）。

### 任務 7 補充 2（2026-07-16 下午）—— 再換一版更新的字元模型，連「不校正」路徑都明顯改善

使用者又提供一個新版 `best (0716plate).pt`，類別清單跟上一版完全相同（33 類，同樣排除 `-`/`I`/`4`），用同一套 `car_tfjs` 環境流程（`imgsz=[256,640] → onnx opset13 → onnx2tf -dgc → tensorflowjs_converter`）重新匯出、部署。

- 離線用黃金標準照（`front_right`，真實車牌 RFX-2325）驗證：「校正後」路徑完美讀出 `RFX2325`（信心 0.91~0.96）。
- 這次額外測試了其餘 3 個角度的「不校正」路徑（這幾個角度目前都還沒有真正的透視校正），結果比前一版明顯進步：
  - `back_right`：完全不需校正就完美讀出 `RFX2325` ✅
  - `front_left`：`RF233525`（R、F 都對了，但仍完全沒偵測到 X；前一版是 `RX3322`，這版換成缺 X 而不是缺 F）
  - `back_left`：`RFX2323`（前 6 碼幾乎全對，只有最後一碼 5 誤判成 3）
  - `front_right`：不校正路徑讀成 `RF2325`（缺 X），但這個角度本來就有真正校準過的透視校正可用，「校正後」那組已完美吻合，不受影響
- **中途也發現了一個之前造成使用者困惑的問題（非本次模型變更引起，先前就存在）**：使用者曾在「期望車牌號碼」欄位填測試用的英文字 `test` 而非真正車牌號碼，導致 `pruneToExpectedLength()` 誤把組出來的字元裁到只剩 4 個（`normalizePlateText("test")` 長度是 4），把正確字元當雜訊剪掉，造成看起來準確率極差的假象。已提醒使用者測試時務必填寫真實車牌格式（例如 `RFX-2325`）。
- 已完成的變更：`web/public/char_model/`、`car_plate_ocr/car_license_train_model.zip`、`data/best.pt`、`data/best.onnx` 都已更新為這一版；`web/src/lib/yolo.ts` 的 `CHAR_CLASS_NAMES` 不需要改（類別清單跟上一版相同）。已跑過 `npm run build`/`npm run lint` 確認無誤，並直接對實際部署檔案（`web/public/char_model/`）重跑一次驗證，確認轉換正確。
- **待驗證**：同樣尚未在裝置上實機測試。

### 任務 8（自動快門與流程控制）—— 新完成

- **`src/platform/useStillnessDetector.ts`**（新檔）：主要判定依據是 `devicemotion` 事件的 `rotationRate` 三軸角速度皆低於 3°/秒；若裝置的 `rotationRate` 全為 `null`（事件有觸發但沒有角速度資料），自動退回備援判定——連續兩次 `deviceorientation` 讀值差 < 1°。`sensorPermission` 為 `denied` 時完全不註冊事件監聽，回傳 `supported: false`，沿用 `useGyroscopeGuard` 已驗證過的作法（避免 iOS 上事件永遠不觸發卻讓狀態卡在誤判）。
- **`src/platform/useHapticFeedback.ts`**（原本是丟出「尚未實作」錯誤的佔位檔）：改為真正呼叫 `navigator.vibrate()` 的實作，往後接 Capacitor 只需改這個檔案內部。
- **`src/components/AutoShutter.tsx`**（新元件）：
  - `active` prop 對應 `activeGuidance === 'ALL_PASSED'`（狀態機優先權 1~6 全通過，車牌 OCR 目前仍是任務 7 的手動按鈕確認機制的一環）。
  - 靜止判定通過後，用 SVG 畫一個 1 秒填滿的進度圈（非倒數文字），填滿時：`canvas.drawImage(video,...)` 截圖轉 `toDataURL()` → 震動（`useHapticFeedback`）→ 快門音效（`AudioContext` 產生的短促提示音，沒有額外音效素材檔案，失敗時靜默略過不影響拍攝）→ 呼叫 `onCapture(base64Image)`。
  - 逾時逃生機制：`active` 持續 18 秒仍未成功拍攝，顯示「偵測到手部持續晃動，是否改為手動拍攝？」+ 手動拍攝按鈕。
  - `sensorPermission` 為 `denied`/裝置不支援時（`useStillnessDetector` 回傳 `supported: false`），完全不跑自動判定，直接顯示手動拍攝按鈕（沒有進度圈或逃生訊息，因為本身已經是手動模式）。
  - 🐛 修正過程中發現的 bug：一開始把 `isStill` 放進計時 `useEffect` 的依賴陣列，導致手部自然的晃動/靜止反覆切換時一直重建 effect、連帶把 18 秒逾時的起始時間一直往後推，逃生機制永遠不會觸發。改成用 `isStillRef` 在 interval callback 內讀最新值，計時 effect 只依賴 `[active, supported]`。
- **`CameraCapture.tsx`**：新增 `onCapture?: (base64Image: string) => void` prop，傳入時（且有 `guideBoxes`、車牌辨識窗格未開啟、非橫式提示畫面）才渲染 `<AutoShutter>`。不傳（例如未來任務 9 的一般取景補拍相機）則完全不啟用自動快門。
- **`CaptureGuidePage.tsx`**：改用 `positionIndex` 依序走訪 `CAR_POSITIONS`，`onCapture` 存下該方位的 base64 圖片後自動 `positionIndex + 1` 換到下一個方位（不需使用者手動點按切換）；四個方位都拍完後顯示縮圖總覽 + 「重新拍攝」按鈕。原本測試用的手動方位切換按鈕已移除（改由自動快門流程驅動）。
- **限制/待驗證**：目前僅能在建置環境驗證編譯與 lint 通過，`devicemotion`/`rotationRate`、震動、真正的靜止判定手感都需要實機測試（尤其是不同手機的 rotationRate 支援度、18 秒逃生機制的體感是否恰當）。

## 尚未開始 / 待處理

- **【最優先】驗證字元辨識準確率**：2026-07-16 已換上新版 33 類模型，離線用黃金標準照測試準確率大幅提升（見上方任務 7 補充），但還沒有實機測試過。`CHAR_SCORE_THRESHOLD` 已是 0.3（正式值，不是診斷用的暫時值）。
- **建議優先做**：比照 `front_right` 的方式，實際量測 `front_left`/`back_left`/`back_right` 這 3 個角度的 `PLATE_SKEW_CORNERS`（目前都還是恆等變換、沒有真正校正）——新模型的測試顯示「校正後」這組結果的重要性比舊模型時更高，這 3 個角度目前只能靠「不校正」那組撐，而離線測試顯示效果不理想。
- OCR 相關測試旗標尚未收尾，正式上線前要處理：
  - `CameraCapture.tsx` 的 OCR 觸發改成使用者手動點擊「辨識車牌」按鈕，目前完全不檢查水平/直立/位置/距離/清晰度，之後要考慮是否要求先通過這些守門才能點擊。
  - `usePlateOCR.ts` 的 `ENABLE_MANUAL_CONFIRMATION_LOCK` 目前是 `false`（方便連續重試測試），之後要改回 `true`。
- **任務 8 待實機驗證**：`AutoShutter` 已實作完成（見上方說明），但靜止判定手感、rotationRate 裝置支援度、18 秒逃生機制體感都還沒有實機測試過。
- **任務 9**：補拍相機（一般取景模式），`CameraCapture` 的 `onCapture`/自動快門機制已預留「不傳 `guideBoxes` 就不啟用」的介面可以重複使用。
- **任務 10**：完整降級 UX（目前只有零星的 fallback，`AutoShutter` 對 `sensorPermission: denied` 已有基本降級，但還沒有正式的 `PermissionErrorBoundary`/`usePermissionGuard`）。
- **任務 11**：model/opencv 等重資源的正式預載策略（目前靠 code-splitting + lazy route 暫時處理；原規格提到的 Tesseract.js 預載已不適用，因為任務 7 已完全移除 tesseract.js 改用 YOLO 字元偵測模型）。
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
