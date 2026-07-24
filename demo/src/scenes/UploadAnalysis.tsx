import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { COLORS, FONT_FAMILY, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { EASE, fadeUp } from '../lib/anim'
import { POSITIONS } from '../lib/carAngles'
import { HANDOFF_OVERLAP_FRAMES } from '../lib/handoff'

// Page 4｜照片上傳分析（對應完整影片的 40~50 秒，這裡做成獨立的 10 秒 composition）。
// 節奏：標題淡入 → 雲朵圖示淡入放大 → 四張剛拍好的照片依序飛向雲朵、縮小淡出 →
// 下方文字「照片上傳中…」在飛行期間顯示，最後一張抵達後淡出切換成「AI 辨識車損中…」
// 同時雲朵旁出現一圈持續旋轉的掃描環，暗示分析正在進行。刻意保持簡單（雲朵＋
// 四張照片＋一行文字），不塞更多裝飾元素，避免畫面資訊過於擁擠。
const TITLE_START = 0
const TITLE_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

const CLOUD_START = 15
const CLOUD_DURATION = 30

const FLIGHT_START = 45
const FLIGHT_DURATION = 70
const FLIGHT_STAGGER = 18
const LAST_FLIGHT_END = FLIGHT_START + (POSITIONS.length - 1) * FLIGHT_STAGGER + FLIGHT_DURATION // 169

const STATUS_SWITCH = LAST_FLIGHT_END + 10 // 179：最後一張抵達後稍停再切換文字
const STATUS_FADE = 15

// 這個 composition 的總長需跟 Root.tsx 的 FPS*10 一致（見該檔案 SCENES 設定），
// 這裡沒辦法用 useVideoConfig() 讀出來（那個讀到的是整支 FullVideo 的總長，
// 不是這個場景自己在 Series.Sequence 裡的長度），所以直接寫死。
const SCENE_DURATION = 300

// 跟 ResultReveal 交接不再是切到下一頁才淡出/淡入，而是兩段時間軸真的重疊
// HANDOFF_OVERLAP_FRAMES（見 Root.tsx 用 offset 讓 ResultReveal 提早開始）：
// 這裡尾端只留雲朵（連同分析中的掃描環）原地縮小淡出，其餘裝飾（標題/副標題/
// 狀態文字/資料傳輸線）提早淡出清空，好讓 ResultReveal 開頭「長出來」的主照片
// 在同一個畫面位置接手，不會有兩邊文字/裝飾互相打架的雜訊。
const HANDOFF_START = SCENE_DURATION - HANDOFF_OVERLAP_FRAMES
const OTHER_FADE_OUT_DURATION = Math.round(HANDOFF_OVERLAP_FRAMES / 2)

// 四張照片起始位置（畫面百分比），對應四個角落，往中央的雲朵飛去。上排 y 從
// 30 調到 40、下排從 74 調到 70——原本上排會跟標題下面的副標題文字重疊、
// 下排太貼近畫面最下方的「照片上傳中…」狀態文字，兩邊都往中間靠一點避開。
const START_POSITIONS = [
  { x: 24, y: 40 },
  { x: 76, y: 40 },
  { x: 24, y: 70 },
  { x: 76, y: 70 },
]

// 拍立得的招牌特徵是「下邊框特別寬」（相紙下緣要留白手持/寫字），這裡用
// padding 而不是 border 做出這個不對稱留白；每張再帶一點點固定角度的傾斜
// （不用 Math.random，這裡直接寫死每個角度各自的傾斜度），營造「隨手放著的
// 實體照片」的感覺，而不是四張完全對齊、機械感的縮圖。
const POLAROID_ROTATIONS = [-6, 5, -4, 7]

// 背景的資料傳輸線條——營造「AI 運算/資料上傳中」的氛圍，跟中間往雲朵飛的照片
// 呼應同一個方向（由下往上）。用 frame 算週期性位移（不用 Math.random，Remotion
// 每一幀都要是純函式輸出，見專案慣例）。數量拉更多讓背景看起來一直有資料在跑，
// 但亮度刻意壓低、不加任何實心亮點——維持「背景角落安靜流動」的氛圍感，
// 不會變成畫面裡搶眼的裝飾物。
const STREAM_COUNT = 22
const STREAM_CYCLE = 110

function DataStreamLines() {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {Array.from({ length: STREAM_COUNT }).map((_, i) => {
        const xPercent = 4 + i * (92 / (STREAM_COUNT - 1))
        const cycle = (frame + i * 23) % STREAM_CYCLE
        const yPercent = 116 - (cycle / STREAM_CYCLE) * 138
        const edgeFade = interpolate(cycle, [0, 12, STREAM_CYCLE - 12, STREAM_CYCLE], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        // 每三條裡挑一條當作「粗一點、亮一點」的主線，其餘是陪襯的細線，
        // 拉出層次感而不是全部線條長得一樣。
        const isPrimary = i % 3 === 0
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${xPercent}%`,
              top: `${yPercent}%`,
              width: isPrimary ? 2.5 : 1.5,
              height: isPrimary ? 130 : 90,
              background: `linear-gradient(to bottom, transparent, ${COLORS.glowBright}, transparent)`,
              opacity: (isPrimary ? 0.4 : 0.22) * edgeFade,
            }}
          />
        )
      })}
    </AbsoluteFill>
  )
}

function CloudIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 64 40" fill="none">
      <path
        d="M18 32c-7 0-12-5-12-11 0-5.5 4-10 9.5-10.8C17 5 22 1 28 1c6.8 0 12.4 5 13.3 11.4C47.6 13 52 17.7 52 23c0 5-4 9-9 9H18z"
        fill={color}
      />
    </svg>
  )
}

// showBackground=false 是給串成 FullVideo 時用的（見 Root.tsx）：整支影片共用同
// 一個連續播放的 SceneBackground，場景切換時背景不會跟著淡出/淡入或重置，只有
// 前景內容在轉場；個別獨立預覽這個 composition 時維持預設 true，自己畫自己的背景。
export const UploadAnalysis = ({ showBackground = true }: { showBackground?: boolean }) => {
  const frame = useCurrentFrame()

  const title = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const subtitle = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION)

  const cloudProgress = interpolate(frame, [CLOUD_START, CLOUD_START + CLOUD_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })

  const statusUploadOpacity = interpolate(
    frame,
    [FLIGHT_START, FLIGHT_START + 10, STATUS_SWITCH, STATUS_SWITCH + STATUS_FADE],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
  const statusAnalyzingOpacity = interpolate(frame, [STATUS_SWITCH, STATUS_SWITCH + STATUS_FADE], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const spinnerRotation = frame * 6

  // 標題/副標題/狀態文字/背景資料線這些「裝飾」提早淡出清空（OTHER_FADE_OUT_DURATION
  // 只佔重疊窗口的一半），剩下的一半只留雲朵繼續縮小淡出，跟 ResultReveal 開頭
  // 長出來的主照片交接時，畫面上不會有兩邊文字同時打架的雜訊。
  const otherFadeOut = interpolate(frame, [HANDOFF_START, HANDOFF_START + OTHER_FADE_OUT_DURATION], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // 雲朵（連同分析中的掃描環）在整個重疊窗口原地縮小淡出，結束的瞬間剛好對上
  // ResultReveal 主照片長到完整大小的那一刻（見該檔案的 PHOTO_START/PHOTO_DURATION
  // 也是用同一個 HANDOFF_OVERLAP_FRAMES），兩邊時間軸完全對齊。
  const handoffExit = interpolate(frame, [HANDOFF_START, SCENE_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })
  const cloudExitScale = 1 - handoffExit
  const cloudExitOpacity = 1 - handoffExit

  return (
    <AbsoluteFill>
      {showBackground && <SceneBackground />}
      <div style={{ opacity: otherFadeOut }}>
        <DataStreamLines />
      </div>

      <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 90 }}>
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 64,
            fontWeight: WEIGHT.title,
            color: COLORS.textH,
            letterSpacing: '0.02em',
            opacity: title.opacity * otherFadeOut,
            transform: `translateY(${title.translateY}px)`,
          }}
        >
          AI 車況分析
        </div>
        <div
          style={{
            marginTop: 16,
            fontFamily: FONT_FAMILY,
            fontSize: 28,
            fontWeight: WEIGHT.subtitle,
            color: COLORS.accent,
            letterSpacing: '0.01em',
            opacity: subtitle.opacity * otherFadeOut,
            transform: `translateY(${subtitle.translateY}px)`,
          }}
        >
          影像上傳雲端，AI 進行車損辨識與異常比對，減少人工核對成本
        </div>

        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              position: 'relative',
              width: 420,
              height: 420,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: cloudExitOpacity,
              transform: `scale(${cloudExitScale})`,
            }}
          >
            {/* 分析中的旋轉掃描環，只在切換到「AI 辨識車損中…」後才出現 */}
            <svg
              width={420}
              height={420}
              style={{ position: 'absolute', opacity: statusAnalyzingOpacity, transform: `rotate(${spinnerRotation}deg)` }}
              viewBox="0 0 420 420"
            >
              <circle
                cx={210}
                cy={210}
                r={185}
                stroke={COLORS.accent}
                strokeWidth={6}
                fill="none"
                strokeDasharray="260 900"
                strokeLinecap="round"
                opacity={0.75}
              />
            </svg>
            <div
              style={{
                opacity: cloudProgress,
                transform: `scale(${0.7 + 0.3 * cloudProgress})`,
                filter: `drop-shadow(0 0 40px ${COLORS.glowMid})`,
              }}
            >
              <CloudIcon size={240} color={COLORS.accent} />
            </div>
          </div>

          {POSITIONS.map((pos, i) => {
            const start = START_POSITIONS[i]
            const flightStart = FLIGHT_START + i * FLIGHT_STAGGER
            const t = interpolate(frame, [flightStart, flightStart + FLIGHT_DURATION], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: EASE,
            })
            const x = start.x + (50 - start.x) * t
            const y = start.y + (50 - start.y) * t
            const scale = interpolate(t, [0, 1], [1, 0.15])
            const opacity = interpolate(t, [0, 0.85, 1], [1, 1, 0])
            // 飛行中段速度最快、起飛/抵達瞬間速度趨近於 0（呼應 EASE 的 ease-in-out
            // 曲線），模糊量跟著同一個節奏走：中段最模糊，起飛跟抵達雲朵那一刻都是
            // 清晰的，看起來才會像「真的在快速移動」而不是全程均勻模糊。
            const flightBlur = 9 * 4 * t * (1 - t)
            // 拍立得相片卡取代直接飄浮的去背車輛圖——單獨一台去背車浮在畫面上看
            // 起來像「送 4 台車進去」，而不是「上傳剛拍好的 4 張照片」；帶下緣留白
            // 的相紙造型 + 隨手放置的傾斜角度，才會讓人一眼認出這是實體照片。
            // 內容用完整原圖（car-photos-raw，含背景、沒有去背)，因為照片本來就該
            // 有背景，去背車反而不像「拍出來的照片」。
            return (
              <div
                key={pos}
                style={{
                  position: 'absolute',
                  left: `${x}%`,
                  top: `${y}%`,
                  width: 260,
                  transform: `translate(-50%, -50%) scale(${scale}) rotate(${POLAROID_ROTATIONS[i]}deg)`,
                  opacity,
                  background: '#fbfaf6',
                  padding: '9px 9px 26px',
                  borderRadius: 2,
                  // 拍立得白邊本身跟深色背景已經有對比，但相紙邊緣跟裡面的照片
                  // 內容常常是接近的淺色調，容易糊在一起，所以額外用一圈清楚的
                  // 深色描邊框住照片內容，再用雙層陰影（貼近邊緣的實體陰影＋
                  // 較遠較柔的環境陰影）加強整張相紙浮在畫面上的立體感。
                  // 這裡不能用 CSS box-shadow 屬性——box-shadow 跟 filter: blur()
                  // 同時套在同一個元素上，Chromium 合成時陰影會碎成一段一段的虛線，
                  // 而不是平滑的陰影（飛行時 flightBlur 一旦不是 0 就會出現）。改用
                  // filter: drop-shadow() 把陰影跟模糊都放進同一條 filter pipeline，
                  // 兩者是一起算的，就不會有這個合成問題。
                  filter: `blur(${flightBlur}px) drop-shadow(0 2px 6px rgba(0,0,0,0.35)) drop-shadow(0 16px 30px rgba(0,0,0,0.6))`,
                }}
              >
                <Img
                  src={staticFile(`car-photos-raw/${pos}.png`)}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    border: '1px solid rgba(0,0,0,0.35)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )
          })}
        </AbsoluteFill>

        <div
          style={{
            position: 'absolute',
            bottom: 110,
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            opacity: otherFadeOut,
          }}
        >
          <div style={{ position: 'relative' }}>
            <p
              style={{
                position: 'absolute',
                inset: 0,
                margin: 0,
                fontFamily: FONT_FAMILY,
                fontSize: 42,
                fontWeight: WEIGHT.subtitle,
                color: COLORS.textH,
                textShadow: `0 0 20px ${COLORS.glowMid}`,
                opacity: statusUploadOpacity,
                whiteSpace: 'nowrap',
              }}
            >
              照片上傳中…
            </p>
            <p
              style={{
                margin: 0,
                fontFamily: FONT_FAMILY,
                fontSize: 42,
                fontWeight: WEIGHT.subtitle,
                color: COLORS.textH,
                textShadow: `0 0 20px ${COLORS.glowMid}`,
                opacity: statusAnalyzingOpacity,
                whiteSpace: 'nowrap',
              }}
            >
              AI 辨識車損中…
            </p>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
