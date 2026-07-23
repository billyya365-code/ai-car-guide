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

// showBackground=false 是給串成 FullVideo 時用的（見 Root.tsx）：整支影片共用同
// 一個連續播放的 SceneBackground，場景切換時背景不會跟著淡出/淡入或重置，只有
// 前景內容在轉場；個別獨立預覽這個 composition 時維持預設 true，自己畫自己的背景。
export const Cover = ({ showBackground = true }: { showBackground?: boolean }) => {
  const frame = useCurrentFrame()

  const title = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const titleScale = 0.95 + 0.05 * title.progress

  const subtitle = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION, SUBTITLE_RISE_PX)

  return (
    <AbsoluteFill>
      {showBackground && <SceneBackground />}
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
            maxWidth: 920,
            textAlign: 'center',
            fontFamily: FONT_FAMILY,
            fontSize: 32,
            fontWeight: WEIGHT.subtitle,
            color: COLORS.accent,
            letterSpacing: '0.03em',
            lineHeight: 1.6,
            opacity: subtitle.opacity,
            transform: `translateY(${subtitle.translateY}px)`,
          }}
        >
          以 AI 驅動智慧巡檢，打造標準化、可追溯的車況管理流程。
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
