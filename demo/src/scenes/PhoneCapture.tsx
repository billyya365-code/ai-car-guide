import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { FONT_FAMILY, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { PhoneFrame, PHONE_WIDTH } from '../components/PhoneFrame'
import { PhoneSceneLayout } from '../components/PhoneSceneLayout'
import { EASE, fadeUp } from '../lib/anim'
import { GUIDE_BOXES, LABELS, POSITIONS, type GuideBox } from '../lib/carAngles'

// 第二支影片 Page 2｜AI 引導拍攝（18 秒）。忠實還原真實 App
// CameraCapture.tsx 的即時取景畫面：中央方形取景框＋白色虛線目標框（常駐）＋
// AI 即時偵測框（藍色追蹤中脈動／綠色已對準發光）、頂部琥珀色提示文字膠囊、
// 下方「位置/距離/清晰」狀態膠囊、底部自動快門圓環。四個角度依序切換
// （跟真實 App 拍攝順序一致：車頭左側→車頭右側→車尾右側→車尾左側），最後
// 疊一次「拍攝完成！」＋車牌核對卡片當作收尾（真實 App 每張都會出現這個卡片，
// 這裡只在最後一張做一次，避免四次都重複同一個動作、拖長片長）。
// 顏色沿用真實 App 這個畫面上的固定寫死色（不是跟著主題走的變數，因為相機
// 疊層本來就永遠是深色）：目標框 rgba(255,255,255,0.75)、追蹤中藍 #3b82f6、
// 已對準綠 #22c55e、提示文字琥珀 #fbbf24、狀態膠囊紅 #ef4444/綠 #22c55e、
// 快門進度弧 #7c97ad。
const TITLE_START = 0
const TITLE_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

const PHONE_START = 15
const PHONE_DURATION = 25

const CONTENT_START = PHONE_START + 15 // 相機內容比手機外殼稍晚一點點淡入

const ANGLE_DURATION = 110
const ANGLE_STARTS = POSITIONS.map((_, i) => CONTENT_START + i * ANGLE_DURATION)
const IMAGE_FADE_DURATION = 12
const CHIP_START_OFFSET = 15
const CHIP_STAGGER = 16
const LOCK_AT = 78 // 對準/發光的時間點（角度自己的本地時間）
const CAPTURE_AT = 98 // 快門觸發

const FINAL_START = ANGLE_STARTS[ANGLE_STARTS.length - 1] + ANGLE_DURATION
const DIALOG_FADE = 15

const SQUARE_SIZE = 336

const GUIDE_BOX_COLOR = 'rgba(255,255,255,0.75)'
const TRACKING_COLOR = '#3b82f6'
const LOCKED_COLOR = '#22c55e'
const HINT_COLOR = '#fbbf24'
const CHIP_FAIL = '#ef4444'
const CHIP_PASS = '#22c55e'
const SHUTTER_COLOR = '#7c97ad'

// 每個角度提示文字只挑一句循環用的訊息（真實 App 是依優先權切換好幾種，這裡
// 精簡成每個角度各自固定一句最常見的提示，避免同一個 18 秒場景塞太多文字）。
const HINT_TEXT: Record<(typeof POSITIONS)[number], string> = {
  front_left: '請對準引導框位置',
  front_right: '請對準引導框位置',
  rear_right: '請調整拍攝距離',
  rear_left: '畫面不清晰，請保持穩定',
}

const CHIP_ITEMS = ['位置', '距離', '清晰']

function TargetBox({ box }: { box: GuideBox }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: `${box.xPercent}%`,
        top: `${box.yPercent}%`,
        width: `${box.widthPercent}%`,
        height: `${box.heightPercent}%`,
        border: `2px dashed ${GUIDE_BOX_COLOR}`,
        borderRadius: 4,
      }}
    />
  )
}

function DetectedBox({ box, locked, pulse }: { box: GuideBox; locked: boolean; pulse: number }) {
  const color = locked ? LOCKED_COLOR : TRACKING_COLOR
  return (
    <div
      style={{
        position: 'absolute',
        left: `${box.xPercent}%`,
        top: `${box.yPercent}%`,
        width: `${box.widthPercent}%`,
        height: `${box.heightPercent}%`,
        border: `2px solid ${color}`,
        borderRadius: 4,
        opacity: locked ? 1 : pulse,
        boxShadow: locked ? `0 0 10px 2px ${color}99` : 'none',
      }}
    />
  )
}

