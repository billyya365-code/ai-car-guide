import { useEffect, useState } from 'react'

// 瀏覽器專屬 API 統一包一層 hook，供 Phase 2 用 Capacitor 封裝時只需替換此檔內部實作
// （改接 @capacitor/screen-orientation 做真正的鎖定）。
// Web 版：iOS Safari 不支援 screen.orientation.lock()，因此改用偵測目前方向、
// 畫面上提示使用者手動轉回直式，而非嘗試強制鎖定（在 iOS 上會直接失敗或無作用）。

export type DeviceOrientation = 'portrait' | 'landscape'

function readOrientation(): DeviceOrientation {
  if (typeof window === 'undefined' || !window.matchMedia) return 'portrait'
  return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'
}

export function useOrientationGuard(): DeviceOrientation {
  const [orientation, setOrientation] = useState<DeviceOrientation>(readOrientation)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(orientation: portrait)')
    const handler = () => setOrientation(readOrientation())
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return orientation
}
