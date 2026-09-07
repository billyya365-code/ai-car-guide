# 車況之眼｜Remotion 成果 Demo 影片 — 進度摘要

用 Remotion + React + TypeScript 製作「車況之眼：智慧巡檢系統」的產品發表 demo 影片，跟主專案（`web/`）是同一個 git repo 底下的獨立子專案，各自有自己的 `package.json`/`node_modules`。目前有**兩支影片**，都在同一個 `demo/` 專案裡（見下方說明），不是分開的兩個資料夾。

## 快速開始

```bash
cd demo
npm install
npm start        # 開 Remotion Studio（http://localhost:3000）即時預覽
```

左側選單可以切換各個 composition。**不需要另外跑 `npm run render` 產生 mp4**——直接在 Studio 裡預覽、確認即可（除非明確需要輸出檔案）。

## 兩支影片

- **`FullVideo`**（第一支，69.5 秒）：`Cover → InputPlate → AiGuideCapture → UploadAnalysis → ResultReveal → DashboardReview`。橫式畫布、深色科技風格、重新詮釋/簡化過的動畫（不是逐畫面還原真實 App）。片尾疊了 `audio/cinematic-corporate-extended.wav` 背景配樂，結尾前用較長的窗口（`AUDIO_FADE_FRAMES`）漸弱，避免跟畫面淡黑一起太突兀地被切斷。
- **`PhoneWalkthrough`**（第二支，60 秒）：`Cover → PhoneWelcome → PhoneCapture → PhoneConfirm → PhoneUpload → PhoneResult`。橫式畫布，用共用的 `PhoneSceneLayout`（左欄標題/副標＋預留的「技術説明」佔位區塊、右欄放大版手機外殼 mockup）排版；手機螢幕裡的內容**忠實還原真實 App**（`web/src/pages`、`web/src/components`）的亮色主題畫面/文案/配色，兩支影片共用同一張 `Cover` 封面當開場。

兩支影片各自的場景也都各自登記了獨立 composition（`Cover`/`InputPlate`/`AiGuideCapture`/`UploadAnalysis`/`ResultReveal`/`DashboardReview`／`PhoneWelcome`/`PhoneCapture`/`PhoneConfirm`/`PhoneUpload`/`PhoneResult`），方便單獨檢視/調整某一頁而不用每次都從頭播整支影片。`Root.tsx` 裡用共用的 `buildFullVideo()` factory 組裝這兩支影片，不是各自複製一份組裝邏輯。

`DashboardReview.tsx`（13.5 秒）是後台審核場景，素材來自使用者提供的真實後台儀表板截圖（`demo/all1/*.png`，另一位成員架設，不在這個 repo 裡，只能靠截圖還原，沒有原始碼可讀）。精選重點元素動態化（統計卡數字跳動、風險比例橫條填滿、案件複核卡片+核准按鈕），不是逐像素還原截圖版面，延續第一支影片自己的深色風格。案件資料（車牌 `ABC-1234`、刮傷/凹痕座標）直接沿用 `InputPlate.tsx`／`ResultReveal.tsx` 同一份，三個地方（`ResultReveal`/`PhoneResult`/`DashboardReview`）保持同一台車、同一組車損結果。

`CrossFade.tsx` 的轉場長度拆成 `introFrames`／`outroFrames` 兩個獨立參數（原本共用一個 `transitionFrames`），`Root.tsx` 的 `SceneConfig` 可以針對單一場景覆寫其中一邊，只加快/放慢某個交接點的其中一半，不會連帶影響該場景自己另一邊的轉場速度。

背景配樂原始檔 `cinematic-corporate.mp3`（67.56 秒）比片長略短，片尾會提早播完、留一小段安靜。用 ffmpeg 的 `atempo` 濾鏡把整首等比例拉慢（音高不變）延長 1 秒，輸出成 `cinematic-corporate-extended.wav`（68.56 秒，`Root.tsx` 目前接的就是這個檔案）——存成 wav 而不是覆蓋成 mp3，是因為這台機器的 ffmpeg 沒有 `libmp3lame`，只能用內建的 `mp3_mf` 編碼器，寫出來的 mp3 檔頭部時長資訊不準，wav 是無損 PCM 才能保證時長正確。原始 `cinematic-corporate.mp3` 保留未動，只是目前沒有場景在用它。

## 專案結構

