# 智能檢車 專案進度摘要

最後更新：2026-07-25

給用途：帶到新電腦或新的 Claude Code 對話時，貼給我當開場背景，讓我快速接上進度。這份文件記錄的是**現況**，不是逐次變更的日誌——中途試過又改掉的做法（例如車牌透視校正、長方形模型輸入、拍照前觸發辨識、相機滿版 cover-fit 裁切、「檢驗證書」視覺風格、獨立的 `/preparing` 準備頁、`/history`／`/settings` stub 頁）不會留在這裡，只留下最後定案的版本，避免未來讀到過時的細節。

## 專案基本資訊

- 任務規格文件：`智能檢車_開發任務清單與Prompt範本_審閱修正版.md`（repo 根目錄，繁體中文，Task 0~13；為整體架構藍圖，實務上有調整、與現況會有落差，以本文件為準）
- 前端程式碼：`D:\AI_Car_Guide\web`（React 19 + Vite + TypeScript PWA）
- 後端程式碼：`D:\AI_Car_Guide\functions`（Firebase Cloud Functions v2，TypeScript）——車損辨識管線，詳見下方「車損辨識後端管線」。
- 展示影片：`D:\AI_Car_Guide\demo`（Remotion 專案，獨立子專案，有自己的 `PROGRESS_SUMMARY.md`，這份文件不重複記錄）
- GitHub repo：https://github.com/billyya365-code/ai-car-guide （公開 repo）
- 線上部署：https://billyya365-code.github.io/ai-car-guide/ （GitHub Pages，push 到 master 自動觸發 GitHub Actions 建置 `web/`，Firebase 設定值透過 repo secrets 注入建置流程，約 1 分鐘完成）
- Git 帳號：billyya365-code
- 本機 conda 環境：`car`、`car_ai`、`car_export`、`car_tfjs`。**`car_tfjs`** 是驗證過可以完整跑通 `best.pt → onnx → onnx2tf -dgc → tensorflowjs_converter` 全流程的環境。`base` 環境額外裝了 `rembg`/`onnxruntime`（一次性去背任務用，不是專案相依套件）。
- 車輪/車牌位置偵測模型原始檔：`car_yolo/yolov8_tfjs_model.zip`（已解壓進 `web/public/model/`）
- 車牌字元辨識模型原始檔：`car_plate_ocr/car_license_train_model.zip`（已解壓進 `web/public/char_model/`）——使用者自訓練的 YOLO11n 字元偵測模型，**33 類**（`0-9` 扣掉 `4`、`A-Z` 扣掉 `O`/`I`、不含分隔符號 `-`），正方形 **640x640** 輸入。缺少 `4`/`I`/`O`/`-` 是刻意設計。

## 已完成任務

- **任務 0**：專案初始化，Vite+React+TS PWA 骨架。
- **任務 1**：YOLOv8 TFJS 模型驗證，驗證頁面在 `/dev/model-spike`。
- **任務 2（資料標註與訓練）**：使用者已確認目前資料集堪用。
- **任務 3**：相機拍照元件（`CameraCapture.tsx`），4 個方位模板（前左/前右/後左/後右），每個方位各有「車輪」+「車牌」兩個引導框。
- **任務 3.5**：iOS 13+ 感測器權限，與相機權限在同一個使用者手勢同步呼叫堆疊內觸發。
- **部署**：GitHub Pages + GitHub Actions，`HashRouter`（`web/src/main.tsx`——GitHub Pages 純靜態託管沒有伺服器端 rewrite，直接連到 `/capture` 這類子路徑會 404，路由放在 `#` 後面靜態主機不用額外設定），`import.meta.env.BASE_URL` 處理子路徑資源載入。Firebase 設定值（apiKey 等）透過 GitHub Actions repo secrets 注入建置環境，不是寫死在程式碼裡。
- **任務 4**：`useGuidanceStateMachine`——提示優先權佇列（水平 > 直立 > 位置 > 距離 > 清晰度 > 車牌）。
- **任務 5**：`useGyroscopeGuard`——gamma ±25° / beta 60°~95°，含萬向鎖 bug 修正。
- **任務 6**：`useVisionGuidance`——載入模型、節流推論（8 FPS）、位置/距離比對。

