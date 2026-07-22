import { useRef, useState, type RefObject } from 'react'
import { useFrameThrottle } from '../lib/frameScheduler'
import { computeSharpnessVariance, DEFAULT_VARIANCE_THRESHOLD } from '../lib/sharpness'

// 節流：每 200ms 最多計算一次，不需要每個 frame 都算一次拉普拉斯變異數。
// 用共用的 frameScheduler（跟任務 6 的視覺推論共用同一條 rAF 迴圈），
// 避免兩組計時器互搶主執行緒。
const BLUR_INTERVAL_MS = 200

export interface BlurDetectionResult {
  isSharpOk: boolean
  variance: number | null
}

// 第一次真正量測到清晰度之前（至少要等第一個 200ms tick、且影格已經有內容）不能
// 預設「已經清晰」——否則配合 AutoShutter 現在沒有動作感測器也會直接倒數拍照的
// 邏輯，會導致才剛進畫面、根本還沒量過清晰度，就被判定「清晰」而提早拍下去。
const INITIAL_RESULT: BlurDetectionResult = { isSharpOk: false, variance: null }

export function useBlurDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  varianceThreshold = DEFAULT_VARIANCE_THRESHOLD,
): BlurDetectionResult {
  const [result, setResult] = useState<BlurDetectionResult>(INITIAL_RESULT)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const computingRef = useRef(false)

  useFrameThrottle(
    () => {
      const video = videoRef.current
      if (!video || computingRef.current) return
      if (video.videoWidth === 0 || video.videoHeight === 0) return

      computingRef.current = true
      try {
        if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
        const variance = computeSharpnessVariance(video, video.videoWidth, video.videoHeight, canvasRef.current)

        setResult({ isSharpOk: variance >= varianceThreshold, variance })
      } catch (err) {
        console.error('[useBlurDetection] compute failed:', err)
      } finally {
        computingRef.current = false
      }
    },
    BLUR_INTERVAL_MS,
    enabled,
  )

  return result
}
