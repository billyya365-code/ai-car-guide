# 智能檢車 專案進度摘要

最後更新：2026-07-17

給用途：帶到新電腦或新的 Claude Code 對話時，貼給我當開場背景，讓我快速接上進度。這份文件記錄的是**現況**，不是逐次變更的日誌——中途試過又改掉的做法（例如車牌透視校正、長方形模型輸入、拍照前觸發辨識、相機滿版 cover-fit 裁切、「檢驗證書」視覺風格）不會留在這裡，只留下最後定案的版本，避免未來讀到過時的細節。

## 專案基本資訊

- 任務規格文件：`智能檢車_開發任務清單與Prompt範本_審閱修正版.md`（repo 根目錄，繁體中文，Task 0~13；為整體架構藍圖，實務上有調整、與現況會有落差，以本文件為準）
- 專案程式碼：`D:\AI_Car_Guide\web`（React 19 + Vite + TypeScript PWA）
- GitHub repo：https://github.com/billyya365-code/ai-car-guide （公開 repo）
- 線上部署：https://billyya365-code.github.io/ai-car-guide/ （GitHub Pages，push 到 master 自動觸發 GitHub Actions 部署，約 1 分鐘完成）
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
- **部署**：GitHub Pages + GitHub Actions，HashRouter、`import.meta.env.BASE_URL` 處理子路徑資源載入。
- **任務 4**：`useGuidanceStateMachine`——提示優先權佇列（水平 > 直立 > 位置 > 距離 > 清晰度 > 車牌）。
- **任務 5**：`useGyroscopeGuard`——gamma ±25° / beta 60°~95°，含萬向鎖 bug 修正。
- **任務 6**：`useVisionGuidance`——載入模型、節流推論（8 FPS）、位置/距離比對。

### 任務 6 補充：位置/距離判斷邏輯（今日調整）

- **位置判斷**：改成「偵測框中心點是否落在引導框（虛線框）矩形內」，跟畫面上偵測框變綠/橘的判斷用同一套邏輯，不再用固定的 8% 容錯值——框畫多大，可接受的對準範圍就多大。
- **距離容許誤差**：從 40% 放寬到 60%（`useVisionGuidance.ts` 的 `DEFAULT_AREA_TOLERANCE_PERCENT`），輪胎和車牌兩個目標仍須同時通過。
- **引導框座標系統**：`guideTemplates.ts` 的座標現在是「相對於畫面中央正方形有效拍攝區域」（0~100，由 `CameraCapture.tsx` 的 `computeEffectiveAreaRect`/`squareRelativeToFrame` 依實際寬高比換算回整個畫面），不是相對整個直式畫面——不同手機寬高比下，引導框才會一直落在使用者看得到的正方形範圍內。四個角度的車輪/車牌引導框大小也已統一（以左前為準）。

### 任務 7（車牌 OCR）—— 現況

ANPR 常見作法：把車牌上每個字元當成獨立物件偵測類別。

**目前的完整流程**（`usePlateOCR.ts` + `CameraCapture.tsx`）：
1. 自動快門只依賴水平/直立/位置/距離/清晰度這 5 項（不含車牌），拍到照片後**先暫存**成 `pendingCaptureImage`，同時把當下偵測到的車牌框位置也一併凍結（`pendingPlateBoxRef`）。
2. 車牌辨識固定對著這張**凍結的照片**（用 `<img>` 載入 dataURL）跑，不是還在播放中的即時 `<video>`——先前「重新辨識」偶爾看起來沒反應，就是因為舊版對著即時畫面重新裁切，畫面稍微一動就讀到不同內容。
3. 裁切車牌區域（12% padding）→ letterbox 成 640x640 → 丟進字元模型 → 跨類別 NMS 去重 → 依已知車牌長度剔除信心分數最低的多餘字元 → **若剛好組出 7 個字元（3 碼英文+4 碼數字），依位置鎖定類別**（前三碼只接受英文候選、後四碼只接受數字候選，同一位置若有其他類別候選則優先選符合規則的，避免「8」被誤判成「B」這類問題）→ 依 x 座標由左到右組字串 → 跟期望車牌比對。
4. 跳出「拍攝完成！」確認頁：必須辨識成功（或本來沒填期望車牌）才能按「確認，前往下一步」；失敗可以「重新辨識」（對同一張照片重跑，多數失敗只是模型雜訊）或「重新拍攝」（放棄這張照片、回到即時畫面重新對準拍攝，適合照片本身有問題如反光/被擋的情況），連續失敗達上限還有「手動確認車牌」逃生選項。
5. 每個角度都**各自獨立**核對一次（`reset()`）。
6. **沒有透視校正**：已確認新版模型準確率夠高，不需要。

