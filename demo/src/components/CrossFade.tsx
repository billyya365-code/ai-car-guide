import type { ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { EASE } from '../lib/anim'

// 串成單一時間軸（見 Root.tsx 的 FullVideo）時，每個場景包一層這個。場景之間
// 在 Root.tsx 是完全接續播放、不重疊，所以這裡只負責「這個場景自己的頭尾」各自
// 轉場——不只是單純 opacity 淡化（那樣連續播五段會很像 PPT 逐頁切換的簡報感），
// 而是 opacity＋scale＋motion blur 三個一起變化：結束時場景微微放大＋模糊＋淡出
// （像鏡頭往前推進、帶走這個畫面），下一段則是從稍微放大＋模糊的狀態縮回原尺寸、
// 對焦清晰＋淡入（像鏡頭往前推進、帶出新畫面），比較有發表會影片剪輯的運鏡感，
// 而不是單純兩張投影片之間的淡入淡出。背景是共用的連續背景（見 SceneBackground
// 現在只在 FullVideo 掛一次），這裡的轉場只影響前景內容本身。
const TRANSITION_SCALE = 1.045
const TRANSITION_BLUR = 7

export function CrossFade({
  children,
  durationInFrames,
  transitionFrames,
  fadeInAtStart = true,
  fadeOutAtEnd = true,
}: {
  children: ReactNode
  durationInFrames: number
  transitionFrames: number
  fadeInAtStart?: boolean
  fadeOutAtEnd?: boolean
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

  const scale = 1 + (1 - introProgress) * (TRANSITION_SCALE - 1) + outroProgress * (TRANSITION_SCALE - 1)
  const blurPx = (1 - introProgress) * TRANSITION_BLUR + outroProgress * TRANSITION_BLUR

  return (
    <AbsoluteFill style={{ opacity, transform: `scale(${scale})`, filter: `blur(${blurPx}px)` }}>
      {children}
    </AbsoluteFill>
  )
}
