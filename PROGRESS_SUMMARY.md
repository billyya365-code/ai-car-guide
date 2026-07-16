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
- 車牌字元辨識模型原始檔：`car_plate_ocr/car_license_train_model.zip`（已解壓進 `web/public/char_model/`）——使用者自訓練的 YOLO11n 字元偵測模型。**2026-07-16 更新為 33 類**（0-9 扣掉 4、A-Z 扣掉 O/I、不含 "-"；正方形 640x640 輸入，中途曾改長方形 640x256 又改回正方形），原本的 36 類版本（含 "-"、4、I）已淘汰，細節見下方任務 7 補充。梯形校正功能已整個移除，OCR 現在只跑單一路徑。

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

### 任務 7 補充 3（2026-07-16 傍晚）—— 改回正方形 640x640 輸入

使用者明確要求把字元模型輸入改回正方形 640x640（原本因為車牌又寬又扁、正方形會浪費黑邊解析度，改成長方形 640x256；但使用者的訓練/匯出慣例是正方形，這次直接沿用使用者自己上傳的正方形 zip，不再自己另外用 `car_tfjs` 重新匯出）。

- 使用者提供的 `best_web_model ( 0716plate).zip` 本身就是正方形 640x640 匯出（跟同時提供的 `best (0716plate).pt` 是同一個模型，類別數/順序不變）。
- 先驗證這個 zip 沒有踩到先前遇過的 onnx2tf group-convolution 轉換 bug：離線用黃金標準照（校正後）測試，完美讀出 `RFX2325`（信心 0.90~0.96），確認可以直接使用，不需要重新跑一次 onnx2tf 轉換。
- **變更**：`usePlateOCR.ts` 的 `CHAR_INPUT_WIDTH`/`CHAR_INPUT_HEIGHT` 改回 `640`/`640`；`web/public/char_model/`、`car_plate_ocr/car_license_train_model.zip` 直接改用使用者提供的正方形版本（不是我方自行匯出的版本）。`data/best.pt` 維持前一版（0716plate 的 `.pt`，跟這個 zip 是同一顆權重）。
- 已跑過 `npm run build`/`npm run lint`，並對實際部署檔案重新驗證過推論結果正確。
- **注意**：改回正方形後，车牌本身又寬又扁的形狀在畫布上又會有較多黑邊（先前為了避免這點才改長方形），但這次測試準確率依然很好，可能是這次重新訓練的模型本身容錯度較高。之後如果實機測試發現準確率下降，可以考慮這是原因之一。

### 任務 7 補充 4（2026-07-16 晚上）—— 移除透視校正功能，OCR 流程簡化為單一路徑

使用者要求直接刪除梯形校正功能（不再需要「不校正 vs 校正後」並排比較），並把 `CaptureGuidePage` 拍攝順序改回最初任務 8 完成時的樣子（嚴格依序 front_left→front_right→back_left→back_right 自動快門+自動換位，移除中途加回的手動選角度按鈕）。

- **刪除的檔案**：`web/src/lib/perspective.ts`、`web/src/lib/plateCornerDetection.ts`。
- **`web/src/hooks/usePlateOCR.ts` 大幅簡化**：`PlateOCRResult` 不再有 `noWarp`/`withWarp` 兩組並排結果，改成單一扁平結構（`recognizedText`/`debugCharDetections`/`debugAllCandidates`/`debugPreNmsCount`/`debugProcessedUrl` 都是單一組）；`triggerOnce` 不再接受 `skewCorners` 參數；`runCharDetection` helper 已合併回 `triggerOnce` 內，只裁切一次、letterbox 一次、跑一次模型推論（不再是每次觸發跑兩次完整流程，效能也因此提升）。
- **`web/src/components/CameraCapture.tsx`**：移除 `plateSkewCorners` prop；辨識窗格從左右並排兩欄改回單一結果區塊。
- **`web/src/config/guideTemplates.ts`**：移除 `PLATE_SKEW_CORNERS`、`identityQuad()`、`Quad` 型別匯入。
- **`web/src/pages/CaptureGuidePage.tsx`**：改回 `positionIndex` 嚴格依序流程（`isDone` 全部完成後才顯示總覽+重新拍攝，拍攝中不能手動跳角度）。
- `npm run build`（bundle 體積因為刪除透視校正相關程式碼而變小）、`npm run lint` 皆已確認通過。

