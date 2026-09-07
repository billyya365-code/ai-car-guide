# 智能檢車 Web App｜開發任務清單與 AI Agent Prompt 範本（審閱修正版）

> 使用方式：請依序、逐一將以下每個「任務區塊」單獨貼給 AI Agent（如 Claude Code），
> 完成並測試通過後，再進行下一個任務。**不要一次把整份文件丟給 AI**，以免產出難以除錯的程式碼。
>
> 每個任務區塊包含：目標、前置條件、規格重點、驗收標準、可直接使用的 Prompt。
> 標記說明：🆕 = 本次審閱新增任務／段落　⚠️ = 原文有風險已修正　✅ = 原文設計良好，維持不變

---

## 本次審閱修正摘要

原文件架構完整、優先權狀態機與相對座標系統設計正確，值得保留。但以專業開發角度檢視後，發現以下問題並已於下方文件中修正：

| 問題 | 嚴重度 | 修正方式 |
|---|---|---|
| **完全未處理 iOS 13+ 的感測器權限機制** | 🔴 高（會導致陀螺儀防呆與自動快門在 iPhone 上完全失效） | 新增任務 3.5，並與任務 10 合併說明 |
| 任務 6/7 的推論與影像運算未做「效能預算」協調，三個模組同時搶主執行緒 | 🟠 中（低階手機可能明顯卡頓） | 於任務 6、7 補充節流與 Worker 建議 |
| 車牌 OCR 若持續辨識失敗會卡死流程，無逃生機制 | 🟠 中 | 任務 7 新增重試上限與手動跳過機制 |
| `expectedPlateNumber` 從哪裡來未定義，是隱藏的資料流缺口 | 🟠 中 | 移至「待確認事項」並標記為阻塞項 |
| 模型與資源檔案的 CORS／快取策略未提及 | 🟡 低 | 任務 0、11 補充說明 |
| 缺少跨裝置測試矩陣，陀螺儀/OCR 表現裝置差異極大 | 🟡 低 | 新增任務 12 |
| 自動快門若使用者手一直抖，永遠無法觸發，缺乏逃生按鈕 | 🟠 中 | 任務 8 新增逾時與手動拍攝備援 |
| 車牌與車損照片屬個資/車輛識別資訊，未提資料保存政策 | 🟡 低 | 待確認事項新增隱私條款項目 |
| 🆕 未規劃「先 Web 後 App」的分階段策略，也未預留封裝彈性 | 🟠 中 | 新增「開發策略」章節與任務 13，並在任務 0/3/3.5/8 補充抽象層寫法要求（標註 🅰️）|
| 🆕 任務 2 已完成（已取得現成 model.json + .bin），原文未反映最新狀態 | — | 任務總覽表新增「狀態」欄位，任務 1、2 內容同步更新 |

---

## 開發策略：Web（PWA）優先，驗證通過後再封裝 App 🆕

本文件確定採取「**先 Web、後 App**」的分階段策略，重點記錄如下：

- **Phase 1（本文件主要範圍）**：以 React + Vite + PWA 完成整套引導拍照邏輯，在瀏覽器上完成任務 1~12，跑完至少一輪真人測試（任務 12），確認狀態機閾值、拍照流程順暢後視為 Phase 1 完成。
- **Phase 2（任務 13，暫緩實作）**：確認 Web 版邏輯與 UX 穩定後，用 **Capacitor** 把現有 React 專案封裝成 iOS/Android App，置換相機/感測器/震動等原生功能，不重寫核心邏輯。
- **為了讓 Phase 2 的轉換成本降到最低，Phase 1 開發時（任務 0、3、3.5、8）必須採用「瀏覽器 API 統一包一層 hook」的寫法**，細節已於下方對應任務的規格重點中補充標註 🅰️，這是現在寫 Web 版時就要遵守的規則，不是之後才要補的事。

**目前專案狀態**：模型訓練與轉換已完成，已取得 `model.json` + `.bin` 權重檔（zip 打包），**任務 2 視為已完成**，可直接從任務 1 的驗證流程開始。

---

## 任務總覽表

| # | 任務 | 類型 | 前置任務 | 風險等級 | 狀態 |
|---|---|---|---|---|---|
| 0 | 專案初始化與環境建置 | 環境 | 無 | 低 | 待開始 |
| 1 | Phase 0 - Step 0：.pt → TFJS 轉換驗證（Spike） | 模型 | 0 | 🔴 高（最優先驗證）| 待開始（模型已就緒，可直接驗證）|
| 2 | Phase 0 - Step 1~3：資料標註與模型訓練 | 模型 | 1 通過 | 中 | ✅ 已完成（已取得 model.json + .bin）|
| 3 | 模組 A：相機與基礎 UI 鎖定 | 前端 | 0 | 低 | 待開始 |
| 3.5 🆕 | 感測器權限請求（iOS 專屬流程） | 前端 | 3 | 🔴 高（未處理會導致 iOS 全面失效）| 待開始 |
| 4 | 狀態機：提示詞優先權佇列 | 前端 | 3 | 中 | 待開始 |
| 5 | 模組 B：陀螺儀雙軸防呆 | 前端 | 3.5, 4 | 低 | 待開始 |
| 6 | 模組 C：AI 視覺定位與引導 | 前端 | 2, 4 | 中 | 待開始 |
| 7 | 模組 D：畫質檢驗與 OCR | 前端 | 4 | 中 | 待開始 |
| 8 | 模組 E：自動快門與流程控制 | 前端 | 5, 6, 7 | 中 | 待開始 |
| 9 | 模組 F：結果渲染與補拍 UX | 前端 | 8, 後端 API | 中 | 待開始 |
| 10 | 權限被拒絕的錯誤處理與降級方案 | 前端 | 3, 3.5 | 低 | 待開始 |
| 11 | 資源預載與 Mock API | 前端 | 0 | 低 | 待開始 |
| 12 🆕 | 跨裝置測試矩陣與效能監控 | 測試 | 5, 6, 7, 8 | 中 | 待開始 |
| 13 🆕 | Capacitor 封裝與原生 Plugin 替換（Phase 2，暫緩） | App 封裝 | 1~12 全數驗證通過 | 中 | 暫緩（Phase 1 完成後才啟動）|

---

## 任務 0：專案初始化與環境建置

