import { useCallback, useEffect, useRef, useState } from 'react'
import * as tf from '@tensorflow/tfjs'
import { CHAR_CLASS_NAMES, decodeYoloOutput, drawLetterboxed, type PercentBox } from '../lib/yolo'
import { warpQuadToRect, type Quad } from '../lib/perspective'
import { detectPlateQuad } from '../lib/plateCornerDetection'
import { ensureFastBackend } from '../lib/tfBackend'

// 用 BASE_URL 而非寫死 '/'，部署到 GitHub Pages 這類子路徑時才能正確解析（見任務 1）
const CHAR_MODEL_URL = `${import.meta.env.BASE_URL}char_model/model.json`
const CHAR_INPUT_SIZE = 640

// 動態角點偵測的信心分數低於此值時，視為不可信，退回使用固定校正（skewCorners）或不校正。
const MIN_QUAD_CONFIDENCE = 0.35

// 連續辨識失敗達此上限時，改用「手動確認車牌」逃生選項——車牌角度/光線條件差時
// 辨識率不一定完美，不能讓使用者卡在無限重試迴圈。
const MAX_FAILURE_COUNT = 3

// 🧪 暫時測試用：先不要因為連續失敗鎖住、跳出手動確認，方便連續觀察每次辨識結果。
// 之後車牌辨識問題排查完畢，記得把這個改回 true。
const ENABLE_MANUAL_CONFIRMATION_LOCK = false

// 偵測框可能剛好卡到字元邊緣，外擴一點避免頭尾字元被切掉。
const CROP_PADDING_PERCENT = 12

// 字元偵測分數門檻。實測過 0.15（排查用）發現正確字元的信心分數可以低到 0.52
// （例如清晰可辨的 "X"），門檻設太高反而會濾掉正確答案；真正的雜訊大多來自車牌
// 分隔符號（"-"）周圍區域被誤判成數字，這類雜訊改用下面的「依已知車牌長度剔除
// 最低分」機制處理，門檻只需要濾掉極低分的雜訊即可，不需要太嚴格。
const CHAR_SCORE_THRESHOLD = 0.3
// 跨類別 NMS 門檻：同一個字元形狀理論上只會被判成一個類別，但模型不確定時可能同一個
// 位置對兩三個類別都給出偵測框，用這個門檻濾掉重疊度高的較低分框，避免同一個字元被
// 重複計入辨識結果（例如誤把同一個 "8" 同時讀成 "8" 跟 "B" 兩個字元）。
const CROSS_CLASS_IOU_THRESHOLD = 0.3

