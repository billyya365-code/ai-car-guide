import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { FONT_FAMILY, UI_LIGHT, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { PhoneFrame, PHONE_WIDTH } from '../components/PhoneFrame'
import { PhoneSceneLayout } from '../components/PhoneSceneLayout'
import { EASE, fadeUp, slideIn } from '../lib/anim'

// 第二支影片 Page 1｜首頁輸入車輛資訊（10 秒）。忠實還原真實 App
// WelcomePage.tsx 的畫面（亮色主題、直式單欄），跟第一支影片 InputPlate.tsx
// 用同一組標題文字當外層章節標題（「跟著 AI 指引完成拍攝」／
// 「AI 協助抓好角度、距離與清晰度，完成後自動拍照」）——這正是真實 App 這個
// 畫面自己的 <h1>/<p className="subtitle"> 文案，外層已經完整呈現過一次，
// 手機畫面內部就不再重複畫一次標題，只還原表單本身（車款/車牌號碼/按鈕），
// 避免同一句話在畫面上出現兩次。
const TITLE_START = 0
const TITLE_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

const PHONE_START = 15
const PHONE_DURATION = 30

// 手機畫面裡先播一段真實 App 的「畫面載入中」動畫（還原自
// web/src/components/CameraCapture.tsx 相機權限請求前的載入畫面：脈動的
// 圖示徽章＋「畫面載入中...」標題＋副標），淡出後才接著顯示首頁表單內容——
// 對應真實 App 冷啟動時「先載入、才看到畫面」的體感，也讓第二支影片一開場
// 不是直接跳到表單已經備妥的狀態。下面表單內容原本的時間常數（HERO_START
// 等）維持不變，改成都相對 CONTENT_OFFSET 起算（見 contentFrame），不用整批
// 重新算數字。
const LOADING_START = 20
const LOADING_FADE_IN = 15
const LOADING_HOLD = 45
const LOADING_FADE_OUT = 20
const CONTENT_OFFSET = LOADING_START + LOADING_FADE_IN + LOADING_HOLD + LOADING_FADE_OUT // 100

const HERO_START = 40
const HERO_DURATION = 30

const ROW_STAGGER = 16
const ROW_DURATION = 26
const CAR_MODEL_ROW_START = 70
const PLATE_ROW_START = CAR_MODEL_ROW_START + ROW_STAGGER
const LAST_ROW_SETTLED = PLATE_ROW_START + ROW_DURATION // 112

const CURSOR_START = LAST_ROW_SETTLED
const TYPING_START = CURSOR_START + 12 // 124
const PLATE_LETTERS = 'ABC'
const PLATE_DIGITS = '1234'
const FULL_PLATE = PLATE_LETTERS + PLATE_DIGITS
const FRAMES_PER_CHAR = 8
const TYPING_DURATION = FULL_PLATE.length * FRAMES_PER_CHAR // 56
const TYPING_END = TYPING_START + TYPING_DURATION // 180

const BUTTON_START = TYPING_END + 20 // 200
const BUTTON_DURATION = 20
const GLOW_START = BUTTON_START + BUTTON_DURATION
const GLOW_PERIOD = 45
const PRESS_FRAME = 265
const PRESS_DURATION = 14

// 車款文字、車輛圖片去識別化，理由跟第一支影片 InputPlate.tsx 一致：避免
// demo 影片被誤認成在幫特定廠牌背書。
const CAR_MODEL_LABEL = 'XXXX XXXXXXX'

function CameraIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7.5h2.8L8.3 5h7.4l1.5 2.5H20a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z"
        fill={color}
      />
      <circle cx="12" cy="13" r="3.4" fill="white" fillOpacity="0.92" />
    </svg>
  )
}