**目標**：建立 React + Vite PWA 專案骨架，確認技術棧可運作。

**規格重點**
- React + Vite
- 部署目標：Vercel 或 GitHub Pages（需綁定 HTTPS，`getUserMedia` 與 `DeviceOrientationEvent` 皆要求 Secure Context）
- 需安裝：TensorFlow.js、OpenCV.js、Tesseract.js（僅 eng 語言包）
- ⚠️ **新增**：建議鎖定套件版本（`package.json` 用精確版號而非 `^`），TFJS 與 OpenCV.js 版本間有已知相容性地雷，任務 1 驗證通過的版本組合應直接鎖死，避免後續 `npm install` 時被動升版導致模型解析行為改變
- ⚠️ **新增**：`public/model/model.json` 與 `.bin` 檔若未來改放 CDN 或其他網域，需確認該網域回傳正確的 CORS 標頭（`Access-Control-Allow-Origin`），否則 `tf.loadGraphModel()` 會直接失敗且錯誤訊息不易理解
- 🅰️ **新增（為 Phase 2 App 封裝預留彈性）**：建立 `src/platform/` 資料夾，之後所有「瀏覽器專屬 API 呼叫」（相機、感測器、震動、檔案存取）都集中寫成獨立 hook 放在這裡，元件本身不要直接呼叫 `navigator.mediaDevices` 等瀏覽器原生 API。這樣之後用 Capacitor 封裝、需要替換成原生 plugin 時，只需改 `src/platform/` 內部實作，不用動到任何使用這些功能的元件

**驗收標準**
- [ ] 專案可本地啟動，HTTPS 模式可用（或用 ngrok/localhost 模擬）
- [ ] 三個核心套件皆可成功 import 且無 console error
- [ ] `package.json` 中三個核心套件為鎖定版本

**Prompt 範本**
```
請用 React + Vite 建立一個 PWA 專案骨架，用於後續開發「引導式車損檢測拍照」功能。
需求：
1. 設定 PWA manifest 與 service worker（vite-plugin-pwa）
2. 安裝並確認可載入：@tensorflow/tfjs、opencv.js、tesseract.js，並在 package.json 中鎖定精確版號
3. 建立基本路由：歡迎頁 → 拍照引導頁 → 結果頁
4. 目前先不用實作邏輯，只需骨架與套件載入測試
```

---

## 任務 1：Phase 0 - Step 0：格式轉換驗證（Spike）⚠️ 最優先 🆕 模型已就緒，可直接開始

**目標**：確認 `.pt → TensorFlow.js` 轉換出來的 `model.json` + `.bin` 能在瀏覽器正確載入、正確推論。

**目前狀態**：已取得訓練/轉換完成的模型，以 zip 檔提供（內含一個 `model.json` + 一到多個 `.bin` 檔），**可直接跳過「先跑通轉換流程」的階段，進入實際載入驗證**。

**為什麼優先**：這是**整條前端路線風險最高的環節**——轉換「完成」不代表轉換「正確」，仍需驗證輸出張量格式是否可解析、推論速度是否可用，越早驗證失敗，成本越低。

**規格重點**
- 將 zip 內的 `model.json` + `.bin` 解壓縮後放入 `public/model/` 資料夾，確認檔案結構與 `model.json` 內宣告的權重檔名一致（zip 解壓縮工具有時會產生巢狀資料夾或改動檔名，需先確認路徑正確）
- 用 10~20 張測試資料快速跑通驗證流程
- 確認三件事：
  1. 轉換後模型能在瀏覽器用 `tf.loadGraphModel()` 正確載入
  2. 輸出張量格式能正確解析出 Bounding Box 座標
  3. NMS（非極大值抑制）等後處理邏輯能在瀏覽器端正確運作
- ⚠️ **新增第 4 點**：同時測試 `tf.setBackend('webgl')` 與 `tf.setBackend('wasm')` 兩種後端的推論結果與速度差異。部分中低階 Android 機型 WebGL 支援度不佳，需確認 WASM 是可行的降級方案，並記錄兩者的推論耗時（為任務 6 的節流頻率抓真實依據，而非憑感覺定 5~10 FPS）

**驗收標準**
- [ ] 瀏覽器 console 印出正確解析的 bbox 座標（含 x, y, width, height, confidence, class）
- [ ] NMS 後處理後，重疊框有被正確過濾
- [ ] WebGL 與 WASM 兩種後端皆可正確推論，並記錄各自單次推論耗時（ms）

**⚠️ 卡關備援**：若驗證卡關超過預期時間（建議自訂上限，例如 2 個工作天），需及早討論備援方案：**改用後端 API 輔助定位**（犧牲即時性）。建議在此步驟開始前，先與後端團隊約定備援 API 的介面規格，避免真的卡關時措手不及。

**Prompt 範本**
```
我有一個用 YOLOv8 Nano 訓練並匯出的 model.json + .bin 權重檔（TFJS Graph Model 格式，
已解壓縮自 zip），放在 public/model/ 資料夾。
請先幫我檢查 model.json 內容，列出：
- 模型宣告的輸入 tensor shape、輸出 tensor shape
- 引用了哪幾個 .bin 檔，檔名是否與資料夾內實際檔案一致
確認無誤後，請寫一個 React 元件，完成以下驗證：
1. 用 tf.loadGraphModel() 載入模型，印出模型輸入/輸出 tensor 的 shape
2. 讀取一張測試圖片，做前處理（resize、normalize）後丟進模型推論
3. 解析輸出張量，畫出所有偵測到的 bounding box（含 class 與信心分數）到 canvas 上
4. 實作 NMS（非極大值抑制）過濾重疊框，並比較過濾前後的框數量
5. 分別用 tf.setBackend('webgl') 與 tf.setBackend('wasm') 各跑一次推論，
   印出兩者耗時（ms）供後續效能評估
請將每個步驟的中間結果印在 console，方便我逐步除錯確認。
```

---

## 任務 2：Phase 0 - Step 1~3：資料標註與模型訓練 ✅ 已完成

**目前狀態**：本任務已完成，已取得訓練與轉換完成的模型（`model.json` + `.bin`，zip 提供），下方內容保留作為紀錄與未來重新訓練（例如擴充資料集、換更大模型）時的參考，**目前可直接跳至任務 1 進行驗證**。

