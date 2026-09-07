import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { COLORS } from '../theme'

// 漂浮週期固定用幀數算（不要用 useVideoConfig().durationInFrames），這樣不管
// 這個元件是掛在單一場景（幾百幀）還是掛在串接後整支 58 秒的 FullVideo 上
// （見 Root.tsx，現在整支影片共用同一份背景），飄動的視覺節奏都一樣明顯——
// 之前用 durationInFrames 當分母，串成 FullVideo 後分母變成全片長度，同樣的
// speed 在任何一段場景的時間窗內只跑得到極小一段循環，動態感幾乎消失。
const CYCLE_FRAMES = 240

// 三種光斑會在這三種藍之間漸層循環切換色調（而不是每個光斑固定死一種顏色），
// 讓背景的藍色調隨時間緩慢變化、更有生命感。
const BLUE_PALETTE = [COLORS.glowDeep, COLORS.glowMid, COLORS.glowBright]

function hexToRgb(hex: string): readonly [number, number, number] {
  const v = hex.replace('#', '')
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}

const PALETTE_RGB = BLUE_PALETTE.map(hexToRgb)

// t 可以是任意實數，會自動 wrap 成 0~1 之間、在三種藍之間依序漸層混色，
// 跑完一輪後平滑接回第一種顏色（無縫循環）。
function cycleBlue(t: number) {
  const n = PALETTE_RGB.length
  const wrapped = ((t % 1) + 1) % 1
  const scaled = wrapped * n
  const i = Math.floor(scaled)
  const localT = scaled - i
  const [r1, g1, b1] = PALETTE_RGB[i]
  const [r2, g2, b2] = PALETTE_RGB[(i + 1) % n]
  const r = Math.round(r1 + (r2 - r1) * localT)
  const g = Math.round(g1 + (g2 - g1) * localT)
  const b = Math.round(b1 + (b2 - b1) * localT)
  return `rgb(${r}, ${g}, ${b})`
}

// 每一頁共用的深色科技背景＋緩慢流動的藍色光斑，抽成共用元件，
// 避免每個場景各自複製一份一樣的漂浮動畫邏輯。
function GlowLayer() {
  const frame = useCurrentFrame()
  const t = frame / CYCLE_FRAMES

  const blob = (
    cx: number,
    cy: number,
    size: number,
    colorPhase: number,
    phase: number,
    speed: number,
    opacity: number,
  ) => {
    const dx = Math.sin((t + phase) * Math.PI * 2 * speed) * 6
    const dy = Math.cos((t + phase) * Math.PI * 2 * speed) * 4
    // 每個光斑各自的顏色循環速度跟起始相位都不同，三顆彼此不同步地漸層換色，
    // 而不是整片背景一起同時切色。
    const color = cycleBlue(t * 0.6 + colorPhase)
    return (
      <div
        style={{
          position: 'absolute',
          left: `${cx + dx}%`,
          top: `${cy + dy}%`,
          width: size,
          height: size,
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
          opacity,
          mixBlendMode: 'screen',
          filter: 'blur(2px)',
        }}
      />
    )
  }

  return (
    <AbsoluteFill>
      {blob(26, 30, 950, 0, 0, 0.5, 0.6)}
      {blob(74, 64, 1150, 0.33, 0.33, 0.4, 0.4)}
      {blob(48, 88, 850, 0.66, 0.66, 0.6, 0.28)}
    </AbsoluteFill>
  )
}

export function SceneBackground() {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 40%, ${COLORS.bg} 0%, ${COLORS.bgDeep} 75%)`,
      }}
    >
      <GlowLayer />
    </AbsoluteFill>
  )
}
