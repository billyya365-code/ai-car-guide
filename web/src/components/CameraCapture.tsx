import { useEffect, useRef, useState } from 'react'
import * as tf from '@tensorflow/tfjs'
import { useCameraCapture } from '../platform/useCameraCapture'
import { useSensorPermission, type SensorPermissionState } from '../platform/useSensorPermission'
import { useOrientationGuard } from '../platform/useOrientationGuard'
import { useGyroscopeGuard } from '../platform/useGyroscopeGuard'
import { GUIDANCE_MESSAGES, useGuidanceStateMachine } from '../hooks/useGuidanceStateMachine'
import {
  DISTANCE_DIRECTION_MESSAGES,
  POSITION_DIRECTION_MESSAGES,
  useVisionGuidance,
} from '../hooks/useVisionGuidance'
import { useBlurDetection } from '../hooks/useBlurDetection'
import { usePlateOCR } from '../hooks/usePlateOCR'
import { AutoShutter } from './AutoShutter'

// 內層引導方格的定位參數：相對外層相機容器的百分比座標（不是絕對像素），
// 之後四個方位模板（front_left / front_right / back_left / back_right）各自傳入不同數值。
// target 對應任務 2 模型的兩個偵測類別，之後任務 6 會用這個欄位比對 AI 偵測結果落在哪一個引導框內。
export interface GuideBoxProps {
  target: 'wheel' | 'license_plate'
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
  label?: string
}

// 靜態目標引導框（黃金位置）：灰色虛線，代表「該對準的位置」
const GUIDE_BOX_COLOR = '#9ca3af'
// 即時偵測框：中心點落在對應的虛線引導框內時為綠色（已對準），框外時為橘色（尚未對準）
const DETECTED_BOX_COLOR_INSIDE = '#22c55e'
const DETECTED_BOX_COLOR_OUTSIDE = '#f97316'

// 只用偵測框「中心點」是否落在引導框矩形範圍內判斷，不要求偵測框整個框完全被包住
// （引導框跟偵測框大小本來就不會完全一致，用中心點夠直覺也夠穩定）。
function isCenterInsideGuideBox(centerXPercent: number, centerYPercent: number, guideBox: GuideBoxProps): boolean {
  return (
    centerXPercent >= guideBox.xPercent &&
    centerXPercent <= guideBox.xPercent + guideBox.widthPercent &&
    centerYPercent >= guideBox.yPercent &&
    centerYPercent <= guideBox.yPercent + guideBox.heightPercent
  )
}

const SENSOR_PERMISSION_LABELS: Record<SensorPermissionState, string> = {
  granted: '已授權',
  denied: '已拒絕（將使用手動拍照模式）',
  not_required: '不需要授權（Android/桌機）',
}

export interface CameraCaptureProps {
  // 不傳 guideBoxes 時為一般取景模式（例如任務 9 的補拍相機），不套用任何引導框
  guideBoxes?: GuideBoxProps[]
  // 不傳時跳過車牌 OCR 核對（isPlateOk 視為通過）——目前尚無車輛資料輸入流程可取得此值
  expectedPlateNumber?: string
  // 傳入時啟用任務 8 的自動快門（優先權 1~6 全通過且靜止 1 秒後自動拍攝），
  // 不傳（例如任務 9 的一般取景補拍相機）則完全不啟用自動快門邏輯
  onCapture?: (base64Image: string) => void
  onStreamReady?: (info: { stream: MediaStream; aspectRatio: number }) => void
  onSensorPermissionChange?: (state: SensorPermissionState) => void
}

