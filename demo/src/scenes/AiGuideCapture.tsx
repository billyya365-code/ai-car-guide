import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { COLORS, FONT_FAMILY, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { EASE, fadeUp } from '../lib/anim'
import { CROP_SIDE, CROP_ZOOM, GUIDE_BOXES, LABELS, POSITIONS, type GuideBox } from '../lib/carAngles'

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
const SCAN_DURATION = 65 // 放大定位後、開始「掃描」到完成之間的時間
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
const STATUS_ITEMS = ['水平', '直立', '位置', '距離', '清晰']
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
                          top: '50%',
                          ...(CROP_SIDE[pos] === 'left' ? { left: 0 } : { right: 0 }),
                          width: PHOTO_SIZE * CROP_ZOOM,
                          height: 'auto',
                          transform: `translate(${handheldX}px, calc(-50% + ${handheldY}px))`,
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

                    {/* 水平/直立/位置/距離/清晰 打勾列 */}
                    <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                      {STATUS_ITEMS.map((label) => (
                        <span
                          key={label}
                          style={{
                            fontFamily: FONT_FAMILY,
                            fontSize: 10,
                            fontWeight: WEIGHT.body,
                            color: '#3ddc71',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          ✓{label}
                        </span>
                      ))}
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
