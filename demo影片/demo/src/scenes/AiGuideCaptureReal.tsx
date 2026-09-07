import type { CSSProperties } from 'react'
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { COLORS, FONT_FAMILY, WEIGHT } from '../theme'
import { SceneBackground } from '../components/SceneBackground'
import { EASE, fadeUp } from '../lib/anim'
import { LABELS, type Position } from '../lib/carAngles'

// AiGuideCapture 的「實拍版」：排版、動畫節奏完全沿用 AiGuideCapture.tsx，
// 只把每一格的畫面來源從去背 CGI 車輛圖換成真實螢幕錄影素材（見 demo/public/footage，
// 剪自 golden_photos/ScreenRecording_07-22-2026 09-50-48_1.mp4，一鏡到底繞車拍攝）。
// 這支素材本身就是真實 App 運作畫面，已經內建真的車輪／車牌偵測框，所以這裡刻意
// 不疊加 AiGuideCapture.tsx 原本那組寫死座標的藍/黃框（GuideBoxOverlay）——雙層框
// 會對不齊、也是多餘的；也不加模擬手持晃動（handheldX/handheldY）——真實素材本身
// 就有真實的手持感，疊加假晃動只會互相干擾。
//
// 素材裡的實際拍攝順序是 左前→左後→右後→右前（使用者當時繞車行走的路線），
// 跟 carAngles.ts 的 POSITIONS 順序（front_left/front_right/rear_right/rear_left）
// 不同——這裡刻意照素材本身的真實順序播放，不重新排序湊合原本順序。
const REAL_ORDER: Position[] = ['front_left', 'rear_left', 'rear_right', 'front_right']

const TITLE_START = 0
const TITLE_DURATION = 30
const SUBTITLE_START = 12
const SUBTITLE_DURATION = 30

const ROW_START = 20
const ROW_DURATION = 35

const PROCESS_START = 75
// 4 支素材現在都統一剪成 72 frame（2.4s，見 public/footage），SCAN_DURATION 訂為
// 84 frame（2.8s），兩者相減＝12 frame（0.4s），就是每支素材播完後、切到海報圖前
// 統一的停格秒數。CELL_DURATION − ENLARGE_DURATION − SCAN_DURATION＝24 frame（0.8s），
// 是「拍完打勾後、換下一格前」的停留秒數。
const CELL_DURATION = 128
const ENLARGE_DURATION = 20
const SCAN_DURATION = 84
const POP_DURATION = 15

const SHRUNK_SCALE = 0.85
const ACTIVE_SCALE = 1.35

const ACTIVE_STARTS = REAL_ORDER.map((_, i) => PROCESS_START + i * CELL_DURATION)
const FINAL_START = ACTIVE_STARTS[ACTIVE_STARTS.length - 1] + CELL_DURATION

const ALL_DONE_START = FINAL_START
const ALL_DONE_DURATION = 20

const PHONE_WIDTH = 340
const PHONE_HEIGHT = 560
const PHOTO_SIZE = 290
// 素材裡實際拍攝畫面（含最下方的手動快門圓鈕）比原本的正方形裁切窗還要長，
// 拉高這個高度、改用長方形取代正方形，才能完整露出素材本身的快門鈕，
// 不會被裁掉下緣（見下方 mediaStyle 的 objectPosition 調整說明）。
const MEDIA_HEIGHT = 310
// 「AI Guide」膠囊用的是中文可顯示字型，實際渲染高度（含字型 line-height／
// border／padding）比看數字估的還高，量測實際渲染結果約 50px，這裡抓 56 留一點餘裕，
// 不然膠囊下緣還是會被下面的實拍畫面黑底蓋掉一小截。
const HEADER_HEIGHT = 56
const PHONE_FRAME = '#1b1d21'
const PHONE_FRAME_EDGE = 'rgba(255,255,255,0.1)'


