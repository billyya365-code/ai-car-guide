import type { ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { EASE } from '../lib/anim'
import { COLORS } from '../theme'

// 串成單一時間軸（見 Root.tsx 的 FullVideo）時，每個場景包一層這個。場景之間
// 在 Root.tsx 是完全接續播放、不重疊，所以這裡只負責「這個場景自己的頭尾」各自
// 轉場——預設（'push'）不只是單純 opacity 淡化（那樣連續播五段會很像 PPT 逐頁
// 切換的簡報感），而是 opacity＋scale＋motion blur 三個一起變化：結束時場景微微
// 放大＋模糊＋淡出（像鏡頭往前推進、帶走這個畫面），下一段則是從稍微放大＋模糊
// 的狀態縮回原尺寸、對焦清晰＋淡入，比較有發表會影片剪輯的運鏡感。背景是共用的
// 連續背景（見 SceneBackground 現在只在 FullVideo 掛一次），這裡的轉場只影響
// 前景內容本身。
//
// 'glow' 是給 UploadAnalysis→ResultReveal 這一個交接點用的專屬轉場（見
// Root.tsx 的 SCENES 設定）：這兩頁的內容本來就分別用了同一種強調色的發光
// （雲朵的 drop-shadow、掃描線的 boxShadow），不用鏡頭推進的 push 感，改成
// 前一頁結尾淡出時疊一層同色系柔光閃現、後一頁開頭再讓同一層柔光淡下去，
// 讓「AI 的光」本身把兩頁銜接起來，感覺比較像一鏡到底，而不是硬切一刀。
// 只用來替換這一個交接點的轉場「風格」，不需要更動 UploadAnalysis／
// ResultReveal 兩邊內部各自的版面/座標，風險跟工作量都比對齊兩邊座標系統小。
const TRANSITION_SCALE = 1.045
const TRANSITION_BLUR = 7
const GLOW_MAX_OPACITY = 0.8

type TransitionStyle = 'push' | 'glow'

export function CrossFade({
  children,
  durationInFrames,
  transitionFrames,
  fadeInAtStart = true,
  fadeOutAtEnd = true,
  introStyle = 'push',
  outroStyle = 'push',
}: {
  children: ReactNode
  durationInFrames: number
  transitionFrames: number
  fadeInAtStart?: boolean
  fadeOutAtEnd?: boolean
  introStyle?: TransitionStyle
  outroStyle?: TransitionStyle
}) {
  const frame = useCurrentFrame()

  const opacity = interpolate(
    frame,
    [0, transitionFrames, durationInFrames - transitionFrames, durationInFrames],
    [fadeInAtStart ? 0 : 1, 1, 1, fadeOutAtEnd ? 0 : 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  // 開頭：從 TRANSITION_SCALE/模糊 → 1/清晰（鏡頭推進到聚焦）。
  // 結尾：從 1/清晰 → TRANSITION_SCALE/模糊（鏡頭繼續推進、帶走畫面）。
  // 不是最前/最後一段時才套用，維持跟 opacity 的 fadeInAtStart/fadeOutAtEnd 邏輯一致。
  const introProgress = fadeInAtStart
    ? interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })
    : 1
  const outroProgress = fadeOutAtEnd
    ? interpolate(frame, [durationInFrames - transitionFrames, durationInFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: EASE,
      })
    : 0

  // push 效果只在對應那一側被指定成 'push' 時才計入，'glow' 側维持 scale=1/blur=0
  // （鏡頭不動），改由下面的 glowOpacity 疊光負責那一側的轉場張力。
  const introPush = introStyle === 'push' ? 1 - introProgress : 0
  const outroPush = outroStyle === 'push' ? outroProgress : 0
  const scale = 1 + introPush * (TRANSITION_SCALE - 1) + outroPush * (TRANSITION_SCALE - 1)
  const blurPx = introPush * TRANSITION_BLUR + outroPush * TRANSITION_BLUR

  // 'glow' 側的柔光：結尾是 0→1（淡出到最亮，剛好在切點前最亮），開頭是 1→0
  // （從最亮開始、淡下去），兩個場景各自負責自己那一半，剪接點前後都是同一種
  // 亮度的光，銜接起來才會連續。疊在內容外層（見下方 return），不受內容本身
  // 的 opacity 影響，才能在內容淡出時依然維持全亮。
  const introGlow = introStyle === 'glow' ? 1 - introProgress : 0
  const outroGlow = outroStyle === 'glow' ? outroProgress : 0
  const glowOpacity = Math.max(introGlow, outroGlow)

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{ opacity, transform: `scale(${scale})`, filter: blurPx ? `blur(${blurPx}px)` : undefined }}
      >
        {children}
      </AbsoluteFill>
      {glowOpacity > 0 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle, ${COLORS.glowBright} 0%, transparent 55%)`,
            opacity: glowOpacity * GLOW_MAX_OPACITY,
            pointerEvents: 'none',
          }}
        />
      )}
    </AbsoluteFill>
  )
}