**目標**：訓練出前端專用的輕量定位模型。

**規格重點**
- 標註類別：僅 `wheel`（車輪）、`license_plate`（車牌）— **不含車損**
- 資料量：約 100~200 張不同角度車款照片
- 訓練工具：Roboflow（標註）+ Google Colab（訓練，YOLOv8 Nano 等輕量架構）
- 產出：`model.json` + 多個 `.bin` 檔，放入 `public/model/`

**⚠️ 分工提醒**：前端資料集（wheel / license_plate）與後端資料集（damage / glare）**各自獨立蒐集標註，不需合併**。

**驗收標準**
- [ ] Roboflow 標註完成，wheel 與 license_plate 兩類別皆有足夠樣本
- [ ] Colab 訓練完成並匯出 `.pt`
- [ ] `.pt` 成功轉換為 TFJS 格式，並通過任務 1 的驗證流程

**Prompt 範本**（此步驟多為人工操作，AI Agent 可協助的部分）
```
請提供一份 Google Colab notebook 範本，用於：
1. 讀取 Roboflow 匯出的 YOLO 格式資料集（wheel, license_plate 兩類別）
2. 使用 Ultralytics YOLOv8 Nano 架構進行訓練
3. 訓練完成後匯出 .pt 模型
4. 執行 .pt → TensorFlow.js 的轉換指令，產出 model.json 與 .bin 權重檔
```

---

## 任務 3：模組 A - 相機與基礎 UI 鎖定 ✅

**目標**：確保所有手機拍出來的車身面積常數一致，並正確處理相機權限。

**規格重點**
- 明確的「開始檢測車況」按鈕，使用者主動點擊才觸發權限請求
- `getUserMedia` 使用 `ideal` 而非 `exact`：
```js
const constraints = {
  video: {
    facingMode: { ideal: "environment" },
    aspectRatio: { ideal: 1.777 }, // 16:9，允許裝置退而求其次
  },
  audio: false,
};
const stream = await navigator.mediaDevices.getUserMedia(constraints);
const track = stream.getVideoTracks()[0];
const { aspectRatio, width, height } = track.getSettings();
```
- **務必用 `getSettings()` 讀取實際取得的比例**，後續座標換算依此動態計算，不可寫死假設
- 容器與引導方格是**兩層獨立結構**：
  - 外層相機容器：比例動態依 `getSettings()` 結果設定
  - 內層引導方格：以「相對容器的百分比座標」定義（例如車牌框位於容器寬度 40%~60%、高度 55%~65%），四個方位模板可各自定義不同參數
- ⚠️ **重要提醒**：這個「開始檢測車況」按鈕的 click handler，之後在任務 3.5 會被重複利用——因為 iOS 的感測器權限也**必須**在同一次使用者手勢中請求，不能等相機權限拿到後才非同步觸發，否則會被瀏覽器視為非使用者主動操作而擋下
- 🅰️ **新增**：`getUserMedia` 呼叫請包成 `src/platform/useCameraCapture.ts`（依任務 0 的資料夾規劃），元件只呼叫這個 hook 拿 stream，不要直接寫 `navigator.mediaDevices.getUserMedia`。之後 Capacitor 封裝時，這個 hook 內部會替換成 `@capacitor/camera` plugin（原生相機通常對焦更快、權限體驗更穩定），但呼叫方式（回傳值格式）盡量保持一致，元件不需要跟著改

**驗收標準**
- [ ] 點擊按鈕後才觸發相機權限請求
- [ ] 在不支援 `exact: 1.777` 的裝置上，相機仍可正常開啟（不拋 `OverconstrainedError`）
- [ ] 實際取得的 aspectRatio 被正確讀取並顯示/記錄
- [ ] 內層引導方格以百分比定位，不受外層容器比例拉伸變形

**Prompt 範本**
```
請建立一個 React 元件 CameraCapture，需求如下：
1. 畫面初始顯示「開始檢測車況」按鈕，點擊後才呼叫 getUserMedia 觸發相機權限請求
2. 使用以下 constraints（用 ideal 而非 exact，避免裝置不支援時相機開不起來）：
   facingMode: { ideal: "environment" }, aspectRatio: { ideal: 1.777 }
3. 取得 stream 後，用 track.getSettings() 讀取實際 aspectRatio/width/height，
   存入 React state 供後續模組使用（不可寫死假設值）
4. 外層 <video> 容器的 CSS aspect-ratio 動態依實際取得的比例設定
5. 內層引導方格用獨立的 SVG 或絕對定位 div，位置與大小以「相對容器的百分比」定義
   （先給我一組 props 介面，例如 { xPercent, yPercent, widthPercent, heightPercent }，
   方便之後四個方位模板分別傳入不同參數）
6. 這個按鈕的 onClick handler 請預留擴充空間（例如 async function 內可再加一段），
   之後任務 3.5 會在同一個 handler 內追加 iOS 感測器權限請求
```

---

## 任務 3.5 🆕：感測器權限請求（iOS 專屬流程）⚠️ 原文缺漏，高風險

**目標**：正確處理 iOS 13+ Safari 對陀螺儀/加速度計資料的存取限制，避免任務 5、8 在 iPhone 上完全失效。

**為什麼必須新增這個任務**：原文件任務 5、8 直接假設 `DeviceOrientationEvent` / `DeviceMotionEvent` 可以直接監聽取值。但 **iOS 13 起，Safari 要求網頁必須先呼叫 `DeviceMotionEvent.requestPermission()` 與 `DeviceOrientationEvent.requestPermission()` 取得使用者明確同意，且這個呼叫必須發生在使用者手勢（如 click）的同步呼叫堆疊內**，不能等非同步流程跑完才呼叫，否則會被瀏覽器擋下、Promise 直接 reject。若不處理這件事，整個防呆與自動快門機制在所有 iPhone 上都會直接失效，卻不會有明顯的錯誤畫面。

Android Chrome 目前不需要這個額外授權（多數機型），但仍需 feature-detect `typeof DeviceMotionEvent.requestPermission === 'function'` 來判斷是否要走這個流程。

