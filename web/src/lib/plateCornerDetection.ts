// 動態偵測車牌四個角點：純影像處理（Sobel 邊緣偵測 + Hough 直線偵測 + 直線交點），
// 不依賴額外訓練資料或模型，用來取代/輔助 guideTemplates.ts 裡固定校準的
// PLATE_SKEW_CORNERS——固定校正只適用於使用者剛好貼齊黃金角度時，實際拍攝角度
// 難免有落差，這裡改成每次都直接從當下畫面找出車牌真正的四個角落。
//
// 原理：車牌是一個高對比矩形物件，四個邊會在灰階梯度圖上形成明顯直線。用 Hough
// 直線偵測找出最強的兩組方向（大致互相垂直的兩族線：一族是左右兩邊、一族是上下
// 兩邊），每族各取最強的兩條線，四線兩兩相交即為四個角點。抓不到夠強直線時回傳
// null，呼叫端應該退回使用固定校正或不校正。

import type { Point, Quad } from './perspective'

export interface DetectedQuad {
  quad: Quad
  confidence: number // 0-1，四條邊線的相對強度，越高代表偵測到的邊界越明顯可信
}

const THETA_STEPS = 180 // 0~180 度，每 1 度一個桶
const MIN_PERPENDICULAR_DEGREES = 60 // 兩族方向至少要接近垂直（容許 ±30 度誤差）才視為合理的矩形邊
const MIN_LINE_SEPARATION_RATIO = 0.15 // 同族兩條線至少要相距裁切框對角線的這個比例，避免抓到同一條邊兩次

function toGrayscale(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  return gray
}

// Sobel 運算子：算出每個像素的梯度強度（邊緣有多明顯），只需要強度不需要方向
// （方向由 Hough 直線偵測階段的角度掃描負責）。
function sobelMagnitude(gray: Float32Array, width: number, height: number): Float32Array {
  const mag = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (dy: number, dx: number) => gray[(y + dy) * width + (x + dx)]
      const gx = i(-1, -1) + 2 * i(0, -1) + i(1, -1) - i(-1, 1) - 2 * i(0, 1) - i(1, 1)
      const gy = i(-1, -1) + 2 * i(-1, 0) + i(-1, 1) - i(1, -1) - 2 * i(1, 0) - i(1, 1)
      mag[y * width + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  return mag
}

interface HoughPeak {
  thetaIdx: number
  rho: number
  votes: number
}

// 標準 Hough 直線偵測：rho = x*cos(theta) + y*sin(theta)。只對梯度強度夠高的像素投票，
// 大幅減少計算量（大部分像素是平坦區域，梯度接近 0，直接跳過）。
function houghAccumulate(mag: Float32Array, width: number, height: number, magThreshold: number) {
  const rhoMax = Math.sqrt(width * width + height * height)
  const rhoOffset = rhoMax
  const rhoSteps = Math.ceil(rhoMax * 2)
  const accumulator = new Uint32Array(THETA_STEPS * rhoSteps)

  const cosTable = new Float32Array(THETA_STEPS)
  const sinTable = new Float32Array(THETA_STEPS)
  for (let t = 0; t < THETA_STEPS; t++) {
    const theta = (t * Math.PI) / THETA_STEPS
    cosTable[t] = Math.cos(theta)
    sinTable[t] = Math.sin(theta)
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mag[y * width + x] < magThreshold) continue
      for (let t = 0; t < THETA_STEPS; t++) {
        const rho = x * cosTable[t] + y * sinTable[t]
        const rhoIdx = Math.round(rho + rhoOffset)
        accumulator[t * rhoSteps + rhoIdx]++
      }
    }
  }

  return { accumulator, rhoSteps, rhoOffset }
}

function findTopPeaks(
  accumulator: Uint32Array,
  rhoSteps: number,
  rhoOffset: number,
  count: number,
  diagonal: number,
): HoughPeak[] {
  const all: HoughPeak[] = []
  for (let t = 0; t < THETA_STEPS; t++) {
    for (let r = 0; r < rhoSteps; r++) {
      const votes = accumulator[t * rhoSteps + r]
      if (votes === 0) continue
      all.push({ thetaIdx: t, rho: r - rhoOffset, votes })
    }
  }
  all.sort((a, b) => b.votes - a.votes)

  // 非極大值抑制：避免同一條實際邊線因為雜訊在鄰近的 theta/rho 桶裡都有高票，
  // 被誤判成好幾條不同的線。
  const picked: HoughPeak[] = []
  const minSeparation = diagonal * MIN_LINE_SEPARATION_RATIO
  for (const peak of all) {
    if (picked.length >= count) break
    const tooClose = picked.some(
      (p) => Math.abs(p.thetaIdx - peak.thetaIdx) < 10 && Math.abs(p.rho - peak.rho) < minSeparation,
    )
    if (!tooClose) picked.push(peak)
  }
  return picked
}