### 任務 6 補充：位置/距離判斷邏輯

- **位置判斷**：偵測框中心點是否落在引導框（虛線框）矩形內，跟畫面上偵測框變綠/橘的判斷用同一套邏輯，不用固定容錯值——框畫多大，可接受的對準範圍就多大。
- **距離容許誤差**：`useVisionGuidance.ts` 的 `DEFAULT_AREA_TOLERANCE_PERCENT` 為 60%，輪胎和車牌兩個目標仍須同時通過。
- **引導框座標系統**：`guideTemplates.ts` 的座標是「相對於畫面中央正方形有效拍攝區域」（0~100，由 `CameraCapture.tsx` 的 `computeEffectiveAreaRect`/`squareRelativeToFrame` 依實際寬高比換算回整個畫面），不是相對整個直式畫面——不同手機寬高比下，引導框才會一直落在使用者看得到的正方形範圍內。四個角度的車輪/車牌引導框大小已統一（以左前為準）。

### 任務 7（車牌 OCR）—— 現況

**目前的完整流程**（`usePlateOCR.ts` + `CameraCapture.tsx`）：
1. 自動快門只依賴水平/直立/位置/距離/清晰度這 5 項（不含車牌），拍到照片後**先暫存**成 `pendingCaptureImage`，同時把當下偵測到的車牌框位置也一併凍結（`pendingPlateBoxRef`）。
2. 車牌辨識固定對著這張**凍結的照片**（用 `<img>` 載入 dataURL）跑，不是還在播放中的即時 `<video>`。
3. 裁切車牌區域（12% padding）→ letterbox 成 640x640 → 丟進字元模型 → 跨類別 NMS（IoU > 0.3）去重 → 依已知車牌長度剔除信心分數最低的多餘字元 → 若剛好組出 7 個字元，依位置鎖定類別（前三碼只接受英文候選、後四碼只接受數字候選）→ 依 x 座標由左到右組字串 → 正規化（大寫、去除非英數字元）。
4. **比對邏輯已放寬成模糊比對**：`countMatchingChars(expected, recognized)`（位置無關的多重集合交集，重複字元不會灌水，例如期望值只有一個 `1`，辨識結果出現三個 `1` 也只算一次符合）算出符合的字元數，`>= MIN_MATCHED_CHARS(5)`（滿分 7 碼）就視為通過——不要求完全依序相符或長度一致。
5. 跳出「拍攝完成！」確認卡片：辨識中顯示「車牌核對中，請稍候…」，失敗顯示「✗ 辨識失敗，請重新拍攝」＋「重新拍攝」按鈕（丟棄這張照片、回到即時畫面），通過後顯示「✓ 車牌號碼辨識成功」＋「拍攝下一個角度」按鈕。
6. 每個角度都各自獨立核對一次（`reset()`）。
7. **沒有透視校正**：已確認新版模型準確率夠高，不需要。
8. `ENABLE_MANUAL_CONFIRMATION_LOCK` 目前是 `false`（方便連續重試測試），所以「手動確認車牌」逃生選項目前不會被觸發，正式上線前要改回 `true`。

**已解決、值得記住的技術債**：
- **onnx2tf 轉換 bug**：YOLO11n attention 模組分組卷積要加 `--disable_group_convolution`（`-dgc`）。
- **後端效能**：字元模型統一強制切到 `wasm` 後端（`src/lib/tfBackend.ts`），不用 `cpu`（15+ 秒/次）或 `webgl`（部分手機失敗時機比逾時保護晚）。
- **`onnx2tf` 校準檔 404**：需要在專案根目錄手動放替代檔案繞過，換電腦/重新匯出時可能要重新產生。
- **測試陷阱**：「期望車牌號碼」欄位填非車牌格式的測試字會被長度裁剪邏輯搞壞辨識結果，測試務必填真實車牌格式。
- **模型類別數變動**：`web/src/lib/yolo.ts` 的 `CHAR_CLASS_NAMES` 必須跟模型實際訓練的類別順序完全一致。

### 任務 8（自動快門）—— 現況

