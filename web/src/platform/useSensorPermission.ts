import { useCallback, useState } from 'react'

// 瀏覽器專屬 API 統一包一層 hook，供 Phase 2 用 Capacitor 封裝時只需替換此檔內部實作
// （改接 @capacitor/motion），呼叫端元件不需修改（回傳值格式盡量保持一致）。

export type SensorPermissionState = 'granted' | 'denied' | 'not_required'

// iOS 13+ Safari 才有的靜態方法，標準 lib.dom.d.ts 未宣告，用最小化的型別擴充處理
interface IOSPermissionEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

function getIOSMotionPermissionApi(): IOSPermissionEventStatic | null {
  if (typeof DeviceMotionEvent === 'undefined') return null
  const api = DeviceMotionEvent as unknown as IOSPermissionEventStatic
  return typeof api.requestPermission === 'function' ? api : null
}

function getIOSOrientationPermissionApi(): IOSPermissionEventStatic | null {
  if (typeof DeviceOrientationEvent === 'undefined') return null
  const api = DeviceOrientationEvent as unknown as IOSPermissionEventStatic
  return typeof api.requestPermission === 'function' ? api : null
}

export interface UseSensorPermissionResult {
  // null = 尚未請求過
  sensorPermission: SensorPermissionState | null
  requestSensorPermission: () => Promise<SensorPermissionState>
}

export function useSensorPermission(): UseSensorPermissionResult {
  const [sensorPermission, setSensorPermission] = useState<SensorPermissionState | null>(null)

  const requestSensorPermission = useCallback(async (): Promise<SensorPermissionState> => {
    const motionApi = getIOSMotionPermissionApi()

    // Android / 舊版 iOS：沒有這個額外授權機制，視為已授權，不跳多餘對話框
    if (!motionApi) {
      setSensorPermission('not_required')
      return 'not_required'
    }

    // iOS 13+ 專屬流程：必須在使用者手勢的同步呼叫堆疊內觸發（呼叫端須確保不等其他 await 先完成）
    try {
      const motionResult = await motionApi.requestPermission!()
      const orientationApi = getIOSOrientationPermissionApi()
      const orientationResult = orientationApi ? await orientationApi.requestPermission!() : 'granted'

      const result: SensorPermissionState = motionResult === 'granted' && orientationResult === 'granted' ? 'granted' : 'denied'
      setSensorPermission(result)
      return result
    } catch (err) {
      console.error('[useSensorPermission] requestPermission failed:', err)
      setSensorPermission('denied')
      return 'denied'
    }
  }, [])

  return { sensorPermission, requestSensorPermission }
}