function lineIntersection(l1: HoughPeak, l2: HoughPeak): Point | null {
  const t1 = (l1.thetaIdx * Math.PI) / THETA_STEPS
  const t2 = (l2.thetaIdx * Math.PI) / THETA_STEPS
  const cos1 = Math.cos(t1)
  const sin1 = Math.sin(t1)
  const cos2 = Math.cos(t2)
  const sin2 = Math.sin(t2)

  const det = cos1 * sin2 - cos2 * sin1
  if (Math.abs(det) < 1e-6) return null // 幾乎平行，無有效交點

  const x = (l1.rho * sin2 - l2.rho * sin1) / det
  const y = (cos1 * l2.rho - cos2 * l1.rho) / det
  return { x, y }
}

// 主要進入點：給一張已裁切好的車牌區域圖片，嘗試動態找出實際四個角點。
// 找不到夠明顯的矩形邊界時回傳 null，呼叫端應退回固定校正或不校正。
export function detectPlateQuad(source: HTMLCanvasElement): DetectedQuad | null {
  const { width, height } = source
  if (width < 20 || height < 20) return null

  const ctx = source.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, width, height)
  const gray = toGrayscale(data, width, height)
  const mag = sobelMagnitude(gray, width, height)

  let maxMag = 0
  for (const m of mag) if (m > maxMag) maxMag = m
  if (maxMag < 1) return null
  const magThreshold = maxMag * 0.3 // 只採用梯度前段（最明顯的邊緣）像素，降低雜訊/背景紋理干擾

  const diagonal = Math.sqrt(width * width + height * height)
  const { accumulator, rhoSteps, rhoOffset } = houghAccumulate(mag, width, height, magThreshold)
  const peaks = findTopPeaks(accumulator, rhoSteps, rhoOffset, 12, diagonal)
  if (peaks.length < 4) return null

  // 把候選線依角度分成兩族：票數最高的線代表族 A 的方向，
  // 族 B 則是跟族 A 角度差距落在「接近垂直」範圍內、票數最高的線。
  let familyBSeed: HoughPeak | null = null
  for (const p of peaks.slice(1)) {
    const angleDiff = (Math.abs(p.thetaIdx - peaks[0].thetaIdx) * 180) / THETA_STEPS
    const normalizedDiff = Math.min(angleDiff, 180 - angleDiff)
    if (normalizedDiff >= MIN_PERPENDICULAR_DEGREES) {
      familyBSeed = p
      break
    }
  }
  if (!familyBSeed) return null

  const isNear = (a: HoughPeak, seed: HoughPeak) => {
    const diff = (Math.abs(a.thetaIdx - seed.thetaIdx) * 180) / THETA_STEPS
    return Math.min(diff, 180 - diff) < 20
  }
  const groupA = peaks.filter((p) => isNear(p, peaks[0])).slice(0, 2)
  const groupB = peaks.filter((p) => isNear(p, familyBSeed!)).slice(0, 2)
  if (groupA.length < 2 || groupB.length < 2) return null

  // 每族兩條線依 rho 排序，較小的視為「上/左」、較大的視為「下/右」。
  groupA.sort((a, b) => a.rho - b.rho)
  groupB.sort((a, b) => a.rho - b.rho)
  const [lineA1, lineA2] = groupA
  const [lineB1, lineB2] = groupB

  const corners = [
    lineIntersection(lineA1, lineB1),
    lineIntersection(lineA1, lineB2),
    lineIntersection(lineA2, lineB2),
    lineIntersection(lineA2, lineB1),
  ]
  if (corners.some((c) => c === null)) return null
  const pts = corners as Point[]

  // 合理性檢查：四個角點都應該落在裁切框附近（允許少量超出邊界，因為抓到的線
  // 可能略微超出原本裁切範圍），且圍出的面積不能小得離譜，避免採用明顯錯誤的結果。
  const margin = diagonal * 0.25
  const inBounds = pts.every((p) => p.x > -margin && p.x < width + margin && p.y > -margin && p.y < height + margin)
  if (!inBounds) return null

  const area = polygonArea(pts)
  if (area < width * height * 0.15) return null

  const totalVotes = lineA1.votes + lineA2.votes + lineB1.votes + lineB2.votes
  const maxPossible = (width + height) * 4
  const confidence = Math.max(0, Math.min(1, totalVotes / maxPossible))

  return { quad: sortCorners(pts), confidence }
}

function polygonArea(pts: Point[]): number {
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i]
    const p2 = pts[(i + 1) % pts.length]
    sum += p1.x * p2.y - p2.x * p1.y
  }
  return Math.abs(sum / 2)
}

// 把四個交點依「左上、右上、右下、左下」排序（用重心 + 象限判斷），
// 因為 lineIntersection 算出來的順序不保證符合 warpQuadToRect() 要求的順序。
function sortCorners(pts: Point[]): Quad {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length

  const withAngle = pts.map((p) => ({ p, angle: Math.atan2(p.y - cy, p.x - cx) }))
  withAngle.sort((a, b) => a.angle - b.angle)
  // atan2 排序會依角度從 -180 到 180 排列，對應大致上是「右下 → 左下 → 左上 → 右上」，
  // 旋轉成從左上開始，再依序是右上、右下、左下。
  const ordered = withAngle.map((w) => w.p)
  const topLeftIdx = ordered.reduce(
    (best, p, i) => (p.x + p.y < ordered[best].x + ordered[best].y ? i : best),
    0,
  )
  const rotated = [...ordered.slice(topLeftIdx), ...ordered.slice(0, topLeftIdx)]
  return rotated as Quad
}