**規格重點**
- 在任務 3「開始檢測車況」按鈕的同一個 click handler 中，於呼叫 `getUserMedia` 前後（同步堆疊內）一併呼叫感測器權限請求
- 判斷邏輯：
```js
async function requestMotionPermission() {
  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    // iOS 13+ 專屬流程
    const motionResult = await DeviceMotionEvent.requestPermission();
    const orientationResult = await DeviceOrientationEvent.requestPermission();
    return motionResult === 'granted' && orientationResult === 'granted';
  }
  // Android / 舊版 iOS：無需額外授權，視為已授權
  return true;
}
```
- 若使用者拒絕：不可讓畫面卡住，需明確告知「無法使用自動防呆與自動拍攝，將切換為手動拍照模式」，並將流程降級為任務 10 的降級方案（顯示手動快門按鈕，跳過任務 5/8 的自動判定）
- 🅰️ **新增**：此權限請求邏輯請包成 `src/platform/useSensorPermission.ts`。Capacitor 封裝後，原生 App 環境不會有這個 iOS Safari 特有的限制（改用 `@capacitor/motion` 等 plugin 的原生權限流程），把邏輯集中在這個 hook 內，之後只需替換內部實作，任務 4、5、8 呼叫這個 hook 的方式不需要改變

**驗收標準**
- [ ] 在 iOS 13+ 真機（非模擬器）上測試，點擊「開始檢測」後彈出感測器權限對話框
- [ ] 使用者同意後，任務 5 的 gamma/beta 事件能正常觸發
- [ ] 使用者拒絕後，畫面正確降級為手動拍照模式，不卡在空白或無反應狀態
- [ ] Android 裝置上此流程不影響原有操作（不會誤跳出不必要的對話框）

**Prompt 範本**
```
請在任務 3 的 CameraCapture 元件中，於「開始檢測車況」按鈕的 onClick handler 內，
新增感測器權限請求邏輯，需求：
1. 先 feature-detect：若 DeviceMotionEvent.requestPermission 是 function（代表 iOS 13+），
   依序呼叫 DeviceMotionEvent.requestPermission() 與 DeviceOrientationEvent.requestPermission()，
   兩者都須在同一個使用者手勢的呼叫堆疊內觸發（不可等 getUserMedia 的 await 結束後才呼叫）
2. 若裝置不需要這個額外授權（如 Android），直接視為已授權，不顯示多餘對話框
3. 將授權結果（granted/denied/not_required）存入 React state，並透過 props 或 context
   往外傳給任務 4 的狀態機與任務 10 的降級判斷使用
4. 若使用者拒絕感測器權限，不可讓相機畫面卡住——相機部分依然正常運作，
   但需標記「感測器不可用」，供任務 10 顯示對應的降級 UI（僅提供手動快門）
```

---

## 任務 4：狀態機 - 提示詞優先權佇列 ✅

**目標**：避免畫面同時出現多種互相衝突的提示字樣。

**規格重點**
- 優先權順序（由高到低）：
  ```
  水平 > 直立 > 位置 > 距離 > 清晰度 > 車牌正確
  ```
- 當高優先級條件不滿足時，只顯示該層級提示，**直接阻斷後續判斷**（不繼續往下判斷）
- ⚠️ **新增**：若感測器權限被拒絕（任務 3.5 回傳 denied），狀態機需能接收「水平/直立兩項不參與判斷」的旗標，直接從「位置」開始檢查，而非卡在永遠無法通過的水平/直立提示

**驗收標準**
- [ ] 同時有多個條件不滿足時，畫面只顯示最高優先級的那一則提示
- [ ] 狀態機邏輯集中在單一 hook/module，其餘模組只需回報「是否通過」，不各自處理顯示邏輯
- [ ] 感測器不可用時，狀態機能正確跳過水平/直立兩項檢查

**Prompt 範本**
```
請建立一個 React hook useGuidanceStateMachine，用於管理拍照引導的提示優先權。
優先權順序（由高到低）：水平 > 直立 > 位置 > 距離 > 清晰度 > 車牌正確
規則：
1. 輸入為一組布林值（每個對應一個檢查項是否通過），例如：
   { isLevelOk, isUprightOk, isPositionOk, isDistanceOk, isSharpOk, isPlateOk }
2. 額外接受一個 sensorAvailable: boolean 參數，若為 false，
   水平與直立兩項一律視為「不參與判斷」（不影響是否可繼續往下檢查），
   並在 UI 上標記這兩項為「已略過（裝置不支援或未授權）」
3. Hook 依優先權順序檢查，回傳「當前應顯示的唯一提示」（第一個不通過的項目），
   若前面項目不通過，後面項目視為「尚未判斷」，不參與顯示
4. 全部通過時回傳 null 或 'ALL_PASSED'
5. 請用 enum 或 const 定義所有可能的提示狀態，方便其他模組 import 使用
```

---

## 任務 5：模組 B - 陀螺儀雙軸防呆 ⚠️ 前置條件已修正

**目標**：純數學運算即時過濾錯誤拍攝姿勢。

**前置條件**：需任務 3.5 取得感測器授權（`granted`）後才開始監聽，否則 iOS 上事件永遠不會觸發，但畫面也不會報錯，容易誤以為是程式邏輯問題。

**規格重點**
- 事件驅動，**不節流**（原生事件可達每秒數十次；純數學比較成本低，節流反而增加不必要的複雜度）
- 優先級 1（Roll）：監聽 `gamma`，超出 ±5° → 「請保持手機水平」
- 優先級 2（Pitch）：監聽 `beta`，未落在 70°~90° → 「請直立鏡頭」
- ⚠️ **新增**：hook 內部需檢查任務 3.5 回傳的授權狀態，若為 `denied` 或 `not applicable`，直接回傳 `isLevelOk: true, isUprightOk: true`（視為不參與判斷，交由狀態機的 `sensorAvailable` 旗標處理顯示邏輯），而非讓事件監聽器靜默失敗

**驗收標準**
- [ ] gamma / beta 事件即時反應，無明顯延遲
- [ ] 超出範圍時觸發任務 4 狀態機對應的提示
- [ ] 未取得感測器授權時，不會誤判為「一直不通過」，而是正確標記為略過

