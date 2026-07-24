import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { FONT_FAMILY, UI_LIGHT, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { PhoneFrame } from '../components/PhoneFrame'
import { PhoneSceneLayout } from '../components/PhoneSceneLayout'
import { EASE, fadeUp } from '../lib/anim'

// 第二支影片 Page 4｜上傳／分析中（8 秒）。還原真實 App CaptureGuidePage.tsx
// 的 uploadPhase 'uploading'→'analyzing' 兩個狀態：上傳中有雲朵+上浮小點動畫
// （對應 web/src/components/CloudUploadAnimation.tsx）＋進度條；切到分析中後
// 真實 App 只剩文字、沒有任何動畫（研究確認過，這裡忠實照做，不額外加裝飾）。
// 外層標題沿用第一支影片 UploadAnalysis.tsx 同一組文案，兩支影片同一個步驟
// 用同一句話，維持一致。
const TITLE_START = 0
const TITLE_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

const PHONE_START = 15
const PHONE_DURATION = 25

const UPLOAD_START = 45
const UPLOAD_DURATION = 105
const SWITCH_FRAME = UPLOAD_START + UPLOAD_DURATION // 150
const TEXT_FADE = 15

const DOT_COUNT = 3
const DOT_CYCLE = 55
const DOT_STAGGER = 16

function CloudUploadIcon() {
  const frame = useCurrentFrame()
  return (
    <div style={{ position: 'relative', width: 72, height: 72 }}>
      <svg width={72} height={72} viewBox="0 0 64 40" style={{ position: 'absolute', top: 6, left: 4 }} fill="none">
        <path
          d="M18 32c-7 0-12-5-12-11 0-5.5 4-10 9.5-10.8C17 5 22 1 28 1c6.8 0 12.4 5 13.3 11.4C47.6 13 52 17.7 52 23c0 5-4 9-9 9H18z"
          fill={UI_LIGHT.accent}
        />
      </svg>
      {Array.from({ length: DOT_COUNT }).map((_, i) => {
        const localFrame = (frame + i * DOT_STAGGER) % DOT_CYCLE
        const t = localFrame / DOT_CYCLE
        const y = 46 - t * 46
        const opacity = interpolate(t, [0, 0.15, 0.85, 1], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        const x = 26 + (i - 1) * 14
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: UI_LIGHT.accent,
              opacity,
            }}
          />
        )
      })}
    </div>
  )
}

export const PhoneUpload = ({ showBackground = true }: { showBackground?: boolean }) => {
  const frame = useCurrentFrame()

  const titleAnim = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const subtitleAnim = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION)

  const phoneProgress = interpolate(frame, [PHONE_START, PHONE_START + PHONE_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })

  const isAnalyzing = frame >= SWITCH_FRAME
  const uploadingOpacity = interpolate(frame, [SWITCH_FRAME, SWITCH_FRAME + TEXT_FADE], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const analyzingOpacity = interpolate(frame, [SWITCH_FRAME, SWITCH_FRAME + TEXT_FADE], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const iconOpacity = interpolate(frame, [UPLOAD_START, UPLOAD_START + 12, SWITCH_FRAME - 10, SWITCH_FRAME], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const progressPercent = interpolate(frame, [UPLOAD_START, SWITCH_FRAME], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill>
      {showBackground && <SceneBackground />}

      <PhoneSceneLayout
        title="AI 車況分析"
        subtitle="影像上傳雲端，AI 進行車損辨識與異常比對，減少人工核對成本"
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
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 16,
                  padding: '0 32px',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ opacity: iconOpacity }}>
                  <CloudUploadIcon />
                </div>

                <div style={{ position: 'relative', textAlign: 'center' }}>
                  <div style={{ opacity: uploadingOpacity, position: isAnalyzing ? 'absolute' : 'static', inset: 0 }}>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 25, fontWeight: WEIGHT.subtitle, color: UI_LIGHT.textH }}>
                      照片上傳中…
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontFamily: FONT_FAMILY,
                        fontSize: 17,
                        fontWeight: WEIGHT.body,
                        color: UI_LIGHT.text,
                      }}
                    >
                      請勿關閉畫面
                    </div>
                  </div>
                  <div style={{ opacity: analyzingOpacity }}>
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 25, fontWeight: WEIGHT.subtitle, color: UI_LIGHT.textH }}>
                      AI 分析中…
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontFamily: FONT_FAMILY,
                        fontSize: 17,
                        fontWeight: WEIGHT.body,
                        color: UI_LIGHT.text,
                      }}
                    >
                      正在偵測車損，請稍候
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    width: 180,
                    height: 6,
                    borderRadius: 3,
                    background: UI_LIGHT.border,
                    overflow: 'hidden',
                    opacity: uploadingOpacity,
                  }}
                >
                  <div
                    style={{
                      width: `${progressPercent}%`,
                      height: '100%',
                      background: UI_LIGHT.accent,
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
            </PhoneFrame>
      </PhoneSceneLayout>
    </AbsoluteFill>
  )
}