### 任務 7 補充 5（2026-07-16 晚上）—— 車牌辨識改回自動觸發（對準即判定）+ 換角度提示

使用者要求把「手動點辨識車牌按鈕」改成對準引導框後自動觸發，並在自動快門拍完後跳出「拍攝完成，請拍攝下一個角度」提示。

- **`CameraCapture.tsx`**：移除「辨識車牌」手動按鈕。新增 `isPlateAligned`（車牌偵測框中心點是否落在引導框內，跟框線橘/綠判斷共用同一個 `isCenterInsideGuideBox` 邏輯），用 `useEffect` 只依賴這個布林值本身——只有「從沒對準變成對準」的那一刻才觸發一次辨識並跳出結果窗格，不會每個 frame 重複觸發。這次不擔心重蹈先前「自動連續觸發、部分手機頻繁逾時」的覆轍，因為任務 7 補充 4 已經把辨識簡化成單一路徑（不再是雙重 noWarp/withWarp 比較），速度快很多。若這次辨識失敗，需使用者移開鏡頭重新對準（或在窗格內點「重新辨識」）才會再次觸發。
  - **2026-07-16 深夜追加**：一開始車牌辨識觸發只看 `isPlateAligned`，不管水平/直立/位置/距離/清晰度當下有沒有過——代表就算手機沒拿正、畫面模糊，只要車牌框剛好對準也會先跑一次辨識（容易白跑，因為畫面品質差時辨識本來就容易失敗）。已改成新增 `areNonPlateChecksPassed = isLevelOk && isUprightOk && isPositionOk && isDistanceOk && isSharpOk`，`useEffect` 依賴改成 `[isPlateAligned, areNonPlateChecksPassed]`，兩者都成立才觸發辨識，確保每次嘗試辨識時畫面品質都已經有一定保障。
- **`CaptureGuidePage.tsx`**：`handleCapture` 拍完後設定 `captureMessage`（「拍攝完成！請確認後拍攝下一個角度：OOO」或全部完成的訊息），疊加顯示在鏡頭畫面上方——**改成需要使用者點「確認，拍攝下一個角度」按鈕才會真的換方位**（原本是 3 秒後自動消失+自動換位，使用者反應來不及看清楚結果畫面就跳掉，已改成手動確認）。等待確認期間會把 `CameraCapture` 的 `onCapture` 暫時傳 `undefined`，讓 `AutoShutter` 完全不渲染，避免同一角度在確認畫面顯示期間又重複觸發一次自動拍攝。
- `npm run build`/`npm run lint` 皆已確認通過。

### 任務 7 補充 6（2026-07-16 深夜）—— 車牌核對改成「拍照後才辨識」，取代補充 5 的做法

使用者測試後確認流程 OK，但希望車牌核對的時機再調整：不要在拍照**之前**就觸發辨識（補充 5 的做法），而是拍照**之後**、停在「拍攝完成」確認頁面時才辨識；而且每個角度都要**各自獨立**重新核對一次（不是整個拍攝流程只要成功核對一次就對所有角度都算過），核對失敗時不能按確認鈕跳過，必須重新辨識成功才能進下一步。這個設計直接取代（不是疊加）補充 5 的 `isPlateAligned`/`areNonPlateChecksPassed` 觸發邏輯。