- **`useStillnessDetector`**：`devicemotion` 的 `rotationRate` 三軸角速度皆低於 3°/秒；不支援時退回備援判定。`sensorPermission` 為 `denied` 時完全不跑自動判定。
- **`AutoShutter`**：條件全通過後，SVG 進度圈 1 秒填滿，接著排一個 `FLASH_DURATION_MS(180)` 的白閃延遲才真正呼叫 `doCapture`。`active` 變成 `false`（例如對準中途壞掉）時，計時器 effect 的 cleanup 會**同時清掉 interval 跟這個延遲的 flash timeout**（過去曾經只清掉 interval，導致已經排好的 180ms flash timeout 照樣觸發、拍出一張其實已經沒對準的照片，現在兩個計時器綁在一起收尾）。真正呼叫 `doCapture('auto')` 之前還會對當下影格重跑一次清晰度檢查（`computeSharpnessVariance` vs `DEFAULT_VARIANCE_THRESHOLD`），沒過就重置進度圈，不會硬拍。
- **手動快門鍵**：外觀是一般相機 App 的圓形快門鍵（白色圓環＋實心圓），永遠顯示在畫面上，但水平/直立/位置/距離/清晰度沒有全部通過時按鈕維持半透明、無法點擊，全部通過後才會變亮可按。
- **`CaptureGuidePage`**：嚴格依序 front_left→front_right→back_left→back_right，拍完一個角度、車牌核對通過並確認後才換下一個。

### 任務 9（結果渲染與補拍 UX）—— 已完成

真實後端 API 規格確定後已經完整實作，不再是暫緩狀態。分成三段：4 張都拍完後的**確認/重拍畫面**、上傳/AI 分析中的**過場畫面**、`ResultPage` 的**結果呈現**。

**確認照片（`CaptureGuidePage.tsx`，`isDone && !confirmed` 這個 state 分支，不是獨立路由）**：4 張縮圖排成 `photo-grid`，點任何一張＝重拍那個角度（從 `capturedPhotos` 移除、`isDone` 翻回 `false`，退回該角度的即時取景畫面）。「確認上傳」按鈕把 `confirmed` 設成 `true`，觸發 `runBatchUpload()`。

**上傳（`runBatchUpload`，`firebaseUpload.ts`）**：確保匿名登入 → 建立 `rentals` 文件（`createRental`，只建一次，`rentalId` 快取在 state 裡避免重試時重建）→ 依序上傳 4 張（`uploadedFlags` 記錄已成功的角度，可安全重試不會建立重複的 `photos` 文件）→ 全部完成後呼叫 `markPickupUploaded(rentalId)` 把 `rentals.status` 翻成 `pickup_uploaded`。任一步失敗進 `error` phase，有重試按鈕（會跳過已成功的角度）。上傳畫面頂部有 `CloudUploadAnimation.tsx`（雲朵圖示 + 3 個小點用 `framer-motion` 交錯上浮淡出的無限循環動畫，純裝飾，不綁真實上傳進度，真實進度另外用 `CarProgressTrack` 顯示）。

**車損辨識後端管線（`functions/src/`）**：見下方獨立章節。

