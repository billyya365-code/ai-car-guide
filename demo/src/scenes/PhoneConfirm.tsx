import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { COLORS, FONT_FAMILY, UI_LIGHT, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { PhoneFrame } from '../components/PhoneFrame'
import { EASE, fadeUp } from '../lib/anim'
import { LABELS, POSITIONS } from '../lib/carAngles'

// 第二支影片 Page 3｜確認照片（8 秒）。真實 App 有、第一支影片沒有做的畫面：
// 四張都拍完後，先讓使用者確認每個角度都對焦清楚，點縮圖可以重拍該角度，
// 而不是拍完直接送出。外層標題/副標直接沿用真實 App CaptureGuidePage.tsx
// 這個畫面自己的 <h1>/<p className="subtitle"> 文案，手機畫面內部不重複
// 畫一次標題，只還原 2x2 縮圖格＋重拍徽章＋底部確認按鈕。
const TITLE_START = 0
const TITLE_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

const PHONE_START = 15
const PHONE_DURATION = 25

const GRID_START = 50
const GRID_STAGGER = 14
const GRID_DURATION = 22

const BUTTON_START = 140
const BUTTON_DURATION = 20
const GLOW_START = BUTTON_START + BUTTON_DURATION
const GLOW_PERIOD = 45
const PRESS_FRAME = 210
const PRESS_DURATION = 14

export const PhoneConfirm = ({ showBackground = true }: { showBackground?: boolean }) => {
  const frame = useCurrentFrame()

  const title = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const subtitle = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION)

  const phoneProgress = interpolate(frame, [PHONE_START, PHONE_START + PHONE_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })

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

      <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 70 }}>
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
          確認照片
        </div>
        <div
          style={{
            marginTop: 16,
            fontFamily: FONT_FAMILY,
            fontSize: 28,
            fontWeight: WEIGHT.subtitle,
            color: COLORS.accent,
            letterSpacing: '0.01em',
            opacity: subtitle.opacity,
            transform: `translateY(${subtitle.translateY}px)`,
          }}
        >
          請確認四個角度都清楚對焦，點選照片即可重新拍攝該角度
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ opacity: phoneProgress, transform: `scale(${0.94 + 0.06 * phoneProgress})` }}>
            <PhoneFrame>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '48px 20px 0',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 12,
                    alignContent: 'start',
                  }}
                >
                  {POSITIONS.map((pos, i) => {
                    const cellStart = GRID_START + i * GRID_STAGGER
                    const cellProgress = interpolate(frame, [cellStart, cellStart + GRID_DURATION], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                      easing: EASE,
                    })
                    return (
                      <div
                        key={pos}
                        style={{
                          opacity: cellProgress,
                          transform: `scale(${0.9 + 0.1 * cellProgress})`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            position: 'relative',
                            borderRadius: 12,
                            overflow: 'hidden',
                            border: `1px solid ${UI_LIGHT.border}`,
                            aspectRatio: '1 / 1',
                          }}
                        >
                          <Img
                            src={staticFile(`car-photos-raw/${pos}.png`)}
                            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: 'rgba(0,0,0,0.55)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <span style={{ color: '#fff', fontSize: 14, lineHeight: 1 }}>↺</span>
                          </div>
                        </div>
                        <span
                          style={{
                            fontFamily: FONT_FAMILY,
                            fontSize: 14,
                            fontWeight: WEIGHT.body,
                            color: UI_LIGHT.text,
                            textAlign: 'center',
                          }}
                        >
                          {LABELS[pos]}
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
                  確認上傳
                </div>
              </div>
            </PhoneFrame>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
