import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { COLORS, FONT_FAMILY, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { EASE, fadeUp, slideIn } from '../lib/anim'
import { HANDOFF_OVERLAP_FRAMES } from '../lib/handoff'

// Page 5｜辨識結果輸出（對應完整影片的 50~60 秒，這裡做成獨立的 10 秒 composition）。
// 單張放大的車身照片——照片本身一開始就是乾淨無框的（本來就同一張圖），掃描線
// 掃過去、偵測框直接在同一張照片上「燒」出來，讓「AI 從無到有標出車損」這件事
// 本身變成畫面的主要張力。資訊卡片是掃描完成後的「結果揭曉」，從右側滑入作為
// 整段的收尾。
const TITLE_START = 0
const TITLE_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

// 這個場景現在跟 UploadAnalysis 的尾端真的時間軸重疊 HANDOFF_OVERLAP_FRAMES
// （見 Root.tsx 用 offset 讓這個 composition 提早開始播放）：主照片從 frame 0
// 就開始「長出來」，花完整個重疊窗口長到完整大小，時間點正好對上 UploadAnalysis
// 那邊雲朵縮小淡出到消失的瞬間，兩邊內容互相接手，不需要經過轉場黑場/模糊。
const PHOTO_START = 0
const PHOTO_DURATION = HANDOFF_OVERLAP_FRAMES

// 主照片長出來的起點位置/尺寸，要對上 UploadAnalysis 那邊雲朵的畫面位置——
// 雲朵是用 AbsoluteFill 的 alignItems/justifyContent:center 置中，剛好落在
// 整個畫面的正中央（960,540 @ 1920x1080），所以這裡也用畫面正中央當起點。
// 主照片堆疊最終停留的位置是這個場景自己版面（下面 flex row）算出來的、偏
// 左上一點的位置，不是畫面正中央，所以額外疊一個「進場位移」：一開始從畫面
// 正中央出發（跟雲朵同一個位置），隨著長大過程慢慢滑回它自己版面該待的位置，
// 兩個動作（縮放+位移）一起在 PHOTO_DURATION 內完成。這兩個數字是量出來的
// 近似值（螢幕正中央 - 版面自然停留位置），不是精確算出來的，有需要可以再微調。
const ENTRY_OFFSET_X = 309
const ENTRY_OFFSET_Y = -125
const ENTRY_SCALE = 0.22

const SCAN_START = PHOTO_START + PHOTO_DURATION + 12 // 67
// 拉長到 100 幀（原本 60）——框展開的快慢是直接照掃描線掃過框的實際時間算的
// （見下面 reveal 的計算），掃描線太快，框本身矮的話幾幀就展開完，看不出來是
// 被掃出來的。試過另一種做法（掃描線速度不變，框固定用一個時間展開），但這樣
// 框展開完的時候掃描線往往已經掃到別的地方去了，畫面看起來反而是兩個各自獨立
// 的動作、對不太起來，所以改回目前這個「完全跟掃描線同步」的做法，只是把整體
// 掃描拉慢，讓每個框的展開時間自然變長。
const SCAN_DURATION = 100

const INFO_START = SCAN_START + SCAN_DURATION + 15 // 142
const ITEM_STAGGER = 18

// 掃描一結束，連接線就「通電」亮起，把分析結果從照片送到右側結論卡片，
// 資訊卡片緊接著在連接線送達後滑入。
const LIT_START = SCAN_START + SCAN_DURATION
const LIT_DURATION = 15

const PHOTO_WIDTH = 760
const CARD_WIDTH = 460
const CONNECTOR_WIDTH = 130

// 主要分析的是 front_left，但拍攝當下其實有四個角度都拍了——這裡在主照片
// 後面疊上其餘三張，做出「一疊照片」的感覺。三張全部往同一個方向（右下）
// 疊出去、旋轉角度也同方向遞增，看起來才會像一疊整齊的照片微微展開，而不是
// 東一張西一張的散亂效果；越後面那張偏移量越大，離主照片最近的那張偏移最小。
const STACK_PHOTOS: { pos: string; rotate: number; x: number; y: number }[] = [
  { pos: 'rear_left', rotate: 6, x: 24, y: 22 },
  { pos: 'rear_right', rotate: 4, x: 16, y: 15 },
  { pos: 'front_right', rotate: 2, x: 8, y: 8 },
]

interface DetectionBox {
  label: string
  color: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

// 座標抓在 car-photos-raw/front_left.png 這張照片上：引擎蓋（Scratch）、
// 前車門（Dent），兩個框彼此不重疊，分散在車身兩個不同區域。
const BOXES: DetectionBox[] = [
  { label: 'Scratch', color: COLORS.warning, xPercent: 27, yPercent: 42, widthPercent: 26, heightPercent: 15 },
  { label: 'Dent', color: COLORS.danger, xPercent: 58, yPercent: 48, widthPercent: 25, heightPercent: 22 },
]

// 風險等級徽章照真實 App（ResultPage.tsx）現有的邏輯：判斷方式照抄
// functions/src/riskRules.ts 的 computeRiskLevel——只要出現 dent 就是高風險
// （優先序高於 scratch），這裡 BOXES 裡有一個 Dent，所以風險等級是「高風險」。
const RISK_LEVEL_LABEL = '高風險'
const CHECKLIST = ['共辨識 2 處異常', '已建立巡檢報告']

// 標籤擺在框「外面」、框的上方（top:-30，見下面 label 的 style），畫面上的
// 實際高度比框本身還高一截——掃描線由上往下掃，會先經過標籤那一行，才會到
// 框的上緣。之前標籤跟框共用同一個 reveal（都用框自己的 yPercent~yPercent+
// heightPercent 這個區間），結果掃描線明明已經掃過標籤那一行了，標籤卻要等
// 掃描線進入「框」的範圍才開始印，看起來是慢半拍才冒出來。改成標籤自己有
// 一個更早、更窄的視窗（LABEL_WINDOW_PERCENT，落在框的正上方、框開始展開
// 之前），標籤印完的時間點剛好接在框開始展開之前，掃描線經過標籤那一行的
// 當下就同步印出來，不是等掃描線掃過框才冒出來。
const LABEL_WINDOW_PERCENT = 5

function DetectionBoxOverlay({ box, scanY }: { box: DetectionBox; scanY: number }) {
  // 框本身：掃描線目前的高度落在框自己的 yPercent~yPercent+heightPercent 之間
  // 才開始展開，跟掃描線視覺上「掃到框」同步。
  const reveal = interpolate(scanY, [box.yPercent, box.yPercent + box.heightPercent], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  // 標籤：視窗比框早一截、剛好接在框開始展開之前結束，對應標籤實際在畫面上
  // 的位置（框的正上方）先被掃描線經過。
  const labelReveal = interpolate(scanY, [box.yPercent - LABEL_WINDOW_PERCENT, box.yPercent], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <div
      style={{
        position: 'absolute',
        left: `${box.xPercent}%`,
        top: `${box.yPercent}%`,
        width: `${box.widthPercent}%`,
        height: `${box.heightPercent}%`,
      }}
    >
      {/* clip-path 只套在這一層（跟外層 div 邊界完全重疊），標籤是外層的另一個
          子元素、擺在框「外面」（top:-24），不會被 clip-path 一起裁掉。 */}
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)` }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: `7px solid ${box.color}`,
            borderRadius: 4,
            boxShadow: `0 0 10px 1px ${box.color}`,
          }}
        />
      </div>
      <span
        style={{
          position: 'absolute',
          top: -30,
          left: 0,
          fontFamily: FONT_FAMILY,
          fontWeight: WEIGHT.subtitle,
          fontSize: 17,
          color: '#fff',
          background: box.color,
          padding: '3px 10px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          clipPath: `inset(0 0 ${(1 - labelReveal) * 100}% 0)`,
        }}
      >
        {box.label}
      </span>
    </div>
  )
}

function CheckBadge() {
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: COLORS.success,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{ color: COLORS.bgDeep, fontSize: 16, fontWeight: 900, lineHeight: 1 }}>✓</span>
    </div>
  )
}

// 照片跟結論卡片之間的連接線——柔光光束風格：一條模糊的漸層光柱，兩端透明、
// 中段最亮，沒有節點也沒有跑動的光點。掃描完成前只是很淡的引導光，掃描一結束
// 就整體淡入變亮，呼應「分析結果送到結論卡片」這個時間點，但視覺上單純是
// 光的強弱變化，不是任何東西沿線移動。
function ConnectorLine({ frame, gateOpacity }: { frame: number; gateOpacity: number }) {
  const litProgress = interpolate(frame, [LIT_START, LIT_START + LIT_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })
  const beamOpacity = gateOpacity * (0.2 + 0.8 * litProgress)

  return (
    <div style={{ width: CONNECTOR_WIDTH, height: 70, display: 'flex', alignItems: 'center', flexShrink: 0, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to right, transparent, ${COLORS.glowMid}, transparent)`,
          filter: 'blur(14px)',
          opacity: beamOpacity * 0.8,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 14,
          transform: 'translateY(-50%)',
          background: `linear-gradient(to right, transparent, ${COLORS.glowBright}, transparent)`,
          filter: 'blur(4px)',
          opacity: beamOpacity,
        }}
      />
    </div>
  )
}