export const AiGuideCaptureReal = ({ showBackground = true }: { showBackground?: boolean }) => {
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
            fontSize: 36,
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
          {REAL_ORDER.map((pos, i) => {
            const activeStart = ACTIVE_STARTS[i]
            const nextStart = i < REAL_ORDER.length - 1 ? ACTIVE_STARTS[i + 1] : FINAL_START

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

            // 對焦感維持：一開始掃描時畫面先短暫失焦模糊再拉回清晰。真實素材本身已經有
            // 手持感，這裡不再疊加額外的模擬晃動（handheldX/handheldY）。
            const focusBlur = interpolate(frame, [scanStart - 1, scanStart, scanStart + 15], [0, 4, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })

            // 還沒輪到的畫面先帶一點灰暗（未拍攝感），輪到開始放大時同步淡回正常。
            const grayscaleAmount = (1 - growProgress) * 100
            const pendingDimBrightness = 0.45 + 0.55 * growProgress
            const pendingDimOpacity = 0.55 + 0.45 * growProgress

            const flashOpacity = interpolate(
              frame,
              [completeStart, completeStart + 3, completeStart + 12],
              [0, 0.85, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            )

            const mediaStyle: CSSProperties = {
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              // 素材本身頂部有一小截 App 的偵測數值文字（Raw/blur/conf...），單純置中裁切
              // 剛好會露出那截文字的下緣，往下多裁一點點把它整個排除在畫面外；框高改成
              // MEDIA_HEIGHT（比原本正方形高）之後，裁切窗底端也跟著往下延伸，
              // 剛好完整露出素材本身的快門圓鈕，不會被切掉下緣。
              objectPosition: 'center 64%',
              filter: `grayscale(${grayscaleAmount}%) brightness(${pendingDimBrightness}) blur(${focusBlur}px)`,
              opacity: pendingDimOpacity,
            }

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
                    <div
                      style={{
                        width: '40%',
                        height: 8,
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.15)',
                        flexShrink: 0,
                      }}
                    />

                    <div style={{ width: PHOTO_SIZE, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                      {/* 標頭列：角度說明詞放左側、AI Guide 提示／完成打勾放右側，兩者
                          對齊同一列（垂直置中），固定高度＝實測膠囊高度，讓下面的實拍
                          畫面永遠從膠囊下緣之後才開始，不會互相疊到。 */}
                      <div
                        style={{
                          position: 'relative',
                          height: HEADER_HEIGHT,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: FONT_FAMILY,
                            fontWeight: WEIGHT.subtitle,
                            fontSize: 22,
                            color: '#fff',
                          }}
                        >
                          {LABELS[pos]}
                        </span>

                        {showScanning && (
                          <div
                            style={{
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
                                fontSize: 20,
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
                      </div>

                      <div
                        style={{
                          position: 'relative',
                          width: PHOTO_SIZE,
                          height: MEDIA_HEIGHT,
                          background: '#000',
                          borderRadius: 10,
                          overflow: 'hidden',
                          flexShrink: 0,
                        }}
                      >
                        {/* 静态海报帧：pending／done 狀態都顯示同一張（掃描窗已經是「畫面已
                            穩定鎖定」那一刻，跟影片播完的最後畫面差異很小），只有掃描中才切
                            換成真正播放的影片。 */}
                        {!showScanning && (
                          <Img src={staticFile(`footage/${pos}_poster.png`)} style={mediaStyle} />
                        )}
                        {/* Sequence 把子元件的時間軸位移到「從 scanStart 那一刻開始算 0」，
                            OffthreadVideo 才會從影片素材的第 0 幀開始播，而不是把 scanStart
                            當成全域幀數疊加上去（那樣會直接跳到遠超過素材長度的畫面，
                            整格只剩黑底）。layout="none" 讓 Sequence 只做時間位移，
                            不套用它預設的 AbsoluteFill 定位，才不會打亂外層 flex 版面。 */}
                        <Sequence from={scanStart} durationInFrames={SCAN_DURATION} layout="none">
                          <OffthreadVideo src={staticFile(`footage/${pos}.mp4`)} muted style={mediaStyle} />
                        </Sequence>

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

                      {/* 素材本身已經內建真的拍照按鈕，這裡不再疊加一個假的快門圓鈕，
                          只保留「自動拍攝」文字說明（用字跟專案程式碼裡的 AutoShutter／
                          CameraCapture／handleAutoCapture 這組「Capture」用詞一致）。 */}
                      <div
                        style={{
                          marginTop: 10,
                          textAlign: 'center',
                          fontFamily: FONT_FAMILY,
                          fontSize: 15,
                          fontWeight: WEIGHT.subtitle,
                          color: 'rgba(255,255,255,0.7)',
                          letterSpacing: '0.14em',
                        }}
                      >
                        AUTO CAPTURE
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

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
