import { useCallback, useEffect, useRef, useState } from 'react'
import * as tf from '@tensorflow/tfjs'
import { CHAR_CLASS_NAMES, decodeYoloOutput, drawLetterboxed, type PercentBox } from '../lib/yolo'
import { ensureFastBackend } from '../lib/tfBackend'

// 用 BASE_URL 而非寫死 '/'，部署到 GitHub Pages 這類子路徑時才能正確解析（見任務 1）
const CHAR_MODEL_URL = `${import.meta.env.BASE_URL}char_model/model.json`
// 字元模型輸入尺寸，需對應目前部署的模型實際匯出尺寸（寬高都必須是 32 的倍數）。
const CHAR_INPUT_WIDTH = 640
const CHAR_INPUT_HEIGHT = 640

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
// 分隔符號區域被誤判成數字，這類雜訊改用下面的「依已知車牌長度剔除最低分」機制
// 處理，門檻只需要濾掉極低分的雜訊即可，不需要太嚴格。
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

// 台灣自小客車車牌最常見的格式是「3 碼英文 + 4 碼數字」（例如 RFX-2325），依這個慣例
// 鎖定每個位置該屬於哪一種類別，用來解決模型偶爾把數字/英文外觀相近的字元判錯類別
// 的問題（例如 "8" 判成 "B"、"2" 判成 "Z"）——見下方 applyPositionalTypeConstraint。
const DIGIT_CLASSES: Set<string> = new Set(CHAR_CLASS_NAMES.filter((c) => /^[0-9]$/.test(c)))
const LETTER_CLASSES: Set<string> = new Set(CHAR_CLASS_NAMES.filter((c) => /^[A-Z]$/.test(c)))

interface CharDetection {
  char: string
  score: number
  x1: number
  x2: number
  y1: number
  y2: number
}

// 同一個物理字元的位置，模型有時會對兩三個類別都給出偵測框（例如同時判成 "8" 跟
// "B"）——跨類別聚類時不能只留下分數最高的類別就丟掉其他候選，因為之後套用「前三碼
// 英文/後四碼數字」規則時，可能反而需要選次高分但符合該位置類別的候選（見下方
// applyPositionalTypeConstraint），所以這裡把同一個位置的所有候選都保留下來。
interface CharSlot {
  best: CharDetection
  candidates: CharDetection[]
}

// 跨類別聚類：依分數由高到低處理，同一個空間位置（IoU 超過門檻）的偵測框歸成同一個
// slot，分數最高的當作預設候選，其餘候選一併保留供後續格式規則挑選。
function clusterCharacters(detections: CharDetection[]): CharSlot[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score)
  const slots: CharSlot[] = []
  for (const det of sorted) {
    const slot = slots.find((s) => boxIou(s.best, det) > CROSS_CLASS_IOU_THRESHOLD)
    if (slot) {
      slot.candidates.push(det)
    } else {
      slots.push({ best: det, candidates: [det] })
    }
  }
  return slots.sort((a, b) => a.best.x1 - b.best.x1)
}

// 已知期望車牌的字元數（不含分隔符號）時，如果組出來的字元數比期望多，多出來的
// 通常是分隔符號區域被誤判成數字造成的雜訊——依信心分數由低到高剔除多餘的字元，
// 而不是單純調高分數門檻（因為實測發現正確字元的信心分數有時也偏低，例如 0.52）。
function pruneSlotsToExpectedLength(slots: CharSlot[], expectedLength: number): CharSlot[] {
  if (expectedLength <= 0 || slots.length <= expectedLength) return slots
  const dropCount = slots.length - expectedLength
  const weakestFirst = [...slots].sort((a, b) => a.best.score - b.best.score)
  const toDrop = new Set(weakestFirst.slice(0, dropCount))
  return slots.filter((s) => !toDrop.has(s))
}

