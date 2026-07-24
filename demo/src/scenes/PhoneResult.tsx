import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { FONT_FAMILY, UI_LIGHT, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { PhoneFrame } from '../components/PhoneFrame'
import { PhoneSceneLayout } from '../components/PhoneSceneLayout'
import { EASE, fadeUp } from '../lib/anim'
import { LABELS, POSITIONS } from '../lib/carAngles'

// 第二支影片 Page 5｜檢測結果（10 秒）。還原真實 App ResultPage.tsx：風險等級
// 卡片＋摘要句、2x2 縮圖各自疊 DamageOverlay（凹痕=danger 紅框、刮傷=warning
// 黃框，跟真實 App 一致）、每格下方一行「偵測到 N 處車損」或「無車損」、底部
// 「返回首頁」按鈕。跟第一支影片 ResultReveal.tsx 用同一組車損資料（front_left
// 一個 Scratch＋一個 Dent，其餘三格無車損），風險等級同樣是「高風險」，兩支
// 影片的「同一次拍攝結果」保持一致，不是憑空編兩組不同的車損資料。外層標題
// 沿用 ResultReveal.tsx 同一組文案。
const TITLE_START = 0
const TITLE_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

const PHONE_START = 15
const PHONE_DURATION = 25

const RISK_CARD_START = 45
const RISK_CARD_DURATION = 25

const GRID_START = 78
const GRID_STAGGER = 14
const GRID_DURATION = 22

// 車損框跟著 front_left 那一格淡入完再彈出來，不做像 ResultReveal.tsx 那種
// 大張照片的掃描線效果——縮圖太小，掃描效果看不清楚，反而不如單純淡入+彈出
// 清楚易讀。
const DAMAGE_BOX_START = GRID_START + GRID_DURATION + 10
const DAMAGE_BOX_STAGGER = 10
const DAMAGE_BOX_DURATION = 14

const BUTTON_START = 230
const BUTTON_DURATION = 20
const GLOW_START = BUTTON_START + BUTTON_DURATION
const GLOW_PERIOD = 45
const PRESS_FRAME = 280
const PRESS_DURATION = 14

const RISK_LEVEL_LABEL = '高風險'
const SUMMARY_TEXT = '本次取車照片偵測到刮傷 1 處、凹痕 1 處，涉及角度：車頭左側。'

interface DamageBox {
  label: string
  confidence: number
  color: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

// 座標跟第一支影片 ResultReveal.tsx 的 BOXES 一致（同一張 front_left.png、
// 同一組刮傷/凹痕位置），只是這裡是中文標籤＋信心值格式，跟真實 App
// ResultPage.tsx 的「{類型}（{信心%}）」格式一致。
const DAMAGE_BOXES: DamageBox[] = [
  { label: '刮傷', confidence: 87, color: UI_LIGHT.warning, xPercent: 27, yPercent: 42, widthPercent: 26, heightPercent: 15 },
  { label: '凹痕', confidence: 92, color: UI_LIGHT.danger, xPercent: 58, yPercent: 48, widthPercent: 25, heightPercent: 22 },
]

export const PhoneResult = ({ showBackground = true }: { showBackground?: boolean }) => {
  const frame = useCurrentFrame()

  const titleAnim = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const subtitleAnim = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION)

  const phoneProgress = interpolate(frame, [PHONE_START, PHONE_START + PHONE_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })

  const riskCard = fadeUp(frame, RISK_CARD_START, RISK_CARD_DURATION, 14)

  const buttonOpacity = interpolate(frame, [BUTTON_START, BUTTON_START + BUTTON_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const glowPhase = Math.max(0, frame - GLOW_START) / GLOW_PERIOD
  const glowIntensity = 0.5 + 0.5 * Math.sin(glowPhase * Math.PI * 2)
  const pressScale = interpolate(
    frame,
    [PRESS_FRAME, PRESS_FRAME + PRESS_DURATION / 2, PRESS_FRAME + PRESS_DURATION],
    [1, 0.94, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE },
  )

  return (
    <AbsoluteFill>
      {showBackground && <SceneBackground />}

      <PhoneSceneLayout
        title="辨識結果輸出"
        subtitle="AI 自動標示車體異常並產出巡檢紀錄，提升管理效率"
        titleAnim={titleAnim}
        subtitleAnim={subtitleAnim}
        phoneOpacity={phoneProgress}
        phoneScale={0.94 + 0.06 * phoneProgress}
      >
            <PhoneFrame>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '48px 20px 0',
                  boxSizing: 'border-box',
                  gap: 14,
                }}
              >
                {/* 風險等級卡片 */}
                <div
                  style={{
                    opacity: riskCard.opacity,
                    transform: `translateY(${riskCard.translateY}px)`,
                    background: UI_LIGHT.bgCard,
                    border: `1px solid ${UI_LIGHT.border}`,
                    borderRadius: 14,
                    padding: 14,
                    boxSizing: 'border-box',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      fontFamily: FONT_FAMILY,
                      fontSize: 14,
                      fontWeight: 700,
                      color: UI_LIGHT.danger,
                      background: UI_LIGHT.dangerBg,
                      padding: '4px 12px',
                      borderRadius: 999,
                    }}
                  >
                    {RISK_LEVEL_LABEL}
                  </span>
                  <div
                    style={{
                      marginTop: 8,
                      fontFamily: FONT_FAMILY,
                      fontSize: 15,
                      lineHeight: 1.5,
                      color: UI_LIGHT.text,
                    }}
                  >
                    {SUMMARY_TEXT}
                  </div>
                </div>

                {/* 2x2 縮圖格 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 10,
                  }}
                >
                  {POSITIONS.map((pos, i) => {
                    const cellStart = GRID_START + i * GRID_STAGGER
                    const cellProgress = interpolate(frame, [cellStart, cellStart + GRID_DURATION], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                      easing: EASE,
                    })
                    const hasDamage = pos === 'front_left'
                    return (
                      <div
                        key={pos}
                        style={{
                          opacity: cellProgress,
                          transform: `scale(${0.9 + 0.1 * cellProgress})`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, color: UI_LIGHT.text }}>{LABELS[pos]}</span>
                        <div
                          style={{
                            position: 'relative',
                            borderRadius: 10,
                            overflow: 'hidden',
                            border: `1px solid ${UI_LIGHT.border}`,
                            aspectRatio: '1 / 1',
                          }}
                        >
                          <Img
                            src={staticFile(`car-photos-raw/${pos}.png`)}
                            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          {hasDamage &&
                            DAMAGE_BOXES.map((box, bi) => {
                              const boxStart = DAMAGE_BOX_START + bi * DAMAGE_BOX_STAGGER
                              const boxProgress = interpolate(frame, [boxStart, boxStart + DAMAGE_BOX_DURATION], [0, 1], {
                                extrapolateLeft: 'clamp',
                                extrapolateRight: 'clamp',
                                easing: EASE,
                              })
                              return (
                                <div
                                  key={box.label}
                                  style={{
                                    position: 'absolute',
                                    left: `${box.xPercent}%`,
                                    top: `${box.yPercent}%`,
                                    width: `${box.widthPercent}%`,
                                    height: `${box.heightPercent}%`,
                                    opacity: boxProgress,
                                    transform: `scale(${0.7 + 0.3 * boxProgress})`,
                                  }}
                                >
                                  <div
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      border: `1.5px solid ${box.color}`,
                                      borderRadius: 3,
                                    }}
                                  />
                                  <span
                                    style={{
                                      position: 'absolute',
                                      top: -14,
                                      left: 0,
                                      fontFamily: FONT_FAMILY,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      color: UI_LIGHT.bgCard,
                                      background: box.color,
                                      padding: '1px 4px',
                                      borderRadius: 3,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {box.label}（{box.confidence}%）
                                  </span>
                                </div>
                              )
                            })}
                        </div>
                        <span
                          style={{
                            fontFamily: FONT_FAMILY,
                            fontSize: 13,
                            fontWeight: WEIGHT.subtitle,
                            color: hasDamage ? UI_LIGHT.danger : UI_LIGHT.success,
                          }}
                        >
                          {hasDamage ? '偵測到 2 處車損' : '無車損'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: UI_LIGHT.bgCard,
                  borderTop: `1px solid ${UI_LIGHT.border}`,
                  padding: '16px 26px 22px',
                  display: 'flex',
                  justifyContent: 'center',
                  opacity: buttonOpacity,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    fontFamily: FONT_FAMILY,
                    fontSize: 18,
                    fontWeight: WEIGHT.subtitle,
                    color: '#fff',
                    background: UI_LIGHT.accent,
                    borderRadius: 14,
                    padding: '13px 0',
                    boxSizing: 'border-box',
                    transform: `scale(${pressScale})`,
                    boxShadow: `0 0 ${16 + glowIntensity * 18}px ${5 + glowIntensity * 6}px rgba(94,120,146,${0.2 + glowIntensity * 0.3})`,
                  }}
                >
                  返回首頁
                </div>
              </div>
            </PhoneFrame>
      </PhoneSceneLayout>
    </AbsoluteFill>
  )
}
