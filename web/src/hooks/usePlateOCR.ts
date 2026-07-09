import { useCallback, useEffect, useRef, useState } from 'react'
import { createWorker } from 'tesseract.js'
import type { PercentBox } from '../lib/yolo'

// 連續辨識失敗達此上限時，改用「手動確認車牌」逃生選項——瀏覽器端 OCR 準確率
// 通常不如預期（車牌字體/光線角度差異大時尤其明顯），不能讓使用者卡在無限重試迴圈。
const MAX_FAILURE_COUNT = 3

function normalizePlateText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export interface PlateOCRResult {
  // null = 尚未核對過
  isPlateOk: boolean | null
  isRecognizing: boolean
  needsManualConfirmation: boolean
  recognizedText: string | null
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
      workerPromiseRef.current = createWorker('eng').then((w) => {
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
        const cropWidth = Math.max(1, Math.round((box.widthPercent / 100) * video.videoWidth))
        const cropHeight = Math.max(1, Math.round((box.heightPercent / 100) * video.videoHeight))
        const cropX = (box.xPercent / 100) * video.videoWidth
        const cropY = (box.yPercent / 100) * video.videoHeight
        canvas.width = cropWidth
        canvas.height = cropHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

        const worker = await getWorker()
        const { data } = await worker.recognize(canvas)
        const recognizedText = normalizePlateText(data.text)
        const expected = normalizePlateText(expectedPlateNumber)
        const isPlateOk = recognizedText.length > 0 && recognizedText === expected

        if (isPlateOk) {
          failureCountRef.current = 0
          setState({ isPlateOk: true, isRecognizing: false, needsManualConfirmation: false, recognizedText: data.text })
        } else {
          failureCountRef.current += 1
          setState({
            isPlateOk: false,
            isRecognizing: false,
            needsManualConfirmation: failureCountRef.current >= MAX_FAILURE_COUNT,
            recognizedText: data.text,
          })
        }
      } catch (err) {
        console.error('[usePlateOCR] recognize failed:', err)
        failureCountRef.current += 1
        setState((s) => ({
          ...s,
          isRecognizing: false,
          isPlateOk: false,
          needsManualConfirmation: failureCountRef.current >= MAX_FAILURE_COUNT,
        }))
      } finally {
        lockRef.current = false
      }
    },
    [getWorker],
  )

  const confirmManually = useCallback(() => {
    setState({ isPlateOk: true, isRecognizing: false, needsManualConfirmation: false, recognizedText: null })
  }, [])

  return { ...state, triggerOnce, confirmManually }
}