// 只在 slot 數量剛好等於 7（3 碼英文 + 4 碼數字，去除分隔符號）時套用——其他長度的
// 車牌（少數車種格式不同）不套用這個假設，照原本信心分數最高的候選即可，避免對
// 不符合這個慣例的車牌反而做出錯誤的類別覆蓋。每個位置若預設候選的類別不符合該
// 位置該有的類別（前三碼須為英文、後四碼須為數字），才從同一位置的其他候選裡挑
// 符合類別中分數最高的一個換上去；找不到符合的候選就維持原本的預設候選。
function applyPositionalTypeConstraint(slots: CharSlot[]): CharDetection[] {
  if (slots.length !== 7) return slots.map((s) => s.best)
  return slots.map((slot, i) => {
    const requiredSet = i < 3 ? LETTER_CLASSES : DIGIT_CLASSES
    if (requiredSet.has(slot.best.char)) return slot.best
    const alt = slot.candidates.filter((c) => requiredSet.has(c.char)).sort((a, b) => b.score - a.score)[0]
    return alt ?? slot.best
  })
}

// 車牌比對本身已經是去掉分隔符號後比較（見 normalizePlateText），這裡只是為了讓
// 畫面顯示的「實際讀到」更好讀，依期望車牌裡分隔符號的位置，在辨識結果的同一個
// 位置插入固定的 "-" 符號（僅在字數對得上時才插入，對不上就照原樣顯示，避免插錯位置）。
function formatRecognizedTextForDisplay(text: string, expectedPlateNumber: string): string {
  const dashIndex = expectedPlateNumber.indexOf('-')
  if (dashIndex !== -1) {
    const expectedLength = normalizePlateText(expectedPlateNumber).length
    if (text.length === expectedLength) return `${text.slice(0, dashIndex)}-${text.slice(dashIndex)}`
  }
  // 沒有期望車牌可以參考分隔符號位置（或字數對不上）時，退回台灣車牌最常見的
  // 3+4 格式（例如 RFX-2325）方便閱讀；純顯示用途，不影響比對邏輯。
  if (text.length === 7) return `${text.slice(0, 3)}-${text.slice(3)}`
  return text
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

export interface PlateOCRResult {
  // null = 尚未核對過
  isPlateOk: boolean | null
  isRecognizing: boolean
  needsManualConfirmation: boolean
  // 車牌字元模型載入失敗時為 true（網路/CORS/檔案損毀），此時 OCR 一律視為無法判斷。
  modelLoadError: boolean
  recognizedText: string | null
  // 🧪 除錯用：裁切下來的原圖。
  debugRawCropUrl: string | null
  // 🧪 除錯用：裁切下來的原始像素尺寸，用來判斷辨識率差是不是解析度不足導致。
  debugCropWidth: number | null
  debugCropHeight: number | null
  debugCharDetections: { char: string; score: number }[] | null
  // 🧪 除錯用：跨類別 NMS/剔除雜訊之前的完整候選清單，見下方 runCharDetection 內的說明。
  debugAllCandidates: { char: string; score: number }[] | null
  debugPreNmsCount: number | null
  debugProcessedUrl: string | null
  // 🧪 除錯用：辨識過程拋出例外時的錯誤訊息，手機上看不到瀏覽器 console，直接顯示在畫面上。
  debugLastError: string | null
}

export interface UsePlateOCRResult extends PlateOCRResult {
  // source 是已經凍結的拍攝照片（透過 <img> 載入 dataURL），不是即時的 <video>——
  // 這樣重新辨識時每次都是對同一張照片重跑模型，結果才會穩定、可重現，不會因為
  // 使用者拍完後手部再晃動、或當下畫面暫時偵測不到車牌框，就悄悄辨識到不同的畫面
  // 甚至直接卡住沒反應（見 CameraCapture 呼叫端的說明）。
  triggerOnce: (
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    box: PercentBox,
    expectedPlateNumber: string,
  ) => Promise<void>
  confirmManually: () => void
  reset: () => void
}

const INITIAL_RESULT: PlateOCRResult = {
  isPlateOk: null,
  isRecognizing: false,
  needsManualConfirmation: false,
  modelLoadError: false,
  recognizedText: null,
  debugRawCropUrl: null,
  debugCropWidth: null,
  debugCropHeight: null,
  debugCharDetections: null,
  debugAllCandidates: null,
  debugPreNmsCount: null,
  debugProcessedUrl: null,
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
    async (
      source: CanvasImageSource,
      sourceWidth: number,
      sourceHeight: number,
      box: PercentBox,
      expectedPlateNumber: string,
    ) => {
      if (lockRef.current) return
      if (stateRef.current.isPlateOk === true) return // 已核對成功，不需要再掃（僅觸發一次）
      if (stateRef.current.needsManualConfirmation) return // 已達失敗上限，等使用者手動確認
      if (sourceWidth === 0 || sourceHeight === 0) return

      lockRef.current = true
      setState((s) => ({ ...s, isRecognizing: true }))

      try {
        if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
        const canvas = canvasRef.current
        const rawWidth = (box.widthPercent / 100) * sourceWidth
        const rawHeight = (box.heightPercent / 100) * sourceHeight
        const padX = rawWidth * (CROP_PADDING_PERCENT / 100)
        const padY = rawHeight * (CROP_PADDING_PERCENT / 100)
        const cropX = Math.max(0, (box.xPercent / 100) * sourceWidth - padX)
        const cropY = Math.max(0, (box.yPercent / 100) * sourceHeight - padY)
        const cropWidth = Math.max(1, Math.round(Math.min(sourceWidth - cropX, rawWidth + padX * 2)))
        const cropHeight = Math.max(1, Math.round(Math.min(sourceHeight - cropY, rawHeight + padY * 2)))
        canvas.width = cropWidth
        canvas.height = cropHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
        const debugRawCropUrl = canvas.toDataURL('image/png')

        if (!letterboxCanvasRef.current) letterboxCanvasRef.current = document.createElement('canvas')
        const letterboxCanvas = letterboxCanvasRef.current
        letterboxCanvas.width = CHAR_INPUT_WIDTH
        letterboxCanvas.height = CHAR_INPUT_HEIGHT
        const letterboxCtx = letterboxCanvas.getContext('2d')!
        drawLetterboxed(letterboxCtx, canvas, cropWidth, cropHeight, CHAR_INPUT_WIDTH, CHAR_INPUT_HEIGHT)
        const debugProcessedUrl = letterboxCanvas.toDataURL('image/png')

        const model = await withTimeout(getModel(), TRIGGER_TIMEOUT_MS, '字元模型載入')
        const inputTensor = tf.tidy(
          () => tf.browser.fromPixels(letterboxCanvas).toFloat().div(255).expandDims(0) as tf.Tensor4D,
        )
        const output = model.execute(inputTensor) as tf.Tensor
        const { detections, preNmsCount } = await withTimeout(
          decodeYoloOutput(output, CHAR_INPUT_WIDTH, CHAR_INPUT_HEIGHT, { scoreThreshold: CHAR_SCORE_THRESHOLD }, CHAR_CLASS_NAMES),
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
        const expected = normalizePlateText(expectedPlateNumber)
        const slots = pruneSlotsToExpectedLength(clusterCharacters(charDetections), expected.length)
        const assembled = applyPositionalTypeConstraint(slots)
        const rawText = assembled.map((d) => d.char).join('')
        const debugCharDetections = assembled.map((d) => ({ char: d.char, score: d.score }))
        // 🧪 除錯用：跨類別 NMS/剔除雜訊「之前」的完整候選清單（依 x 座標排序），用來
        // 判斷字元讀漏是「模型根本沒偵測到」還是「有偵測到但被跨類別 NMS 誤判成跟別的
        // 字元重疊而濾掉」——如果這裡也看不到漏掉的字元，就是模型本身的辨識力問題。
        const debugAllCandidates = [...charDetections].sort((a, b) => a.x1 - b.x1).map((d) => ({ char: d.char, score: d.score }))

        const recognizedText = normalizePlateText(rawText)
        const isPlateOk = recognizedText.length > 0 && recognizedText === expected
        const displayText = formatRecognizedTextForDisplay(recognizedText, expectedPlateNumber)

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
          recognizedText: displayText,
          debugRawCropUrl,
          debugCropWidth: cropWidth,
          debugCropHeight: cropHeight,
          debugCharDetections,
          debugAllCandidates,
          debugPreNmsCount: preNmsCount,
          debugProcessedUrl,
          debugLastError: null,
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

  // 每個拍攝角度都要各自重新驗證車牌，不能沿用前一個角度已經核對成功的結果——
  // 這個 hook 實例會跨角度共用（CameraCapture 不會因為換角度而重新掛載），
  // 呼叫端（CameraCapture）換到下一個角度前呼叫這個把狀態重置回初始值。
  const reset = useCallback(() => {
    failureCountRef.current = 0
    setState(INITIAL_RESULT)
  }, [])

  return { ...state, triggerOnce, confirmManually, reset }
}
