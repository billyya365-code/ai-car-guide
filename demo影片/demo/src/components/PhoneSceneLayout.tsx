import type { ReactNode } from 'react'
import { AbsoluteFill } from 'remotion'
import { COLORS, FONT_FAMILY, WEIGHT } from '../theme'

// 第二支影片（手機 walkthrough）共用的左右分割版面：左邊放章節標題／副標＋一個
// 「未來技術説明」預留區塊（目前先放通用佔位文字，之後使用者會自己換成實際的
// 技術重點），右邊置中放手機模擬畫面。5 段 Phone*.tsx 原本都是同一組「標題／
// 副標置中、手機置中疊在下面」的版面，抽成這個共用元件，不用 5 個檔案各自重寫
// 一份幾乎一樣的排版邏輯。
const LEFT_WIDTH = 720

// 手機畫面本身（PhoneFrame 380x820）在只佔畫面右半邊時顯得偏小、看不清楚裡面
// 的文字/按鈕，用 CSS transform 統一放大整個手機外殼＋內容（不是去改
// PHONE_WIDTH/HEIGHT 本身——那樣只會讓外殼變大，裡面每個場景各自寫死的
// px 字體/間距不會跟著放大，反而比例會跑掉）。1.28 倍是抓右側可用高度
// （畫面滿版 1080px）扣掉手機原始高度 820px 之後還留白的最大值，不會爆版。
const PHONE_DISPLAY_SCALE = 1.28

export function PhoneSceneLayout({
  title,
  subtitle,
  titleAnim,
  subtitleAnim,
  phoneOpacity,
  phoneScale,
  techNote,
  children,
}: {
  title: string
  subtitle: string
  titleAnim: { opacity: number; translateY: number }
  subtitleAnim: { opacity: number; translateY: number }
  phoneOpacity: number
  phoneScale: number
  techNote?: string
  children: ReactNode
}) {
  return (
    <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center' }}>
      <div
        style={{
          width: LEFT_WIDTH,
          flexShrink: 0,
          paddingLeft: 110,
          paddingRight: 40,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 50,
            fontWeight: WEIGHT.title,
            color: COLORS.textH,
            letterSpacing: '0.02em',
            lineHeight: 1.25,
            opacity: titleAnim.opacity,
            transform: `translateY(${titleAnim.translateY}px)`,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 18,
            fontFamily: FONT_FAMILY,
            fontSize: 23,
            fontWeight: WEIGHT.subtitle,
            color: COLORS.accent,
            letterSpacing: '0.01em',
            lineHeight: 1.6,
            opacity: subtitleAnim.opacity,
            transform: `translateY(${subtitleAnim.translateY}px)`,
          }}
        >
          {subtitle}
        </div>

        {/* 預留給使用者之後補上的技術説明——先用虛線框＋斜體佔位文字標示這裡
            還沒放最終內容，避免看起來像是已經做完的設計。 */}
        <div
          style={{
            marginTop: 44,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '18px 20px',
            borderRadius: 12,
            border: `1.5px dashed ${COLORS.border}`,
            opacity: subtitleAnim.opacity,
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>🛠️</span>
          <span
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: 16,
              fontStyle: 'italic',
              color: COLORS.text,
              lineHeight: 1.6,
            }}
          >
            {techNote ?? '未來將於此加入相關技術說明（開發中）'}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: phoneOpacity, transform: `scale(${phoneScale * PHONE_DISPLAY_SCALE})` }}>{children}</div>
      </div>
    </AbsoluteFill>
  )
}
