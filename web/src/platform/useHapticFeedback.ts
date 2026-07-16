// 瀏覽器專屬 API 統一包一層 hook，供 Phase 2 用 Capacitor 封裝時只需替換此檔內部實作
// （改接 @capacitor/haptics，原生震動手感通常較細膩），呼叫端元件不需修改。

export interface HapticFeedback {
  vibrate: (pattern?: number | number[]) => void
}

export function useHapticFeedback(): HapticFeedback {
  const vibrate = (pattern: number | number[] = 100) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  }

  return { vibrate }
}