- **`usePlateOCR.ts`**：新增 `reset()`，把狀態重置回 `INITIAL_RESULT`（含 `failureCountRef` 歸零）。因為 `usePlateOCR` 的狀態是跟著 `CameraCapture` 這個元件實例走的（換角度不會重新掛載），若不主動重置，第一個角度核對成功後 `isPlateOk` 會一直是 `true`，後面角度就不會再檢查。
- **`CameraCapture.tsx` 大幅調整**：
  - `useGuidanceStateMachine` 固定傳 `isPlateOk: true`（車牌不再是拍照前的守門條件之一），自動快門現在只看水平/直立/位置/距離/清晰度這 5 項就會觸發拍照。
  - 移除補充 5 加的 `isPlateAligned`/`areNonPlateChecksPassed` 那組拍照前觸發邏輯。
  - `AutoShutter` 的 `onCapture` 改接內部的 `handleAutoCapture`，只是把拍到的 base64 存進 `pendingCaptureImage`，**不會**立刻呼叫外層傳入的 `onCapture` prop。`pendingCaptureImage` 一有值，`AutoShutter` 就不再渲染（避免同一角度重複拍攝），並自動觸發一次車牌辨識（`runPlateRecognition`，沒有期望車牌時直接 no-op）。
  - 原本的辨識結果窗格改成「拍攝完成！」確認頁：有期望車牌時必須 `isPlateOk === true` 才能按下「確認，前往下一步」（`canConfirmNext`），按鈕在辨識失敗時停用，只能點「重新辨識」或（連續失敗達上限時）「手動確認車牌」逃生選項；沒有期望車牌則直接可以確認。按下確認才會真的呼叫外層 `onCapture(pendingCaptureImage)`，並呼叫 `resetPlateOCR()` 讓下一個角度重新獨立核對。
- **`CaptureGuidePage.tsx` 簡化回原本樣子**：拍照 → 核對 → 確認整個流程都封裝在 `CameraCapture` 內部，`CaptureGuidePage` 的 `onCapture` 現在只代表「這個角度已經確定完成」，直接存照片、`positionIndex + 1` 即可，不再需要自己的 `captureMessage`/確認按鈕（已移除，避免跟 `CameraCapture` 內部的確認頁重複）。
- `npm run build`/`npm run lint` 皆已確認通過。

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
- **2026-07-16 晚上：透視校正功能已整個移除**（見上方任務 7 補充 4），OCR 現在只跑「不校正」單一路徑，不再需要另外量測 `PLATE_SKEW_CORNERS`。
- OCR 相關測試旗標尚未收尾，正式上線前要處理：
  - `usePlateOCR.ts` 的 `ENABLE_MANUAL_CONFIRMATION_LOCK` 目前是 `false`（方便連續重試測試），之後要改回 `true`。
- **任務 8 待實機驗證**：`AutoShutter` 已實作完成（見上方說明），但靜止判定手感、rotationRate 裝置支援度、18 秒逃生機制體感都還沒有實機測試過。
- **任務 9：使用者已決定暫緩**，等後端 API 規格確定後再做。已跟使用者確認過需求細節（後端回傳 known_damage 綠框/detected_damage 紅框、使用者點擊漏檢處開一般取景相機拍特寫、上傳資料要預留 consentTimestamp/retentionPolicy 欄位），但尚未實作，也還沒建立 mockUploadAPI（決定等任務 9 真的開始時再一起做，避免先寫沒人用的東西）。目前 `CameraCapture` 沒有 `guideBoxes` 時完全沒有自動快門也沒有手動拍照按鈕，任務 9 的一般取景相機還需要加手動快門按鈕（規劃中，尚未實作）。
- **任務 10**：完整降級 UX（目前只有零星的 fallback，`AutoShutter` 對 `sensorPermission: denied` 已有基本降級，但還沒有正式的 `PermissionErrorBoundary`/`usePermissionGuard`）。
- **車輛資料查詢流程**：車牌號碼目前是 `CaptureGuidePage` 上手動輸入框（測試用），還沒有真正的車輛查詢/掃描機制帶入 `expectedPlateNumber`。

### 任務 11（資源預載）+ 全站視覺設計 —— 2026-07-16 深夜完成

