import { useEffect, useRef, useState } from 'react'
import type { SensorPermissionState } from './useSensorPermission'

// 瀏覽器專屬 API 統一包一層 hook，供 Phase 2 用 Capacitor 封裝時只需替換此檔內部實作
// （改接 @capacitor/motion），回傳值格式維持一致，AutoShutter 呼叫端不需修改。

const ROTATION_RATE_THRESHOLD_DEG_PER_SEC = 5
// iOS Safari 從來沒有實作 DeviceMotionEvent.rotationRate（一律回傳 null），實際上幾乎
// 所有 iOS 裝置都是走下面 deviceorientation 差值備援這條路——先前 1 度的閾值只跟「上一個
// 事件」比較，devicemotion/deviceorientation 觸發頻率很高（常見每秒數十次），手部自然的
// 微幅顫抖在這麼短的取樣間隔內就足以持續超標，導致實務上幾乎不可能連續判定「靜止」滿
// 1 秒，18 秒後就降級成手動拍攝。放寬角度閾值，並改成跟「一段時間之前」的角度比較
// （見下方 MIN_SAMPLE_INTERVAL_MS），把單一取樣的感測器雜訊/手部自然微幅晃動平滑掉，
// 只有真的持續在移動時才會判定為「還在晃」。
const ORIENTATION_DIFF_THRESHOLD_DEG = 2.5
const MIN_SAMPLE_INTERVAL_MS = 150

export interface StillnessDetectorResult {
  isStill: boolean
  // false 代表感測器權限被拒絕/裝置不支援，完全沒有事件可監聽——呼叫端此時應該
  // 直接降級為手動拍攝，而不是顯示一個永遠不會判定為靜止的進度圈
  supported: boolean
}

// denied（或尚未請求過權限）時直接視為不支援，不註冊事件監聽——沿用 useGyroscopeGuard
// 已驗證過的作法，避免 iOS 上事件永遠不觸發、卻讓 isStill 卡在 false 被誤判為「一直在晃動」。
export function useStillnessDetector(sensorPermission: SensorPermissionState | null): StillnessDetectorResult {
  const active = sensorPermission === 'granted' || sensorPermission === 'not_required'
  const [isStill, setIsStill] = useState(false)
  const lastOrientationRef = useRef<{
    alpha: number | null
    beta: number | null
    gamma: number | null
    timestamp: number
  } | null>(null)

  useEffect(() => {
    if (!active) {
      setIsStill(false)
      return
    }

    lastOrientationRef.current = null
    // rotationRate 是主要判定依據；部分裝置雖觸發 devicemotion 事件但 rotationRate 全為 null
    // （未提供陀螺儀角速度），此時該次事件視為不可用，交給 deviceorientation 差值備援判定
    let usingRotationRate = false

    const handleMotion = (event: DeviceMotionEvent) => {
      const r = event.rotationRate
      if (!r || r.alpha === null || r.beta === null || r.gamma === null) return
      usingRotationRate = true
      const stillNow =
        Math.abs(r.alpha) < ROTATION_RATE_THRESHOLD_DEG_PER_SEC &&
        Math.abs(r.beta) < ROTATION_RATE_THRESHOLD_DEG_PER_SEC &&
        Math.abs(r.gamma) < ROTATION_RATE_THRESHOLD_DEG_PER_SEC
      setIsStill(stillNow)
    }

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (usingRotationRate) return // rotationRate 可用時優先採用，避免兩種判定互相干擾
      const now = performance.now()
      const last = lastOrientationRef.current
      // 只跟「至少 MIN_SAMPLE_INTERVAL_MS 之前」的角度比較，而不是每次事件都跟緊接在前
      // 一個事件比較——devicemotion/deviceorientation 觸發頻率很高，緊鄰的兩個事件之間
      // 本來就容易因為感測器雜訊或手部自然微幅顫抖而超過閾值，拉長比較的時間間隔可以把
      // 這種瞬間雜訊平均掉，只有真的持續移動一段時間才會判定為「還在晃」。
      if (last && now - last.timestamp < MIN_SAMPLE_INTERVAL_MS) return
      const current = { alpha: event.alpha, beta: event.beta, gamma: event.gamma, timestamp: now }
      if (last) {
        const diff = Math.max(
          Math.abs((current.alpha ?? 0) - (last.alpha ?? 0)),
          Math.abs((current.beta ?? 0) - (last.beta ?? 0)),
          Math.abs((current.gamma ?? 0) - (last.gamma ?? 0)),
        )
        setIsStill(diff < ORIENTATION_DIFF_THRESHOLD_DEG)
      }
      lastOrientationRef.current = current
    }

    window.addEventListener('devicemotion', handleMotion)
    window.addEventListener('deviceorientation', handleOrientation)
    return () => {
      window.removeEventListener('devicemotion', handleMotion)
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [active])

  return { isStill, supported: active }
}
