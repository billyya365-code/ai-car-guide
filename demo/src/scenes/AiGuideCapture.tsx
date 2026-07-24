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
// 藍框手機外殼、車輛照片上疊車輪／車牌偵測框、下方位置/水平/清晰打勾列、
// 底部自動拍照圓形快門鍵——而不是單純一張去背車輛照片。
const TITLE_START = 0
const TITLE_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

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

// 四格全部完成後，在畫面下方淡入一個「拍攝完成」的確認徽章，停留到這個
// composition 結束（後面接 UploadAnalysis，呼應「拍攝完成→接著上傳分析」）。
// 用 absolute 疊在下方，不动到上面 phones 那排既有的 flex 版面。
const ALL_DONE_START = FINAL_START
const ALL_DONE_DURATION = 20

const PHONE_WIDTH = 340
const PHONE_HEIGHT = 560
const PHOTO_SIZE = 290
// 手機外殼改成中性深灰（真的手機殼的顏色），不用彩色，比較有「用手機在拍照」的實感；
// 內層再疊一條更淡的邊框做金屬邊緣的細節感。
const PHONE_FRAME = '#1b1d21'
const PHONE_FRAME_EDGE = 'rgba(255,255,255,0.1)'
// 底下的「位置/水平/清晰」打勾列，樣式照真實 App（CameraCapture.tsx 的
// STATUS_CHIP_ORDER）：一排膠囊狀狀態列，每項未通過是紅色 ✗、通過後變綠色 ✓，
// 顏色直接用真實 App 那兩個寫死的 hex（#ef4444／#22c55e）。三項依序（不是同時）
// 從 ✗ 翻成 ✓，全部翻完之後才觸發快門拍照——「打勾＝檢查通過→才拍照」的因果
// 關係要看得出來，不是打勾跟拍照同時發生。⚠️ 真實 App 的 STATUS_CHIP_ORDER 其實
// 是位置/距離/清晰（沒有水平），這裡改成位置/水平/清晰是使用者這輪指定的示範
// 內容，刻意跟真實畫面不同，不是忘記同步。
const CHECK_ITEMS = ['位置', '水平', '清晰']
const CHECK_START_OFFSET = 15
const CHECK_STAGGER = 18
const CHECK_POP_DURATION = 10
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

