import { useCallback, useState } from 'react'

// 瀏覽器專屬 API 統一包一層 hook，供 Phase 2 用 Capacitor 封裝時只需替換此檔內部實作
// （改接 @capacitor/geolocation），呼叫端元件不需修改（回傳值格式盡量保持一致），
// 跟 useSensorPermission.ts 是同一套設計慣例。
//
// 車損巡檢後端規格（02_SDD）預期 gps_lat/gps_lng 是「解析照片 EXIF 取得」，但目前
// 拍照方式（getUserMedia + canvas 手動畫格）產生的照片先天不會有 EXIF，這條路線對
// 我們不成立；改用瀏覽器 Geolocation API 直接取得經緯度，效果等同文件要的欄位格式
// （有定位就填數字、沒授權/不支援則為 null），只是取得方式不同。

export type GeolocationPermissionState = 'granted' | 'denied' | 'unsupported'

export interface CaptureLocation {
  latitude: number
  longitude: number
  accuracy: number // 公尺
}

export interface UseGeolocationResult {
  // null = 尚未取得（還沒請求過，或請求中）
  location: CaptureLocation | null
  permissionState: GeolocationPermissionState | null
  requestLocation: () => Promise<CaptureLocation | null>
}

const GEOLOCATION_TIMEOUT_MS = 10000

export function useGeolocation(): UseGeolocationResult {
  const [location, setLocation] = useState<CaptureLocation | null>(null)
  const [permissionState, setPermissionState] = useState<GeolocationPermissionState | null>(null)

  // 定位失敗（使用者拒絕、逾時、裝置不支援）一律 resolve(null) 而不是 reject——
  // 呼叫端把定位當成「錦上添花」的中繼資料，不應該因為拿不到就要額外寫 try/catch
  // 或擋住拍攝流程，見 CameraCapture.tsx 的呼叫處。
  const requestLocation = useCallback(async (): Promise<CaptureLocation | null> => {
    if (!('geolocation' in navigator)) {
      setPermissionState('unsupported')
      return null
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc: CaptureLocation = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }
          setPermissionState('granted')
          setLocation(loc)
          resolve(loc)
        },
        (err) => {
          console.error('[useGeolocation] getCurrentPosition failed:', err)
          setPermissionState('denied')
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 0 },
      )
    })
  }, [])

  return { location, permissionState, requestLocation }
}