**Prompt 範本**
```
請建立一個 React hook useGyroscopeGuard，需求：
1. 接收一個 sensorPermission: 'granted' | 'denied' | 'not_required' 參數（來自任務 3.5）
2. 若 sensorPermission 不是 'granted' 或 'not_required'，直接回傳
   { isLevelOk: true, isUprightOk: true, sensorAvailable: false }，不註冊事件監聽
3. 若已授權，監聽 DeviceOrientationEvent，取得 gamma（左右傾斜）與 beta（前後傾斜）
4. 優先級 1：gamma 超出 ±5° 時，回傳 isLevelOk: false
5. 優先級 2：beta 不在 70°~90° 區間時，回傳 isUprightOk: false
6. 事件為即時反應，不做節流（純數學運算成本低）
7. 回傳值需能直接餵給任務 4 建立的 useGuidanceStateMachine
```

---

## 任務 6：模組 C - AI 視覺定位與引導 ⚠️ 已補充效能與容錯

**目標**：用 Phase 0 訓練好的模型做即時座標運算，判斷位置與距離。

**規格重點**
- 載入 `public/model/model.json`，偵測頻率節流至 **5~10 FPS**（實際上限請依任務 1 Spike 階段量測到的真實推論耗時決定，不同機型差異可能很大，5~10 FPS 是目標值而非保證值）
- 座標邏輯改用**相對百分比**（非絕對像素）：
  - 中心點座標：相對畫面寬高的百分比
  - 目標面積：佔畫面總面積的百分比
- 優先級 3（位置）：比對中心點百分比座標差距 → 提示「請將畫面降低/拿高」
- 優先級 4（距離）：比對面積百分比比例，容錯率 10% → 提示「請靠近一點/退後一點」
- ⚠️ **新增**：模型載入失敗（網路問題、CORS、檔案損毀）時需有明確的 fallback，不可讓整個拍照流程卡死——建議降級為「僅靠陀螺儀防呆 + 手動拍攝」，並記錄錯誤供後續除錯
- ⚠️ **新增（效能協調）**：任務 6（視覺推論）與任務 7（OpenCV 模糊偵測）都會佔用主執行緒，兩者若同時全速跑，低階裝置容易明顯掉幀。建議此 hook 內部用 `requestAnimationFrame` 搭配時間戳記手動節流，並與任務 7 共用同一個節流排程器，避免兩個 `setInterval` 互相搶资源

**驗收標準**
- [ ] 推論頻率確實節流在目標 FPS 範圍，不佔滿主執行緒
- [ ] 座標與面積計算皆以百分比表示，不依賴裝置解析度
- [ ] 位置與距離提示能正確餵入任務 4 的狀態機
- [ ] 模型載入失敗時能明確降級，不白畫面、不卡死

**Prompt 範本**
```
請建立一個 React hook useVisionGuidance，需求：
1. 用 tf.loadGraphModel() 載入 public/model/model.json，並用 try/catch 包裹，
   載入失敗時回傳 { modelLoadError: true }，不拋出未捕捉例外
2. 對 <video> 畫面做推論，頻率節流在 5~10 FPS（用 requestAnimationFrame + 時間戳記節流，
   而非單純的 setInterval，避免與其他模組的排程互相干擾）
3. 解析輸出，取得 wheel / license_plate 的 bounding box，換算為：
   - 中心點座標：{ xPercent, yPercent }（相對畫面寬高百分比）
   - 面積：佔畫面總面積百分比
4. 與傳入的目標百分比座標（例如 { targetXPercent: 50, targetYPercent: 60, targetAreaPercent: 15 }）比較：
   - 中心點偏移 → 回傳 isPositionOk 及方向（up/down/left/right）
   - 面積比例超出 10% 容錯 → 回傳 isDistanceOk 及方向（closer/farther）
5. 回傳值格式需能餵給任務 4 的 useGuidanceStateMachine，並包含 modelLoadError 欄位
```

---

## 任務 7：模組 D - 畫質檢驗與 OCR 攔截 ⚠️ 已補充重試上限

**目標**：確保畫面清晰且車牌正確。

**規格重點**
- 優先級 5（模糊偵測）：OpenCV.js 拉普拉斯變異數，低於閾值 → 「畫面模糊，請輕觸對焦或擦拭鏡頭」
  - ⚠️ **新增**：模糊偵測同樣需節流（建議與任務 6 共用節流排程），不需要每個 frame 都算一次拉普拉斯變異數
- 優先級 6（車牌核對）：前面條件皆滿足時才觸發，Canvas 裁切車牌 bbox 區域 → Tesseract.js 辨識
  - **僅預載 `eng` 語言包**（移除 `chi_tra`，台灣車牌無中文字）
  - **僅觸發一次**，不列入常態掃描，期間顯示「車牌核對中...」
  - 不符提示：「車牌不符，請確認車輛」
  - ⚠️ **新增**：OCR 辨識準確率在瀏覽器端（非後端）通常不如預期，尤其車牌字體與光線角度差異大時。若連續辨識失敗（建議上限 3 次），需提供「手動確認車牌」的逃生選項，而非讓使用者卡在無限重試迴圈——這點也請一併記錄在「待確認事項」中與需求方討論可接受的失敗處理方式

**驗收標準**
- [ ] 模糊偵測即時運作但有節流，不影響其他優先級判斷也不過度佔用主執行緒
- [ ] OCR 僅在條件全滿足時觸發一次，不會重複觸發造成效能浪費
- [ ] Tesseract.js 僅載入 eng 語言包
- [ ] 連續辨識失敗達上限後，提供手動確認逃生選項

**Prompt 範本**
```
請建立兩個功能：
1. useBlurDetection hook：用 opencv.js 計算 <video> 當前畫面的拉普拉斯變異數，
   低於指定閾值時回傳 isSharpOk: false。請加入節流機制（例如每 200ms 最多計算一次），
   不需要每個 frame 都運算
2. usePlateOCR hook：
   - 僅預載 Tesseract.js 的 eng 語言包
   - 提供一個 triggerOnce(bboxRect) 方法，用 Canvas 裁切傳入的車牌 bounding box 區域，
     送入 Tesseract.js 辨識，辨識期間回傳 isRecognizing: true
   - 確保此方法呼叫一次只執行一次辨識，不會被重複觸發（需有 lock 機制）
   - 辨識結果與傳入的 expectedPlateNumber 比對，回傳 isPlateOk
   - 內部維護一個失敗計數器，連續失敗達 3 次時，回傳 needsManualConfirmation: true，
     供 UI 顯示「手動確認車牌」按鈕作為逃生選項
兩者回傳值需能餵給任務 4 的 useGuidanceStateMachine
```

