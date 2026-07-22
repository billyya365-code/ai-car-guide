// 拉普拉斯變異數清晰度計算，從 useBlurDetection.ts 抽出成共用函式——快門觸發的
// 那一刻需要對「即將真正拍下的那個影格」再檢查一次清晰度（見 AutoShutter.tsx），
// 不能只靠 useBlurDetection 每 200ms 節流一次的舊數值：使用者手部剛停下、對焦鏡頭
// 還在微調的這段時間，最長可能有 200ms＋快門閃光延遲的落差，剛好可能是「上次量到
// 清晰、這次真正拍下卻還沒對準焦」的窗口——這正是使用者回報「感覺沒對焦就拍了」
// 的成因。

// 計算用縮圖寬度：不需要用原始解析度算變異數，縮小尺寸可大幅減少運算量，
// 對模糊判斷的相對結果影響很小。
const CALC_WIDTH = 320

// 拉普拉斯變異數閾值：低於此值視為模糊。這是常見的經驗起始值，
// 實際門檻需依真實拍攝條件（光線、鏡頭）微調。
export const DEFAULT_VARIANCE_THRESHOLD = 100

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

// canvas 由呼叫端傳入並重複利用（useBlurDetection 每 200ms 呼叫一次，重建 canvas
// 沒有必要）；一次性呼叫（例如快門觸發前的最後確認）可以每次新建一個。
export function computeSharpnessVariance(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  canvas: HTMLCanvasElement = document.createElement('canvas'),
): number {
  const calcHeight = Math.round((sourceHeight / sourceWidth) * CALC_WIDTH)
  canvas.width = CALC_WIDTH
  canvas.height = calcHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, CALC_WIDTH, calcHeight)

  const imageData = ctx.getImageData(0, 0, CALC_WIDTH, calcHeight)
  const gray = toGrayscale(imageData)
  return laplacianVariance(gray, CALC_WIDTH, calcHeight)
}
