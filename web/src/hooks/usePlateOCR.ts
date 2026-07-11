import { useCallback, useEffect, useRef, useState } from 'react'
import { createWorker, PSM } from 'tesseract.js'
import type { PercentBox } from '../lib/yolo'

// 連續辨識失敗達此上限時，改用「手動確認車牌」逃生選項——瀏覽器端 OCR 準確率
// 通常不如預期（車牌字體/光線角度差異大時尤其明顯），不能讓使用者卡在無限重試迴圈。
const MAX_FAILURE_COUNT = 3

// 🧪 暫時測試用：先不要因為連續失敗鎖住、跳出手動確認，方便連續觀察每次辨識結果。
// 之後車牌辨識問題排查完畢，記得把這個改回 true。
const ENABLE_MANUAL_CONFIRMATION_LOCK = false

// 🧪 暫時測試用：兩次辨識嘗試間至少間隔這麼久，避免每個 frame 都重新觸發、畫面一直閃動，
// 讓除錯文字有時間穩定顯示方便截圖。之後排查完畢可以拿掉或調短。
const TEST_RETRY_COOLDOWN_MS = 3000

// 實測裁切下來的車牌已有 300px 以上寬度，解析度足夠，不需要再放大——先前設 3 倍會把圖片撐到
// 900px+，Tesseract 在手機上跑這種尺寸非常慢，容易讓人誤以為卡死，改成不放大以加快辨識速度。
const UPSCALE_FACTOR = 1
// 偵測框可能剛好卡到字元邊緣，外擴一點避免頭尾字元被切掉。
const CROP_PADDING_PERCENT = 12

function normalizePlateText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// 灰階 + 對比度拉伸（不強制二值化）：連續試過「不處理」「全域 Otsu」「局部自適應」三種
// 二值化方式，車牌本身雖然肉眼清楚可辨，辨識結果卻始終是空的或雜訊——現代 Tesseract
// 用的是 LSTM 引擎，本來就是拿灰階／彩色影像訓練，強制二值化反而會把它賴以辨識的
// 反鋸齒邊緣細節破壞掉。改成只拉伸對比度（把實際亮度範圍拉滿到 0-255），保留灰階漸層。
function preprocessForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = source
  const srcCtx = source.getContext('2d')!
  const { data } = srcCtx.getImageData(0, 0, width, height)

  const gray = new Uint8ClampedArray(width * height)
  let min = 255
  let max = 0
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const v = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
    gray[i] = v
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = Math.max(1, max - min)

  const outCanvas = document.createElement('canvas')
  outCanvas.width = width * UPSCALE_FACTOR
  outCanvas.height = height * UPSCALE_FACTOR
  const grayCanvas = document.createElement('canvas')
  grayCanvas.width = width
  grayCanvas.height = height
  const grayCtx = grayCanvas.getContext('2d')!
  const grayImageData = grayCtx.createImageData(width, height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const stretched = ((gray[i] - min) / range) * 255
    grayImageData.data[p] = stretched
    grayImageData.data[p + 1] = stretched
    grayImageData.data[p + 2] = stretched
    grayImageData.data[p + 3] = 255
  }
  grayCtx.putImageData(grayImageData, 0, 0)

  const outCtx = outCanvas.getContext('2d')!
  outCtx.imageSmoothingEnabled = true
  outCtx.drawImage(grayCanvas, 0, 0, width, height, 0, 0, outCanvas.width, outCanvas.height)

  return outCanvas
}

export interface PlateOCRResult {
  // null = 尚未核對過
  isPlateOk: boolean | null
  isRecognizing: boolean
  needsManualConfirmation: boolean
  recognizedText: string | null
  // 🧪 除錯用：分別是「裁切下來的原圖」與「送進 Tesseract 的前處理後圖片」，
  // 用來肉眼確認裁切框到底框到了什麼、前處理有沒有把文字變清楚。
  debugRawCropUrl: string | null
  debugProcessedUrl: string | null
  // 🧪 除錯用：裁切下來的原始像素尺寸，用來判斷辨識率差是不是解析度不足導致。
  debugCropWidth: number | null
  debugCropHeight: number | null
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
  debugRawCropUrl: null,
  debugProcessedUrl: null,
  debugCropWidth: null,
  debugCropHeight: null,
}

export function usePlateOCR(): UsePlateOCRResult {
  const [state, setState] = useState<PlateOCRResult>(INITIAL_RESULT)
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null)
  const workerPromiseRef = useRef<Promise<Awaited<ReturnType<typeof createWorker>>> | null>(null)
  const failureCountRef = useRef(0)
  // lock 機制：確保 triggerOnce 呼叫一次只執行一次辨識，不會被重複觸發
  // （例如連續好幾個 frame 都判定「條件已全滿足」而重複呼叫）。
  const lockRef = useRef(false)
  const lastAttemptAtRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  const getWorker = useCallback(async () => {
    if (workerRef.current) return workerRef.current
    if (!workerPromiseRef.current) {
      // 僅預載 eng 語言包：台灣車牌無中文字，不需要 chi_tra，減少下載體積與初始化時間
      workerPromiseRef.current = createWorker('eng').then(async (w) => {
        // 車牌只會是英數字，限制字元集可大幅降低雜訊誤判成其他符號的機率；
        // SINGLE_LINE 假設車牌是單行文字，比預設的段落辨識模式更符合車牌實際版面。
        await w.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
        })
        workerRef.current = w
        return w
      })
    }
    return workerPromiseRef.current
  }, [])

  const triggerOnce = useCallback(
    async (video: HTMLVideoElement, box: PercentBox, expectedPlateNumber: string) => {
      if (lockRef.current) return
      if (stateRef.current.isPlateOk === true) return // 已核對成功，不需要再掃（僅觸發一次）
      if (stateRef.current.needsManualConfirmation) return // 已達失敗上限，等使用者手動確認
      if (video.videoWidth === 0 || video.videoHeight === 0) return
      if (Date.now() - lastAttemptAtRef.current < TEST_RETRY_COOLDOWN_MS) return // 🧪 測試用冷卻，見上方常數說明

      lastAttemptAtRef.current = Date.now()
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
        const processedCanvas = preprocessForOcr(canvas)
        const debugProcessedUrl = processedCanvas.toDataURL('image/png')

        const worker = await getWorker()
        const { data } = await worker.recognize(processedCanvas)
        const recognizedText = normalizePlateText(data.text)
        const expected = normalizePlateText(expectedPlateNumber)
        const isPlateOk = recognizedText.length > 0 && recognizedText === expected

        if (isPlateOk) {
          failureCountRef.current = 0
          setState({
            isPlateOk: true,
            isRecognizing: false,
            needsManualConfirmation: false,
            recognizedText: data.text,
            debugRawCropUrl,
            debugProcessedUrl,
            debugCropWidth: cropWidth,
            debugCropHeight: cropHeight,
          })
        } else {
          failureCountRef.current += 1
          setState({
            isPlateOk: false,
            isRecognizing: false,
            needsManualConfirmation: ENABLE_MANUAL_CONFIRMATION_LOCK && failureCountRef.current >= MAX_FAILURE_COUNT,
            recognizedText: data.text,
            debugRawCropUrl,
            debugProcessedUrl,
            debugCropWidth: cropWidth,
            debugCropHeight: cropHeight,
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
        }))
      } finally {
        lockRef.current = false
      }
    },
    [getWorker],
  )

  const confirmManually = useCallback(() => {
    setState((s) => ({ ...s, isPlateOk: true, isRecognizing: false, needsManualConfirmation: false }))
  }, [])

  return { ...state, triggerOnce, confirmManually }
}
