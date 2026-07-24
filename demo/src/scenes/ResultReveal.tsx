import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { COLORS, FONT_FAMILY, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { EASE, fadeUp, slideIn } from '../lib/anim'

// Page 5｜辨識結果輸出（對應完整影片的 50~60 秒，這裡做成獨立的 10 秒 composition）。
// 單張放大的車身照片——照片本身一開始就是乾淨無框的（本來就同一張圖），掃描線
// 掃過去、偵測框直接在同一張照片上「燒」出來，讓「AI 從無到有標出車損」這件事
// 本身變成畫面的主要張力。資訊卡片是掃描完成後的「結果揭曉」，從右側滑入作為
// 整段的收尾。
const TITLE_START = 0
const TITLE_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

const PHOTO_START = 15
const PHOTO_DURATION = 40

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

// reveal 是 0~1，直接對應「掃描線目前掃到框的哪個高度」（見呼叫端用 scanY
// 算出來的 revealProgress），不是跟時間掛鉤的淡入/彈出。用 clip-path 從下緣
// 往上收，框本身才會像被掃描線由上往下「畫」出來一樣，隨掃描線位置同步展開；
// 標籤文字用同一個方向（由上往下）的 clip-path，而不是單純 opacity 淡入或
// 左右方向的 wipe——掃描線本身是由上往下掃過去的，標籤文字也要跟著「由上
// 往下被印出來」才會是同一個動作的延伸（像印表機列印一行字時墨水由上往下
// 逐漸顯影的感覺），兩者同步隨掃描線目前掃到的高度展開。
function DetectionBoxOverlay({ box, reveal }: { box: DetectionBox; reveal: number }) {
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
            border: `4px solid ${box.color}`,
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
          clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)`,
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

  // 大合照登場用「淡入＋輕微放大」，比左右滑入更有「揭曉」的隆重感，
  // 呼應這是整段影片的結論畫面。
  const photoProgress = interpolate(frame, [PHOTO_START, PHOTO_START + PHOTO_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })
  const photoScale = 0.92 + 0.08 * photoProgress

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
              transform: `scale(${photoScale})`,
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

                  {BOXES.map((box) => {
                    // 框跟著掃描線目前的高度（scanY）即時展開，不是等掃描線掃過去
                    // 之後才憑空彈出來——scanY 掃到框的上緣時 reveal=0（還沒開始畫），
                    // 掃到下緣時 reveal=1（整個框都畫完了），中間是連續的展開過程，
                    // 完全跟掃描線目前的位置同步（不會有框已經展開完、掃描線卻還在
                    // 別的地方的錯位感）；展開夠不夠慢是靠上面 SCAN_DURATION 拉長，
                    // 不是靠框自己另外訂一個跟掃描線脫鉤的展開時間。
                    const reveal = interpolate(scanY, [box.yPercent, box.yPercent + box.heightPercent], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    })
                    return <DetectionBoxOverlay key={box.label} box={box} reveal={reveal} />
                  })}

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