**`ResultPage.tsx`（`/result?rentalId=`）**：
- 兩個即時 `onSnapshot` 監聽：`rentals/{rentalId}` 文件本身、`photos` collection 依 `rental_id` 篩選。`rentalId` 走 query string（不是 router state），重新整理/深連結都能還原。
- 依 `rental.status` 分支：`pickup_uploading`/`pickup_uploaded`/`pickup_analyzing` 顯示「AI 分析中…／正在偵測車損，請稍候，此頁面會自動更新」（純粹等 Cloud Function 把狀態改掉、onSnapshot 自動重新渲染，沒有輪詢）；`pickup_analysis_failed` 顯示紅字「分析失敗」＋客服提示；`pickup_analyzed`/`pickup_reviewed` 才顯示完整結果。
- **摘要文字改成前端自己組**（`buildClientDamageSummary()`，`ResultPage.tsx`）：直接用手上已經有的 `photos` 資料組「本次取車照片偵測到刮傷 N 處、凹痕 N 處，涉及角度：{角度}。」，不讀 `rentals.ai_summary`。原因是前端每次 push 會自動部署、但 Cloud Function 改文案需要額外重新 deploy 權限，複製一份組字邏輯到前端可以不求人調文案。**`rentals.ai_summary`（後端組的版本，含風險等級句子＋低信心分數提醒）依然由 Cloud Function 寫入 Firestore，只是這個頁面不顯示了**，留給未來的後台複核介面用——兩邊文字不再完全一致，之後如果要做後台要注意這點。
- **車損框疊圖**（`DamageOverlay`）：座標是 Cloud Function 存的 0~1 標準化 `x1/y1/x2/y2`，直接 ×100 當 CSS 百分比（已經正規化過，不用再除以圖片實際寬高）。外加 `BOX_PAD_PERCENT(1.5)` 的外擴留白（真實框偏小，約佔照片 3%/1.75%）。**只畫外框（border），不填色**——凹痕用 `var(--danger)`，刮傷用 `var(--warning)`。標籤（「刮傷（87%）」格式）用簡單啟發式（`labelBelow`/`labelAlignRight`）避免貼近照片邊緣時被裁掉。
- **每格照片下方一行**（`DamageSummaryLine`）：有車損顯示「偵測到 N 處車損」（紅），無車損顯示「無車損」（綠）——刻意明確標示，避免使用者誤以為沒畫框代表「還沒分析完」。
- **燈箱**（`PhotoLightbox`）：點任一張縮圖的照片區塊（`<button>`）全螢幕放大，同樣疊車損框＋摘要行，Esc 或點背景關閉。縮圖格跟燈箱共用 `useDownloadUrl(fileName)` hook（`getDownloadURL` 讀 Firebase Storage）。
- **風險徽章**：純粹反映 `rental.risk_level`（`low`/`medium`/`high` → 低/中/高風險，對應 `badge-ok`/`badge-warn`/`badge-danger`），前端不自己算風險。
- 這個頁面同樣需要 `ensureAnonymousAuth()`，代表 Firestore/Storage 的讀取也是被安全規則擋著要求登入的，不只是寫入。

### 車損辨識後端管線（`functions/src/`，Cloud Functions v2，region `asia-east1`）

- **觸發方式**：`onDocumentUpdated` Firestore trigger（不是 HTTP endpoint），監聽 `rentals/{rentalId}` 文件更新，函式名稱 `analyzeRentalOnUpload`。只在 `after.status === 'pickup_uploaded'` 且狀態真的有變時才繼續（擋掉其他欄位更新觸發的空跑）。`timeoutSeconds: 300`、`memory: 512MiB`。
- **搶佔/防重複執行**：用 Firestore transaction 把狀態從 `pickup_uploaded` 翻成 `pickup_analyzing` 當作「認領」的動作——Eventarc 至少送達一次（at-least-once），這個 transaction 確保同一筆訂單只會真正跑一次分析。
- **流程**：讀出該 `rentalId` 的 4 張 `photos` 文件（數量對不上 4 就丟錯）→ 讀 `configs/detection_engine` 文件的 `endpoint_url` 欄位（引擎網址存在 Firestore 設定文件裡，不是環境變數/secret）→ 呼叫 `engineClient.ts` 的 `analyzeBatch()` → 用 `riskRules.ts` 算風險 → 一個 `db.batch()` 寫回所有結果。
- **`engineClient.ts`**：POST `{endpoint_url}/analyze-batch`，body `{ rental_id, photos: [{ photo_id, storage_path }] }`；預期回傳**純 JSON 陣列**（每筆 `{ photo_id, qc_status, damages }`）。逾時 `ENGINE_TIMEOUT_MS = 240_000`（4 分鐘，`AbortController`）。任何失敗（非 2xx／回傳不是陣列／逾時／網路錯誤）統一包成 `EngineError`，逾時特別標記 `E003_ENGINE_TIMEOUT`。
- **`riskRules.ts`**：
  - `computeRiskLevel`：看**類型有沒有出現，不是看數量**——有任一凹痕（dent）就是高風險，否則有任一刮傷（scratch）就是中風險，否則低風險。凹痕永遠蓋過刮傷，不管刮傷有幾處。
  - `buildAiSummary`：純樣板字串組合，**沒有呼叫任何生成式 AI**。無車損：「本次取車照片未偵測到明顯車損，風險等級：低。」；有車損：「本次取車照片偵測到刮傷 N 處、凹痕 N 處，涉及角度：{角度清單}。風險等級：{等級}。」，若有任一車損 `confidence < 0.5`（不含 0.5 本身）再加一句「其中 N 處信心分數低於 50%，建議複核人員優先人工確認。」。角度中文標籤是自己另外寫死一份 `PHOTO_TYPE_LABELS`（跟 `web/` 的 `guideTemplates.ts` 重複，因為 `functions/` 跟 `web/` 是各自獨立的 TS 專案沒有共用程式碼），改角度名稱要記得兩邊都改。