**已解決、值得記住的技術債**：
- **onnx2tf 轉換 bug**：YOLO11n attention 模組分組卷積要加 `--disable_group_convolution`（`-dgc`）。
- **後端效能**：字元模型統一強制切到 `wasm` 後端（`src/lib/tfBackend.ts`），不用 `cpu`（15+ 秒/次）或 `webgl`（部分手機失敗時機比逾時保護晚）。
- **`onnx2tf` 校準檔 404**：需要在專案根目錄手動放替代檔案繞過，換電腦/重新匯出時可能要重新產生。
- **測試陷阱**：「期望車牌號碼」欄位填非車牌格式的測試字會被長度裁剪邏輯搞壞辨識結果，測試務必填真實車牌格式。
- **模型類別數變動**：`web/src/lib/yolo.ts` 的 `CHAR_CLASS_NAMES` 必須跟模型實際訓練的類別順序完全一致。

### 任務 8（自動快門）—— 現況

- **`useStillnessDetector`**：`devicemotion` 的 `rotationRate` 三軸角速度皆低於 3°/秒；不支援時退回備援判定。`sensorPermission` 為 `denied` 時完全不跑自動判定。
- **`AutoShutter`**：條件全通過後，SVG 進度圈 1 秒填滿即觸發拍照（震動 + 音效），18 秒逾時跳出提示。
- **手動快門鍵（今日重新設計）**：外觀改成一般相機 App 的圓形快門鍵（白色圓環＋實心圓），**永遠顯示在畫面上**（不再只在感測器不支援/18 秒逾時才出現），但水平/直立/位置/距離/清晰度沒有全部通過時按鈕維持半透明、無法點擊，全部通過後才會變亮可按——避免使用者提早拍到不合格的構圖，同時保留「隨時看得到快門在哪」的正常相機手感。
- **`CaptureGuidePage`**：嚴格依序 front_left→front_right→back_left→back_right，拍完一個角度、車牌核對通過並確認後才換下一個。

### 任務 11（資源預載）—— 已完成

`src/lib/usePreloadResources.ts`：歡迎畫面/準備畫面背景依序預載兩個 TFJS 模型，讀 `model.json` 的 `weightsManifest` 算出實際權重檔清單，`fetch()` + `ReadableStream` 邊讀邊算進度。純粹是預熱瀏覽器快取。

### 全站視覺設計與導覽（今日大改版）—— 已完成

