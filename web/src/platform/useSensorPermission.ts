// 瀏覽器專屬 API 統一包一層 hook，供 Phase 2 用 Capacitor 封裝時只需替換此檔內部實作
// （改接 @capacitor/motion），呼叫端元件不需修改。實作將於任務 3.5 完成。

export type SensorPermissionState = 'granted' | 'denied' | 'not_required'

export function useSensorPermission() {
  throw new Error('useSensorPermission: 尚未實作，將於任務 3.5 完成')
}
