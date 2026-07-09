import * as tf from '@tensorflow/tfjs'

export const CLASS_NAMES = ['license_plate', 'wheel'] as const

export interface Detection {
  classId: number
  className: string
  score: number
  // 0-1，相對於送進模型的正方形輸入（例如 640x640）
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface DecodeResult {
  preNmsCount: number
  detections: Detection[]
}

export interface LetterboxLayout {
  scale: number
  offsetX: number
  offsetY: number
  drawWidth: number
  drawHeight: number
}

// 等比縮放置中、其餘部分補黑邊，對應資料集標註時採用的「Fit (black edges)」前處理，
// 不可直接拉伸/壓扁，否則物件長寬比例會與訓練資料不一致，影響模型準確度。
export function computeLetterboxLayout(
  sourceWidth: number,
  sourceHeight: number,
  targetSize: number,
): LetterboxLayout {
  const scale = Math.min(targetSize / sourceWidth, targetSize / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale
  return {
    scale,
    offsetX: (targetSize - drawWidth) / 2,
    offsetY: (targetSize - drawHeight) / 2,
    drawWidth,
    drawHeight,
  }
}

export function drawLetterboxed(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetSize: number,
): LetterboxLayout {
  const layout = computeLetterboxLayout(sourceWidth, sourceHeight, targetSize)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, targetSize, targetSize)
  ctx.drawImage(source, layout.offsetX, layout.offsetY, layout.drawWidth, layout.drawHeight)
  return layout
}

export function preprocessImageToTensor(
  img: HTMLImageElement,
  inputSize = 640,
): tf.Tensor4D {
  const canvas = document.createElement('canvas')
  canvas.width = inputSize
  canvas.height = inputSize
  const ctx = canvas.getContext('2d')!
  drawLetterboxed(ctx, img, img.naturalWidth || img.width, img.naturalHeight || img.height, inputSize)

  return tf.tidy(() => {
    const pixels = tf.browser.fromPixels(canvas)
    const normalized = pixels.toFloat().div(255)
    return normalized.expandDims(0) as tf.Tensor4D
  })
}

export interface PercentBox {
  xPercent: number // 左上角，相對畫面寬度的百分比（0-100）——與 GuideBoxProps 座標慣例一致
  yPercent: number // 左上角，相對畫面高度的百分比（0-100）
  widthPercent: number
  heightPercent: number
}

// Detection 的 x1/y1/x2/y2 是相對「補黑邊後的正方形輸入」（例如 640x640）的 0-1 座標，
// 不能直接當作畫面百分比使用——黑邊部分並不對應畫面內容。需先用 letterbox layout
// 換算回原始 <video> 像素座標，才能得到真正對應畫面顯示內容的百分比。
export function detectionToVideoPercent(
  det: Detection,
  layout: LetterboxLayout,
  videoWidth: number,
  videoHeight: number,
  inputSize: number,
): PercentBox {
  const toVideoX = (v: number) => (v * inputSize - layout.offsetX) / layout.scale
  const toVideoY = (v: number) => (v * inputSize - layout.offsetY) / layout.scale

  const x1 = toVideoX(det.x1)
  const x2 = toVideoX(det.x2)
  const y1 = toVideoY(det.y1)
  const y2 = toVideoY(det.y2)

  return {
    xPercent: (x1 / videoWidth) * 100,
    yPercent: (y1 / videoHeight) * 100,
    widthPercent: ((x2 - x1) / videoWidth) * 100,
    heightPercent: ((y2 - y1) / videoHeight) * 100,
  }
}

// 解析 YOLOv8 TFJS 輸出 [1, 4+numClasses, numAnchors]，回傳 NMS 前後的偵測數量與最終框列表。
export async function decodeYoloOutput(
  output: tf.Tensor,
  inputSize: number,
  options: { scoreThreshold?: number; iouThreshold?: number; maxDetectionsPerClass?: number } = {},
): Promise<DecodeResult> {
  const scoreThreshold = options.scoreThreshold ?? 0.25
  const iouThreshold = options.iouThreshold ?? 0.45
  const maxDetectionsPerClass = options.maxDetectionsPerClass ?? 50

  const { boxesYX, scores, classIds } = tf.tidy(() => {
    const squeezed = output.squeeze([0]) as tf.Tensor2D // [features, anchors]
    const transposed = squeezed.transpose() as tf.Tensor2D // [anchors, features]
    const numFeatures = transposed.shape[1]
    const numClasses = numFeatures - 4

    const box = transposed.slice([0, 0], [-1, 4])
    const classScores = transposed.slice([0, 4], [-1, numClasses])

    const cx = box.slice([0, 0], [-1, 1])
    const cy = box.slice([0, 1], [-1, 1])
    const w = box.slice([0, 2], [-1, 1])
    const h = box.slice([0, 3], [-1, 1])

    const x1 = cx.sub(w.div(2)).div(inputSize)
    const y1 = cy.sub(h.div(2)).div(inputSize)
    const x2 = cx.add(w.div(2)).div(inputSize)
    const y2 = cy.add(h.div(2)).div(inputSize)

    const boxesYX = tf.concat([y1, x1, y2, x2], 1) as tf.Tensor2D
    const scores = classScores.max(1) as tf.Tensor1D
    const classIds = classScores.argMax(1) as tf.Tensor1D

    return { boxesYX, scores, classIds }
  })

  const [scoresArr, classIdsArr] = await Promise.all([
    scores.array() as Promise<number[]>,
    classIds.array() as Promise<number[]>,
  ])
  const preNmsCount = scoresArr.filter((s) => s >= scoreThreshold).length

  const detections: Detection[] = []

  for (let classId = 0; classId < CLASS_NAMES.length; classId++) {
    const indices = classIdsArr.reduce<number[]>((acc, c, i) => {
      if (c === classId) acc.push(i)
      return acc
    }, [])
    if (indices.length === 0) continue

    const classBoxes = tf.gather(boxesYX, indices) as tf.Tensor2D
    const classScoresT = tf.gather(scores, indices) as tf.Tensor1D

    const nmsIndicesT = await tf.image.nonMaxSuppressionAsync(
      classBoxes,
      classScoresT,
      maxDetectionsPerClass,
      iouThreshold,
      scoreThreshold,
    )
    const [keepLocalIdx, keptBoxes, keptScores] = await Promise.all([
      nmsIndicesT.array() as Promise<number[]>,
      classBoxes.array() as Promise<number[][]>,
      classScoresT.array() as Promise<number[]>,
    ])

    for (const localIdx of keepLocalIdx) {
      const [y1, x1, y2, x2] = keptBoxes[localIdx]
      detections.push({
        classId,
        className: CLASS_NAMES[classId],
        score: keptScores[localIdx],
        x1,
        y1,
        x2,
        y2,
      })
    }

    classBoxes.dispose()
    classScoresT.dispose()
    nmsIndicesT.dispose()
  }

  boxesYX.dispose()
  scores.dispose()
  classIds.dispose()

  return { preNmsCount, detections }
}
