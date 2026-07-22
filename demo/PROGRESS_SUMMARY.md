# 車況之眼｜Remotion 成果 Demo 影片 — 進度摘要

用 Remotion + React + TypeScript 製作「車況之眼：智慧巡檢系統」的產品發表 demo 影片（目標總長約 60~80 秒），跟主專案（`web/`）是同一個 git repo 底下的獨立子專案，各自有自己的 `package.json`/`node_modules`。

## 快速開始

```bash
cd demo
npm install
npm start        # 開 Remotion Studio（http://localhost:3000）即時預覽
```

左側選單可以切換各個 composition。**不需要另外跑 `npm run render` 產生 mp4**——直接在 Studio 裡預覽、確認即可（除非明確需要輸出檔案）。

## 專案結構

```
demo/
├── src/
│   ├── Root.tsx                 # 註冊所有 composition（id、時長、尺寸）
│   ├── index.ts                 # registerRoot 進入點
│   ├── theme.ts                 # 色票（延伸自 web/src/index.css 深色主題）＋ Noto Sans TC 字體載入＋字重
│   ├── components/
│   │   └── SceneBackground.tsx  # 每頁共用的深色背景＋緩慢流動藍色光斑
│   ├── lib/
│   │   ├── anim.ts              # 共用動畫小工具：EASE、fadeUp()、slideIn()
│   │   └── carAngles.ts         # 四角度車輛照片共用設定：裁切方向/比例、車輪車牌框座標
│   └── scenes/
│       ├── Cover.tsx            # Page 1｜封面
│       ├── InputPlate.tsx       # Page 2｜輸入車牌
│       ├── AiGuideCapture.tsx   # Page 3｜AI 引導拍照
│       └── Calibration.tsx      # 座標校正工具（非正式影片內容，見下方說明）
└── public/
    ├── car-angles/              # 四角度車輛去背照（複製自 web/public/car-angles/）
    └── car-models/              # 車款照（複製自 web/public/car-models/，目前只放 Corolla Altis）
```

## 目前完成的頁面

### Page 1｜封面（Cover，獨立 composition 6 秒）
- 深色科技背景＋緩慢流動的藍色光斑
- 標題「車況之眼」（Black 900）＋副標題「智慧巡檢系統」（Medium 500）依序淡入＋縮放進場，ease-in-out、無回彈

### Page 2｜輸入車牌（InputPlate，對應完整影片 8~18 秒，獨立 composition 10 秒）
- 左半：對應車款的實際車輛去背圖（從左側滑入）
- 右半：忠實還原 App 實際「輸入車牌」欄位（車款選單、車牌雙輸入框），逐行從右側滑入
- 車牌號碼「ABC-1234」逐字打字動畫＋游標閃爍，打完自動跳到下一個框（比照真實 App 行為）
- 「開始拍照」按鈕移到下方置中，出現時發光＋按下回彈

### Page 3｜AI 引導拍照（AiGuideCapture，對應完整影片 18~40 秒，獨立 composition 22 秒）
- 四個角度（車頭左側→車頭右側→車尾右側→車尾左側，跟 App 實際拍攝順序一致）各自是一支手機外殼 mockup
- 車輛照片裁切放大保留重點那一半（前角度留車頭、後角度留車尾），車輪／車牌疊上偵測框（座標已用使用者透過 Calibration 工具校正過）
- 每次只有「當前這一支手機」放大，顯示 AI Guide 掃描徽章＋掃描線＋對焦模糊拉清晰＋對焦框呼吸縮放＋手持晃動感；完成時白閃模擬快門＋綠色打勾，該格縮回基準大小、下一格接手放大（焦點像接力棒一樣交接）
- 尚未輪到的手機畫面先降低亮度/飽和度（灰暗未拍攝感），輪到時淡回正常
- 最後一格完成後，四支手機一起回到基準大小、全部打勾做結尾停留

### 座標校正工具（Calibration，非正式影片內容）
- 跟 `AiGuideCapture` 用同一份 `CROP_SIDE`/`CROP_ZOOM` 設定裁出一樣的畫面，疊上每 10% 一條的格線＋數字
- 目前拿掉了框線疊圖，只保留乾淨的格線＋車輛照片，方便使用者自己在畫面上標記想要的位置後直接由 AI 讀出座標
- `GUIDE_BOXES`（`src/lib/carAngles.ts`）是 `AiGuideCapture` 跟 `Calibration` 共用的唯一座標來源，改一次兩邊同步

## 尚未進行

- Page 1/2/3 目前都是各自獨立的 composition，還沒有串成單一時間軸的完整影片（例如用 `<Series>` 銜接、轉場效果）
- Page 3 之後（40 秒~結尾，約 20~40 秒份量）的頁面（例如巡檢結果／報告畫面）尚未開始設計
- 尚未在真實裝置/實際輸出的 mp4 上做過最終畫質與時長驗收