---

## 任務 8：模組 E - 自動快門與流程控制（方案 A）⚠️ 已補充逃生機制

**目標**：實現「人臉辨識轉帳級」的無感自動拍攝。

**規格重點**
- 靜態對齊計時器：優先級 1~6 全部通過，並維持靜止 1 秒
- 靜止判定：
  - 主要：`DeviceMotionEvent.rotationRate` 三軸皆低於 3°/秒，持續 1 秒
  - 備援（不支援 rotationRate 時，不限 iOS）：連續兩次 `DeviceOrientation` 讀值差 < 1°
- UI：**進度圈動畫**（非 3,2,1 倒數文字），對應 1 秒判定時間，填滿即觸發快門
- 自動拍攝：`canvas.toDataURL()` 轉 Base64，POST 至後端
- 換位引導：快門音效/震動 + 自動切換下一方位，附帶 `position` 參數（如 `front_right`）
- ⚠️ **新增（逃生機制）**：手持穩定度因人而異，部分使用者可能長時間無法通過靜止判定。建議加入**逾時備援**：例如條件持續滿足但因手抖超過 15~20 秒仍未觸發，畫面提示「偵測到手部持續晃動，是否改為手動拍攝？」並提供手動快門按鈕，避免使用者卡在無限等待的挫折體驗中
- 🅰️ **新增**：`navigator.vibrate` 震動呼叫請包成 `src/platform/useHapticFeedback.ts`。Capacitor 封裝後會替換成 `@capacitor/haptics`（原生震動手感通常較細膩），同樣只改這個 hook 內部即可

**驗收標準**
- [ ] 條件全滿足且靜止 1 秒後，自動觸發拍攝，無需使用者手動點擊
- [ ] 進度圈動畫與實際判定時間同步（1 秒）
- [ ] rotationRate 不支援的裝置能自動切換備援判定邏輯
- [ ] 拍攝後正確傳遞 position 參數
- [ ] 長時間無法通過靜止判定時，提供手動拍攝逃生選項

**Prompt 範本**
```
請建立一個 React 元件 AutoShutter，需求：
1. 監聽 DeviceMotionEvent 的 rotationRate，若裝置支援，判斷 alpha/beta/gamma
   三軸數值皆低於 3°/秒 且持續 1 秒視為靜止
2. Feature detection：若裝置不支援 rotationRate，改用連續兩次 DeviceOrientation
   讀值之差 < 1° 作為替代判斷依據
3. 僅在傳入的 allConditionsPassed（來自任務 4 狀態機，代表優先級 1~6 全滿足）為 true 時，
   才開始計時判定靜止
4. UI 顯示一個逐漸填滿的圓形進度圈動畫，對應 1 秒靜止判定時間，填滿時：
   - 呼叫 canvas.toDataURL() 截圖轉 Base64
   - 觸發震動（navigator.vibrate）與快門音效
   - 呼叫傳入的 onCapture(base64Image, position) callback
5. 拍攝完成後，UI 自動切換至下一個方位（傳入方位陣列，如 ['front_left','front_right','back_left','back_right']）
6. 加入逾時備援：若 allConditionsPassed 為 true 但持續 15~20 秒仍未成功觸發拍攝
   （代表使用者手持不穩定），顯示提示訊息與手動快門按鈕，
   讓使用者可以主動點擊完成拍攝，跳過自動判定
```

---

## 任務 9：模組 F - 結果渲染與補拍 UX ✅

**目標**：實作人機協作機制，讓使用者可標註漏檢的車損。

**規格重點**
- 四方位拍照完成，上傳後端分析
- 後端回傳結果後，前端疊加 Bounding Box：**綠框＝已知舊傷、紅框＝本次疑似車損**
- 使用者可點擊照片上未被框出的位置
- 前端換算點擊相對座標（x%, y%），開啟**一般相機**（不套引導模板，僅一般取景）
- 完成拍攝後，特寫照 + 點擊座標一併上傳，標記來源為「使用者回報」
- 此機制同時也是未來模型訓練的資料來源
- ⚠️ **提醒**：此步驟上傳的照片包含車牌與車輛外觀等可識別資訊，建議在此任務實作時就把「上傳資料結構」設計成可擴充欄位（例如預留 `consentTimestamp`、`retentionPolicy` 欄位），避免之後補隱私合規要求時要大改資料結構

**驗收標準**
- [ ] Bounding Box 顏色正確區分舊傷/新傷
- [ ] 點擊座標正確換算為百分比並記錄
- [ ] 補拍相機不套用任何引導框/防呆邏輯
- [ ] 上傳資料包含來源標記（使用者回報）

**Prompt 範本**
```
請建立一個 React 元件 ResultReviewAndReport，需求：
1. 顯示四張已拍攝照片，並疊加後端回傳的 bounding box：
   - type: 'known_damage' → 綠框
   - type: 'detected_damage' → 紅框
2. 使用者可點擊照片上任意位置（未被框出之處），觸發：
   - 換算點擊位置為相對照片的百分比座標 { xPercent, yPercent }
   - 開啟一般相機畫面（重複使用任務 3 的 CameraCapture，但不傳入引導方格 props）
3. 使用者完成特寫拍攝後：
   - 呼叫傳入的 onReportSubmit(closeUpImageBase64, { xPercent, yPercent, sourcePhotoId }) callback
   - 標記 source: 'user_reported'
4. 此元件不需處理實際 API 上傳，只需組好資料結構並透過 callback 往外傳，
   資料結構請預留 consentTimestamp、retentionPolicy 欄位供後續串接
```

---

## 任務 10：權限被拒絕的錯誤處理與降級方案 ⚠️ 範圍已擴大

**目標**：處理使用者拒絕權限或裝置不支援的情況（涵蓋相機權限**與**任務 3.5 的感測器權限）。

