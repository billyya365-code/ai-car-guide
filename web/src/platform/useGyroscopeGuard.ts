import { useEffect, useState } from 'react'
import type { SensorPermissionState } from './useSensorPermission'

// 瀏覽器專屬 API 統一包一層 hook，供 Phase 2 用 Capacitor 封裝時只需替換此檔內部實作
// （改接 @capacitor/motion 的原生陀螺儀事件），回傳值格式維持一致，
// useGuidanceStateMachine 呼叫端不需修改。

const GAMMA_LEVEL_THRESHOLD_DEG = 25 // 優先權 1（Roll）：左右傾斜超出 ±25°
const BETA_UPRIGHT_MIN_DEG = 60 // 優先權 2（Pitch）：前後傾斜需落在 60°~95°
const BETA_UPRIGHT_MAX_DEG = 95

export interface GyroscopeGuardResult {
  isLevelOk: boolean
  isUprightOk: boolean
  sensorAvailable: boolean
}

// denied（或尚未請求過權限）時直接視為不參與判斷，不註冊事件監聽——
// 否則 iOS 上事件永遠不會觸發，畫面也不會報錯，容易誤以為是程式邏輯問題，
// 或更糟：讓 isLevelOk/isUprightOk 卡在 false，被狀態機誤判為「一直不通過」。
const SKIPPED_RESULT: GyroscopeGuardResult = { isLevelOk: true, isUprightOk: true, sensorAvailable: false }

export function useGyroscopeGuard(sensorPermission: SensorPermissionState | null): GyroscopeGuardResult {
  const active = sensorPermission === 'granted' || sensorPermission === 'not_required'
  const [result, setResult] = useState<GyroscopeGuardResult>(SKIPPED_RESULT)

  useEffect(() => {
    if (!active) {
      setResult(SKIPPED_RESULT)
      return
    }

    // 尚未收到第一筆事件前，先樂觀視為通過（不誤判為失敗），實際數值由事件即時更新覆蓋
    setResult({ isLevelOk: true, isUprightOk: true, sensorAvailable: true })

    // 事件驅動、不節流：原生事件可達每秒數十次，純數學比較成本低，節流反而增加不必要的複雜度
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const { gamma, beta } = event
      const isLevelOk = gamma === null || Math.abs(gamma) <= GAMMA_LEVEL_THRESHOLD_DEG
      const isUprightOk = beta === null || (beta >= BETA_UPRIGHT_MIN_DEG && beta <= BETA_UPRIGHT_MAX_DEG)
      setResult({ isLevelOk, isUprightOk, sensorAvailable: true })
    }

    window.addEventListener('deviceorientation', handleOrientation)
    return () => window.removeEventListener('deviceorientation', handleOrientation)
  }, [active])

  return result
}
