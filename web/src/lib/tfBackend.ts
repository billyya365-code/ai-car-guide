import * as tf from '@tensorflow/tfjs'
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm'
import '@tensorflow/tfjs-backend-wasm'

// 匯入 '@tensorflow/tfjs' 預設只會註冊 webgl/cpu 兩種後端，純 JS 的 cpu 後端對這兩顆
// YOLO 模型來說慢了一到兩個數量級（實測車牌字元偵測模型在 cpu 後端要 15+ 秒才跑完一次
// 推論，wasm 後端只要 0.4 秒）。部分手機瀏覽器環境下 webgl 可能初始化失敗或退化，
// tfjs 此時會靜默 fallback 回最慢的 cpu 後端且不會有任何錯誤訊息。這裡額外註冊 wasm
// 當作比 cpu 快非常多的保底選項，依序嘗試 webgl → wasm，都失敗才會落回內建的 cpu。
let backendReadyPromise: Promise<string> | null = null

export function ensureFastBackend(): Promise<string> {
  if (!backendReadyPromise) {
    backendReadyPromise = (async () => {
      setWasmPaths(`${import.meta.env.BASE_URL}tfjs-wasm/`)
      for (const candidate of ['webgl', 'wasm'] as const) {
        try {
          await tf.setBackend(candidate)
          return candidate
        } catch (err) {
          console.warn(`[tfBackend] backend '${candidate}' unavailable:`, err)
        }
      }
      return tf.getBackend()
    })()
  }
  return backendReadyPromise
}
