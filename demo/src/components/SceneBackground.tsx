import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS } from '../theme'

// 每一頁共用的深色科技背景＋緩慢流動的藍色光斑，抽成共用元件，
// 避免每個場景各自複製一份一樣的漂浮動畫邏輯。
function GlowLayer() {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const t = frame / durationInFrames

  const blob = (
    cx: number,
    cy: number,
    size: number,
    color: string,
    phase: number,
    speed: number,
    opacity: number,
  ) => {
    const dx = Math.sin((t + phase) * Math.PI * 2 * speed) * 6
    const dy = Math.cos((t + phase) * Math.PI * 2 * speed) * 4
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
      {blob(26, 30, 950, COLORS.glowDeep, 0, 0.5, 0.6)}
      {blob(74, 64, 1150, COLORS.glowMid, 0.33, 0.4, 0.4)}
      {blob(48, 88, 850, COLORS.glowBright, 0.66, 0.6, 0.28)}
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
