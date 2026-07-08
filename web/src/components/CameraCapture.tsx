import { useEffect, useRef } from 'react'
import { useCameraCapture } from '../platform/useCameraCapture'
import { useSensorPermission, type SensorPermissionState } from '../platform/useSensorPermission'

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
  const { stream, aspectRatio, width, height, status, error, requestCamera } = useCameraCapture()
  const { sensorPermission, requestSensorPermission } = useSensorPermission()
  const videoRef = useRef<HTMLVideoElement>(null)

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
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />

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
        實際比例: {aspectRatio?.toFixed(3)}（{width}x{height}）
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
          }}
        >
          感測器：{SENSOR_PERMISSION_LABELS[sensorPermission]}
        </p>
      )}
    </div>
  )
}
