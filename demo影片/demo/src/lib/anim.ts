import { Easing, interpolate } from 'remotion'

// 全片共用的進場 easing：ease-in-out 三次曲線，不用 spring，避免回彈感，
// 貼近 Apple/Tesla 發表會的沉穩調性（Page 1 標題動畫就是照這個規格調的）。
export const EASE = Easing.inOut(Easing.cubic)

// 文字類進場：淡入＋由下往上位移歸零。
export function fadeUp(frame: number, start: number, duration: number, riseNoPx = 20) {
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })
  return {
    opacity: progress,
    translateY: (1 - progress) * riseNoPx,
    progress,
  }
}

// 列表/欄位類進場：淡入＋水平滑入歸零（正值＝從右側滑入，負值＝從左側滑入）。
export function slideIn(frame: number, start: number, duration: number, fromX: number) {
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })
  return {
    opacity: progress,
    transform: `translateX(${(1 - progress) * fromX}px)`,
    progress,
  }
}