export const PhoneCapture = ({ showBackground = true }: { showBackground?: boolean }) => {
  const frame = useCurrentFrame()

  const titleAnim = fadeUp(frame, TITLE_START, TITLE_DURATION)
  const subtitleAnim = fadeUp(frame, SUBTITLE_START, SUBTITLE_DURATION)

  const phoneProgress = interpolate(frame, [PHONE_START, PHONE_START + PHONE_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  })

  // 目前是第幾個角度、在該角度自己的本地時間
  const angleIndex = Math.min(
    POSITIONS.length - 1,
    Math.max(0, Math.floor((frame - CONTENT_START) / ANGLE_DURATION)),
  )
  const angleStart = ANGLE_STARTS[angleIndex]
  const localT = frame - angleStart
  const pos = POSITIONS[angleIndex]
  const boxes = GUIDE_BOXES[pos]

  const imageOpacity = interpolate(localT, [0, IMAGE_FADE_DURATION], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const locked = localT >= LOCK_AT
  const pulse = 0.55 + 0.45 * Math.sin(frame / 8)

  // 手持感：畫面本身持續有輕微漂移，模擬手機手持取景時的小幅晃動；越接近
  // 對準（LOCK_AT）晃動越小，暗示「快拍到了、手自然會放穩」，對準之後完全
  // 靜止（呼應「拍到就定格」），不是整個角度從頭晃到尾。每個角度的晃動相位
  // 錯開（handheldPhase），四個角度看起來不會是同一個節奏在晃。
  const handheldPhase = angleIndex * 1.7
  const jitterAmount = interpolate(localT, [0, LOCK_AT - 15, LOCK_AT], [1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const handheldX = Math.sin(frame / 17 + handheldPhase) * 5 * jitterAmount
  const handheldY = Math.cos(frame / 13 + handheldPhase * 1.3) * 4 * jitterAmount

  const hintOpacity = interpolate(
    localT,
    [CHIP_START_OFFSET, CHIP_START_OFFSET + 8, LOCK_AT - 8, LOCK_AT],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const chipStates = CHIP_ITEMS.map((label, ci) => {
    const passFrame = CHIP_START_OFFSET + ci * CHIP_STAGGER
    return { label, passed: localT >= passFrame }
  })

  const flashOpacity = interpolate(localT, [CAPTURE_AT, CAPTURE_AT + 3, CAPTURE_AT + 14], [0, 0.85, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const shutterFillProgress = interpolate(localT, [LOCK_AT, CAPTURE_AT], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const shutterPress = interpolate(
    localT,
    [CAPTURE_AT - 4, CAPTURE_AT, CAPTURE_AT + 8],
    [1, 0.82, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE },
  )

  const isFinalDialog = frame >= FINAL_START
  const dialogOpacity = interpolate(frame, [FINAL_START, FINAL_START + DIALOG_FADE], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill>
      {showBackground && <SceneBackground />}

      <PhoneSceneLayout
        title="AI 引導拍攝"
        subtitle="即時指引拍攝角度、畫面清晰度與穩定性，符合標準後即自動拍照，把關影像品質"
        titleAnim={titleAnim}
        subtitleAnim={subtitleAnim}
        phoneOpacity={phoneProgress}
        phoneScale={0.94 + 0.06 * phoneProgress}
      >
            <PhoneFrame screenBackground="#000">
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 18,
                }}
              >
                {/* 角度圖示列：4 個角度各自一個方塊（真實 App 是圖示，這裡精簡成
                    角度縮寫文字），目前角度亮起、完成的打勾。 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {POSITIONS.map((p, i) => {
                      const isActive = i === angleIndex
                      const isDone = i < angleIndex || (i === angleIndex && isFinalDialog)
                      return (
                        <div
                          key={p}
                          style={{
                            position: 'relative',
                            width: 46,
                            height: 46,
                            borderRadius: 10,
                            border: `2px solid rgba(255,255,255,${isActive ? 0.9 : 0.25})`,
                            background: `rgba(255,255,255,${isActive ? 0.2 : 0.05})`,
                            opacity: isActive || isDone ? 1 : 0.4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <span style={{ fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: WEIGHT.subtitle, color: '#fff' }}>
                            {LABELS[p].slice(1, 3)}
                          </span>
                          {isDone && (
                            <div
                              style={{
                                position: 'absolute',
                                top: -5,
                                right: -5,
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                background: '#22c55e',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <span style={{ color: '#fff', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <span style={{ fontFamily: FONT_FAMILY, fontSize: 17, fontWeight: WEIGHT.subtitle, color: '#fff' }}>
                    {LABELS[pos]}
                  </span>
                </div>

                {/* 中央方形取景框 */}
                <div
                  style={{
                    position: 'relative',
                    width: SQUARE_SIZE,
                    height: SQUARE_SIZE,
                    overflow: 'hidden',
                    borderRadius: 8,
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                  }}
                >
                  <Img
                    src={staticFile(`car-angles/${pos}.png`)}
                    style={{
                      position: 'absolute',
                      // 跟 lib/carAngles.ts 的校正工具（Calibration.tsx）用同一種
                      // 單純 inset:0/100%/100%/object-fit:cover 置中裁切——GUIDE_BOXES
                      // 座標就是照這個裁切方式量出來的，車身頂端留一點點暗邊是這組
                      // 素材本身的樣子（真實相機取景也常見），不需要額外放大裁掉，
                      // 放大裁切反而會讓車輪/車牌跟著等比例位移，跟框線對不上。
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      opacity: imageOpacity,
                      transform: `translate(${handheldX}px, ${handheldY}px)`,
                    }}
                  />

                  <TargetBox box={boxes.wheel} />
                  <TargetBox box={boxes.plate} />
                  <DetectedBox box={boxes.wheel} locked={locked} pulse={pulse} />
                  <DetectedBox box={boxes.plate} locked={locked} pulse={pulse} />

                  {!locked && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 10,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.45)',
                        padding: '5px 14px',
                        borderRadius: 8,
                        opacity: hintOpacity,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 700, color: HINT_COLOR }}>
                        {HINT_TEXT[pos]}
                      </span>
                    </div>
                  )}

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

                {/* 狀態膠囊：位置/距離/清晰 */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {chipStates.map(({ label, passed }) => (
                    <span
                      key={label}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        fontFamily: FONT_FAMILY,
                        fontSize: 14,
                        fontWeight: 700,
                        color: passed ? CHIP_PASS : CHIP_FAIL,
                        background: 'rgba(0,0,0,0.45)',
                        padding: '4px 10px',
                        borderRadius: 999,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {passed ? '✓' : '✗'} {label}
                    </span>
                  ))}
                </div>

                {/* 自動快門圓環 */}
                <div style={{ position: 'relative', width: 72, height: 72 }}>
                  <svg width={72} height={72} style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                    <circle cx={36} cy={36} r={32} stroke="rgba(255,255,255,0.3)" strokeWidth={5} fill="none" />
                    <circle
                      cx={36}
                      cy={36}
                      r={32}
                      stroke={SHUTTER_COLOR}
                      strokeWidth={5}
                      fill="none"
                      strokeDasharray={2 * Math.PI * 32}
                      strokeDashoffset={2 * Math.PI * 32 * (1 - shutterFillProgress)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 8,
                      borderRadius: '50%',
                      background: locked ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: `scale(${shutterPress})`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT_FAMILY,
                        fontSize: 10,
                        fontWeight: 700,
                        color: locked ? '#1c1c1e' : 'rgba(255,255,255,0.7)',
                        textAlign: 'center',
                        lineHeight: 1.2,
                      }}
                    >
                      自動
                      <br />
                      拍攝
                    </span>
                  </div>
                </div>
              </div>

              {/* 拍攝完成！＋車牌核對卡片，只在最後一張拍完後出現一次 */}
              {isFinalDialog && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.75)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: dialogOpacity,
                  }}
                >
                  <div
                    style={{
                      width: 280,
                      background: '#23261d',
                      borderRadius: 10,
                      padding: 18,
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ fontFamily: FONT_FAMILY, fontSize: 19, fontWeight: WEIGHT.subtitle, color: '#f2f0e6' }}>
                      拍攝完成！
                    </div>
                    <div style={{ marginTop: 10, fontFamily: FONT_FAMILY, fontSize: 16, color: '#a8c398' }}>
                      ✓ 車牌號碼辨識成功
                    </div>
                  </div>
                </div>
              )}
            </PhoneFrame>
      </PhoneSceneLayout>
    </AbsoluteFill>
  )
}
