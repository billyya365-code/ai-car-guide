// 透視校正：把畫面中一個因斜角拍攝而變形的四邊形區域（例如車牌）「拉直」成一張
// 正面矩形圖片，讓後續 OCR 看到的是正常比例的文字而非梯形/歪斜字元。純數學運算，
// 不依賴 opencv.js（延續本專案避開重量級 WASM 函式庫的作法，見 useBlurDetection.ts）。

export interface Point {
  x: number
  y: number
}

// 四角順序固定為：左上、右上、右下、左下。
export type Quad = [Point, Point, Point, Point]

// 高斯消去法解線性方程組 Ax = B，純數學運算。用來解投影變換的 8 個未知參數。
function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivotRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivotRow][col])) pivotRow = row
    }
    ;[m[col], m[pivotRow]] = [m[pivotRow], m[col]]

    const pivot = m[col][col]
    for (let j = col; j <= n; j++) m[col][j] /= pivot

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = m[row][col]
      for (let j = col; j <= n; j++) m[row][j] -= factor * m[col][j]
    }
  }

  return m.map((row) => row[n])
}

// 解出「來源矩形 → 目的四邊形」的投影變換參數 [a..h]：
//   X = (a*x + b*y + c) / (g*x + h*y + 1)
//   Y = (d*x + e*y + f) / (g*x + h*y + 1)
// 故意用「矩形→四邊形」的方向來解（而非「四邊形→矩形」），這樣解出來的參數直接就是
// backward mapping：輸出矩形上的每個像素座標 (x,y) 代入後，得到的 (X,Y) 就是該像素
// 應該去來源畫面的哪個位置取樣，不需要另外再求反矩陣。
function solvePerspectiveParams(rect: Quad, quad: Quad): number[] {
  const a: number[][] = []
  const b: number[] = []

  for (let i = 0; i < 4; i++) {
    const { x, y } = rect[i]
    const { x: dx, y: dy } = quad[i]
    a.push([x, y, 1, 0, 0, 0, -x * dx, -y * dx])
    b.push(dx)
    a.push([0, 0, 0, x, y, 1, -x * dy, -y * dy])
    b.push(dy)
  }

  return solveLinearSystem(a, b)
}

// 雙線性內插取樣：避免最近鄰取樣造成拉直後的文字邊緣呈鋸齒狀。
function sampleBilinear(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): [number, number, number, number] {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)))
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)))
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0

  const idx = (xx: number, yy: number) => (yy * width + xx) * 4
  const i00 = idx(x0, y0)
  const i10 = idx(x1, y0)
  const i01 = idx(x0, y1)
  const i11 = idx(x1, y1)

  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx
    const bottom = data[i01 + c] * (1 - fx) + data[i11 + c] * fx
    out[c] = top * (1 - fy) + bottom * fy
  }
  return out
}

// 把來源 canvas 中的任意四邊形區域拉直成一張 outWidth x outHeight 的正面矩形圖片。
// quad 座標是「來源 canvas 的像素座標」，四角順序見上方 Quad 型別註解。
export function warpQuadToRect(source: HTMLCanvasElement, quad: Quad, outWidth: number, outHeight: number): HTMLCanvasElement {
  const srcCtx = source.getContext('2d')!
  const { data: srcData } = srcCtx.getImageData(0, 0, source.width, source.height)

  const rect: Quad = [
    { x: 0, y: 0 },
    { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight },
    { x: 0, y: outHeight },
  ]
  const [a, b, c, d, e, f, g, h] = solvePerspectiveParams(rect, quad)

  const outCanvas = document.createElement('canvas')
  outCanvas.width = outWidth
  outCanvas.height = outHeight
  const outCtx = outCanvas.getContext('2d')!
  const outImageData = outCtx.createImageData(outWidth, outHeight)

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const denom = g * x + h * y + 1
      const srcX = (a * x + b * y + c) / denom
      const srcY = (d * x + e * y + f) / denom

      const outIdx = (y * outWidth + x) * 4
      if (srcX < 0 || srcX > source.width - 1 || srcY < 0 || srcY > source.height - 1) {
        outImageData.data[outIdx + 3] = 0 // 超出來源範圍：透明，避免產生錯誤顏色
        continue
      }

      const [r, g2, b2, a2] = sampleBilinear(srcData, source.width, source.height, srcX, srcY)
      outImageData.data[outIdx] = r
      outImageData.data[outIdx + 1] = g2
      outImageData.data[outIdx + 2] = b2
      outImageData.data[outIdx + 3] = a2
    }
  }

  outCtx.putImageData(outImageData, 0, 0)
  return outCanvas
}