- **寫回 Firestore**（同一個 batch）：每張 `photos/{id}` 寫 `qc_status:'analyzed'`＋`damages`；`rentals/{rentalId}` 寫 `risk_flag`／`risk_level`／`ai_summary`／`status:'pickup_analyzed'`／`analyzed_at`。
- **失敗處理**：任何拋錯，把所有照片標成 `qc_status:'analysis_failed'`、訂單標成 `status:'pickup_analysis_failed'`——這個狀態值不在原始規格文件裡，是特地加的，避免引擎逾時/掛掉時前端一直卡在「分析中」轉圈圈。
- **車損座標格式**：`x1/y1/x2/y2` 是**相對照片寬高的 0~1 標準化浮點數**，不是像素也不是 0~100 百分比，Cloud Function 不做任何座標轉換，原封不動存進 Firestore。`label` 目前只有 `'scratch' | 'dent'` 兩種。
- **測試**：`functions/` 有 `vitest`，`riskRules.test.ts` 完整覆蓋 `computeRiskLevel`／`buildAiSummary`。

### 全站視覺設計與導覽 —— 已完成

- **設計方向是 Apple HIG 風格**（不是「檢驗證書」風格）：`index.css` 用系統字體（`--sans`）、藍灰強調色系（相機按鈕/快門進度圈 `#7c97ad`，車輛角度圖示位置標記橘色 `#ff9f0a`）、淺色主題背景偏白/偏亮（`--bg:#f2f2f5`、`--bg-card:#ffffff`）、卡片與按鈕大圓角、柔和分散陰影。
- **沒有導入 Tailwind**：沿用既有 CSS 自訂屬性系統＋共用類別（`.btn`/`.card`/`.field`/`.badge` 等）。用到 `framer-motion`（Splash 淡出、首頁進場、上傳動畫，刻意不套用在相機拍攝畫面——那邊已有純 CSS 進場動畫，且要避開「祖先有 transform 會讓內部 `position:fixed` 子元素定位錯容器」的坑，新增動畫時只動 `opacity`）、`lucide-react`（圖示）。
- **目前實際的頁面流程**（`App.tsx` 路由表）：
  ```
  /                    → WelcomePage
  /capture             → CaptureGuidePage（lazy）
  /result              → ResultPage
  /dev/guidance-spike  → GuidanceStateMachineSpikePage
  /dev/model-spike     → ModelSpikePage（lazy）
  /dev/firebase-spike  → FirebaseSpikePage（lazy）
  ```
  `SplashScreen`不是路由，是 `App.tsx` 內的 state：兩個 TFJS 模型預載完成 **且** 至少顯示 `MIN_SPLASH_MS(900)`ms 才淡出，淡出後直接進 `WelcomePage`——**沒有獨立的 `/preparing` 過場頁**，模型預載已經提前到 Splash 階段做完。`WelcomePage`（車款選單＋車牌輸入合併在同一頁）「開始拍照」用 router **state**（不是 query）帶 `{ plateNumber, carModel }` 導到 `/capture`。`CaptureGuidePage` 內部用本地 state 在「即時取景／確認照片／上傳分析中」三種畫面切換，不是子路由；分析完成後 `navigate('/result?rentalId=...', {replace:true})`。**`/history`、`/settings` 這兩個 stub 頁面已經拿掉，不存在了**。
  `App.tsx` 有個全域 effect：只要整頁重新載入時的路徑不是 `/`、不是 `/dev/*`、也不是 `/result`，一律導回 `/`——避免重新整理後卡在需要 router state 才能運作的 `/capture` 半途畫面；`/result` 因為狀態走 query string、重新整理後還原得起來，特別排除在這個規則外。
