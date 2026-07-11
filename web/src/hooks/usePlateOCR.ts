import { useCallback, useEffect, useRef, useState } from 'react'
import { createWorker, PSM } from 'tesseract.js'
import type { PercentBox } from '../lib/yolo'

// 連續辨識失敗達此上限時，改用「手動確認車牌」逃生選項——瀏覽器端 OCR 準確率
// 通常不如預期（車牌字體/光線角度差異大時尤其明顯），不能讓使用者卡在無限重試迴圈。
const MAX_FAILURE_COUNT = 3

// 🧪 暫時測試用：先不要因為連續失敗鎖住、跳出手動確認，方便連續觀察每次辨識結果。
// 之後車牌辨識問題排查完畢，記得把這個改回 true。
const ENABLE_MANUAL_CONFIRMATION_LOCK = false

// 裁切下來的車牌框通常只有幾十像素高，直接丟給 Tesseract 準確率很差，放大後文字邊緣更清楚。
const UPSCALE_FACTOR = 3
// 偵測框可能剛好卡到字元邊緣，外擴一點避免頭尾字元被切掉。
const CROP_PADDING_PERCENT = 12

function normalizePlateText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// 局部自適應二值化的視窗大小佔短邊比例、以及像素需比周圍平均亮度暗多少才算「前景」的容忍值。
// 車牌實拍常有局部反光/陰影，單一全域門檻值（如 Otsu）在光線不均的區域會整片誤判，
// 改成「每個像素跟周圍區域平均亮度比較」可以讓不同光線區域各自有正確的黑白分界。
const ADAPTIVE_BLOCK_RATIO = 0.25
const ADAPTIVE_C = 8

// 用 summed-area table（積分圖）讓「任意矩形範圍內平均亮度」變成 O(1) 查詢，
// 否則對每個像素都重新掃一次周圍視窗會是 O(width*height*blockSize^2)，裁切圖放大前雖然不大，
// 但仍值得用積分圖換取穩定的效能與較大 block size 的彈性。
function adaptiveThreshold(gray: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x]
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum
    }
  }

  const blockSize = Math.max(9, Math.floor(Math.min(width, height) * ADAPTIVE_BLOCK_RATIO)) | 1
  const half = Math.floor(blockSize / 2)
  const out = new Uint8ClampedArray(width * height)

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - half)
    const y2 = Math.min(height - 1, y + half)
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - half)
      const x2 = Math.min(width - 1, x + half)
      const area = (x2 - x1 + 1) * (y2 - y1 + 1)
      const sum =
        integral[(y2 + 1) * (width + 1) + (x2 + 1)] -
        integral[y1 * (width + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (width + 1) + x1] +
        integral[y1 * (width + 1) + x1]
      const localMean = sum / area
      out[y * width + x] = gray[y * width + x] >= localMean - ADAPTIVE_C ? 255 : 0
    }
  }

  return out
}

// 灰階 + 局部自適應二值化 + 放大：把裁切下來的車牌小圖轉成 Tesseract 較容易辨識的
// 高對比黑白大圖，且不受畫面局部反光/陰影影響（見 adaptiveThreshold 說明）。
function preprocessForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = source
  const srcCtx = source.getContext('2d')!
  const { data } = srcCtx.getImageData(0, 0, width, height)

  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  const binarized = adaptiveThreshold(gray, width, height)

  const binCanvas = document.createElement('canvas')
  binCanvas.width = width
  binCanvas.height = height
  const binCtx = binCanvas.getContext('2d')!
  const binImageData = binCtx.createImageData(width, height)
  for (let i = 0, p = 0; i < binarized.length; i++, p += 4) {
    const v = binarized[i]
    binImageData.data[p] = v
    binImageData.data[p + 1] = v
    binImageData.data[p + 2] = v
    binImageData.data[p + 3] = 255
  }
  binCtx.putImageData(binImageData, 0, 0)

  const outCanvas = document.createElement('canvas')
  outCanvas.width = width * UPSCALE_FACTOR
  outCanvas.height = height * UPSCALE_FACTOR
  const outCtx = outCanvas.getContext('2d')!
  outCtx.imageSmoothingEnabled = true
  outCtx.drawImage(binCanvas, 0, 0, width, height, 0, 0, outCanvas.width, outCanvas.height)

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
