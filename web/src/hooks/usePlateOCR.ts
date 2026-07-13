import { useCallback, useEffect, useRef, useState } from 'react'
import * as tf from '@tensorflow/tfjs'
import { CHAR_CLASS_NAMES, decodeYoloOutput, drawLetterboxed, type PercentBox } from '../lib/yolo'
import { ensureFastBackend } from '../lib/tfBackend'

// 用 BASE_URL 而非寫死 '/'，部署到 GitHub Pages 這類子路徑時才能正確解析（見任務 1）
const CHAR_MODEL_URL = `${import.meta.env.BASE_URL}char_model/model.json`
const CHAR_INPUT_SIZE = 640

// 連續辨識失敗達此上限時，改用「手動確認車牌」逃生選項——車牌角度/光線條件差時
// 辨識率不一定完美，不能讓使用者卡在無限重試迴圈。
const MAX_FAILURE_COUNT = 3

// 🧪 暫時測試用：先不要因為連續失敗鎖住、跳出手動確認，方便連續觀察每次辨識結果。
// 之後車牌辨識問題排查完畢，記得把這個改回 true。
const ENABLE_MANUAL_CONFIRMATION_LOCK = false

// 偵測框可能剛好卡到字元邊緣，外擴一點避免頭尾字元被切掉。
const CROP_PADDING_PERCENT = 12

// 字元偵測分數門檻。🧪 暫時從 0.4 調低到 0.15 排查準確率問題：目前不確定模型是
// 「完全沒看到」大部分字元、還是「有看到但信心不到 0.4」被濾掉，調低後配合
// debugPreNmsCount 一起看，可以分辨是門檻問題還是模型本身辨識力問題。
const CHAR_SCORE_THRESHOLD = 0.15
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

interface CharDetection {
  char: string
  score: number
  x1: number
  x2: number
  y1: number
  y2: number
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

export interface PlateOCRResult {
  // null = 尚未核對過
  isPlateOk: boolean | null
  isRecognizing: boolean
  needsManualConfirmation: boolean
  recognizedText: string | null
  // 車牌字元模型載入失敗時為 true（網路/CORS/檔案損毀），此時 OCR 一律視為無法判斷。
  modelLoadError: boolean
  // 🧪 除錯用：分別是「裁切下來的原圖」與「送進字元偵測模型的圖片（letterbox 後）」，
  // 用來肉眼確認裁切框到底框到了什麼。
  debugRawCropUrl: string | null
  debugProcessedUrl: string | null
  // 🧪 除錯用：裁切下來的原始像素尺寸，用來判斷辨識率差是不是解析度不足導致。
  debugCropWidth: number | null
  debugCropHeight: number | null
  // 🧪 除錯用：每個被偵測到的字元與其信心分數（已依左到右排序），方便判斷是漏字、
  // 誤判成別的字元、還是順序組錯。
  debugCharDetections: { char: string; score: number }[] | null
  // 🧪 除錯用：NMS 前超過分數門檻的候選框數量（跨所有 36 類加總，含重疊/重複計數）。
  // 用來分辨「模型根本沒看到大部分字元」（這個數字也很低）還是「有看到但被 NMS/
  // 門檻濾掉」（這個數字偏高，但 debugCharDetections 卻很少）。
  debugPreNmsCount: number | null
  // 🧪 除錯用：辨識過程拋出例外時的錯誤訊息，手機上看不到瀏覽器 console，直接顯示在畫面上。
  debugLastError: string | null
}

export interface UsePlateOCRResult extends PlateOCRResult {
  triggerOnce: (video: HTMLVideoElement, box: PercentBox, expectedPlateNumber: string) => Promise<void>
  confirmManually: () => void
}

const INITIAL_RESULT: PlateOCRResult = {
  isPlateOk: null,
  isRecognizing: false,
  needsManualConfirmation: false,
  recognizedText: null,
  modelLoadError: false,
  debugRawCropUrl: null,
  debugProcessedUrl: null,
  debugCropWidth: null,
  debugCropHeight: null,
  debugCharDetections: null,
  debugPreNmsCount: null,
  debugLastError: null,
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

  const triggerOnce = useCallback(
    async (video: HTMLVideoElement, box: PercentBox, expectedPlateNumber: string) => {
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

        // 曾經加過透視校正 + 動態角點偵測，目的是把斜角拍攝的車牌拉正——但實測發現
        // 這兩層對這顆字元偵測 YOLO 模型反而是負面效果（手刻透視變形的重取樣模糊
        // 明顯拉低了辨識信心分數，例如同一張參考照「不校正」最高信心 0.96，「校正
        // 後」只剩 0.87 且大量位置錯亂）。這兩層原本是為了改善 Tesseract 對斜角的
        // 弱點設計的，這顆模型本身對真實拍攝角度的容忍度已經夠好，不需要額外校正，
        // 直接把裁切下來的原圖丟給模型即可。
        if (!letterboxCanvasRef.current) letterboxCanvasRef.current = document.createElement('canvas')
        const letterboxCanvas = letterboxCanvasRef.current
        letterboxCanvas.width = CHAR_INPUT_SIZE
        letterboxCanvas.height = CHAR_INPUT_SIZE
        const letterboxCtx = letterboxCanvas.getContext('2d')!
        drawLetterboxed(letterboxCtx, canvas, canvas.width, canvas.height, CHAR_INPUT_SIZE)
        const debugProcessedUrl = letterboxCanvas.toDataURL('image/png')

        const model = await withTimeout(getModel(), TRIGGER_TIMEOUT_MS, '字元模型載入')
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

        const charDetections: CharDetection[] = detections.map((d) => ({
          char: d.className,
          score: d.score,
          x1: d.x1,
          x2: d.x2,
          y1: d.y1,
          y2: d.y2,
        }))
        const assembled = assembleCharacters(charDetections)
        const rawText = assembled.map((d) => d.char).join('')
        const debugCharDetections = assembled.map((d) => ({ char: d.char, score: d.score }))

        const recognizedText = normalizePlateText(rawText)
        const expected = normalizePlateText(expectedPlateNumber)
        const isPlateOk = recognizedText.length > 0 && recognizedText === expected

        if (isPlateOk) {
          failureCountRef.current = 0
          setState({
            isPlateOk: true,
            isRecognizing: false,
            needsManualConfirmation: false,
            recognizedText: rawText,
            modelLoadError: false,
            debugRawCropUrl,
            debugProcessedUrl,
            debugCropWidth: cropWidth,
            debugCropHeight: cropHeight,
            debugCharDetections,
            debugPreNmsCount: preNmsCount,
            debugLastError: null,
          })
        } else {
          failureCountRef.current += 1
          setState({
            isPlateOk: false,
            isRecognizing: false,
            needsManualConfirmation: ENABLE_MANUAL_CONFIRMATION_LOCK && failureCountRef.current >= MAX_FAILURE_COUNT,
            recognizedText: rawText,
            modelLoadError: false,
            debugRawCropUrl,
            debugProcessedUrl,
            debugCropWidth: cropWidth,
            debugCropHeight: cropHeight,
            debugCharDetections,
            debugPreNmsCount: preNmsCount,
            debugLastError: null,
          })
        }
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
