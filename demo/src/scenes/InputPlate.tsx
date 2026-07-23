import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { COLORS, FONT_FAMILY, UI_LIGHT, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { EASE, fadeUp, slideIn } from '../lib/anim'

// Page 2｜輸入車牌（對應完整影片的 8~18 秒，這裡先做成獨立的 10 秒 composition）。
// 節奏：標題/副標題淡入 → 車輛圖與輸入卡片淡入放大 → 卡片內游標閃爍等待輸入 →
// 逐字打完 ABC-1234 → 「開始拍照」按鈕出現並發光、最後模擬按下。

const HEADER_START = 0
const HEADER_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

const CAR_START = 15
const CAR_DURATION = 35 // 車輛先出現、穩定（~50）

// 右側輸入卡片明顯晚於車輛才出現，而不是幾乎同時。
const CARD_START = 58
// 卡片本身用真實 App 的 1:1 px 數值畫，再整個用 transform: scale() 放大，
// 對應指示「整個 UI 放大」，這裡取 1.8（左右各半版面，可以再放大一些）。
const CARD_SCALE = 1.8
const CAR_WIDTH = 720

// 右側改成逐行列出：車款欄、車牌欄各自從右側滑入＋淡入，中間錯開一點時間，
// 而不是整個卡片一次性淡入，比較有「一項一項出現」的節奏感。
const ROW_DURATION = 26
const ROW_STAGGER = 16
const CAR_MODEL_ROW_START = CARD_START
const PLATE_ROW_START = CARD_START + ROW_STAGGER
const LAST_ROW_SETTLED = PLATE_ROW_START + ROW_DURATION // 100

const CURSOR_START = LAST_ROW_SETTLED // 100：欄位都出現後，游標先在空欄位閃爍一下
const TYPING_START = CURSOR_START + 12 // 112
const PLATE_LETTERS = 'ABC'
const PLATE_DIGITS = '1234'
const FULL_PLATE = PLATE_LETTERS + PLATE_DIGITS // 7 碼
const FRAMES_PER_CHAR = 8
const TYPING_DURATION = FULL_PLATE.length * FRAMES_PER_CHAR // 56
const TYPING_END = TYPING_START + TYPING_DURATION // 168

const BUTTON_START = TYPING_END + 20 // 188：打完字停頓一下按鈕才出現
const BUTTON_DURATION = 25
const GLOW_START = BUTTON_START + BUTTON_DURATION // 213
const GLOW_PERIOD = 45

const PRESS_FRAME = 260
const PRESS_DURATION = 14

export const InputPlate = () => {
  const frame = useCurrentFrame()

  const header = fadeUp(frame, HEADER_START, HEADER_DURATION)
  const subtitle = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION)

  // 左右兩欄不只是淡出/淡入，而是從畫面外側往中間滑入＋放大，車輛從左邊滑入、
  // 輸入欄位從右邊滑入，跟左右分欄的版面互相呼應，比單純 opacity 淡入更有動態感。
  const carProgress = interpolate(frame, [CAR_START, CAR_START + CAR_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })
  const carOpacity = carProgress
  const carTranslateX = (1 - carProgress) * -140
  const carScale = 0.85 + 0.15 * carProgress

  const carModelRow = slideIn(frame, CAR_MODEL_ROW_START, ROW_DURATION, 70)
  const plateRow = slideIn(frame, PLATE_ROW_START, ROW_DURATION, 70)

  const typedCount = Math.floor(
    interpolate(frame, [TYPING_START, TYPING_START + TYPING_DURATION], [0, FULL_PLATE.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  )
  const lettersShown = PLATE_LETTERS.slice(0, Math.min(typedCount, 3))
  const digitsShown = PLATE_DIGITS.slice(0, Math.max(0, typedCount - 3))
  const cursorInLetters = typedCount < 3

  const cursorActive = frame >= CURSOR_START && frame < BUTTON_START
  const cursorVisible = cursorActive && Math.floor(frame / 16) % 2 === 0

  const buttonRow = slideIn(frame, BUTTON_START, BUTTON_DURATION, 50)
  const glowPhase = Math.max(0, frame - GLOW_START) / GLOW_PERIOD
  const glowIntensity = 0.5 + 0.5 * Math.sin(glowPhase * Math.PI * 2)

  const pressScale = interpolate(
    frame,
    [PRESS_FRAME, PRESS_FRAME + PRESS_DURATION / 2, PRESS_FRAME + PRESS_DURATION],
    [1, 0.93, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE },
  )

  return (
    <AbsoluteFill>
      <SceneBackground />

      <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', paddingTop: 90 }}>
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 64,
            fontWeight: WEIGHT.title,
            color: COLORS.textH,
            letterSpacing: '0.02em',
            opacity: header.opacity,
            transform: `translateY(${header.translateY}px)`,
          }}
        >
          跟著 AI 指引完成拍攝
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
          AI 協助抓好角度、距離與清晰度，完成後自動拍照
        </div>

        <div
          style={{
            flex: 1,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '100%', display: 'flex' }}>
            {/* 左半邊：對應車款的實際車輛去背圖 */}
            <div style={{ width: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div
                style={{
                  position: 'relative',
                  width: CAR_WIDTH,
                  opacity: carOpacity,
                  transform: `translateX(${carTranslateX}px) scale(${carScale})`,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '6%',
                    width: '80%',
                    height: '30%',
                    transform: 'translateX(-50%)',
                    background: `radial-gradient(ellipse, ${COLORS.glowMid} 0%, transparent 72%)`,
                    opacity: 0.55,
                    filter: 'blur(6px)',
                  }}
                />
                <Img
                  src={staticFile('car-models/toyota-corolla-altis.png')}
                  style={{
                    position: 'relative',
                    display: 'block',
                    width: '100%',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.55))',
                  }}
                />
              </div>
            </div>

            {/* 右半邊：目前 App 既有的「輸入車牌」畫面欄位（不含按鈕，按鈕移到下方置中）。
                只還原欄位本身（select/輸入框保留自己的淺色底），拿掉外層那個大白色卡片框，
                讓欄位直接浮在深色場景上。這裡不整組一起淡入，而是每一行各自從右側滑入，
                做出逐行列出的節奏感。 */}
            <div style={{ width: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ transform: `scale(${CARD_SCALE})` }}>
                <div
                  style={{
                    width: 380,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 22,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...carModelRow }}>
                    <span
                      style={{
                        fontFamily: FONT_FAMILY,
                        fontSize: 13,
                        fontWeight: WEIGHT.body,
                        color: COLORS.text,
                      }}
                    >
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
                      <span
                        style={{
                          fontFamily: FONT_FAMILY,
                          fontSize: 16,
                          fontWeight: WEIGHT.body,
                          color: UI_LIGHT.textH,
                        }}
                      >
                        Toyota Corolla Altis
                      </span>
                      <span style={{ color: UI_LIGHT.text, fontSize: 12 }}>▾</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...plateRow }}>
                    <span
                      style={{
                        fontFamily: FONT_FAMILY,
                        fontSize: 13,
                        fontWeight: WEIGHT.body,
                        color: COLORS.text,
                      }}
                    >
                      車牌號碼
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PlateBox
                        value={lettersShown}
                        width={76}
                        showCursor={cursorVisible && cursorInLetters}
                      />
                      <span
                        style={{
                          fontFamily: FONT_FAMILY,
                          fontSize: 20,
                          fontWeight: WEIGHT.title,
                          color: COLORS.text,
                        }}
                      >
                        -
                      </span>
                      <PlateBox
                        value={digitsShown}
                        width={84}
                        showCursor={cursorVisible && !cursorInLetters}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 開始拍照按鈕移到左右兩欄下方、置中——往下移一點，跟上面欄位拉開多一點距離 */}
          <div
            style={{
              marginTop: 110,
              opacity: buttonRow.opacity,
              transform: `${buttonRow.transform} scale(${CARD_SCALE * pressScale})`,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                fontFamily: FONT_FAMILY,
                fontSize: 17,
                fontWeight: WEIGHT.subtitle,
                color: '#fff',
                background: UI_LIGHT.accent,
                borderRadius: 14,
                padding: '14px 36px',
                boxShadow: `0 0 ${18 + glowIntensity * 22}px ${6 + glowIntensity * 8}px rgba(94,120,146,${0.25 + glowIntensity * 0.35})`,
              }}
            >
              開始拍照
            </div>
          </div>
        </div>
      </AbsoluteFill>
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
          fontSize: 22,
          fontWeight: WEIGHT.title,
          letterSpacing: 2,
          color: UI_LIGHT.textH,
        }}
      >
        {value}
      </span>
      {showCursor && (
        <span
          style={{
            width: 2,
            height: 22,
            background: UI_LIGHT.accent,
          }}
        />
      )}
    </div>
  )
}
