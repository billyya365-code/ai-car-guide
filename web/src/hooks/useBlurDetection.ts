import { useRef, useState, type RefObject } from 'react'
import { useFrameThrottle } from '../lib/frameScheduler'

// 節流：每 200ms 最多計算一次，不需要每個 frame 都算一次拉普拉斯變異數。
// 用共用的 frameScheduler（跟任務 6 的視覺推論共用同一條 rAF 迴圈），
// 避免兩組計時器互搶主執行緒。
const BLUR_INTERVAL_MS = 200

// 拉普拉斯變異數閾值：低於此值視為模糊。這是常見的經驗起始值，
// 實際門檻需依真實拍攝條件（光線、鏡頭）微調。
const DEFAULT_VARIANCE_THRESHOLD = 100

// 計算用縮圖寬度：不需要用原始解析度算變異數，縮小尺寸可大幅減少運算量，
// 對模糊判斷的相對結果影響很小。
const CALC_WIDTH = 320

export interface BlurDetectionResult {
  isSharpOk: boolean
  variance: number | null
}

// 第一次真正量測到清晰度之前（至少要等第一個 200ms tick、且影格已經有內容）不能
// 預設「已經清晰」——否則配合 AutoShutter 現在沒有動作感測器也會直接倒數拍照的
// 邏輯，會導致才剛進畫面、根本還沒量過清晰度，就被判定「清晰」而提早拍下去。
const INITIAL_RESULT: BlurDetectionResult = { isSharpOk: false, variance: null }

// 灰階轉換用 ITU-R BT.601 係數
function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData
  const gray = new Float32Array(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  return gray
}

// 純 JS/Canvas 實作拉普拉斯變異數，不依賴 opencv.js——同樣的運算（3x3 拉普拉斯核
// 卷積後取變異數）用 Canvas ImageData + 一般陣列迴圈就能算，opencv.js 的 WASM
// 二進位被打包成內嵌 base64 的 JS chunk，體積高達 15MB+，對這個單一運算而言
// 不成比例地重，改用純 JS 可完全避免這筆下載。
function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width
    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x
      const value = gray[idx - width] + gray[idx + width] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx]
      sum += value
      sumSq += value * value
      count++
    }
  }
  const mean = sum / count
  return sumSq / count - mean * mean
}

export function useBlurDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  varianceThreshold = DEFAULT_VARIANCE_THRESHOLD,
): BlurDetectionResult {
  const [result, setResult] = useState<BlurDetectionResult>(INITIAL_RESULT)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const computingRef = useRef(false)

  useFrameThrottle(
    () => {
      const video = videoRef.current
      if (!video || computingRef.current) return
      if (video.videoWidth === 0 || video.videoHeight === 0) return

      computingRef.current = true
      try {
        if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
        const canvas = canvasRef.current
        const calcHeight = Math.round((video.videoHeight / video.videoWidth) * CALC_WIDTH)
        canvas.width = CALC_WIDTH
        canvas.height = calcHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(video, 0, 0, CALC_WIDTH, calcHeight)

        const imageData = ctx.getImageData(0, 0, CALC_WIDTH, calcHeight)
        const gray = toGrayscale(imageData)
        const variance = laplacianVariance(gray, CALC_WIDTH, calcHeight)

        setResult({ isSharpOk: variance >= varianceThreshold, variance })
      } catch (err) {
        console.error('[useBlurDetection] compute failed:', err)
      } finally {
        computingRef.current = false
      }
    },
    BLUR_INTERVAL_MS,
    enabled,
  )

  return result
}
