import type { ReactNode } from 'react'
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { COLORS, FONT_FAMILY, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { EASE, fadeUp } from '../lib/anim'

// Page 6｜後台審核・CGI 去背版（接在 ResultReveal 之後，FullVideo 最後一段，13 秒）。
// 搭配 ResultReveal.tsx（CGI 去背車）串進 FullVideo1，全程維持去背風格；實拍版是
// 完全獨立的另一個檔案 DashboardReviewReal.tsx（搭配 ResultRevealReal.tsx 串進
// FullVideo2），排版/動畫節奏兩邊一致，但不共用同一份程式碼——修改其中一邊的
// 版面/時間常數時，記得檢查另一邊是否也要跟著調整。
//
// 素材來自使用者提供的真實後台儀表板截圖（demo/all1/*.png，另一位成員架設，不在
// 這個 repo 裡，沒有原始碼可讀）。精選重點元素做動態化，不是逐像素還原截圖版面：
// 延續第一支影片自己的深色科技風視覺語言（跟第二支影片「忠實還原亮色 App 截圖」
// 刻意不同），用截圖裡的真實文案/資料結構重新設計成跟其他 5 段一致的深色卡片風格。
//
// 分兩段：Part A 總覽（統計卡數字跳動+風險比例橫條填滿）淡出後，Part B 聚焦到
// 「本次案件」複核卡片——車牌/車損資料直接沿用 ResultReveal.tsx 的 BOXES 跟
// InputPlate.tsx 的車牌，不是憑空編一組新資料，讓「後台審核的案件」明顯就是剛剛
// 看到的同一台車，形成「拍照→AI分析→後台複核」的完整故事線。
const TITLE_START = 0
const TITLE_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

const STATS_START = 45
const STATS_STAGGER = 14
const STATS_CARD_DURATION = 26
const STATS_COUNT_DURATION = 38

const RISK_START = 125
const RISK_STAGGER = 13
const RISK_FILL_DURATION = 30

// 延長 2 秒（+60 frame）給整段場景更多喘息時間：Part A 總覽多留 30 frame 讓
// 統計卡/風險比例看得更從容，Part B 的「已核准」收尾也多留 30 frame 才進入
// 片尾淡黑（見 Root.tsx 的 END_FADE_FRAMES），不會跟淡出動作擠在一起。
const PART_A_EXIT_START = 225
const PART_A_EXIT_DURATION = 20

const CASE_HEADER_START = 225
// 車牌／風險徽章淡入拉長（24→40），出現的速度慢一點，不會一下子就跳出來。
const CASE_HEADER_DURATION = 40
const SUMMARY_START = 240
const SUMMARY_DURATION = 24
const PHOTO_START = 245
const PHOTO_DURATION = 22
const BOX1_START = 263
const BOX2_START = 275
const BOX_DURATION = 16
const BUTTON_START = 252
const BUTTON_DURATION = 18
const GLOW_START = BUTTON_START + BUTTON_DURATION
const GLOW_PERIOD = 45
// 按鈕按下前多留 30 frame（+1 秒）的發光等待時間，核准收尾感覺不會太趕。
const PRESS_FRAME = 324
const PRESS_DURATION = 14
const APPROVED_START = PRESS_FRAME + 4
const APPROVED_DURATION = 14

const PLATE_NUMBER = 'ABC-1234'
const RISK_LEVEL_LABEL = '高風險'
const SUMMARY_TEXT = '本次取車照片偵測到刮傷 1 處、凹痕 1 處，涉及角度：車頭左側。'

interface StatCard {
  label: string
  value: number
  color: string
  icon: (color: string) => ReactNode
}

function ActivityIcon(color: string) {
  return (
    <svg width={34} height={34} viewBox="0 0 24 24" fill="none">
      <path d="M3 13h4l2.5 7L14 4l2.5 9H21" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ClockIcon(color: string) {
  return (
    <svg width={34} height={34} viewBox="0 0 24 24" fill="none">
      <circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <path d="M12 7v5l3.5 2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WarningIcon(color: string) {
  return (
    <svg width={34} height={34} viewBox="0 0 24 24" fill="none">
      <path d="M12 4 22 20H2L12 4Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <path d="M12 10.5v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <circle cx={12} cy={17} r={0.9} fill={color} />
    </svg>
  )
}

const STAT_CARDS: StatCard[] = [
  { label: '今日車輛巡檢案件', value: 31, color: COLORS.accent, icon: ActivityIcon },
  { label: '待人工複核件數', value: 20, color: COLORS.warning, icon: ClockIcon },
  { label: 'AI 判定高風險件數', value: 2, color: COLORS.danger, icon: WarningIcon },
]

interface RiskItem {
  label: string
  value: number
  color: string
}

const RISK_ITEMS: RiskItem[] = [
  { label: '高風險', value: 4, color: COLORS.danger },
  { label: '中風險', value: 18, color: COLORS.warning },
  { label: '低風險', value: 5, color: COLORS.success },
]
const RISK_MAX = Math.max(...RISK_ITEMS.map((r) => r.value))

interface DamageBox {
  label: string
  confidence: number
  color: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

// 座標跟 ResultReveal.tsx 的 BOXES 一致（同一張 car-photos-raw/front_left.png），
// 是同一個案件的同一次辨識結果。
const DAMAGE_BOXES: DamageBox[] = [
  { label: '刮傷', confidence: 87, color: COLORS.warning, xPercent: 27, yPercent: 42, widthPercent: 26, heightPercent: 15 },
  { label: '凹痕', confidence: 92, color: COLORS.danger, xPercent: 58, yPercent: 48, widthPercent: 25, heightPercent: 22 },
]

// 照片寬度固定、高度隨圖片原始比例算出來（不裁切）。這張去背照是橫式，600 剛好
// 塞得下畫面剩下的直向空間；實拍版的照片是直式，另外調過寬度，見
// DashboardReviewReal.tsx 同名常數的說明。
const PHOTO_WIDTH = 600

function StatCardView({ card, index, frame }: { card: StatCard; index: number; frame: number }) {
  const start = STATS_START + index * STATS_STAGGER
  const card_ = fadeUp(frame, start, STATS_CARD_DURATION, 24)
  const count = interpolate(frame, [start, start + STATS_COUNT_DURATION], [0, card.value], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })
  return (
    <div
      style={{
        width: 420,
        background: COLORS.bgCard,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 24,
        padding: '34px 36px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
        boxSizing: 'border-box',
        opacity: card_.opacity,
        transform: `translateY(${card_.translateY}px)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 34, fontWeight: WEIGHT.body, color: COLORS.text, maxWidth: 230, lineHeight: 1.4 }}>
          {card.label}
        </span>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: `${card.color}26`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {card.icon(card.color)}
        </div>
      </div>
      <div style={{ marginTop: 22, fontFamily: FONT_FAMILY, fontSize: 72, fontWeight: WEIGHT.title, color: COLORS.textH }}>
        {Math.round(count)}
      </div>
    </div>
  )
}

function RiskRow({ item, index, frame }: { item: RiskItem; index: number; frame: number }) {
  const start = RISK_START + index * RISK_STAGGER
  const row = fadeUp(frame, start, 18, 12)
  const fillProgress = interpolate(frame, [start, start + RISK_FILL_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })
  const numberOpacity = interpolate(
    frame,
    [start + RISK_FILL_DURATION - 10, start + RISK_FILL_DURATION + 5],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, opacity: row.opacity, transform: `translateY(${row.translateY}px)` }}>
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
      <span style={{ width: 150, fontFamily: FONT_FAMILY, fontSize: 34, fontWeight: WEIGHT.body, color: COLORS.text, flexShrink: 0 }}>
        {item.label}
      </span>
      <div style={{ flex: 1, height: 16, borderRadius: 8, background: COLORS.border, overflow: 'hidden' }}>
        <div style={{ width: `${(item.value / RISK_MAX) * fillProgress * 100}%`, height: '100%', background: item.color, borderRadius: 8 }} />
      </div>
      <span
        style={{
          width: 100,
          textAlign: 'right',
          whiteSpace: 'nowrap',
          fontFamily: FONT_FAMILY,
          fontSize: 34,
          fontWeight: WEIGHT.subtitle,
          color: COLORS.textH,
          opacity: numberOpacity,
          flexShrink: 0,
        }}
      >
        {item.value} 筆
      </span>
    </div>
  )
}

function DetectionBox({ box, start, frame }: { box: DamageBox; start: number; frame: number }) {
  const progress = interpolate(frame, [start, start + BOX_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })
  return (
    <div
      style={{
        position: 'absolute',
        left: `${box.xPercent}%`,
        top: `${box.yPercent}%`,
        width: `${box.widthPercent}%`,
        height: `${box.heightPercent}%`,
        opacity: progress,
        transform: `scale(${0.75 + 0.25 * progress})`,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, border: `4px solid ${box.color}`, borderRadius: 4, boxShadow: `0 0 8px 1px ${box.color}` }} />
      <span
        style={{
          position: 'absolute',
          top: -34,
          left: 0,
          fontFamily: FONT_FAMILY,
          fontWeight: WEIGHT.subtitle,
          fontSize: 22,
          color: '#fff',
          background: box.color,
          padding: '5px 13px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
        }}
      >
        {box.label}（{box.confidence}%）
      </span>
    </div>
  )
}

export const DashboardReview = ({ showBackground = true }: { showBackground?: boolean }) => {
  const frame = useCurrentFrame()

  const title = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const subtitle = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION)

  const partAExit = interpolate(frame, [PART_A_EXIT_START, PART_A_EXIT_START + PART_A_EXIT_DURATION], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })

  const caseHeader = fadeUp(frame, CASE_HEADER_START, CASE_HEADER_DURATION, 16)
  const summary = fadeUp(frame, SUMMARY_START, SUMMARY_DURATION, 16)
  const photo = fadeUp(frame, PHOTO_START, PHOTO_DURATION, 20)
  const photoScale = 0.92 + 0.08 * photo.progress

  const buttonOpacity = interpolate(frame, [BUTTON_START, BUTTON_START + BUTTON_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const glowPhase = Math.max(0, frame - GLOW_START) / GLOW_PERIOD
  const glowIntensity = frame < PRESS_FRAME ? 0.5 + 0.5 * Math.sin(glowPhase * Math.PI * 2) : 0
  const pressScale = interpolate(
    frame,
    [PRESS_FRAME, PRESS_FRAME + PRESS_DURATION / 2, PRESS_FRAME + PRESS_DURATION],
    [1, 0.94, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE },
  )
  const approved = fadeUp(frame, APPROVED_START, APPROVED_DURATION, 10)

  return (
    <AbsoluteFill>
      {showBackground && <SceneBackground />}
      {/* 按鈕音效跟畫面上「核准」按下動畫（pressScale）同一刻觸發。 */}
      <Sequence from={PRESS_FRAME}>
        <Audio src={staticFile('audio/button-press.mp3')} />
      </Sequence>

      <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
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
          營運後台即時同步
        </div>
        <div
          style={{
            marginTop: 16,
            fontFamily: FONT_FAMILY,
            fontSize: 36,
            fontWeight: WEIGHT.subtitle,
            color: COLORS.accent,
            letterSpacing: '0.01em',
            opacity: subtitle.opacity,
            transform: `translateY(${subtitle.translateY}px)`,
          }}
        >
          AI 判定結果即時回傳，複核人員一鍵確認
        </div>

        <div style={{ flex: 1, position: 'relative', width: '100%' }}>
          {/* Part A：總覽——統計卡＋風險比例，複核卡片聚焦前先淡出 */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 74,
              opacity: partAExit,
              transform: `translateY(${(1 - partAExit) * -24}px)`,
              pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', gap: 36 }}>
              {STAT_CARDS.map((card, i) => (
                <StatCardView key={card.label} card={card} index={i} frame={frame} />
              ))}
            </div>
            <div style={{ width: 840, display: 'flex', flexDirection: 'column', gap: 26 }}>
              {RISK_ITEMS.map((item, i) => (
                <RiskRow key={item.label} item={item} index={i} frame={frame} />
              ))}
            </div>
          </div>

          {/* Part B：本次案件複核——沿用 ResultReveal/InputPlate 同一份車牌與車損資料 */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 84,
            }}
          >
            <div style={{ width: 580, display: 'flex', flexDirection: 'column', gap: 30 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: caseHeader.opacity, transform: `translateY(${caseHeader.translateY}px)` }}>
                <span style={{ fontFamily: FONT_FAMILY, fontSize: 50, fontWeight: WEIGHT.title, color: COLORS.textH }}>{PLATE_NUMBER}</span>
                <span
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontSize: 28,
                    fontWeight: WEIGHT.subtitle,
                    color: COLORS.danger,
                    background: 'rgba(201,138,122,0.16)',
                    padding: '7px 18px',
                    borderRadius: 999,
                  }}
                >
                  {RISK_LEVEL_LABEL}
                </span>
              </div>

              <div
                style={{
                  opacity: summary.opacity,
                  transform: `translateY(${summary.translateY}px)`,
                  background: 'rgba(217,184,91,0.14)',
                  border: `1px solid ${COLORS.warning}55`,
                  borderRadius: 18,
                  padding: '26px 28px',
                }}
              >
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 28, fontWeight: WEIGHT.subtitle, color: COLORS.warning, marginBottom: 12 }}>
                  智慧總結報告
                </div>
                <div style={{ fontFamily: FONT_FAMILY, fontSize: 32, fontWeight: WEIGHT.body, color: COLORS.text, lineHeight: 1.6 }}>
                  {SUMMARY_TEXT}
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    width: 320,
                    textAlign: 'center',
                    fontFamily: FONT_FAMILY,
                    fontSize: 30,
                    fontWeight: WEIGHT.subtitle,
                    color: COLORS.bgDeep,
                    background: COLORS.success,
                    borderRadius: 18,
                    padding: '20px 0',
                    boxSizing: 'border-box',
                    opacity: buttonOpacity,
                    transform: `scale(${pressScale})`,
                    boxShadow: `0 0 ${16 + glowIntensity * 18}px ${5 + glowIntensity * 6}px ${COLORS.success}44`,
                  }}
                >
                  核准（寫入）
                </div>

                <div
                  style={{
                    marginTop: 22,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    opacity: approved.opacity,
                    transform: `translateY(${approved.translateY}px)`,
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#3fae59', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: '#fff', fontSize: 20, fontWeight: 900, lineHeight: 1 }}>✓</span>
                  </div>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 30, fontWeight: WEIGHT.subtitle, color: COLORS.textH }}>已核准</span>
                </div>
              </div>
            </div>

            <div
              style={{
                opacity: photo.opacity,
                transform: `scale(${photoScale})`,
                background: '#fbfaf6',
                padding: '20px 20px 30px',
                borderRadius: 8,
                boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ position: 'relative', width: PHOTO_WIDTH, overflow: 'hidden', borderRadius: 2 }}>
                <Img
                  src={staticFile('car-photos-raw/front_left.png')}
                  style={{ display: 'block', width: '100%', height: 'auto', border: '1px solid rgba(0,0,0,0.35)', boxSizing: 'border-box' }}
                />
                <DetectionBox box={DAMAGE_BOXES[0]} start={BOX1_START} frame={frame} />
                <DetectionBox box={DAMAGE_BOXES[1]} start={BOX2_START} frame={frame} />
              </div>
              <div style={{ marginTop: 16, textAlign: 'center', fontFamily: FONT_FAMILY, fontWeight: WEIGHT.subtitle, fontSize: 24, color: '#8a8a8f', letterSpacing: '0.04em' }}>
                車頭左側・待複核
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