**規格重點**
- 明確錯誤畫面：「需要相機／感測器權限才能進行檢測」
- 「重新授權」按鈕，引導使用者到瀏覽器設定重新開啟權限
- 裝置完全不支援時（如陀螺儀 API 不存在），需有降級方案提示，避免畫面卡在空白狀態
- ⚠️ **新增**：相機權限與感測器權限需**分開判斷、分開顯示訊息**——相機被拒是阻斷性錯誤（無法繼續），感測器被拒是**非阻斷性降級**（仍可用手動拍照完成檢測），兩者不應共用同一個錯誤畫面文案，否則使用者會誤以為感測器被拒也無法使用 App

**驗收標準**
- [ ] 拒絕相機權限時顯示對應錯誤畫面與重新授權引導（阻斷流程）
- [ ] 拒絕感測器權限時顯示降級提示，但仍可繼續使用手動拍照模式（不阻斷流程）
- [ ] 陀螺儀 API 不存在時顯示降級提示，不會白畫面
- [ ] 錯誤畫面文案清楚說明原因與下一步動作，且相機/感測器兩種情境文案不同

**Prompt 範本**
```
請建立一個 PermissionErrorBoundary 元件與對應的權限檢查 hook usePermissionGuard，需求：
1. 分別檢查相機（getUserMedia）與感測器（任務 3.5 的 DeviceOrientationEvent /
   DeviceMotionEvent 授權流程）兩種權限狀態，兩者獨立處理不可混用同一組錯誤訊息
2. 若使用者拒絕相機權限：顯示阻斷性錯誤畫面「需要相機權限才能進行檢測」+ 「重新授權」按鈕
   （點擊後引導使用者查看瀏覽器設定說明，因程式無法直接重開系統權限對話框）
3. 若使用者拒絕感測器權限，或裝置完全不支援（例如 DeviceOrientationEvent 不存在）：
   顯示非阻斷性降級提示，說明此裝置/設定無法使用自動防呆與自動拍攝，
   並提供「改用手動拍照模式繼續」的選項，不擋住整體流程
4. 確保任何權限失敗情境都不會導致畫面卡在空白狀態
```

---

## 任務 11：資源預載與 Mock API ⚠️ 已補充說明

**目標**：避免拍照時才下載大體積資源導致卡頓；讓前端可獨立於後端開發測試。

**規格重點**
- OpenCV.js 與 Tesseract.js（僅 eng）於歡迎畫面時背景非同步預載
- `mockUploadAPI`：模擬上傳延遲與回傳假座標，供後端未完成前測試 UI
- ⚠️ **新增**：OpenCV.js 檔案體積較大（約 8MB 以上），建議預載時顯示進度百分比而非單純的 loading 動畫，避免使用者在慢速網路下誤以為 App 卡死；同時建議這三項資源（OpenCV.js、Tesseract.js、TFJS 模型）分批載入而非同時發出請求，避免行動網路頻寬被瞬間佔滿

**驗收標準**
- [ ] 進入歡迎畫面即開始背景載入，不阻塞 UI
- [ ] Mock API 可模擬延遲與假資料，回傳格式與真實 API 一致
- [ ] 大體積資源（OpenCV.js）載入時有可見的進度提示

**Prompt 範本**
```
請建立以下兩個工具：
1. usePreloadResources hook：在使用者進入歡迎畫面時，背景非同步預載 OpenCV.js 與
   Tesseract.js（僅 eng 語言包），並回傳每項資源的載入進度供 UI 顯示（不阻塞使用者操作）。
   請將資源載入順序稍微錯開（例如用 Promise 依序或小延遲觸發），避免同時搶占行動網路頻寬
2. mockUploadAPI(imageBase64, position) 函數：
   - 模擬 1~2 秒網路延遲
   - 回傳假的分析結果，格式範例：
     { photoId, boundingBoxes: [{ type: 'detected_damage', xPercent, yPercent, widthPercent, heightPercent }] }
   - 用於任務 9 的前端 UI 測試，之後可直接替換成真實 API 呼叫
```

---

## 任務 12 🆕：跨裝置測試矩陣與效能監控

**目標**：陀螺儀行為、OCR 準確率、TFJS 推論效能在不同裝置上差異極大，需要有系統的測試覆蓋，避免只在開發者自己的手機上測過就視為完成。

**規格重點**
- 建議至少涵蓋以下測試矩陣：
  - iOS Safari（近兩代主流機型，需實測感測器權限彈窗）
  - Android Chrome（含一款中低階機型，測試 WebGL 降級與推論效能）
  - 至少一款螢幕較舊/解析度較低的裝置，驗證引導方格百分比定位是否跑版
- 建議加入簡易的效能監控（可先用 console 記錄，之後視需要接 Sentry 等工具）：
  - 各模組推論/運算耗時（供未來調整節流頻率參考）
  - 感測器權限請求的通過率與拒絕率
  - OCR 平均重試次數

**驗收標準**
- [ ] 至少完成上述測試矩陣中 3 種以上裝置的手動測試並記錄結果
- [ ] 核心模組具備基本的耗時記錄，供後續效能調校依據
- [ ] 測試結果整理成文件，標註各裝置已知問題與限制

**Prompt 範本**
```
請在 useVisionGuidance、useBlurDetection、usePlateOCR 三個 hook 中，
加入簡易的效能記錄邏輯：
1. 各自記錄最近 10 次運算的耗時（ms），並計算平均值
2. 提供一個 usePerformanceDebugPanel hook，在開發模式下（import.meta.env.DEV）
   顯示一個浮動面板，列出上述三項平均耗時，以及感測器權限狀態
3. 此面板僅在開發模式顯示，正式環境不渲染
```

---

## 任務 13 🆕：Capacitor 封裝與原生 Plugin 替換（Phase 2，暫緩實作）

**目標**：在 Web（PWA）版本完成任務 1~12、並跑過至少一輪真人測試驗證邏輯與 UX 穩定後，將現有 React 專案封裝成可上架 iOS/Android 的原生 App。

**啟動條件**：任務 1~12 全數完成且驗收通過，尤其任務 12 的跨裝置測試已找出並修正主要的裝置相容性問題後，才啟動本任務。**不建議在 Phase 1 邏輯尚未穩定前提前封裝**，因為封裝後每次疊代成本會明顯增加。

