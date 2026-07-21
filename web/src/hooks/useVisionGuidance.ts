import { useEffect, useRef, useState, type RefObject } from 'react'
import * as tf from '@tensorflow/tfjs'
import { decodeYoloOutput, detectionToVideoPercent, drawLetterboxed, type LetterboxLayout } from '../lib/yolo'
import { useFrameThrottle } from '../lib/frameScheduler'
import { ensureFastBackend } from '../lib/tfBackend'

// 用 BASE_URL 而非寫死 '/'，部署到 GitHub Pages 這類子路徑時才能正確解析（見任務 1）
const MODEL_URL = `${import.meta.env.BASE_URL}model/model.json`
const INPUT_SIZE = 640

// 5~10 FPS 原本是任務 1 Spike 階段（webgl 後端）量到的目標值，但後來為了穩定性
// 改用 wasm 後端（見 tfBackend.ts）後，實測單次推論本身就要 400~460ms，遠比
// 8 FPS 的 125ms 間隔長——等於每輪推論一結束、下一輪幾乎立刻又開始，主執行緒
// 長時間被連續的推論長任務佔住，導致點擊（例如切換拍攝角度）要等推論做完才會
// 被瀏覽器處理，感覺畫面「卡住」。改成更保守的目標、且真正在每次推論「做完」
// 之後才額外空出一段時間（見下方 POST_INFERENCE_IDLE_MS + nextAllowedAtRef），
// 讓主執行緒之間確實有喘息空檔可以處理使用者互動，犧牲一點偵測更新頻率換取
// UI 回應速度。
const TARGET_FPS = 3
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS
// 推論完成後，額外保留這麼多毫秒的主執行緒空檔，才允許下一輪推論觸發——這是
// 真正的「做完才等」，不是単纯縮短目標間隔（縮短目標間隔本身不夠：只要單次推論
// 時間超過目標間隔，下一輪還是會在推論結束的瞬間立刻接著開始，中間仍然沒有空檔）。
const POST_INFERENCE_IDLE_MS = 150

// 面積比例容錯（相對目標面積的百分比差距）。原本 10%、後來 40% 都實測太嚴格，常卡在
// 「請靠近一點」無法通過——黃金標準照的目標面積是估算值，非使用者實際持機拍攝距離的
// 精確值，放寬到 60% 讓距離判斷更容易通過（後續可依黃金標準照校準結果再收緊）。
const DEFAULT_AREA_TOLERANCE_PERCENT = 60

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
  // 引導框（虛線框）本身的位置與大小——位置判斷改成「偵測框中心點是否落在這個
  // 矩形內」，而不是跟單一容錯值比較，框畫多大，可接受的對準範圍就有多大。
  boxXPercent: number
  boxYPercent: number
  boxWidthPercent: number
  boxHeightPercent: number
  targetAreaPercent: number
  areaTolerancePercent?: number
}

// 即時偵測到的框，座標慣例與 GuideBoxProps 一致（左上角 + 寬高百分比），
// 讓呼叫端可以直接疊加渲染在畫面上，跟靜態引導框並排比較。
export interface DetectedBox {
  target: 'wheel' | 'license_plate'
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
  score: number
}

export interface VisionGuidanceResult {
  // 模型載入失敗（網路/CORS/檔案損毀）時為 true，此時 isPositionOk/isDistanceOk 一律
  // 視為「不參與判斷」（回傳 true），降級為僅靠陀螺儀防呆 + 手動拍攝，不讓整個流程卡死。
  modelLoadError: boolean
  isPositionOk: boolean
  positionDirection: PositionDirection | null
  isDistanceOk: boolean
  distanceDirection: DistanceDirection | null
  // 當前影格每個 target 偵測到的框（找不到則不列入），用於即時畫面疊加顯示
  detectedBoxes: DetectedBox[]
}

const SKIPPED_CHECKS = {
  isPositionOk: true,
  positionDirection: null as PositionDirection | null,
  isDistanceOk: true,
  distanceDirection: null as DistanceDirection | null,
  detectedBoxes: [] as DetectedBox[],
}

// 元件剛掛載、AI 模型還沒載完或第一次推論還沒跑完之前的預設值——這段期間根本還
// 沒有任何真正的偵測結果，不能沿用 SKIPPED_CHECKS（那組「一律視為通過」是「沒有
// 引導框需要比對」專用的語意，例如任務 9 的一般取景相機）。如果拿 SKIPPED_CHECKS
// 當 React state 的初始值，會被 useGuidanceStateMachine 誤判成「位置/距離已經
// 對準」，配合 AutoShutter 現在就算沒有動作感測器也會直接倒數拍照的邏輯，會導致
// 使用者才剛進畫面、車輪/車牌根本還沒偵測過一次，就被自動拍下去。
const INITIAL_CHECKS = {
  isPositionOk: false,
  positionDirection: null as PositionDirection | null,
  isDistanceOk: false,
  distanceDirection: null as DistanceDirection | null,
  detectedBoxes: [] as DetectedBox[],
}

