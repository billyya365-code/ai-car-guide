import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { COLORS, FONT_FAMILY, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { fadeUp } from '../lib/anim'

// 標題進場：scale 95%→100%、opacity 0→100%，用共用的 ease-in-out 三次曲線（不用 spring）
// 避免任何回彈感，貼近 Apple/Tesla 發表會的沉穩調性。整體拉到 6 秒後步調放慢，
// 進場時間拉長，不再是趕著在第一秒內就跑完。
const TITLE_START = 0
const TITLE_DURATION = 55

// 副標題稍晚一點進場（跟標題錯開，不是同時跳出來），一樣是淡入＋位移歸零，同款 easing。
const SUBTITLE_START = 32
const SUBTITLE_DURATION = 55
const SUBTITLE_RISE_PX = 24

export const Cover = () => {
  const frame = useCurrentFrame()

  const title = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const titleScale = 0.95 + 0.05 * title.progress

  const subtitle = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION, SUBTITLE_RISE_PX)

  return (
    <AbsoluteFill>
      <SceneBackground />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 132,
            fontWeight: WEIGHT.title,
            color: COLORS.textH,
            letterSpacing: '0.04em',
            opacity: title.opacity,
            transform: `scale(${titleScale})`,
          }}
        >
          車況之眼
        </div>
        <div
          style={{
            marginTop: 28,
            fontFamily: FONT_FAMILY,
            fontSize: 40,
            fontWeight: WEIGHT.subtitle,
            color: COLORS.accent,
            letterSpacing: '0.25em',
            opacity: subtitle.opacity,
            transform: `translateY(${subtitle.translateY}px)`,
          }}
        >
          智慧巡檢系統
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
