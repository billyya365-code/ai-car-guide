import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { COLORS, FONT_FAMILY, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { EASE, fadeUp } from '../lib/anim'
import { GUIDE_BOXES, LABELS, POSITIONS, type GuideBox } from '../lib/carAngles'

// Page 3｜AI 引導拍照（對應完整影片的 18~40 秒，這裡做成獨立的 22 秒 composition）。
// 節奏：標題淡入 → 四格（車頭左側/車頭右側/車尾右側/車尾左側）以基準大小一起出現 →
// 由左至右依序「輪到誰、誰就放大＋顯示 AI Guide 掃描＋完成打勾」，完成後縮回基準大小、
// 換下一格放大（焦點像接力棒一樣交接），最後第四格也完成後，四格一起回到基準大小、
// 全部打勾做結尾停留。全程只有一個格子在放大，不是四格一起出現/一起完成。
//
// 每一格的樣子照使用者提供的示意圖（demo/photo_temp/圖片1.png）還原成真正的「拍攝畫面」：
// 藍框手機外殼、車輛照片上疊車輪／車牌偵測框、下方水平/直立/位置/距離/清晰打勾列、
// 底部自動拍照圓形快門鍵——而不是單純一張去背車輛照片。
const TITLE_START = 0
const TITLE_DURATION = 30

const ROW_START = 20
const ROW_DURATION = 35

const PROCESS_START = 75
const CELL_DURATION = 125
const ENLARGE_DURATION = 20
// 放大定位後、開始「掃描」到完成之間的時間——從 65 拉長到 75，讓下面的提示文字
// 有足夠時間顯示完整（原本 10 幀含頭尾淡入淡出，扣掉淡入淡出實際全不透明只有
// 4 幀，字都還沒看清楚就切下一則，太趕）。CELL_DURATION／ACTIVE_STARTS／
// FINAL_START 都沒變，只是同一個 125 幀的格子預算裡，掃描階段分到的時間變多、
// 完成打勾後到下一格開始放大之間的閒置時間變少，總長度（22 秒）不受影響。
const SCAN_DURATION = 75
const POP_DURATION = 15

const SHRUNK_SCALE = 0.85
const ACTIVE_SCALE = 1.35

const ACTIVE_STARTS = POSITIONS.map((_, i) => PROCESS_START + i * CELL_DURATION)
const FINAL_START = ACTIVE_STARTS[ACTIVE_STARTS.length - 1] + CELL_DURATION // 575

const PHONE_WIDTH = 340
const PHONE_HEIGHT = 560
const PHOTO_SIZE = 290
// 手機外殼改成中性深灰（真的手機殼的顏色），不用彩色，比較有「用手機在拍照」的實感；
// 內層再疊一條更淡的邊框做金屬邊緣的細節感。
const PHONE_FRAME = '#1b1d21'
const PHONE_FRAME_EDGE = 'rgba(255,255,255,0.1)'
// 真實 App（web/src/hooks/useGuidanceStateMachine.ts 的 GUIDANCE_MESSAGES）一次
// 只顯示「目前優先權最高、還沒通過的那一項」提示文字，不是像這裡原本那樣五項一起
// 常駐打勾——文字內容直接照搬那份對照表，依序切換，最後留一段安靜時間不顯示任何
// 提示（對應 activeGuidance === 'ALL_PASSED' 時完全不顯示提示文字的真實行為）。
// 只放 2 則（位置／清晰度）——使用者這輪指定只保留這兩則，拿掉「請調整拍攝
// 距離」。⚠️ 真實 App（CameraCapture.tsx 的 STATUS_CHIP_ORDER／guidanceMessage）
// 目前還是有顯示「距離」相關的提示，這裡跟真實畫面不完全一致，是刻意的簡化決定
// （使用者只要求 demo 這裡改），不是忘記同步。
const GUIDANCE_HINTS = ['請對準引導框位置', '畫面不清晰，請保持穩定']
const HINT_DURATION = 18
const HINT_FADE = 4
// 車牌框原本用半透明白色，車牌本身底色也偏白/淺色，對比不夠、不明顯，改用亮金黃色
// 並加發光，跟車輪框的藍色分開，兩個框都清楚。
const PLATE_COLOR = '#ffcc33'

function GuideBoxOverlay({
  box,
  kind,
  pulse = 1,
}: {
  box: GuideBox
  kind: 'wheel' | 'plate'
  pulse?: number
}) {
  const isWheel = kind === 'wheel'
  const color = isWheel ? COLORS.glowBright : PLATE_COLOR
  return (
    <div
      style={{
        position: 'absolute',
        left: `${box.xPercent}%`,
        top: `${box.yPercent}%`,
        width: `${box.widthPercent}%`,
        height: `${box.heightPercent}%`,
        border: `2.5px solid ${color}`,
        borderRadius: 4,
        boxShadow: `0 0 8px 1px ${color}`,
        transform: `scale(${pulse})`,
      }}
    />
  )
}

export const AiGuideCapture = () => {
  const frame = useCurrentFrame()

  const title = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const row = fadeUp(frame, ROW_START, ROW_DURATION)
  const rowScaleIn = 0.92 + 0.08 * row.progress

  return (
    <AbsoluteFill>
      <SceneBackground />

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
          AI 引導拍攝
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 64,
            opacity: row.opacity,
            transform: `translateY(${row.translateY}px) scale(${rowScaleIn})`,
          }}
        >
          {POSITIONS.map((pos, i) => {
            const activeStart = ACTIVE_STARTS[i]
            const nextStart = i < POSITIONS.length - 1 ? ACTIVE_STARTS[i + 1] : FINAL_START

            const growProgress = interpolate(frame, [activeStart, activeStart + ENLARGE_DURATION], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: EASE,
            })
            const shrinkProgress = interpolate(frame, [nextStart, nextStart + ENLARGE_DURATION], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: EASE,
            })
            const bump = Math.max(0, growProgress - shrinkProgress)
            const cellScale = SHRUNK_SCALE + (ACTIVE_SCALE - SHRUNK_SCALE) * bump

            const completeStart = activeStart + ENLARGE_DURATION + SCAN_DURATION
            const isDone = frame >= completeStart
            const checkPop = interpolate(
              frame,
              [completeStart, completeStart + POP_DURATION * 0.6, completeStart + POP_DURATION],
              [0, 1.15, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            )

            const scanStart = activeStart + ENLARGE_DURATION
            const showScanning = frame >= scanStart && frame < completeStart
            const scanLinePeriod = 40
            const scanT = ((frame - scanStart) % scanLinePeriod) / scanLinePeriod
            const dotOpacity = 0.5 + 0.5 * Math.sin(frame / 8)

            // 提示文字依序切換：掃描開始後每 HINT_DURATION frame 換下一則，5 則放完
            // （共 5*HINT_DURATION frame）後不再顯示任何提示，剩下的掃描時間安靜
            // 帶過，對應真實 App 全部通過後提示文字消失的狀態。
            const hintsElapsed = frame - scanStart
            const hintIndex = Math.floor(hintsElapsed / HINT_DURATION)
            const hintLocal = hintsElapsed - hintIndex * HINT_DURATION
            const showHint = showScanning && hintIndex >= 0 && hintIndex < GUIDANCE_HINTS.length
            const hintOpacity = showHint
              ? interpolate(
                  hintLocal,
                  [0, HINT_FADE, HINT_DURATION - HINT_FADE, HINT_DURATION],
                  [0, 1, 1, 0],
                  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
                )
              : 0

            // 對焦感：一開始掃描時畫面先短暫失焦模糊再拉回清晰（像相機剛開始對焦），
            // 車輪/車牌框則在整個掃描期間持續小幅呼吸縮放，模擬對焦框一直在微調的感覺。
            const focusBlur = interpolate(frame, [scanStart - 1, scanStart, scanStart + 15], [0, 4, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
            const focusPulse = showScanning ? 1 + 0.05 * Math.sin((frame - scanStart) / 5) : 1

            // 手持感：畫面（車輛照片）本身持續有很輕微的漂移，模擬用手機手持取景時畫面
            // 本來就會有的小幅晃動；拍到（isDone）的瞬間穩定下來，呼應「拍完就定格」。
            const handheldPhase = i * 1.7
            const handheldAmount = isDone ? 0 : 1
            const handheldX = Math.sin(frame / 17 + handheldPhase) * 4 * handheldAmount
            const handheldY = Math.cos(frame / 13 + handheldPhase * 1.3) * 3 * handheldAmount

            const boxes = GUIDE_BOXES[pos]
            // 還沒輪到的畫面先帶一點灰暗（未拍攝感），輪到開始放大時同步淡回正常。車輛本身
            // 是白/銀色，單純 grayscale 幾乎看不出差異，所以還要疊 brightness/opacity 一起降。
            const grayscaleAmount = (1 - growProgress) * 100
            const pendingDimBrightness = 0.45 + 0.55 * growProgress
            const pendingDimOpacity = 0.55 + 0.45 * growProgress

            // 完成瞬間（跟打勾同一刻）畫面白閃一下，模擬真的相機快門拍照的感覺。
            const flashOpacity = interpolate(
              frame,
              [completeStart, completeStart + 3, completeStart + 12],
              [0, 0.85, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            )

            return (
              <div key={pos} style={{ width: PHONE_WIDTH, display: 'flex', justifyContent: 'center' }}>
                <div
                  style={{
                    position: 'relative',
                    transform: `scale(${cellScale})`,
                    transformOrigin: 'center',
                    zIndex: Math.round(cellScale * 100),
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: PHONE_WIDTH,
                      height: PHONE_HEIGHT,
                      borderRadius: 30,
                      border: `8px solid ${PHONE_FRAME}`,
                      outline: `1px solid ${PHONE_FRAME_EDGE}`,
                      outlineOffset: -9,
                      background: '#05070a',
                      boxShadow: '0 20px 40px -12px rgba(0,0,0,0.6)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'space-evenly',
                      gap: 12,
                      padding: '14px 10px 16px',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* 頂部聽筒/相機小黑條 */}
                    <div
                      style={{
                        width: '40%',
                        height: 8,
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.15)',
                        flexShrink: 0,
                      }}
                    />

                    {/* 拍攝畫面本體（正方形取景區） */}
                    <div
                      style={{
                        position: 'relative',
                        width: PHOTO_SIZE,
                        height: PHOTO_SIZE,
                        background: '#000',
                        borderRadius: 10,
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <Img
                        src={staticFile(`car-angles/${pos}.png`)}
                        style={{
                          position: 'absolute',
                          inset: '-4%',
                          width: '108%',
                          height: '108%',
                          objectFit: 'cover',
                          transform: `translate(${handheldX}px, ${handheldY}px)`,
                          filter: `grayscale(${grayscaleAmount}%) brightness(${pendingDimBrightness}) blur(${focusBlur}px)`,
                          opacity: pendingDimOpacity,
                        }}
                      />

                      <GuideBoxOverlay box={boxes.wheel} kind="wheel" pulse={focusPulse} />
                      <GuideBoxOverlay box={boxes.plate} kind="plate" pulse={focusPulse} />

                      <div
                        style={{
                          position: 'absolute',
                          top: 6,
                          left: 8,
                          fontFamily: FONT_FAMILY,
                          fontWeight: WEIGHT.subtitle,
                          fontSize: 13,
                          color: '#fff',
                          textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                        }}
                      >
                        {LABELS[pos]}
                      </div>

                      {showScanning && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: `${scanT * 100}%`,
                            height: 2,
                            background: COLORS.glowBright,
                            boxShadow: `0 0 12px 3px ${COLORS.glowBright}`,
                            opacity: 0.85,
                          }}
                        />
                      )}

                      {showScanning && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            background: 'rgba(0,0,0,0.55)',
                            border: `1px solid ${COLORS.accent}`,
                            borderRadius: 999,
                            padding: '3px 7px',
                          }}
                        >
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: COLORS.glowBright,
                              opacity: dotOpacity,
                            }}
                          />
                          <span
                            style={{
                              fontFamily: FONT_FAMILY,
                              fontSize: 9,
                              fontWeight: WEIGHT.body,
                              color: '#fff',
                              letterSpacing: '0.04em',
                            }}
                          >
                            AI Guide
                          </span>
                        </div>
                      )}

                      {isDone && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            background: '#3fae59',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transform: `scale(${checkPop})`,
                            boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
                          }}
                        >
                          <span style={{ color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: 1 }}>✓</span>
                        </div>
                      )}

                      {/* 快門白閃：跟完成打勾同一瞬間觸發，模擬相機拍照的感覺 */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: '#fff',
                          opacity: flashOpacity,
                          pointerEvents: 'none',
                        }}
                      />
                    </div>

                    {/* 引導提示文字：一次只顯示一則、依序切換，全部通過後安靜下來
                        不顯示任何提示（見上方 hintIndex/hintOpacity 計算），跟真實
                        App 的提示邏輯一致，樣式也比照 CameraCapture.tsx 的提示 pill
                        （琥珀色文字＋半透明底）。固定高度的外層 wrapper 讓提示文字
                        淡入淡出時，手機畫面其餘元素（快門鍵等）不會跟著跳動。 */}
                    <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0, height: 24 }}>
                      {showHint && (
                        <span
                          style={{
                            fontFamily: FONT_FAMILY,
                            fontSize: 11,
                            fontWeight: WEIGHT.subtitle,
                            color: '#fbbf24',
                            background: 'rgba(0,0,0,0.45)',
                            padding: '4px 12px',
                            borderRadius: 8,
                            whiteSpace: 'nowrap',
                            opacity: hintOpacity,
                          }}
                        >
                          {GUIDANCE_HINTS[hintIndex]}
                        </span>
                      )}
                    </div>

                    {/* 自動拍照快門鍵 */}
                    <div
                      style={{
                        width: 54,
                        height: 54,
                        borderRadius: '50%',
                        background: '#fff',
                        border: '3px solid rgba(255,255,255,0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: showScanning
                          ? `0 0 ${10 + dotOpacity * 10}px ${3 + dotOpacity * 4}px ${COLORS.glowBright}99`
                          : 'none',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: FONT_FAMILY,
                          fontSize: 12,
                          fontWeight: WEIGHT.subtitle,
                          color: '#222',
                          textAlign: 'center',
                          letterSpacing: '0.02em',
                        }}
                      >
                        Auto
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
