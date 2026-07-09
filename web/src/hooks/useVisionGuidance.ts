import { useEffect, useRef, useState, type RefObject } from 'react'
import * as tf from '@tensorflow/tfjs'
import { decodeYoloOutput, detectionToVideoPercent, drawLetterboxed, type LetterboxLayout } from '../lib/yolo'
import { useFrameThrottle } from '../lib/frameScheduler'

// 用 BASE_URL 而非寫死 '/'，部署到 GitHub Pages 這類子路徑時才能正確解析（見任務 1）
const MODEL_URL = `${import.meta.env.BASE_URL}model/model.json`
const INPUT_SIZE = 640

// 5~10 FPS 為目標值：任務 1 Spike 階段量測到 WebGL/WASM 皆遠快於此門檻，
// 這裡取中間值，真正上限仍需依實機（尤其低階 Android）表現微調。
const TARGET_FPS = 8
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS

const DEFAULT_POSITION_TOLERANCE_PERCENT = 8 // 中心點座標容錯（百分比畫面寬高）
const DEFAULT_AREA_TOLERANCE_PERCENT = 10 // 面積比例容錯（相對目標面積的百分比差距）

export type PositionDirection = 'up' | 'down' | 'left' | 'right'
export type DistanceDirection = 'closer' | 'farther'

export const POSITION_DIRECTION_MESSAGES: Record<PositionDirection, string> = {
  up: '請將鏡頭拿高',
  down: '請將鏡頭降低',
  left: '請將鏡頭往左移',
  right: '請將鏡頭往右移',
}

export const DISTANCE_DIRECTION_MESSAGES: Record<DistanceDirection, string> = {
  closer: '請靠近一點',
  farther: '請退後一點',
}

export interface VisionTarget {
  target: 'wheel' | 'license_plate'
  targetXPercent: number
  targetYPercent: number
  targetAreaPercent: number
  positionTolerancePercent?: number
  areaTolerancePercent?: number
}

export interface VisionGuidanceResult {
  // 模型載入失敗（網路/CORS/檔案損毀）時為 true，此時 isPositionOk/isDistanceOk 一律
  // 視為「不參與判斷」（回傳 true），降級為僅靠陀螺儀防呆 + 手動拍攝，不讓整個流程卡死。
  modelLoadError: boolean
  isPositionOk: boolean
  positionDirection: PositionDirection | null
  isDistanceOk: boolean
  distanceDirection: DistanceDirection | null
}

const SKIPPED_CHECKS = {
  isPositionOk: true,
  positionDirection: null as PositionDirection | null,
  isDistanceOk: true,
  distanceDirection: null as DistanceDirection | null,
}

export function useVisionGuidance(
  videoRef: RefObject<HTMLVideoElement | null>,
  targets: VisionTarget[],
  enabled: boolean,
): VisionGuidanceResult {
  const [modelLoadError, setModelLoadError] = useState(false)
  const [checks, setChecks] = useState(SKIPPED_CHECKS)
  const modelRef = useRef<tf.GraphModel | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const targetsRef = useRef(targets)
  targetsRef.current = targets
  const inferringRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    tf.loadGraphModel(MODEL_URL)
      .then((model) => {
        if (cancelled) {
          model.dispose()
          return
        }
        modelRef.current = model
      })
      .catch((err) => {
        console.error('[useVisionGuidance] model load failed:', err)
        if (!cancelled) setModelLoadError(true)
      })

    return () => {
      cancelled = true
      modelRef.current?.dispose()
      modelRef.current = null
    }
  }, [enabled])

  useFrameThrottle(
    () => {
      const video = videoRef.current
      const model = modelRef.current
      if (!video || !model || inferringRef.current) return
      if (video.videoWidth === 0 || video.videoHeight === 0) return

      inferringRef.current = true
      void runInference(model, video, targetsRef.current)
        .then((next) => setChecks(next))
        .catch((err) => {
          console.error('[useVisionGuidance] inference failed:', err)
        })
        .finally(() => {
          inferringRef.current = false
        })
    },
    FRAME_INTERVAL_MS,
    enabled && !modelLoadError,
  )

  async function runInference(
    model: tf.GraphModel,
    video: HTMLVideoElement,
    currentTargets: VisionTarget[],
  ): Promise<typeof SKIPPED_CHECKS> {
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas')
    const canvas = canvasRef.current
    canvas.width = INPUT_SIZE
    canvas.height = INPUT_SIZE
    const ctx = canvas.getContext('2d')!
    const layout = drawLetterboxed(ctx, video, video.videoWidth, video.videoHeight, INPUT_SIZE)

    const inputTensor = tf.tidy(
      () => tf.browser.fromPixels(canvas).toFloat().div(255).expandDims(0) as tf.Tensor4D,
    )
    const output = model.execute(inputTensor) as tf.Tensor
    const { detections } = await decodeYoloOutput(output, INPUT_SIZE)
    inputTensor.dispose()
    output.dispose()

    return evaluateTargets(currentTargets, detections, layout, video.videoWidth, video.videoHeight)
  }

  function evaluateTargets(
    currentTargets: VisionTarget[],
    detections: Awaited<ReturnType<typeof decodeYoloOutput>>['detections'],
    layout: LetterboxLayout,
    videoWidth: number,
    videoHeight: number,
  ): typeof SKIPPED_CHECKS {
    if (currentTargets.length === 0) return SKIPPED_CHECKS

    let isPositionOk = true
    let positionDirection: PositionDirection | null = null
    let isDistanceOk = true
    let distanceDirection: DistanceDirection | null = null

    for (const t of currentTargets) {
      const best = detections
        .filter((d) => d.className === t.target)
        .sort((a, b) => b.score - a.score)[0]

      if (!best) {
        // 完全沒偵測到目標物件：視為位置/距離都尚未對準，沒有方向可猜測
        isPositionOk = false
        isDistanceOk = false
        continue
      }

      const box = detectionToVideoPercent(best, layout, videoWidth, videoHeight, INPUT_SIZE)
      const posTolerance = t.positionTolerancePercent ?? DEFAULT_POSITION_TOLERANCE_PERCENT
      const dx = box.xPercent - t.targetXPercent
      const dy = box.yPercent - t.targetYPercent

      if (Math.abs(dx) > posTolerance || Math.abs(dy) > posTolerance) {
        isPositionOk = false
        if (!positionDirection) {
          // 慣例（暫定，待黃金標準照驗證後可能需調整）：方向代表「鏡頭該往哪裡移動」，
          // 取偏移量較大的軸決定方向。
          positionDirection =
            Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : dx > 0 ? 'left' : 'right'
        }
      }

      const areaTolerance = t.areaTolerancePercent ?? DEFAULT_AREA_TOLERANCE_PERCENT
      const areaDiffRatio = ((box.areaPercent - t.targetAreaPercent) / t.targetAreaPercent) * 100
      if (Math.abs(areaDiffRatio) > areaTolerance) {
        isDistanceOk = false
        if (!distanceDirection) {
          // 偵測面積比目標小 → 物件太小 → 離太遠，需靠近；反之需後退
          distanceDirection = areaDiffRatio < 0 ? 'closer' : 'farther'
        }
      }
    }

    return { isPositionOk, positionDirection, isDistanceOk, distanceDirection }
  }

  if (modelLoadError) {
    return { modelLoadError: true, ...SKIPPED_CHECKS }
  }
  return { modelLoadError: false, ...checks }
}