export function CameraCapture({
  guideBoxes,
  expectedPlateNumber,
  onCapture,
  onStreamReady,
  onSensorPermissionChange,
}: CameraCaptureProps) {
  const { stream, aspectRatio: trackAspectRatio, width, height, status, error, requestCamera } = useCameraCapture()
  const { sensorPermission, requestSensorPermission } = useSensorPermission()
  const orientation = useOrientationGuard()
  const { isLevelOk, isUprightOk, sensorAvailable } = useGyroscopeGuard(sensorPermission)
  const videoRef = useRef<HTMLVideoElement>(null)

  // guideBoxes 的 xPercent/yPercent 是方框左上角，AI 視覺定位比對的是偵測框「中心點」，
  // 面積百分比則是寬高百分比的乘積（皆為相對容器的百分比，不需再除以 100 兩次）。
  const visionTargets = (guideBoxes ?? []).map((box) => ({
    target: box.target,
    targetXPercent: box.xPercent + box.widthPercent / 2,
    targetYPercent: box.yPercent + box.heightPercent / 2,
    targetAreaPercent: (box.widthPercent * box.heightPercent) / 100,
  }))
  const { modelLoadError, isPositionOk, positionDirection, isDistanceOk, distanceDirection, detectedBoxes } =
    useVisionGuidance(videoRef, visionTargets, status === 'granted' && visionTargets.length > 0)

  const { isSharpOk, variance } = useBlurDetection(videoRef, status === 'granted')

  const {
    isPlateOk,
    isRecognizing,
    needsManualConfirmation,
    recognizedText,
    debugRawCropUrl,
    debugCropWidth,
    debugCropHeight,
    debugCharDetections,
    debugAllCandidates,
    debugPreNmsCount,
    debugProcessedUrl,
    debugLastError,
    modelLoadError: plateModelLoadError,
    triggerOnce,
    confirmManually,
  } = usePlateOCR()
  // 沒有 expectedPlateNumber（尚無車輛資料輸入流程）時，車牌核對視為不參與判斷（通過）
  const isPlateOkForStateMachine = !expectedPlateNumber ? true : (isPlateOk ?? false)

  const { activeGuidance } = useGuidanceStateMachine(
    { isLevelOk, isUprightOk, isPositionOk, isDistanceOk, isSharpOk, isPlateOk: isPlateOkForStateMachine },
    sensorAvailable,
  )
  const guidanceMessage =
    activeGuidance === 'POSITION' && positionDirection
      ? POSITION_DIRECTION_MESSAGES[positionDirection]
      : activeGuidance === 'DISTANCE' && distanceDirection
        ? DISTANCE_DIRECTION_MESSAGES[distanceDirection]
        : GUIDANCE_MESSAGES[activeGuidance]

  const [showPlatePanel, setShowPlatePanel] = useState(false)

  const runPlateRecognition = () => {
    if (!expectedPlateNumber) return
    const video = videoRef.current
    const plateBox = detectedBoxes.find((b) => b.target === 'license_plate')
    if (!video || !plateBox) return
    void triggerOnce(video, plateBox, expectedPlateNumber)
  }

  const handleOpenPlatePanel = () => {
    setShowPlatePanel(true)
    runPlateRecognition()
  }

  // 車牌偵測框中心點是否落在引導框內（跟框線顏色橘/綠是同一套判斷邏輯）——
  // 對準後自動觸發辨識，不用再手動點按鈕。用 useEffect 依賴這兩個布林值本身
  // （而非每個 frame 都判斷），只有「從條件不滿足變成滿足」那一刻才會觸發一次，
  // 不會每個 frame 重複觸發；辨識模型現在只跑單一路徑（已移除梯形校正雙重比較），
  // 速度夠快、不會像先前那樣容易連續逾時。若這次失敗，需使用者移開鏡頭再重新對準
  // 才會再次觸發（或在跳出的窗格內點「重新辨識」）。
  const plateGuideBox = guideBoxes?.find((g) => g.target === 'license_plate')
  const plateDetectedBox = detectedBoxes.find((b) => b.target === 'license_plate')
  const isPlateAligned =
    !!plateGuideBox &&
    !!plateDetectedBox &&
    isCenterInsideGuideBox(
      plateDetectedBox.xPercent + plateDetectedBox.widthPercent / 2,
      plateDetectedBox.yPercent + plateDetectedBox.heightPercent / 2,
      plateGuideBox,
    )
  // 水平/直立/位置/距離/清晰度都先過了才觸發車牌辨識，避免手機還沒拿正、畫面
  // 還模糊時就先跑一次辨識（這種情況下辨識通常本來就容易失敗，等於白跑）。
  const areNonPlateChecksPassed = isLevelOk && isUprightOk && isPositionOk && isDistanceOk && isSharpOk

  useEffect(() => {
    if (!isPlateAligned) return
    if (!areNonPlateChecksPassed) return
    if (!expectedPlateNumber) return
    if (isPlateOk === true) return
    if (needsManualConfirmation) return
    if (isRecognizing) return
    handleOpenPlatePanel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlateAligned, areNonPlateChecksPassed])
  // track.getSettings() 在部分手機瀏覽器上回報的是感光元件「未旋轉」的原生尺寸（例如 4:3 橫式數字），
  // 跟 <video> 實際顯示（瀏覽器內部已處理好旋轉）的畫面比例對不上，導致容器形狀跟畫面內容不一致。
  // 改用 <video> 的 videoWidth/videoHeight（loadedmetadata 事件），這是瀏覽器真正要渲染的畫面尺寸，
  // 用它來決定容器比例才會跟畫面內容一致。
  const [renderedAspectRatio, setRenderedAspectRatio] = useState<number | null>(null)
  const aspectRatio = renderedAspectRatio ?? trackAspectRatio

  // 🧪 除錯用：顯示 tfjs 實際選用的後端（webgl/wasm/cpu）。cpu 後端純 JS 運算，
  // 車牌字元模型在 cpu 後端要 15 秒以上才跑完一次推論，藉此確認手機上是否不小心
  // 落到這個最慢的 fallback（例如 webgl 初始化失敗但沒有拋出使用者看得到的錯誤）。
  const [tfBackendName, setTfBackendName] = useState<string | null>(null)
  useEffect(() => {
    if (status !== 'granted') return
    const id = setInterval(() => setTfBackendName(tf.getBackend() ?? null), 500)
    return () => clearInterval(id)
  }, [status])

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  useEffect(() => {
    if (status === 'granted' && stream && aspectRatio) {
      onStreamReady?.({ stream, aspectRatio })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (sensorPermission) {
      onSensorPermissionChange?.(sensorPermission)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensorPermission])

  const handleStart = async () => {
    // iOS 13+ 的 DeviceMotionEvent/DeviceOrientationEvent.requestPermission() 必須在使用者手勢的
    // 同步呼叫堆疊內觸發，因此排在 getUserMedia 之前呼叫，不等相機權限先取得才觸發，
    // 否則 iOS Safari 會判定不是使用者主動操作而擋下。
    await requestSensorPermission()

    // 感測器授權被拒絕/不需要，都不影響相機——相機本身仍要正常運作，
    // 只是任務 5/8 之後會依 sensorPermission 決定是否啟用自動防呆與自動快門
    try {
      await requestCamera()
    } catch {
      // 錯誤已記錄於 hook 的 error 狀態，完整降級 UI 由任務 10 補上
    }
  }

  if (status === 'idle' || status === 'requesting') {
    return (
      <div>
        <button type="button" onClick={handleStart} disabled={status === 'requesting'}>
          {status === 'requesting' ? '請求相機權限中…' : '開始檢測車況'}
        </button>
      </div>
    )
  }

  if (status === 'denied' || status === 'error') {
    return <p>無法取得相機權限：{error}</p>
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 480,
        aspectRatio: aspectRatio ? String(aspectRatio) : '16 / 9',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (v.videoWidth && v.videoHeight) {
            setRenderedAspectRatio(v.videoWidth / v.videoHeight)
          }
        }}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />

      {modelLoadError && (
        <p
          style={{
            position: 'absolute',
            top: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            margin: 0,
            color: '#fff',
            fontSize: 12,
            background: 'rgba(153,27,27,0.85)',
            padding: '4px 12px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
          }}
        >
          AI 定位模型載入失敗，請自行對準引導框後手動拍照
        </p>
      )}

      {!modelLoadError && isRecognizing && (
        <p
          style={{
            position: 'absolute',
            top: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            margin: 0,
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
            background: 'rgba(217,119,6,0.85)',
            padding: '4px 12px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
          }}
        >
          車牌核對中...
        </p>
      )}

      {!modelLoadError && !isRecognizing && activeGuidance !== 'ALL_PASSED' && (
        <p
          style={{
            position: 'absolute',
            top: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            margin: 0,
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
            background: 'rgba(217,119,6,0.85)',
            padding: '4px 12px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
          }}
        >
          {activeGuidance === 'PLATE' && isPlateOk === false ? '車牌不符，請確認車輛' : guidanceMessage}
        </p>
      )}

      {needsManualConfirmation && (
        <div
          style={{
            position: 'absolute',
            top: 36,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <p
            style={{
              margin: 0,
              color: '#fff',
              fontSize: 12,
              background: 'rgba(153,27,27,0.85)',
              padding: '4px 12px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
            }}
          >
            車牌辨識連續失敗，請手動確認
          </p>
          <button type="button" onClick={confirmManually}>
            手動確認車牌
          </button>
        </div>
      )}

      {onCapture && guideBoxes && guideBoxes.length > 0 && !showPlatePanel && orientation !== 'landscape' && (
        <AutoShutter
          active={activeGuidance === 'ALL_PASSED'}
          videoRef={videoRef}
          sensorPermission={sensorPermission}
          onCapture={onCapture}
        />
      )}

      {/* 黃金位置（靜態目標引導框）：灰色虛線 */}
      {guideBoxes?.map((box, i) => (
        <div
          key={`${box.target}-${i}`}
          style={{
            position: 'absolute',
            left: `${box.xPercent}%`,
            top: `${box.yPercent}%`,
            width: `${box.widthPercent}%`,
            height: `${box.heightPercent}%`,
            border: `2px dashed ${GUIDE_BOX_COLOR}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        >
          {box.label && (
            <span style={{ color: GUIDE_BOX_COLOR, fontSize: 12, background: 'rgba(0,0,0,0.5)' }}>
              {box.label}
            </span>
          )}
        </div>
      ))}

      {/* 即時偵測框：模型當下實際看到的位置；中心點落在對應虛線引導框內為綠色，
          框外為橘色，讓使用者一眼就能看出有沒有對準。信心分數顯示在框外（上方），避免蓋住畫面內容 */}
      {detectedBoxes.map((box, i) => {
        const guideBox = guideBoxes?.find((g) => g.target === box.target)
        const centerXPercent = box.xPercent + box.widthPercent / 2
        const centerYPercent = box.yPercent + box.heightPercent / 2
        const isAligned = guideBox ? isCenterInsideGuideBox(centerXPercent, centerYPercent, guideBox) : false
        const color = isAligned ? DETECTED_BOX_COLOR_INSIDE : DETECTED_BOX_COLOR_OUTSIDE

        return (
          <div
            key={`detected-${box.target}-${i}`}
            style={{
              position: 'absolute',
              left: `${box.xPercent}%`,
              top: `${box.yPercent}%`,
              width: `${box.widthPercent}%`,
              height: `${box.heightPercent}%`,
              border: `2px solid ${color}`,
              boxSizing: 'border-box',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                color,
                fontSize: 10,
                background: 'rgba(0,0,0,0.5)',
                whiteSpace: 'nowrap',
              }}
            >
              {box.score.toFixed(2)}
            </span>
          </div>
        )
      })}

      <div
        style={{
          position: 'absolute',
          bottom: 4,
          left: 4,
          right: 4,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 4,
          pointerEvents: 'none',
        }}
      >
        <p
          style={{
            margin: 0,
            maxWidth: '58%',
            color: '#fff',
            fontSize: 11,
            lineHeight: 1.4,
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 6px',
            overflowWrap: 'break-word',
          }}
        >
          比例: {aspectRatio?.toFixed(3)}（{width}x{height}）/ 後端: {tfBackendName ?? '-'}
          {visionTargets.length > 0 && !modelLoadError && (
            <>
              <br />
              位置: {isPositionOk ? 'OK' : `✗ (${positionDirection ?? '未偵測到'})`} / 距離:{' '}
              {isDistanceOk ? 'OK' : `✗ (${distanceDirection ?? '未偵測到'})`}
            </>
          )}
          <br />
          清晰度: {isSharpOk ? 'OK' : '✗'}（{variance?.toFixed(0) ?? '-'}）
          {expectedPlateNumber && plateModelLoadError && (
            <>
              <br />
              車牌字元模型載入失敗，無法進行車牌 OCR
            </>
          )}
        </p>

        {sensorPermission && (
          <p
            style={{
              margin: 0,
              maxWidth: '38%',
              color: '#fff',
              fontSize: 11,
              lineHeight: 1.4,
              background: 'rgba(0,0,0,0.5)',
              padding: '2px 6px',
              textAlign: 'right',
              overflowWrap: 'break-word',
            }}
          >
            感測器：{SENSOR_PERMISSION_LABELS[sensorPermission]}
            {sensorAvailable && (
              <>
                <br />
                水平: {isLevelOk ? 'OK' : '✗'} / 直立: {isUprightOk ? 'OK' : '✗'}
              </>
            )}
          </p>
        )}
      </div>

      {showPlatePanel && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 10,
          }}
        >
          <div
            style={{
              background: '#1f2937',
              color: '#fff',
              borderRadius: 8,
              padding: 16,
              width: '100%',
              maxWidth: 320,
              maxHeight: '90%',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16 }}>車牌辨識</h2>

            {expectedPlateNumber && <p style={{ margin: 0 }}>期望車牌：{expectedPlateNumber}</p>}

            {isRecognizing && <p style={{ margin: 0 }}>辨識中，請稍候…</p>}

            {!isRecognizing && debugLastError && (
              <p style={{ margin: 0, color: '#fca5a5' }}>⚠️ 辨識發生錯誤：{debugLastError}</p>
            )}

            {!isRecognizing && !debugLastError && debugRawCropUrl && (
              <div>
                <p style={{ margin: 0, fontSize: 10, color: '#d1d5db' }}>
                  原始裁切{debugCropWidth && debugCropHeight ? `（${debugCropWidth}x${debugCropHeight}）` : ''}
                </p>
                <img src={debugRawCropUrl} alt="原始裁切" style={{ maxWidth: 160 }} />
              </div>
            )}

            {!isRecognizing && !debugLastError && (
              <div>
                <p style={{ margin: 0, color: isPlateOk ? '#86efac' : undefined }}>
                  {recognizedText || '（無法辨識）'}
                </p>
                {debugPreNmsCount !== null && (
                  <p style={{ margin: 0, fontSize: 11, color: '#d1d5db' }}>NMS 前候選數: {debugPreNmsCount}</p>
                )}
                {debugCharDetections && debugCharDetections.length > 0 && (
                  <p style={{ margin: 0, fontSize: 11, color: '#d1d5db' }}>
                    {debugCharDetections.map((d) => `${d.char}(${d.score.toFixed(2)})`).join(' ')}
                  </p>
                )}
                {debugAllCandidates && debugAllCandidates.length > 0 && (
                  <p style={{ margin: 0, fontSize: 10, color: '#9ca3af' }}>
                    🧪 全部候選: {debugAllCandidates.map((d) => `${d.char}(${d.score.toFixed(2)})`).join(' ')}
                  </p>
                )}
                {debugProcessedUrl && <img src={debugProcessedUrl} alt="前處理後" style={{ maxWidth: 160 }} />}
              </div>
            )}

            {!isRecognizing && !debugLastError && isPlateOk === null && (
              <p style={{ margin: 0 }}>尚未偵測到車牌，請將車牌對準引導框後再試一次</p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {!isRecognizing && isPlateOk !== true && (
                <button type="button" onClick={runPlateRecognition}>
                  重新辨識
                </button>
              )}
              {isPlateOk !== true && (
                <button
                  type="button"
                  onClick={() => {
                    confirmManually()
                    setShowPlatePanel(false)
                  }}
                >
                  手動確認車牌
                </button>
              )}
              <button type="button" onClick={() => setShowPlatePanel(false)}>
                {isPlateOk === true ? '完成' : '關閉'}
              </button>
            </div>
          </div>
        </div>
      )}

      {orientation === 'landscape' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 16,
          }}
        >
          <p style={{ fontSize: 32, margin: 0 }}>↻</p>
          <p style={{ margin: '8px 0 0' }}>請將手機轉為直式繼續拍攝</p>
        </div>
      )}
    </div>
  )
}