- **設計方向從「檢驗證書」改為 Apple HIG 風格**：使用者明確要求不再強調證書/用印意象。`index.css` 拿掉襯線標題字體（h1/h2 改回系統字體 `--sans`）、金色（`#d9b85b`）改成藍灰強調色系（相機按鈕/快門進度圈用 `#7c97ad`，車輛角度圖示的位置標記用橘色 `#ff9f0a`）、淺色主題背景從奶油色改成更白/更亮（`--bg: #f2f2f5`、`--bg-card: #ffffff`）、卡片與按鈕圓角加大、陰影更柔和分散。拿掉 `.hero-seal`（「檢」字圓章）與 `.section-divider`。
- **沒有導入 Tailwind**：沿用既有 CSS 自訂屬性系統＋共用類別（`.btn`/`.card`/`.field`/`.badge` 等）調整數值達到同樣效果，避免對已校準的相機拍攝畫面做不必要的大重構。有新增兩個套件：`framer-motion`（僅用在 Splash 淡出、首頁進場、Preparing 轉場，刻意不套用在相機拍攝畫面——那邊已經有一個純 CSS 進場動畫、且踩過「祖先有 transform 就讓內部 position: fixed 子元素定位到錯誤容器」的坑，這次新增動畫元素時同樣要避開這個坑，只動 opacity 不動 transform/x/y）、`lucide-react`（新畫面圖示）。
- **新增流程**：`SplashScreen`（開場品牌識別，~1.5 秒自動淡出，不是獨立路由，是 `App.tsx` 內的 state，底下 `<Routes>` 照常掛載不受影響）→ 首頁（`WelcomePage.tsx`，重新設計）→ 按「開始拍攝」先進 `PreparingPage`（`/preparing`，「AI 準備中」畫面，完成時機綁定 `usePreloadResources` 真實狀態＋最短顯示時間，不是假動畫）→ 自動導向 `/capture`。新增 `HistoryPage`/`SettingsPage`（`/history`、`/settings`）作為「拍攝紀錄」「設定」按鈕的目的地，目前都是「此功能尚未實作」的 stub 頁面（沒有後端支援）。
- **車輛圖示全面換成 AI 生成照片**：原本手繪的 SVG 線稿（`CarAngleIcon.tsx`）已刪除，改用：
  - `CarHeroIllustration.tsx`：首頁中央大圖，來源是使用者用 ChatGPT 生成的車輛照片裁切出前左 45 度角，已去背（`rembg`，`isnet-general-use` 模型）成透明 PNG，用 CSS `drop-shadow` 濾鏡（依透明度輪廓算陰影，不是矩形陰影）補回地面陰影的立體感。
  - `CarAnglePhoto.tsx`：四個拍攝角度的小圖示（首頁格子、拍照引導頁標題、相機畫面左上角），來源是使用者用 Gemini 生成的四角度合照，裁切成 4 張單獨角度圖 + 去背 + 同樣的 drop-shadow。圖片放在 `web/public/car-angles/`（`hero.png`、`front_left.png`、`front_right.png`、`back_left.png`、`back_right.png`），確認過不會被 PWA 的 service worker 預先快取（workbox 預設 globPatterns 不含圖片）。
  - **注意**：`front_left`/`front_right` 一開始裁切時左右擺反了，已對照 `golden_photos/` 的實際參考照片核對修正（判斷依據：`front_left` 車頭永遠在畫面左側，`front_right` 車頭在右側；`back_left`/`back_right` 則是車尾分別在右側/左側，這組畫面合成的邏輯跟前方是鏡像但不對稱，兩張圖片要各自核對，不能只套同一個規則）。
  - `CaptureProgressSteps.tsx`：新增的拍攝進度視覺化元件，`●──●──○──○` 連接式步驟指示器（取代原本的「2 / 4」文字），已完成/目前/尚未三種狀態，短標籤（左前/右前/左後/右後，`POSITION_LABELS_SHORT`）。拍照引導頁用完整版（含文字），相機畫面頂部小徽章用精簡版（只有圓點+連接線，省空間）。
- **相機拍攝畫面 UI 降低侵入感**：頂部小徽章、引導/錯誤訊息、狀態列全部改成黑色 40% + 毛玻璃模糊（`backdrop-filter: blur`），不再是實心/近乎不透明的色塊，狀態改用文字顏色表達（紅字=錯誤、琥珀=提示）。引導框（虛線）灰色改白色半透明；偵測框未對準時橘色改藍色（加呼吸動畫代表「追蹤中」），對準時綠色加柔光（代表「鎖定」）；引導框的文字標籤改成浮在框上方、有上下分隔線的懸浮小標籤（不再直接貼在框線內）。
- **相機滿版顯示**：最終定案是「保留完整鏡頭視野」（CSS `min()`，可能會有黑邊）而不是「吃滿螢幕邊緣但會裁切視野」（CSS `max()`）——後者實測會讓畫面看起來被放大、引導框跟著等比例放大顯得不合理，兩者是同一個根因。黑邊區域現在用同一支鏡頭畫面模糊放大鋪滿（`filter: blur` 疊層），取代純黑色，比較有沉浸感。畫面內容（影格層：影片/引導框/偵測框/遮罩）跟機體控制列層（頂部提示、狀態列、快門鍵）分開兩層：控制列固定貼在螢幕邊緣，且改成用 `bottom: 100%`/`top: 100%` 貼在「影格自己的邊界」正上/下方（不是螢幕邊界固定距離），這樣不管黑邊多窄，提示文字永遠落在畫面外、不會疊到鏡頭實際內容上。

