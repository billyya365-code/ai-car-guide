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
const CELL_DURATION = 125
const ENLARGE_DURATION = 20
const SCAN_DURATION = 75
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

            const shutterPress = interpolate(
              frame,
              [completeStart - 4, completeStart, completeStart + 8],
              [1, 0.82, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE },
            )

            const mediaStyle: CSSProperties = {
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              // 素材本身頂部有一小截 App 的偵測數值文字（Raw/blur/conf...），單純置中裁切
              // 剛好會露出那截文字的下緣，往下多裁一點點（58% 而不是預設 50%）把它整個
              // 排除在畫面外。
              objectPosition: 'center 58%',
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

                      <div
                        style={{
                          position: 'absolute',
                          top: 6,
                          left: 8,
                          fontFamily: FONT_FAMILY,
                          fontWeight: WEIGHT.subtitle,
                          fontSize: 22,
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

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span
                        style={{
                          fontFamily: FONT_FAMILY,
                          fontSize: 15,
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