export function useVisionGuidance(
  videoRef: RefObject<HTMLVideoElement | null>,
  targets: VisionTarget[],
  enabled: boolean,
): VisionGuidanceResult {
  const [modelLoadError, setModelLoadError] = useState(false)
  const [checks, setChecks] = useState(INITIAL_CHECKS)
  const modelRef = useRef<tf.GraphModel | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const targetsRef = useRef(targets)
  targetsRef.current = targets
  const inferringRef = useRef(false)
  // 記錄「下一次最早可以幾點開始推論」，只有在推論真正跑完的那一刻（見下方
  // .finally()）才會被更新成「現在＋POST_INFERENCE_IDLE_MS」；跟 frameScheduler
  // 自己的節流間隔分開追蹤，因為 frameScheduler 每次 tick 只要時間到就會呼叫這個
  // callback（即使因為 inferringRef 而立刻略過），不會知道推論實際上還沒真的完成。
  const nextAllowedAtRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    ensureFastBackend()
      .then(() => tf.loadGraphModel(MODEL_URL))
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
    (timestamp) => {
      const video = videoRef.current
      const model = modelRef.current
      if (!video || !model || inferringRef.current) return
      if (timestamp < nextAllowedAtRef.current) return
      if (video.videoWidth === 0 || video.videoHeight === 0) return

      inferringRef.current = true
      void runInference(model, video, targetsRef.current)
        .then((next) => setChecks(next))
        .catch((err) => {
          console.error('[useVisionGuidance] inference failed:', err)
        })
        .finally(() => {
          inferringRef.current = false
          nextAllowedAtRef.current = performance.now() + POST_INFERENCE_IDLE_MS
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
    const layout = drawLetterboxed(ctx, video, video.videoWidth, video.videoHeight, INPUT_SIZE, INPUT_SIZE)

    const inputTensor = tf.tidy(
      () => tf.browser.fromPixels(canvas).toFloat().div(255).expandDims(0) as tf.Tensor4D,
    )
    const output = model.execute(inputTensor) as tf.Tensor
    const { detections } = await decodeYoloOutput(output, INPUT_SIZE, INPUT_SIZE)
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
    const detectedBoxes: DetectedBox[] = []

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

      const box = detectionToVideoPercent(best, layout, videoWidth, videoHeight, INPUT_SIZE, INPUT_SIZE)
      detectedBoxes.push({ target: t.target, score: best.score, ...box })

      const centerXPercent = box.xPercent + box.widthPercent / 2
      const centerYPercent = box.yPercent + box.heightPercent / 2
      const areaPercent = (box.widthPercent * box.heightPercent) / 100

      // 對準與否直接看偵測框中心點是否落在引導框（虛線框）矩形內，跟畫面上疊加顯示
      // 的偵測框顏色（CameraCapture 的 isCenterInsideGuideBox）用同一套邏輯，兩者
      // 視覺上會保持一致：框內＝綠色＝這裡的 isPositionOk 也是 true。
      const insideBox =
        centerXPercent >= t.boxXPercent &&
        centerXPercent <= t.boxXPercent + t.boxWidthPercent &&
        centerYPercent >= t.boxYPercent &&
        centerYPercent <= t.boxYPercent + t.boxHeightPercent

      if (!insideBox) {
        isPositionOk = false
        if (!positionDirection) {
          const boxCenterX = t.boxXPercent + t.boxWidthPercent / 2
          const boxCenterY = t.boxYPercent + t.boxHeightPercent / 2
          const dx = centerXPercent - boxCenterX
          const dy = centerYPercent - boxCenterY
          // 慣例（暫定，待黃金標準照驗證後可能需調整）：方向代表「鏡頭該往哪裡移動」，
          // 取偏移量較大的軸決定方向。
          positionDirection =
            Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : dx > 0 ? 'left' : 'right'
        }
      }

      const areaTolerance = t.areaTolerancePercent ?? DEFAULT_AREA_TOLERANCE_PERCENT
      const areaDiffRatio = ((areaPercent - t.targetAreaPercent) / t.targetAreaPercent) * 100
      if (Math.abs(areaDiffRatio) > areaTolerance) {
        isDistanceOk = false
        if (!distanceDirection) {
          // 偵測面積比目標小 → 物件太小 → 離太遠，需靠近；反之需後退
          distanceDirection = areaDiffRatio < 0 ? 'closer' : 'farther'
        }
      }
    }

    return { isPositionOk, positionDirection, isDistanceOk, distanceDirection, detectedBoxes }
  }

  if (modelLoadError) {
    return { modelLoadError: true, ...SKIPPED_CHECKS }
  }
  return { modelLoadError: false, ...checks }
}