## 尚未開始 / 待處理

- **任務 9（結果渲染與補拍 UX）**：使用者已決定暫緩，等後端 API 規格確定後再做。已確認需求細節：後端回傳 `known_damage`（綠框）/`detected_damage`（紅框）、使用者點擊漏檢處開一般取景相機拍特寫、上傳資料要預留 `consentTimestamp`/`retentionPolicy` 欄位。
- **任務 10**：完整降級 UX，還沒有正式的 `PermissionErrorBoundary`/`usePermissionGuard`。
- **「拍攝紀錄」「設定」頁面**：目前是 stub，沒有後端/實際功能。
- **車輛資料查詢流程**：車牌號碼目前是 `CaptureGuidePage` 上手動輸入框（測試用），還沒有真正的車輛查詢/掃描機制。
- **測試旗標收尾**：`usePlateOCR.ts` 的 `ENABLE_MANUAL_CONFIRMATION_LOCK` 目前是 `false`（方便連續重試測試），正式上線前要改回 `true`。
- **相機鏡頭比例**：曾討論過用 `getUserMedia` 的 `aspectRatio`/`width`/`height` 約束指定 9:16，但先前實測會導致部分手機裁切感光元件原生視野（畫面看起來放大），目前維持不指定比例、用原生預設 framing。使用者決定先不重新嘗試。

## 已知注意事項 / 待確認事項

- `golden_photos/`、`test_pic/`、`data/` 都**沒有**提交到 git（已加入 `.gitignore`）。`car_plate_ocr/*.pt`、`*.onnx` 也已加入 `.gitignore`。
- 位置/距離/方向的判斷慣例是暫定的，尚未經過黃金標準照精確驗證。
- `@techstark/opencv-js` 仍是專案依賴（`CoreLibsCheck.tsx` 診斷頁面還在用它驗證套件載入），正式功能已不依賴它。
- 傳截圖給 Claude Code 測試的既定流程：使用者把手機截圖/參考圖放進 `D:\AI_Car_Guide\car_plate_ocr\`，該類資料夾多半在 `.gitignore` 內，不會外流。
- **視覺驗證方式**：這次大量使用本機 headless 瀏覽器截圖（`msedge.exe --headless=new` 或臨時安裝 `playwright`，用完即移除、不留在 `package.json`）自行驗證排版/動畫，抓到了好幾個純靠程式碼審查看不出來的 bug（h1 兩行文字重疊、相機滿版被放大、引導框左右角度擺反）。`playwright` 的 `--use-fake-device-for-media-stream` 旗標可以在沒有實體鏡頭的情況下測試相機畫面。

## 常用指令

```bash
cd D:/AI_Car_Guide/web
npm run dev          # 本機開發伺服器
npm run build         # 正式建置（部署前務必先跑一次確認無誤）
npm run preview       # 建置後本機預覽（測試 PWA/Service Worker 行為用這個，不要用 dev）
```

部署：push 到 `master` 會自動觸發 GitHub Actions 建置並部署到 GitHub Pages，不需要手動操作。目前所有開發都直接在 `master` 上進行（曾經為了一次大改版開過 `redesign/apple-hig-home` 分支，完成後已合併回 master 並刪除）。

換電腦時：`git clone` 這個 repo 後，`char_model/`、`model/`、`public/car-angles/` 都已隨 git 一起帶過去，但 `data/`、`golden_photos/`、`test_pic/` 需另外手動搬移或重新蒐集。
