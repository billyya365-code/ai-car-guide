import type { CSSProperties, ReactNode } from 'react'
import { UI_LIGHT } from '../theme'

// 第二支影片共用的手機外殼——橫式畫布中央放一支直式手機，模擬「螢幕錄影」的
// 呈現方式，裡面畫真實 App 的畫面（見 scenes/Phone*.tsx）。邊框配色沿用
// AiGuideCapture.tsx（第一支影片）已經在用的手機殼顏色，兩支影片的手機質感
// 保持一致。尺寸抓 9:19.5 常見手機比例，刻意不用滿版高度——上方要留給場景
// 標題/副標（跟第一支影片每個場景的標題排版慣例一致），太高會被title擠壓。
export const PHONE_WIDTH = 380
export const PHONE_HEIGHT = 820
const RADIUS = 52
const BEZEL = 12
const PHONE_FRAME = '#1b1d21'
const PHONE_FRAME_EDGE = 'rgba(255,255,255,0.1)'

export function PhoneFrame({
  children,
  screenBackground = UI_LIGHT.bg,
  style,
}: {
  children: ReactNode
  screenBackground?: string
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: PHONE_WIDTH,
        height: PHONE_HEIGHT,
        borderRadius: RADIUS,
        border: `${BEZEL}px solid ${PHONE_FRAME}`,
        outline: `1px solid ${PHONE_FRAME_EDGE}`,
        outlineOffset: -(BEZEL + 1),
        boxShadow: '0 40px 80px -20px rgba(0,0,0,0.65)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* 螢幕內容區——真實 App 畫面畫在這裡面，圓角比外殼略小、overflow 裁切。 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: RADIUS - BEZEL,
          overflow: 'hidden',
          background: screenBackground,
        }}
      >
        {children}
      </div>

      {/* 頂部瀏海（藥丸造型）＋底部 Home Indicator，疊在螢幕內容之上。 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 26,
          borderRadius: '0 0 16px 16px',
          background: PHONE_FRAME,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 5,
          borderRadius: 3,
          background: 'rgba(0,0,0,0.35)',
        }}
      />
    </div>
  )
}