- **車輛圖示全面是 AI 生成照片**：`CarHeroIllustration.tsx`（首頁大圖，ChatGPT 生成、`rembg`/`isnet-general-use` 去背、CSS `drop-shadow` 補地面陰影）、`CarAnglePhoto.tsx`（四角度小圖示，Gemini 生成合照裁切+去背，`web/public/car-angles/` 下 5 張圖，確認過不會被 PWA service worker 預先快取）。`front_left`/`front_right`/`back_left`/`back_right` 的左右方向已對照 `golden_photos/` 核對修正過。
- **`CaptureProgressSteps.tsx`**：`●──●──○──○` 連接式步驟指示器（完整版含文字用在拍攝流程、精簡版只有圓點連接線用在相機畫面頂部小徽章）。
- **相機拍攝畫面 UI**：低侵入感（毛玻璃模糊黑底取代實心色塊）、引導框白色半透明虛線、偵測框未對準藍色呼吸動畫（追蹤中）/對準綠色柔光（鎖定）。滿版顯示用 CSS `min()` 保留完整鏡頭視野（可能有黑邊，黑邊用同畫面模糊放大鋪滿而不是純黑）；畫面內容跟機體控制列分兩層，控制列貼在「取景框自己的邊界」而不是螢幕邊界，避免提示文字疊到鏡頭實際內容上。
- **GPS 是拍照的硬性前提**：`CameraCapture.tsx` 的 `handleStart()` 會先 `requestLocation()`，拿不到（拒絕/逾時/不支援）就完全擋住相機開啟（`locationBlocked` 狀態＋重試按鈕），不是選填的 EXIF 附加資訊。一次 4 角度拍攝流程只取一次定位（假設車輛拍攝過程中不會移動）。

## Firebase 資料模型（現況）

**`rentals/{rentalId}`**（`createRental`，`web/src/lib/firebaseUpload.ts`，id 格式 `Rental_{vehicle_id}_{timestamp}`）：
```
vehicle_id, status（初始 'pickup_uploading'）, created_at,
pickup_photo_count, return_photo_count(0),
risk_flag(false), risk_level(null), ai_summary(null),
reviewed_by_staff(false), review_notes(null), reviewed_at(null),
car_model  # 額外欄位，SDD 沒有
```
`status` 的完整生命週期：`pickup_uploading → pickup_uploaded → pickup_analyzing → pickup_analyzed | pickup_analysis_failed`（→ 未來後台複核後可能到 `pickup_reviewed`，前端 `ResultPage` 已經會處理這個狀態，但目前沒有寫入這個狀態的介面）。

**`photos/{autoId}`**（`createPhotoRecord`）：
```
rental_id, vehicle_id, stage:'pickup', photo_type, file_name, storage_path,
gps_lat, gps_lng, uploaded_at（client 端時間）, server_uploaded_at（serverTimestamp）,
qc_status:'pending', damages:[],
captured_at, capture_mode('auto'|'manual'), sharpness_score, app_version('1.0.0'),
device:{ platform, user_agent },
detections:[{ target, x_percent, y_percent, width_percent, height_percent, score }]
```
`uploaded_at`（前端本地時間）跟 `server_uploaded_at`（伺服器時間）故意分開存——兩者的時間差本身可以當一個信任訊號給後端用。`capture_mode`/`sharpness_score`/`app_version`/`device`/`detections` 都是超出 SDD 規格的額外欄位，程式碼註解裡有標記是刻意加的。

**Storage 檔名**：`{rental_id}_{vehicle_id}_{photo_type}_{unix_timestamp}.jpg`，直接放在 bucket 根目錄，沒有子資料夾。

**`consentTimestamp`／`retentionPolicy` 這兩個欄位確認還沒實作**（`web/src/`、`functions/src/` 全部搜過都沒有），還是任務 9 遺留的待辦，不是這次一起做掉的。

## 尚未開始 / 待處理

