import { useEffect, useRef, useState } from 'react'
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

const TARGET_COLORS: Record<GuideBoxProps['target'], string> = {
  wheel: '#22c55e',
  license_plate: '#3b82f6',
}

const SENSOR_PERMISSION_LABELS: Record<SensorPermissionState, string> = {
  granted: '已授權',
  denied: '已拒絕（將使用手動拍照模式）',
  not_required: '不需要授權（Android/桌機）',
}

export interface CameraCaptureProps {
  // 不傳 guideBoxes 時為一般取景模式（例如任務 9 的補拍相機），不套用任何引導框
  guideBoxes?: GuideBoxProps[]
  onStreamReady?: (info: { stream: MediaStream; aspectRatio: number }) => void
  onSensorPermissionChange?: (state: SensorPermissionState) => void
}

export function CameraCapture({ guideBoxes, onStreamReady, onSensorPermissionChange }: CameraCaptureProps) {
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
  const { modelLoadError, isPositionOk, positionDirection, isDistanceOk, distanceDirection } = useVisionGuidance(
    videoRef,
    visionTargets,
    status === 'granted' && visionTargets.length > 0,
  )

  // isSharpOk/isPlateOk 暫時固定 true：任務 7（清晰度/OCR）尚未實作，
  // 之後接上真實 hook 後在此換成實際回傳值即可，狀態機不需改動。
  const { activeGuidance } = useGuidanceStateMachine(
    { isLevelOk, isUprightOk, isPositionOk, isDistanceOk, isSharpOk: true, isPlateOk: true },
    sensorAvailable,
  )
  const guidanceMessage =
    activeGuidance === 'POSITION' && positionDirection
      ? POSITION_DIRECTION_MESSAGES[positionDirection]
      : activeGuidance === 'DISTANCE' && distanceDirection
        ? DISTANCE_DIRECTION_MESSAGES[distanceDirection]
        : GUIDANCE_MESSAGES[activeGuidance]
  // track.getSettings() 在部分手機瀏覽器上回報的是感光元件「未旋轉」的原生尺寸（例如 4:3 橫式數字），
  // 跟 <video> 實際顯示（瀏覽器內部已處理好旋轉）的畫面比例對不上，導致容器形狀跟畫面內容不一致。
  // 改用 <video> 的 videoWidth/videoHeight（loadedmetadata 事件），這是瀏覽器真正要渲染的畫面尺寸，
  // 用它來決定容器比例才會跟畫面內容一致。
  const [renderedAspectRatio, setRenderedAspectRatio] = useState<number | null>(null)
  const aspectRatio = renderedAspectRatio ?? trackAspectRatio

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

      {!modelLoadError && activeGuidance !== 'ALL_PASSED' && (
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
          {guidanceMessage}
        </p>
      )}

      {guideBoxes?.map((box, i) => (
        <div
          key={`${box.target}-${i}`}
          style={{
            position: 'absolute',
            left: `${box.xPercent}%`,
            top: `${box.yPercent}%`,
            width: `${box.widthPercent}%`,
            height: `${box.heightPercent}%`,
            border: `2px solid ${TARGET_COLORS[box.target]}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        >
          {box.label && (
            <span style={{ color: TARGET_COLORS[box.target], fontSize: 12, background: 'rgba(0,0,0,0.5)' }}>
              {box.label}
            </span>
          )}
        </div>
      ))}

      <p
        style={{
          position: 'absolute',
          bottom: 4,
          left: 4,
          margin: 0,
          color: '#fff',
          fontSize: 12,
          background: 'rgba(0,0,0,0.5)',
          padding: '2px 6px',
        }}
      >
        實際比例: {aspectRatio?.toFixed(3)}（track: {trackAspectRatio?.toFixed(3)} / video: {renderedAspectRatio?.toFixed(3)}，{width}x{height}）
        {visionTargets.length > 0 && !modelLoadError && (
          <>
            <br />
            位置: {isPositionOk ? 'OK' : `✗ (${positionDirection ?? '未偵測到'})`} / 距離:{' '}
            {isDistanceOk ? 'OK' : `✗ (${distanceDirection ?? '未偵測到'})`}
          </>
        )}
      </p>

      {sensorPermission && (
        <p
          style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            margin: 0,
            color: '#fff',
            fontSize: 12,
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 6px',
            textAlign: 'right',
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
