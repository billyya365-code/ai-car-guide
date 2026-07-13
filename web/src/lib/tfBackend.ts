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

// setBackend() 只驗證「切換當下」能不能用，有些手機 GPU 是切換成功、但實際跑推論時
// 才因為紋理記憶體不足等原因失敗（例如兩顆 YOLO 模型同時常駐在較弱的行動 GPU 上）。
// 這種執行期失敗要靠呼叫端在 catch 到例外時自行判斷、回報，才能觸發降級。
export function isWebglResourceError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /webgl|texture|context lost/i.test(message)
}

// 偵測到上述執行期 webgl 失敗時呼叫：往後都固定用 wasm，不再嘗試 webgl
// （backendReadyPromise 直接鎖定成 'wasm'，避免下次又切回同一顆會失敗的 webgl 後端）。
export function downgradeToWasm(): Promise<string> {
  backendReadyPromise = tf
    .setBackend('wasm')
    .then(() => 'wasm')
    .catch(() => tf.getBackend())
  return backendReadyPromise
}
