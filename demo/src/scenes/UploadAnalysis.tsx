import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { COLORS, FONT_FAMILY, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { EASE, fadeUp } from '../lib/anim'
import { POSITIONS } from '../lib/carAngles'

// Page 4｜照片上傳分析（對應完整影片的 40~50 秒，這裡做成獨立的 10 秒 composition）。
// 節奏：標題淡入 → 雲朵圖示淡入放大 → 四張剛拍好的照片依序飛向雲朵、縮小淡出 →
// 下方文字「照片上傳中…」在飛行期間顯示，最後一張抵達後淡出切換成「AI 辨識車損中…」
// 同時雲朵旁出現一圈持續旋轉的掃描環，暗示分析正在進行。刻意保持簡單（雲朵＋
// 四張照片＋一行文字），不塞更多裝飾元素，避免畫面資訊過於擁擠。
const TITLE_START = 0
const TITLE_DURATION = 30

const CLOUD_START = 15
const CLOUD_DURATION = 30

const FLIGHT_START = 45
const FLIGHT_DURATION = 70
const FLIGHT_STAGGER = 18
const LAST_FLIGHT_END = FLIGHT_START + (POSITIONS.length - 1) * FLIGHT_STAGGER + FLIGHT_DURATION // 169

const STATUS_SWITCH = LAST_FLIGHT_END + 10 // 179：最後一張抵達後稍停再切換文字
const STATUS_FADE = 15

// 四張照片起始位置（畫面百分比），對應四個角落，往中央的雲朵飛去。
const START_POSITIONS = [
  { x: 24, y: 30 },
  { x: 76, y: 30 },
  { x: 24, y: 74 },
  { x: 76, y: 74 },
]

// 拍立得的招牌特徵是「下邊框特別寬」（相紙下緣要留白手持/寫字），這裡用
// padding 而不是 border 做出這個不對稱留白；每張再帶一點點固定角度的傾斜
// （不用 Math.random，這裡直接寫死每個角度各自的傾斜度），營造「隨手放著的
// 實體照片」的感覺，而不是四張完全對齊、機械感的縮圖。
const POLAROID_ROTATIONS = [-6, 5, -4, 7]

// 背景的資料傳輸線條——營造「AI 運算/資料上傳中」的氛圍，跟中間往雲朵飛的照片
// 呼應同一個方向（由下往上）。用 frame 算週期性位移（不用 Math.random，Remotion
// 每一幀都要是純函式輸出，見專案慣例），數量刻意壓低（6 條、透明度也低），只是
// 背景氛圍，不會搶過中間主要內容的視覺焦點。
const STREAM_COUNT = 6
const STREAM_CYCLE = 130

function DataStreamLines() {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {Array.from({ length: STREAM_COUNT }).map((_, i) => {
        const xPercent = 8 + i * (84 / (STREAM_COUNT - 1))
        const cycle = (frame + i * 37) % STREAM_CYCLE
        const yPercent = 112 - (cycle / STREAM_CYCLE) * 130
        const edgeFade = interpolate(cycle, [0, 15, STREAM_CYCLE - 15, STREAM_CYCLE], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${xPercent}%`,
              top: `${yPercent}%`,
              width: 2,
              height: 90,
              background: `linear-gradient(to bottom, transparent, ${COLORS.glowBright}, transparent)`,
              opacity: 0.35 * edgeFade,
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

export const UploadAnalysis = () => {
  const frame = useCurrentFrame()

  const title = fadeUp(frame, TITLE_START, TITLE_DURATION)

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

  return (
    <AbsoluteFill>
      <SceneBackground />
      <DataStreamLines />

      <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 90 }}>
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
          照片分析中
        </div>

        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              position: 'relative',
              width: 220,
              height: 220,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* 分析中的旋轉掃描環，只在切換到「AI 辨識車損中…」後才出現 */}
            <svg
              width={220}
              height={220}
              style={{ position: 'absolute', opacity: statusAnalyzingOpacity, transform: `rotate(${spinnerRotation}deg)` }}
              viewBox="0 0 220 220"
            >
              <circle
                cx={110}
                cy={110}
                r={94}
                stroke={COLORS.accent}
                strokeWidth={3}
                fill="none"
                strokeDasharray="130 460"
                strokeLinecap="round"
                opacity={0.75}
              />
            </svg>
            <div
              style={{
                opacity: cloudProgress,
                transform: `scale(${0.7 + 0.3 * cloudProgress})`,
                filter: `drop-shadow(0 0 26px ${COLORS.glowMid})`,
              }}
            >
              <CloudIcon size={120} color={COLORS.accent} />
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
                  width: 168,
                  transform: `translate(-50%, -50%) scale(${scale}) rotate(${POLAROID_ROTATIONS[i]}deg)`,
                  opacity,
                  background: '#fbfaf6',
                  padding: '9px 9px 26px',
                  borderRadius: 2,
                  boxShadow: '0 12px 22px rgba(0,0,0,0.55)',
                }}
              >
                <Img
                  src={staticFile(`car-photos-raw/${pos}.png`)}
                  style={{ display: 'block', width: '100%', height: 'auto' }}
                />
              </div>
            )
          })}
        </AbsoluteFill>

        <div style={{ position: 'absolute', bottom: 110, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative' }}>
            <p
              style={{
                position: 'absolute',
                inset: 0,
                margin: 0,
                fontFamily: FONT_FAMILY,
                fontSize: 30,
                fontWeight: WEIGHT.subtitle,
                color: COLORS.accent,
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
                fontSize: 30,
                fontWeight: WEIGHT.subtitle,
                color: COLORS.accent,
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