**任務 11**：新增 `src/lib/usePreloadResources.ts`，在歡迎畫面背景依序（不是同時）預載兩個 TFJS 模型（車輪/車牌位置偵測 + 車牌字元辨識，各約 12MB）。做法是讀 `model.json` 的 `weightsManifest` 算出每個模型實際的權重檔案清單，用 HEAD 請求算出總位元組數，再用 `fetch()` + `ReadableStream` 邊讀邊算位元組進度，顯示百分比進度條。這裡只是把檔案讀進瀏覽器快取，`useVisionGuidance`/`usePlateOCR` 之後還是各自呼叫自己的 `tf.loadGraphModel()`，不影響既有程式碼，同個瀏覽器工作階段內幾乎都會命中快取。預載失敗不阻擋使用者，只記錄 log。原規格提到的 Mock API 部分**先跳過**（見上方任務 9 待處理），原規格的 Tesseract.js 預載已不適用（任務 7 早就移除了）。

**視覺設計**：使用者要求整體視覺要有設計感，選定「檢驗證書」風格（正式、可信，像一張正式的車輛檢驗合格證書）為主要方向，色票取自使用者指定的參考圖（`5E7892` 灰藍 / `A7B7C6` 淺灰藍 / `F3EFDF` 奶油白 / `BDCFAA` 鼠尾草綠 / `8E9E83` 深橄欖綠）。

- `web/src/index.css`：重寫 CSS 變數（淺色：奶油白底 + 深灰藍標題 + 灰藍強調色；深色：對應調亮版本），標題用襯線字體（`Iowan Old Style`/`Palatino Linotype`/`Georgia`，證書感），內文維持系統無襯線字體。新增共用元件類別：`.btn`/`.btn-primary`/`.btn-secondary`（app 內一般按鈕，跟隨主題變數）、`.card`、`.field`（表單輸入）、`.badge`/`.badge-ok`/`.badge-warn`/`.badge-danger`（狀態標籤）、`.photo-grid`/`.photo-thumb`（縮圖網格）、`.progress-track`/`.progress-fill`（進度條）。另外新增 `.btn-camera-primary`/`.btn-camera-secondary`——相機取景畫面本身固定是深色疊層，不跟著淺色/深色主題變動，顏色寫死；主要動作用金色（`#d9b85b`），呼應「證書用印」意象（蓋章核可）。
  - 深/淺色主題除了 `prefers-color-scheme` 外，也對應 `:root[data-theme='dark'/'light']`（讓使用者手動切換主題時能正確覆蓋）。
  - `#root` 容器從舊版的置中 1126px 寬+左右分隔線（明顯是舊範本殘留）改成 640px 單欄版面，符合這個 app 幾乎都是手機直式操作的實際使用情境。
- `WelcomePage.tsx`：改成正式的首頁排版（eyebrow 標籤 + 標題 + 說明 + 主要 CTA 按鈕），嵌入任務 11 的預載進度條，開發工具區塊收進一個 `.card` 裡。
- `CaptureGuidePage.tsx`：車牌輸入框改用 `.field`，四個方位用 `.badge` 顯示完成狀態（打勾+目前方位用強調色外框），完成後的縮圖總覽改用 `.photo-grid`。
- `CameraCapture.tsx`/`AutoShutter.tsx`：guidance 提示/錯誤訊息 banner 改用新的 warning/danger 色調、圓角從 4px 統一調成 8px；車牌核對面板重新排版（深色但用暖色調的橄欖灰 `#23261d` 取代原本的冷灰藍 `#1f2937`，跟證書配色家族一致）；面板內按鈕、`AutoShutter` 手動拍攝按鈕都改用 `.btn-camera-primary`/`.btn-camera-secondary`；自動快門進度圈顏色從綠色改成金色，跟確認鈕的金色呼應同一個「用印」意象。偵測框對準/未對準的綠色/橘色（交通號誌慣例）維持不變，沒有跟著改色，避免破壞既有的直覺辨識性。
- 範圍內**沒有**動到：`ResultPage.tsx`（任務 9 佔位頁，任務 9 本身已暫緩）、`ModelSpikePage.tsx`/`GuidanceStateMachineSpikePage.tsx`（開發診斷頁，非一般使用者會看到的頁面）。
- `npm run build`/`npm run lint` 皆已確認通過，但這次改動偏視覺，**還沒有實機/瀏覽器截圖驗證過實際呈現效果**，建議部署後實際看一次。

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