// showBackground=false 是給串成 FullVideo 時用的（見 Root.tsx）：整支影片共用同
// 一個連續播放的 SceneBackground，場景切換時背景不會跟著淡出/淡入或重置，只有
// 前景內容在轉場；個別獨立預覽這個 composition 時維持預設 true，自己畫自己的背景。
export const AiGuideCapture = ({ showBackground = true }: { showBackground?: boolean }) => {
  const frame = useCurrentFrame()

  const title = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const subtitle = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION)
  const row = fadeUp(frame, ROW_START, ROW_DURATION)
  const rowScaleIn = 0.92 + 0.08 * row.progress

  const allDone = fadeUp(frame, ALL_DONE_START, ALL_DONE_DURATION)

  return (
    <AbsoluteFill>
      {showBackground && <SceneBackground />}

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
          即時指引拍攝角度、畫面清晰度與穩定性，符合標準後即自動拍照，把關影像品質
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

            // 三項打勾依序（不是同時）從 ✗ 翻成 ✓，各自的翻面時間點錯開
            // CHECK_STAGGER frame；最後一項翻完到真正拍照（completeStart）之間
            // 留一小段安靜時間，讓「全部通過→才拍照」的因果關係看得出來。
            const checkStates = CHECK_ITEMS.map((label, ci) => {
              const passFrame = scanStart + CHECK_START_OFFSET + ci * CHECK_STAGGER
              const passed = frame >= passFrame
              const sinceFlip = frame - passFrame
              const pop =
                sinceFlip >= 0 && sinceFlip < CHECK_POP_DURATION
                  ? interpolate(sinceFlip, [0, CHECK_POP_DURATION * 0.5, CHECK_POP_DURATION], [1, 1.3, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    })
                  : 1
              return { label, passed, pop }
            })

            // 對焦感：一開始掃描時畫面先短暫失焦模糊再拉回清晰（像相機剛開始對焦），
            // 車輪/車牌框則在整個掃描期間持續小幅呼吸縮放，模擬對焦框一直在微調的感覺。
            const focusBlur = interpolate(frame, [scanStart - 1, scanStart, scanStart + 15], [0, 4, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
            const focusPulse = showScanning ? 1 + 0.05 * Math.sin((frame - scanStart) / 5) : 1

            // 手持感：畫面（車輛照片）本身持續有很輕微的漂移，模擬用手機手持取景時畫面
            // 本來就會有的小幅晃動；拍到（isDone）的瞬間穩定下來，呼應「拍完就定格」。
            // 還沒輪到自己（連 activeStart 都還沒到）的格子維持靜止，不需要先晃——
            // 手持感是「輪到這格、正在拍」才有的動態，不是每一格從頭到尾都在晃。
            const handheldPhase = i * 1.7
            const hasStarted = frame >= activeStart
            const handheldAmount = isDone || !hasStarted ? 0 : 1
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

            // 快門鍵內圓在拍照那一刻像真的被按下一樣稍微縮一下再彈回，
            // 時間點跟白閃同一刻，呼應「按下快門」的觸感。
            const shutterPress = interpolate(
              frame,
              [completeStart - 4, completeStart, completeStart + 8],
              [1, 0.82, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE },
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
                          fontSize: 17,
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
                            padding: '5px 10px',
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: COLORS.glowBright,
                              opacity: dotOpacity,
                            }}
                          />
                          <span
                            style={{
                              fontFamily: FONT_FAMILY,
                              fontSize: 13,
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

                    {/* 位置/水平/清晰打勾列：樣式照真實 App 的狀態膠囊（見上方
                        CHECK_ITEMS 註解），未通過紅色 ✗、通過後變綠色 ✓，三項
                        依序翻面。固定高度的外層 wrapper 讓這排內容淡入淡出時，
                        手機畫面其餘元素（快門鍵等）不會跟著跳動。 */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexShrink: 0, height: 30, opacity: showScanning ? 1 : 0 }}>
                      {checkStates.map(({ label, passed, pop }) => (
                        <span
                          key={label}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontFamily: FONT_FAMILY,
                            fontSize: 15,
                            fontWeight: WEIGHT.subtitle,
                            color: passed ? '#22c55e' : '#ef4444',
                            background: 'rgba(0,0,0,0.45)',
                            padding: '5px 11px',
                            borderRadius: 999,
                            whiteSpace: 'nowrap',
                            transform: `scale(${pop})`,
                          }}
                        >
                          {passed ? '✓' : '✗'} {label}
                        </span>
                      ))}
                    </div>

                    {/* 自動拍照快門鍵：改成 iPhone 相機那種「外圈＋內圓，中間留一圈
                        間隙」的樣式，不再是圓餅裡面直接寫字。AUTO 字樣挪到快門上方
                        （對應 iOS 相機介面拍攝模式文字的位置），內圓在拍照瞬間會像
                        真的按下快門一樣縮一下再彈回（shutterPress，見上方計算）。 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span
                        style={{
                          fontFamily: FONT_FAMILY,
                          fontSize: 10,
                          fontWeight: WEIGHT.subtitle,
                          color: 'rgba(255,255,255,0.7)',
                          letterSpacing: '0.14em',
                        }}
                      >
                        AUTO
                      </span>
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: '50%',
                          border: '3px solid #fff',
                          boxSizing: 'border-box',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: showScanning
                            ? `0 0 ${10 + dotOpacity * 10}px ${3 + dotOpacity * 4}px ${COLORS.glowBright}99`
                            : 'none',
                        }}
                      >
                        <div
                          style={{
                            width: 46,
                            height: 46,
                            borderRadius: '50%',
                            background: '#fff',
                            transform: `scale(${shutterPress})`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 四格都完成後才淡入的「拍攝完成」確認徽章，疊在下方，不影響上面
            phones 那排的版面。 */}
        <div
          style={{
            position: 'absolute',
            bottom: 70,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            opacity: allDone.opacity,
            transform: `translateY(${allDone.translateY}px)`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: 'rgba(0,0,0,0.4)',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 999,
              padding: '14px 32px',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#3fae59',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span style={{ color: '#fff', fontSize: 17, fontWeight: 900, lineHeight: 1 }}>✓</span>
            </div>
            <span
              style={{
                fontFamily: FONT_FAMILY,
                fontWeight: WEIGHT.subtitle,
                fontSize: 32,
                color: COLORS.textH,
              }}
            >
              拍攝完成
            </span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