**規格重點**
- 安裝 `@capacitor/core` 與對應平台套件（`@capacitor/ios`、`@capacitor/android`），將現有 Vite build 產出的 `dist/` 資料夾設為 Capacitor 的 `webDir`
- 依任務 0/3/3.5/8 已建立的 `src/platform/` 抽象層，逐一替換內部實作：
  - `useCameraCapture` → 改接 `@capacitor/camera`
  - `useSensorPermission` → 改接 `@capacitor/motion`（原生流程通常不需要每次重問權限，體驗較穩定）
  - `useHapticFeedback` → 改接 `@capacitor/haptics`
  - TFJS 模型載入邏輯原則上可直接沿用（Capacitor WebView 仍是瀏覽器環境），若後續要進一步提升效能，才評估是否換成原生 Core ML / TFLite（屬於更大規模的重寫，非本任務範圍）
- PWA 的 manifest/service worker 邏輯可保留，讓 Web 版與 App 版雙軌並存，互不影響
- 需重新針對 App 環境跑一次任務 12 的測試矩陣（原生殼可能暴露 WebView 特有的行為差異，例如檔案系統路徑、Deep Link 等，需個別驗證）

**驗收標準**
- [ ] iOS/Android 皆可成功 build 出可安裝的 App，核心拍照引導流程功能與 Web 版一致
- [ ] `src/platform/` 內的三個 hook 皆已替換為對應原生 plugin，且呼叫方式未改動使用端元件
- [ ] 在至少各一款真實 iOS/Android 裝置上完成完整拍照流程測試

**Prompt 範本**
```
我的 React + Vite 專案已完成 Web 版開發，src/platform/ 資料夾內有三個 hook：
useCameraCapture、useSensorPermission、useHapticFeedback，目前底層分別呼叫瀏覽器原生 API。
請協助：
1. 安裝並設定 Capacitor（@capacitor/core、@capacitor/ios、@capacitor/android），
   將 Vite build 的 dist/ 設為 webDir
2. 依序將上述三個 hook 的內部實作替換為對應的 Capacitor plugin：
   @capacitor/camera、@capacitor/motion、@capacitor/haptics，
   但維持每個 hook 對外的回傳值格式與呼叫方式不變，
   確保原本呼叫這些 hook 的元件完全不用修改
3. 若某個 plugin 的行為與原本瀏覽器 API 有明顯差異（例如權限詢問時機不同），
   請在程式碼註解中說明差異，方便我之後測試時知道要特別注意什麼
```

---

## 開發順序建議（甘特邏輯）

```
【Phase 1：Web / PWA】

任務0 → 任務1（Spike，模型已就緒，直接驗證載入與推論）
           ├─ 通過 → （任務2 已完成，無需再做）
           └─ 卡關 → 啟動備援方案（後端 API 輔助定位）

任務0 → 任務3（相機UI）→ 任務3.5（iOS 感測器權限，與任務3同一手勢）→ 任務4（狀態機）
                                                                          ├─ 任務5（陀螺儀）
                                                                          ├─ 任務6（視覺定位，任務1驗證通過後即可開始）
                                                                          └─ 任務7（畫質+OCR）
                                                                                ↓
                                                                          任務8（自動快門，整合5+6+7）
                                                                                ↓
                                                                          任務9（結果渲染，需後端API或任務11 Mock）
                                                                                ↓
                                                                          任務12（跨裝置測試，貫穿5~9持續進行）

任務10（權限錯誤處理，涵蓋相機+感測器）可與任務3/3.5並行
任務11（預載+Mock）可與任務0後立即開始，供任務9提前測試

           ↓  （任務1~12 全數完成且驗收通過，Phase 1 結束）

【Phase 2：App 封裝（暫緩，Phase 1 穩定後才啟動）】

任務13（Capacitor 封裝 + 替換 src/platform/ 內三個 hook 為原生 plugin）
           ↓
   重新針對 App 環境跑一次任務12 測試矩陣 → 上架準備
```

---

## 待確認事項（建議開工前與需求方確認，屬阻塞性項目請優先釐清）

1. **各方位的黃金標準照**：左前/左後/右前/右後是否各需一張黃金標準照來換算百分比座標？還是共用一組邏輯座標？
2. 🔴 **`expectedPlateNumber` 的資料來源（阻塞性）**：任務 7 的 OCR 比對需要一個「預期車牌號碼」，但目前文件未定義這個值從哪裡來——是使用者在拍照前手動輸入？還是從後端某個既有預約/訂單資料帶入？這會直接影響任務 7 的元件介面設計，建議優先確認。
3. **OCR 辨識失敗的可接受處理方式**：連續辨識失敗後允許使用者「手動確認車牌」，是否會產生車牌辨識準確度的資安/防詐疑慮（例如惡意使用者故意輸錯車牌讓系統手動放行）？需與需求方確認是否要加上後端二次驗證。
4. **資料保存與隱私政策**：拍攝內容包含車牌與車輛外觀等可識別資訊，是否需要在拍照前顯示同意條款？照片保存期限與使用範圍（是否用於未來模型訓練）是否需要明確告知使用者？
5. **rotationRate 不支援裝置的實際占比**：建議开發前先用任務 12 的測試矩陣快速盤點目標用戶常用機型，確認備援判定邏輯的實際覆蓋率是否足夠。
6. **Phase 0 Spike 卡關的備援 API 介面**：建議提前與後端團隊約定好介面格式（即使備援方案最終沒用到）。
7. **效能預算分配**：任務 6（視覺推論）、任務 7（模糊偵測+OCR）三者共用主執行緒，是否需要設定明確的效能基準線（例如「中階機型 App 需維持 15fps 以上互動流暢度」），作為驗收依據？
8. 🆕 **Phase 2 啟動時機**：目前規劃是 Phase 1（Web）全數驗收通過、跑完任務 12 測試矩陣後才啟動任務 13（Capacitor 封裝）。建議與需求方確認：是否有明確的 App 上架時程壓力（例如需要在特定日期前上架 App Store/Google Play），若有，時程需要往前推算 Phase 1 的截止日，避免 Phase 2 時間被壓縮而跳過必要的驗證步驟。
9. 🆕 **主要使用族群是否為高頻使用者**：先前討論提到，若主要使用者是「內部定損師/維修廠員工每天重複使用」，封裝 App 的必要性較高；若是「一般保戶/租車客戶偶爾使用一次」，Web/PWA 可能就足夠、甚至不需要進入 Phase 2。建議先確認此定位，再決定任務 13 是否列入正式排程。