// 保護機制：模型下載/辨識若因網路狀況等原因卡住不動，逾時強制中斷並回報錯誤，
// 避免 lockRef 卡在 true 導致整個 OCR 功能永久停擺、又沒有任何錯誤訊息可看。
const TRIGGER_TIMEOUT_MS = 15000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} 逾時（${ms / 1000}秒）`)), ms)),
  ])
}

function normalizePlateText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// 車牌上的分隔符號（"-"）位置是固定的車牌格式規則，不需要靠模型辨識，而且實測發現
// 這個符號本身的形狀（一小段橫線）很容易被模型誤判成鄰近的數字類別（例如把分隔符號
// 誤讀成 "0"/"8"），與其讓模型猜測它的類別，不如直接不採信這個類別的偵測結果。
function isSeparatorChar(char: string): boolean {
  return char === '-'
}

interface CharDetection {
  char: string
  score: number
  x1: number
  x2: number
  y1: number
  y2: number
}

// 已知期望車牌的字元數（不含分隔符號）時，如果組出來的字元數比期望多，多出來的
// 通常是分隔符號區域被誤判成數字造成的雜訊——依信心分數由低到高剔除多餘的字元，
// 而不是單純調高分數門檻（因為實測發現正確字元的信心分數有時也偏低，例如 0.52）。
function pruneToExpectedLength(chars: CharDetection[], expectedLength: number): CharDetection[] {
  if (expectedLength <= 0 || chars.length <= expectedLength) return chars
  const dropCount = chars.length - expectedLength
  const weakestFirst = [...chars].sort((a, b) => a.score - b.score)
  const toDrop = new Set(weakestFirst.slice(0, dropCount))
  return chars.filter((c) => !toDrop.has(c))
}

// 車牌比對本身已經是去掉分隔符號後比較（見 normalizePlateText），這裡只是為了讓
// 畫面顯示的「實際讀到」更好讀，依期望車牌裡分隔符號的位置，在辨識結果的同一個
// 位置插入固定的 "-" 符號（僅在字數對得上時才插入，對不上就照原樣顯示，避免插錯位置）。
function formatRecognizedTextForDisplay(text: string, expectedPlateNumber: string): string {
  const dashIndex = expectedPlateNumber.indexOf('-')
  if (dashIndex === -1) return text
  const expectedLength = normalizePlateText(expectedPlateNumber).length
  if (text.length !== expectedLength) return text
  return `${text.slice(0, dashIndex)}-${text.slice(dashIndex)}`
}

function boxIou(a: CharDetection, b: CharDetection): number {
  const x1 = Math.max(a.x1, b.x1)
  const y1 = Math.max(a.y1, b.y1)
  const x2 = Math.min(a.x2, b.x2)
  const y2 = Math.min(a.y2, b.y2)
  const interW = Math.max(0, x2 - x1)
  const interH = Math.max(0, y2 - y1)
  const inter = interW * interH
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
  const union = areaA + areaB - inter
  return union <= 0 ? 0 : inter / union
}

// 跨類別 NMS + 依 x 座標由左到右排序，把獨立的字元偵測框組成一串車牌文字。
function assembleCharacters(detections: CharDetection[]): CharDetection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score)
  const accepted: CharDetection[] = []
  for (const det of sorted) {
    const overlaps = accepted.some((a) => boxIou(a, det) > CROSS_CLASS_IOU_THRESHOLD)
    if (!overlaps) accepted.push(det)
  }
  return accepted.sort((a, b) => a.x1 - b.x1)
}

// 🧪 用於「梯形校正 vs 不校正」並排比較：同一張裁切圖分別跑一次「原圖直接辨識」跟
// 「先做透視校正拉正再辨識」，讓使用者可以在同一次拍攝上直接比較兩種做法的效果，
// 而不是只能憑單一張黃金標準照的離線測試結果決定要不要保留校正。
export interface PlateOCRVariantResult {
  recognizedText: string | null
  isPlateOk: boolean | null
  debugCharDetections: { char: string; score: number }[] | null
  debugPreNmsCount: number | null
  debugProcessedUrl: string | null
}

const INITIAL_VARIANT_RESULT: PlateOCRVariantResult = {
  recognizedText: null,
  isPlateOk: null,
  debugCharDetections: null,
  debugPreNmsCount: null,
  debugProcessedUrl: null,
}

export interface PlateOCRResult {
  // null = 尚未核對過；true 表示「不校正」或「校正」任一組辨識結果吻合即可
  isPlateOk: boolean | null
  isRecognizing: boolean
  needsManualConfirmation: boolean
  // 車牌字元模型載入失敗時為 true（網路/CORS/檔案損毀），此時 OCR 一律視為無法判斷。
  modelLoadError: boolean
  // 🧪 除錯用：裁切下來的原圖，兩組結果共用同一張裁切圖。
  debugRawCropUrl: string | null
  // 🧪 除錯用：裁切下來的原始像素尺寸，用來判斷辨識率差是不是解析度不足導致。
  debugCropWidth: number | null
  debugCropHeight: number | null
  // 🧪 除錯用：這次校正實際用的角點來源與信心分數，方便判斷動態偵測有沒有抓對。
  debugQuadSource: 'dynamic' | 'static' | 'none' | null
  debugQuadConfidence: number | null
  // 🧪 除錯用：辨識過程拋出例外時的錯誤訊息，手機上看不到瀏覽器 console，直接顯示在畫面上。
  debugLastError: string | null
  noWarp: PlateOCRVariantResult
  withWarp: PlateOCRVariantResult
}

export interface UsePlateOCRResult extends PlateOCRResult {
  triggerOnce: (video: HTMLVideoElement, box: PercentBox, expectedPlateNumber: string, skewCorners?: Quad) => Promise<void>
  confirmManually: () => void
}

const INITIAL_RESULT: PlateOCRResult = {
  isPlateOk: null,
  isRecognizing: false,
  needsManualConfirmation: false,
  modelLoadError: false,
  debugRawCropUrl: null,
  debugCropWidth: null,
  debugCropHeight: null,
  debugQuadSource: null,
  debugQuadConfidence: null,
  debugLastError: null,
  noWarp: INITIAL_VARIANT_RESULT,
  withWarp: INITIAL_VARIANT_RESULT,
}

export function usePlateOCR(): UsePlateOCRResult {
  const [state, setState] = useState<PlateOCRResult>(INITIAL_RESULT)
  const modelRef = useRef<tf.GraphModel | null>(null)
  const modelPromiseRef = useRef<Promise<tf.GraphModel> | null>(null)
  const failureCountRef = useRef(0)
  // lock 機制：確保 triggerOnce 呼叫一次只執行一次辨識，不會被重複觸發
  // （例如連續好幾個 frame 都判定「條件已全滿足」而重複呼叫）。
  const lockRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const letterboxCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    return () => {
      modelRef.current?.dispose()
    }
  }, [])

  const getModel = useCallback(async () => {
    if (modelRef.current) return modelRef.current
    if (!modelPromiseRef.current) {
      modelPromiseRef.current = ensureFastBackend().then(() => tf.loadGraphModel(CHAR_MODEL_URL)).then(
        (m) => {
          modelRef.current = m
          return m
        },
        (err) => {
          console.error('[usePlateOCR] char model load failed:', err)
          setState((s) => ({ ...s, modelLoadError: true }))
          throw err
        },
      )
    }
    return modelPromiseRef.current
  }, [])

  // 把「letterbox → 丟進模型 → 解析 → 過濾分隔符號 → 依已知長度剔除雜訊 → 組字串
  // → 跟期望車牌比對」這一整段跑在指定的來源畫布上，讓「校正前」「校正後」兩張
  // 畫布可以共用同一套邏輯分別各跑一次。
  async function runCharDetection(
    model: tf.GraphModel,
    sourceCanvas: HTMLCanvasElement,
    expectedPlateNumber: string,
  ): Promise<PlateOCRVariantResult> {
    if (!letterboxCanvasRef.current) letterboxCanvasRef.current = document.createElement('canvas')
    const letterboxCanvas = letterboxCanvasRef.current
    letterboxCanvas.width = CHAR_INPUT_SIZE
    letterboxCanvas.height = CHAR_INPUT_SIZE
    const letterboxCtx = letterboxCanvas.getContext('2d')!
    drawLetterboxed(letterboxCtx, sourceCanvas, sourceCanvas.width, sourceCanvas.height, CHAR_INPUT_SIZE)
    const debugProcessedUrl = letterboxCanvas.toDataURL('image/png')

    const inputTensor = tf.tidy(
      () => tf.browser.fromPixels(letterboxCanvas).toFloat().div(255).expandDims(0) as tf.Tensor4D,
    )
    const output = model.execute(inputTensor) as tf.Tensor
    const { detections, preNmsCount } = await withTimeout(
      decodeYoloOutput(output, CHAR_INPUT_SIZE, { scoreThreshold: CHAR_SCORE_THRESHOLD }, CHAR_CLASS_NAMES),
      TRIGGER_TIMEOUT_MS,
      '偵測結果解析',
    )
    inputTensor.dispose()
    output.dispose()

    const charDetections: CharDetection[] = detections
      .filter((d) => !isSeparatorChar(d.className))
      .map((d) => ({
        char: d.className,
        score: d.score,
        x1: d.x1,
        x2: d.x2,
        y1: d.y1,
        y2: d.y2,
      }))
    const expected = normalizePlateText(expectedPlateNumber)
    const assembled = pruneToExpectedLength(assembleCharacters(charDetections), expected.length)
    const rawText = assembled.map((d) => d.char).join('')
    const debugCharDetections = assembled.map((d) => ({ char: d.char, score: d.score }))

    const recognizedText = normalizePlateText(rawText)
    const isPlateOk = recognizedText.length > 0 && recognizedText === expected
    const displayText = formatRecognizedTextForDisplay(recognizedText, expectedPlateNumber)

    return { recognizedText: displayText, isPlateOk, debugCharDetections, debugPreNmsCount: preNmsCount, debugProcessedUrl }
  }

  const triggerOnce = useCallback(
    async (video: HTMLVideoElement, box: PercentBox, expectedPlateNumber: string, skewCorners?: Quad) => {
      if (lockRef.current) return
      if (stateRef.current.isPlateOk === true) return // 已核對成功，不需要再掃（僅觸發一次）
      if (stateRef.current.needsManualConfirmation) return // 已達失敗上限，等使用者手動確認
      if (video.videoWidth === 0 || video.videoHeight === 0) return

      lockRef.current = true
      setState((s) => ({ ...s, isRecognizing: true }))

      try {
        if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
        const canvas = canvasRef.current
        const rawWidth = (box.widthPercent / 100) * video.videoWidth
        const rawHeight = (box.heightPercent / 100) * video.videoHeight
        const padX = rawWidth * (CROP_PADDING_PERCENT / 100)
        const padY = rawHeight * (CROP_PADDING_PERCENT / 100)
        const cropX = Math.max(0, (box.xPercent / 100) * video.videoWidth - padX)
        const cropY = Math.max(0, (box.yPercent / 100) * video.videoHeight - padY)
        const cropWidth = Math.max(1, Math.round(Math.min(video.videoWidth - cropX, rawWidth + padX * 2)))
        const cropHeight = Math.max(1, Math.round(Math.min(video.videoHeight - cropY, rawHeight + padY * 2)))
        canvas.width = cropWidth
        canvas.height = cropHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
        const debugRawCropUrl = canvas.toDataURL('image/png')

        // 拍攝角度多少會有落差，先嘗試直接從當下畫面動態抓車牌的實際四個角落
        // （見 plateCornerDetection.ts），信心分數不夠時才退回該角度模板固定校準好的
        // 角點（skewCorners），兩者都沒有時「校正後」這組跟「不校正」這組會是同一張圖。
        const detected = detectPlateQuad(canvas)
        let quadPx: Quad | null = null
        let quadSource: 'dynamic' | 'static' | 'none' = 'none'
        let quadConfidence: number | null = null
        if (detected && detected.confidence >= MIN_QUAD_CONFIDENCE) {
          quadPx = detected.quad
          quadSource = 'dynamic'
          quadConfidence = detected.confidence
        } else if (skewCorners) {
          quadPx = skewCorners.map((p) => ({ x: p.x * cropWidth, y: p.y * cropHeight })) as Quad
          quadSource = 'static'
        }
        const dewarpedCanvas = quadPx ? warpQuadToRect(canvas, quadPx, cropWidth, cropHeight) : canvas

        const model = await withTimeout(getModel(), TRIGGER_TIMEOUT_MS, '字元模型載入')
        const noWarp = await runCharDetection(model, canvas, expectedPlateNumber)
        const withWarp =
          dewarpedCanvas === canvas ? noWarp : await runCharDetection(model, dewarpedCanvas, expectedPlateNumber)

        const isPlateOk = noWarp.isPlateOk === true || withWarp.isPlateOk === true

        if (isPlateOk) {
          failureCountRef.current = 0
        } else {
          failureCountRef.current += 1
        }

        setState({
          isPlateOk,
          isRecognizing: false,
          needsManualConfirmation: ENABLE_MANUAL_CONFIRMATION_LOCK && failureCountRef.current >= MAX_FAILURE_COUNT,
          modelLoadError: false,
          debugRawCropUrl,
          debugCropWidth: cropWidth,
          debugCropHeight: cropHeight,
          debugQuadSource: quadSource,
          debugQuadConfidence: quadConfidence,
          debugLastError: null,
          noWarp,
          withWarp,
        })
      } catch (err) {
        console.error('[usePlateOCR] recognize failed:', err)
        failureCountRef.current += 1
        setState((s) => ({
          ...s,
          isRecognizing: false,
          isPlateOk: false,
          needsManualConfirmation: ENABLE_MANUAL_CONFIRMATION_LOCK && failureCountRef.current >= MAX_FAILURE_COUNT,
          debugLastError: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        }))
      } finally {
        lockRef.current = false
      }
    },
    [getModel],
  )

  const confirmManually = useCallback(() => {
    setState((s) => ({ ...s, isPlateOk: true, isRecognizing: false, needsManualConfirmation: false }))
  }, [])

  return { ...state, triggerOnce, confirmManually }
}