```
demo/
├── src/
│   ├── Root.tsx                 # 註冊所有 composition；SCENES＝第一支影片場景列表，
│   │                             # SCENES_V2＝第二支影片場景列表，buildFullVideo() 共用組裝
│   ├── index.ts                 # registerRoot 進入點
│   ├── theme.ts                 # COLORS＝深色主題（延伸自 web/src/index.css 深色變數，
│   │                             # 給第一支影片跟兩支影片共用的背景/標題文字用）；
│   │                             # UI_LIGHT＝亮色主題（延伸自 web/src/index.css 亮色變數，
│   │                             # 給第二支影片手機畫面內容、以及第一支影片 InputPlate 的
│   │                             # 「輸入車牌」卡片用）；還有 Noto Sans TC 字體載入＋字重
│   ├── components/
│   │   ├── SceneBackground.tsx  # 每頁共用的深色背景＋緩慢流動藍色光斑（兩支影片共用）
│   │   ├── CrossFade.tsx        # 場景交接轉場（opacity+scale+motion blur push），兩支影片共用
│   │   ├── PhoneFrame.tsx       # 第二支影片專用：可重用的手機外殼（瀏海/Home Indicator/
│   │   │                         # 亮色螢幕內容區），380x820 置中在 1920x1080 畫布
│   │   └── PhoneSceneLayout.tsx # 第二支影片專用：左欄標題/副標+技術説明佔位、右欄放大手機
│   │                             # mockup 的共用左右分割版面，5 個 Phone* 場景共用
│   ├── lib/
│   │   ├── anim.ts              # 共用動畫小工具：EASE、fadeUp()、slideIn()
│   │   ├── carAngles.ts         # 四角度共用設定：POSITIONS/LABELS、GUIDE_BOXES 座標
│   │   └── handoff.ts           # 第一支影片 UploadAnalysis→ResultReveal 交接用的重疊幀數常數
│   └── scenes/
│       ├── Cover.tsx            # 封面（兩支影片共用同一個開場）
│       ├── InputPlate.tsx       # 第一支 Page 2｜輸入車牌
│       ├── AiGuideCapture.tsx   # 第一支 Page 3｜AI 引導拍照
│       ├── UploadAnalysis.tsx   # 第一支 Page 4｜照片上傳分析
│       ├── ResultReveal.tsx     # 第一支 Page 5｜辨識結果輸出
│       ├── DashboardReview.tsx  # 第一支 Page 6｜後台審核（精選還原真實後台儀表板截圖重點元素）
│       ├── Calibration.tsx      # 座標校正工具（非正式影片內容）
│       ├── PhoneWelcome.tsx     # 第二支 Page 1｜首頁輸入車輛資訊（還原 WelcomePage）
│       ├── PhoneCapture.tsx     # 第二支 Page 2｜AI 引導拍攝（還原 CameraCapture 即時取景）
│       ├── PhoneConfirm.tsx     # 第二支 Page 3｜確認照片/重拍（真實 App 有、第一支影片沒有）
│       ├── PhoneUpload.tsx      # 第二支 Page 4｜上傳中/AI 分析中
│       └── PhoneResult.tsx      # 第二支 Page 5｜檢測結果（還原 ResultPage）
└── public/
    ├── car-angles/              # 四角度車輛去背照（去背+補陰影，當「即時相機取景」畫面用）
    ├── car-photos-raw/          # 四角度車輛原圖（含背景，當「已拍好的照片」畫面用，
    │                             # 例如 UploadAnalysis 飛行照片卡、PhoneConfirm/PhoneResult 縮圖、
    │                             # DashboardReview 案件複核卡片的照片）
    ├── car-models/              # 去識別化的示範車款圖（generic-sedan.png），首頁畫面用
    └── audio/                   # cinematic-corporate.mp3（原始檔，目前沒有場景在用）／
                                  # cinematic-corporate-extended.wav（延長 1 秒版，FullVideo 實際在用）
```

`demo/all1/*.png`（repo 根目錄外的 `demo/` 底下，不在 `src`/`public` 裡）是使用者提供的真實後台儀表板截圖，純參考素材，`DashboardReview.tsx` 沒有直接載入這幾張圖，只是拿裡面的文案/資料結構重新設計成深色風格。

## 兩支影片的關鍵差異（給之後接手的人快速判斷用）

|  | 第一支（`FullVideo`） | 第二支（`PhoneWalkthrough`） |
|---|---|---|
| 畫布 | 橫式，內容鋪滿全畫面 | 橫式，中央手機外殼 mockup |
| 視覺風格 | 深色科技風、重新詮釋簡化過 | 亮色主題、忠實還原真實 App 畫面 |
| 場景檔名慣例 | 無前綴（`Cover`/`InputPlate`/…） | `Phone` 開頭（`PhoneWelcome`/`PhoneCapture`/…） |
| 涵蓋範圍 | 輸入車牌→引導拍照→上傳分析→結果→後台審核 | 多了「確認照片/重拍」這個真實 App 有的畫面 |

兩支影片用同一組車損判定結果（前車頭左側：刮傷+凹痕各一處、高風險），維持「同一次拍攝」的一致性。

## 已知的校正細節（給之後接手的人參考，避免重踩同一個坑）

`AiGuideCapture.tsx`／`PhoneCapture.tsx` 這兩個場景的車輪/車牌引導框座標都是用 `Calibration.tsx` 校正出來的（`lib/carAngles.ts` 的 `GUIDE_BOXES`，純 `width:100%,height:100%,objectFit:'cover'`，沒有額外縮放）。這兩個場景的取景畫面**都必須**用一模一樣的 crop 方式（不能疊加 overscan/zoom 去遮擋圖片邊緣的透明留白），不然框的座標就會跟實際車輪/車牌位置對不上——兩邊都曾經因為疊加了縮放而跑掉、之後改回純 cover 才修正，如果之後又想加 overscan 遮留白，要連 `GUIDE_BOXES` 一起重新校正，不能只改其中一邊。

## 尚未進行

- 兩支影片都尚未在真實裝置/實際輸出的 mp4 上做過最終畫質與時長驗收（目前都只在 Remotion Studio 預覽/`remotion still` 截圖確認過）
- 第二支影片的場景交接目前都是預設的 push 轉場，還沒有像第一支影片 Page4/5 那種時間軸重疊合併的處理（範圍當時刻意收斂，之後如果要做可以參考 `lib/handoff.ts` 的做法）
- `DashboardReview.tsx` 只精選還原了統計卡/風險比例/單一案件複核卡片這幾個重點元素，截圖裡的側邊欄、搜尋/篩選、案件列表、信心分數閾值滑桿等其餘畫面內容目前都沒有做
- 背景配樂 `cinematic-corporate-extended.wav` 只做了時長延長，沒有實際試聽確認銜接處/音質（沒有辦法聽音檔，只能保證秒數對）