- **`consentTimestamp`／`retentionPolicy` 欄位**：上傳資料目前沒有這兩個隱私相關欄位，任務 9 規格內提過但還沒做。
- **後台複核介面**：`rentals.ai_summary`／`reviewed_by_staff`／`review_notes` 這些欄位 Cloud Function 已經在寫，但沒有任何畫面讀取/寫入複核結果——`demo/` 底下的 `DashboardReview.tsx` 是這個介面的展示影片示意，不是真正可用的後台。
- **車輛資料查詢流程**：車牌號碼目前是 `WelcomePage` 上手動輸入框（測試用），還沒有真正的車輛查詢/掃描機制。
- **測試旗標收尾**：`usePlateOCR.ts` 的 `ENABLE_MANUAL_CONFIRMATION_LOCK` 目前是 `false`（方便連續重試測試），正式上線前要改回 `true`。
- **相機鏡頭比例**：曾討論過用 `getUserMedia` 的 `aspectRatio`/`width`/`height` 約束指定 9:16，但先前實測會導致部分手機裁切感光元件原生視野（畫面看起來放大），目前維持不指定比例、用原生預設 framing。使用者決定先不重新嘗試。

## 已知注意事項 / 待確認事項

- `golden_photos/`、`test_pic/`、`data/` 都**沒有**提交到 git（已加入 `.gitignore`）。`car_plate_ocr/*.pt`、`*.onnx` 也已加入 `.gitignore`。
- 位置/距離/方向的判斷慣例是暫定的，尚未經過黃金標準照精確驗證。
- `@techstark/opencv-js` 仍是專案依賴（`CoreLibsCheck.tsx` 診斷頁面還在用它驗證套件載入），正式功能已不依賴它。
- 傳截圖給 Claude Code 測試的既定流程：使用者把手機截圖/參考圖放進 `D:\AI_Car_Guide\car_plate_ocr\`，該類資料夾多半在 `.gitignore` 內，不會外流。
- **視覺驗證方式**：大量使用本機 headless 瀏覽器截圖（`msedge.exe --headless=new` 或臨時安裝 `playwright`，用完即移除、不留在 `package.json`）自行驗證排版/動畫。`playwright` 的 `--use-fake-device-for-media-stream` 旗標可以在沒有實體鏡頭的情況下測試相機畫面。
- **`ai_summary`（後端組的版本）跟 `ResultPage.tsx` 實際顯示的摘要文字已經不是同一份**——前端為了不求人重新部署 Cloud Function 就能調文案，自己另外組了一份（少了風險等級句跟低信心分數提醒），Firestore 裡的 `ai_summary` 沒人在讀，是留給未來後台用的。改任一份摘要文案時記得看清楚是要改前端顯示的那份還是後端存的那份。
- **車損辨識引擎網址**存在 Firestore 的 `configs/detection_engine` 文件（`endpoint_url` 欄位），不是環境變數/secret，換引擎網址要改 Firestore 資料而不是改程式碼/CI 設定。
- 目前沒有找到 `firestore.rules`／`storage.rules` 檔案（沒有特別去找，只是這次沒看到）——如果之後要動安全規則，要先確認規則實際放在哪裡管理（有可能是在 Firebase Console 直接設定，沒有進 git）。

## 常用指令

```bash
cd D:/AI_Car_Guide/web
npm run dev          # 本機開發伺服器
npm run build         # 正式建置（部署前務必先跑一次確認無誤）
npm run preview       # 建置後本機預覽（測試 PWA/Service Worker 行為用這個，不要用 dev）

cd D:/AI_Car_Guide/functions
npm run build          # tsc 編譯
npm run test           # vitest run（riskRules.test.ts）
npm run serve           # build + firebase emulators
npm run deploy          # firebase deploy --only functions
```

部署：push 到 `master` 會自動觸發 GitHub Actions 建置並部署 `web/` 到 GitHub Pages，不需要手動操作。`functions/` **不在**這個自動化流程裡，改動後要自己手動 `npm run deploy`。目前所有開發都直接在 `master` 上進行（曾經為了一次大改版開過 `redesign/apple-hig-home` 分支，完成後已合併回 master 並刪除）。

換電腦時：`git clone` 這個 repo 後，`char_model/`、`model/`、`public/car-angles/` 都已隨 git 一起帶過去，但 `data/`、`golden_photos/`、`test_pic/` 需另外手動搬移或重新蒐集。`functions/` 部署需要本機登入過 `firebase login` 且對這個 Firebase 專案有部署權限；`web/` 本機開發需要 `.env` 或等效方式提供 Firebase 設定值（正式部署走 GitHub Actions secrets，本機開發要另外自己補）。