// showBackground=false 是給串成 FullVideo 時用的（見 Root.tsx）：整支影片共用同
// 一個連續播放的 SceneBackground，場景切換時背景不會跟著淡出/淡入或重置，只有
// 前景內容在轉場；個別獨立預覽這個 composition 時維持預設 true，自己畫自己的背景。
export const ResultReveal = ({ showBackground = true }: { showBackground?: boolean }) => {
  const frame = useCurrentFrame()

  const title = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const subtitle = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION)

  // 主照片從 UploadAnalysis 雲朵縮小消失的同一個位置「長出來」（見上面
  // ENTRY_OFFSET_X/Y/ENTRY_SCALE 的說明）：一開始是雲朵那麼小、在畫面正中央，
  // 隨 photoProgress 同時放大到完整尺寸、位移歸零回到版面自然停留的位置。
  const photoProgress = interpolate(frame, [PHOTO_START, PHOTO_START + PHOTO_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })
  const photoScale = ENTRY_SCALE + (1 - ENTRY_SCALE) * photoProgress
  const photoEntryX = ENTRY_OFFSET_X * (1 - photoProgress)
  const photoEntryY = ENTRY_OFFSET_Y * (1 - photoProgress)

  // 掃描線改成等速（不套 easing），這樣才能直接用「掃描線目前掃到的高度」去
  // 反推每個框該在哪一幀出現，讓框一定是掃描線先掃過那個位置之後才冒出來，
  // 而不是掃描線跟框同時或框先出現。
  const scanY = interpolate(frame, [SCAN_START, SCAN_START + SCAN_DURATION], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scanOpacity = interpolate(
    frame,
    [SCAN_START, SCAN_START + 10, SCAN_START + SCAN_DURATION - 10, SCAN_START + SCAN_DURATION],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const infoHeader = slideIn(frame, INFO_START, 25, 90)

  return (
    <AbsoluteFill>
      {showBackground && <SceneBackground />}

      <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 64,
            fontWeight: WEIGHT.title,
            color: COLORS.textH,
            letterSpacing: '0.02em',
            opacity: title.opacity,
            transform: `translateY(${title.translateY}px)`,
          }}
        >
          辨識結果輸出
        </div>
        <div
          style={{
            marginTop: 16,
            fontFamily: FONT_FAMILY,
            fontSize: 28,
            fontWeight: WEIGHT.subtitle,
            color: COLORS.accent,
            letterSpacing: '0.01em',
            opacity: subtitle.opacity,
            transform: `translateY(${subtitle.translateY}px)`,
          }}
        >
          AI 自動標示車體異常並產出巡檢紀錄，提升管理效率
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          {/* 照片改成印刷相片的樣子（白色相紙邊框＋角落說明文字），而不是單純一張
              貼著色框的圖片，讓它讀起來真的是「一張拍出來的照片」；後面再疊三張
              其餘角度的照片，做出「一整疊四張照片」的層次感。 */}
          <div
            style={{
              position: 'relative',
              opacity: photoProgress,
              transform: `translate(${photoEntryX}px, ${photoEntryY}px) scale(${photoScale})`,
            }}
          >
            {STACK_PHOTOS.map((s, i) => (
              <div
                key={s.pos}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  zIndex: i + 1,
                  transform: `rotate(${s.rotate}deg) translate(${s.x}px, ${s.y}px)`,
                }}
              >
                <div
                  style={{
                    background: '#fbfaf6',
                    padding: '18px 18px 30px',
                    borderRadius: 6,
                    boxShadow: '0 16px 32px rgba(0,0,0,0.45)',
                  }}
                >
                  <div style={{ width: PHOTO_WIDTH, overflow: 'hidden', borderRadius: 2 }}>
                    <Img
                      src={staticFile(`car-photos-raw/${s.pos}.png`)}
                      style={{
                        display: 'block',
                        width: '100%',
                        height: 'auto',
                        border: '1px solid rgba(0,0,0,0.35)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}

            <div style={{ position: 'relative', zIndex: 10 }}>
              <div
                style={{
                  background: '#fbfaf6',
                  padding: '18px 18px 30px',
                  borderRadius: 6,
                  boxShadow: `0 30px 60px rgba(0,0,0,0.55), 0 0 36px ${COLORS.glowMid}55`,
                }}
              >
                <div style={{ position: 'relative', width: PHOTO_WIDTH, overflow: 'hidden', borderRadius: 2 }}>
                  <Img
                    src={staticFile('car-photos-raw/front_left.png')}
                    style={{
                      display: 'block',
                      width: '100%',
                      height: 'auto',
                      border: '1px solid rgba(0,0,0,0.35)',
                      boxSizing: 'border-box',
                    }}
                  />

                  {BOXES.map((box) => (
                    // 框跟著掃描線目前的高度（scanY）即時展開，不是等掃描線掃過去
                    // 之後才憑空彈出來——scanY 掃到框的上緣時 reveal=0（還沒開始畫），
                    // 掃到下緣時 reveal=1（整個框都畫完了），中間是連續的展開過程，
                    // 完全跟掃描線目前的位置同步（不會有框已經展開完、掃描線卻還在
                    // 別的地方的錯位感）；展開夠不夠慢是靠上面 SCAN_DURATION 拉長，
                    // 不是靠框自己另外訂一個跟掃描線脫鉤的展開時間。標籤自己的
                    // reveal 視窗見 DetectionBoxOverlay 內部（比框早一截）。
                    <DetectionBoxOverlay key={box.label} box={box} scanY={scanY} />
                  ))}

                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: `${scanY}%`,
                      height: 3,
                      background: COLORS.glowBright,
                      boxShadow: `0 0 16px 4px ${COLORS.glowBright}`,
                      opacity: scanOpacity,
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 14,
                    textAlign: 'center',
                    fontFamily: FONT_FAMILY,
                    fontWeight: WEIGHT.subtitle,
                    fontSize: 17,
                    color: '#8a8a8f',
                    letterSpacing: '0.04em',
                  }}
                >
                  車頭左側・AI Result
                </div>
              </div>
            </div>
          </div>

          <ConnectorLine frame={frame} gateOpacity={photoProgress} />

          {/* 資訊卡片：掃描完成後才揭曉，是整段的結論，而不是跟照片同時出現的說明欄 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 24,
              width: CARD_WIDTH,
              background: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 20,
              padding: '40px 44px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              boxSizing: 'border-box',
              opacity: infoHeader.opacity,
              transform: infoHeader.transform,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: FONT_FAMILY, fontSize: 38, fontWeight: WEIGHT.title, color: COLORS.textH }}>
                車損分析完成
              </span>
              <span
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 20,
                  fontWeight: WEIGHT.subtitle,
                  color: COLORS.danger,
                  background: 'rgba(201,138,122,0.16)',
                  padding: '6px 16px',
                  borderRadius: 999,
                }}
              >
                {RISK_LEVEL_LABEL}
              </span>
            </div>

            {CHECKLIST.map((text, i) => {
              const item = slideIn(frame, INFO_START + 22 + i * ITEM_STAGGER, 20, 40)
              return (
                <div
                  key={text}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    opacity: item.opacity,
                    transform: item.transform,
                  }}
                >
                  <CheckBadge />
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 30, fontWeight: WEIGHT.body, color: COLORS.text }}>
                    {text}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