export const PhoneWelcome = ({ showBackground = true }: { showBackground?: boolean }) => {
  const frame = useCurrentFrame()

  const titleAnim = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const subtitleAnim = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION)

  const phoneProgress = interpolate(frame, [PHONE_START, PHONE_START + PHONE_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })

  // 表單內容全部相對 contentFrame 起算（= frame - CONTENT_OFFSET），loading
  // 畫面淡出之前 contentFrame 是負的，interpolate/fadeUp/slideIn 的
  // extrapolateLeft:'clamp' 會直接夾在起始值（opacity 0 等），所以這段時間
  // 表單內容自然是不可見的，不用另外判斷「loading 還沒結束就不要畫」。
  const contentFrame = frame - CONTENT_OFFSET

  const loadingOpacity = interpolate(
    frame,
    [LOADING_START, LOADING_START + LOADING_FADE_IN, LOADING_START + LOADING_FADE_IN + LOADING_HOLD, CONTENT_OFFSET],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
  const loadingPulse = 1 + 0.08 * Math.sin(frame / 15)

  const hero = fadeUp(contentFrame, HERO_START, HERO_DURATION, 14)
  const carModelRow = slideIn(contentFrame, CAR_MODEL_ROW_START, ROW_DURATION, 60)
  const plateRow = slideIn(contentFrame, PLATE_ROW_START, ROW_DURATION, 60)

  const typedCount = Math.floor(
    interpolate(contentFrame, [TYPING_START, TYPING_START + TYPING_DURATION], [0, FULL_PLATE.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  )
  const lettersShown = PLATE_LETTERS.slice(0, Math.min(typedCount, 3))
  const digitsShown = PLATE_DIGITS.slice(0, Math.max(0, typedCount - 3))
  const cursorInLetters = typedCount < 3
  const cursorActive = contentFrame >= CURSOR_START && contentFrame < BUTTON_START
  const cursorVisible = cursorActive && Math.floor(contentFrame / 16) % 2 === 0

  const buttonRow = slideIn(contentFrame, BUTTON_START, BUTTON_DURATION, 40)
  const glowPhase = Math.max(0, contentFrame - GLOW_START) / GLOW_PERIOD
  const glowIntensity = 0.5 + 0.5 * Math.sin(glowPhase * Math.PI * 2)
  const pressScale = interpolate(
    contentFrame,
    [PRESS_FRAME, PRESS_FRAME + PRESS_DURATION / 2, PRESS_FRAME + PRESS_DURATION],
    [1, 0.94, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE },
  )

  return (
    <AbsoluteFill>
      {showBackground && <SceneBackground />}

      <PhoneSceneLayout
        title="跟著 AI 指引完成拍攝"
        subtitle="AI 協助抓好角度、距離與清晰度，完成後自動拍照"
        titleAnim={titleAnim}
        subtitleAnim={subtitleAnim}
        phoneOpacity={phoneProgress}
        phoneScale={0.94 + 0.06 * phoneProgress}
      >
            <PhoneFrame>
              {/* 真實 App 相機權限請求前的「畫面載入中」畫面，借來當開場的
                  冷啟動載入感，淡出後才換成首頁表單內容。 */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 14,
                  opacity: loadingOpacity,
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: UI_LIGHT.accentBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `scale(${loadingPulse})`,
                  }}
                >
                  <CameraIcon size={34} color={UI_LIGHT.accent} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: FONT_FAMILY, fontSize: 23, fontWeight: WEIGHT.subtitle, color: UI_LIGHT.textH }}>
                    畫面載入中...
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontFamily: FONT_FAMILY,
                      fontSize: 15,
                      fontWeight: WEIGHT.body,
                      color: UI_LIGHT.text,
                    }}
                  >
                    正在準備相機，請允許存取權限
                  </div>
                </div>
              </div>

              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '48px 26px 0',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    width: PHONE_WIDTH - 52,
                    opacity: hero.opacity,
                    transform: `translateY(${hero.translateY}px)`,
                  }}
                >
                  <Img
                    src={staticFile('car-models/generic-sedan.png')}
                    style={{ display: 'block', width: '100%', objectFit: 'contain' }}
                  />
                </div>

                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20, marginTop: 22 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...carModelRow }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: WEIGHT.body, color: UI_LIGHT.text }}>
                      車款
                    </span>
                    <div
                      style={{
                        height: 48,
                        padding: '0 14px',
                        borderRadius: 10,
                        border: `1px solid ${UI_LIGHT.border}`,
                        background: UI_LIGHT.bgCard,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 19, fontWeight: WEIGHT.body, color: UI_LIGHT.textH }}>
                        {CAR_MODEL_LABEL}
                      </span>
                      <span style={{ color: UI_LIGHT.text, fontSize: 13 }}>▾</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...plateRow }}>
                    <span style={{ fontFamily: FONT_FAMILY, fontSize: 16, fontWeight: WEIGHT.body, color: UI_LIGHT.text }}>
                      車牌號碼
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PlateBox value={lettersShown} width={76} showCursor={cursorVisible && cursorInLetters} />
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: WEIGHT.title, color: UI_LIGHT.text }}>
                        -
                      </span>
                      <PlateBox value={digitsShown} width={84} showCursor={cursorVisible && !cursorInLetters} />
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部固定 bar，比照真實 App .bottom-bar：頂部細線＋卡片背景＋置中主按鈕 */}
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
                  opacity: buttonRow.opacity,
                  transform: buttonRow.transform,
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
                  開始拍照
                </div>
              </div>
            </PhoneFrame>
      </PhoneSceneLayout>
    </AbsoluteFill>
  )
}

function PlateBox({ value, width, showCursor }: { value: string; width: number; showCursor: boolean }) {
  return (
    <div
      style={{
        width,
        height: 48,
        borderRadius: 10,
        border: `1px solid ${UI_LIGHT.border}`,
        background: UI_LIGHT.bgCard,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <span
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: 24,
          fontWeight: WEIGHT.title,
          letterSpacing: 2,
          color: UI_LIGHT.textH,
        }}
      >
        {value}
      </span>
      {showCursor && <span style={{ width: 2, height: 24, background: UI_LIGHT.accent }} />}
    </div>
  )
}
