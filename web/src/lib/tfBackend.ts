import * as tf from '@tensorflow/tfjs'
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm'
import '@tensorflow/tfjs-backend-wasm'

// 原本想依序嘗試 webgl → wasm，但實測發現行不通：webgl 在部分手機上是計算到一半
// 才失敗（例如兩顆 YOLO 模型同時佔用行動 GPU 的紋理記憶體），失敗發生的時間點比
// decodeYoloOutput 外層包的 15 秒逾時保護還晚——Promise.race 會讓逾時錯誤先跳出，
// 蓋掉 webgl 真正丟出的錯誤，導致「偵測到 webgl 錯誤才降級」的邏輯根本沒機會執行、
// 每次都只看到逾時，回頭一直卡在同一支手機的同一個問題上。
// 與其賭 webgl 會不會撐過整段運算，不如固定用 wasm：實測（Node.js）同一顆車牌
// 字元模型在 cpu 後端要 16 秒，wasm 後端只要 0.4 秒，對這兩顆模型已經夠快，且不
// 受行動 GPU 資源限制影響。穩定性優先於「webgl 有機會更快」的可能性。
let backendReadyPromise: Promise<string> | null = null

export function ensureFastBackend(): Promise<string> {
  if (!backendReadyPromise) {
    backendReadyPromise = (async () => {
      setWasmPaths(`${import.meta.env.BASE_URL}tfjs-wasm/`)
      try {
        await tf.setBackend('wasm')
        return 'wasm'
      } catch (err) {
        console.warn('[tfBackend] wasm backend unavailable, falling back to', tf.getBackend(), err)
        return tf.getBackend()
      }
    })()
  }
  return backendReadyPromise
}
