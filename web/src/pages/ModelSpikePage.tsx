import { useCallback, useEffect, useRef, useState } from 'react'
import * as tf from '@tensorflow/tfjs'
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm'
import '@tensorflow/tfjs-backend-wasm'
import { decodeYoloOutput, drawLetterboxed, type Detection } from '../lib/yolo'

// 用 BASE_URL 而非寫死 '/'，部署到 GitHub Pages 這類子路徑（/ai-car-guide/）時才能正確解析
const MODEL_URL = `${import.meta.env.BASE_URL}model/model.json`
const INPUT_SIZE = 640
const TIMED_RUNS = 5

type BackendName = 'webgl' | 'wasm'

interface BackendResult {
  status: 'idle' | 'running' | 'done' | 'error'
  avgMs?: number
  perRunMs?: number[]
  preNmsCount?: number
  detections?: Detection[]
  error?: string
}

setWasmPaths(`${import.meta.env.BASE_URL}tfjs-wasm/`)

export function ModelSpikePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [modelInfo, setModelInfo] = useState<string>('尚未載入模型')
  const [results, setResults] = useState<Record<BackendName, BackendResult>>({
    webgl: { status: 'idle' },
    wasm: { status: 'idle' },
  })

  const drawBase = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    canvas.width = INPUT_SIZE
    canvas.height = INPUT_SIZE
    const ctx = canvas.getContext('2d')!
    // 等比縮放置中、周圍補黑邊，不可直接拉伸——與 Roboflow 匯出時採用的
    // 「Fit (black edges)」前處理一致，否則物件長寬比會與訓練資料不符
    drawLetterboxed(ctx, img, img.naturalWidth || img.width, img.naturalHeight || img.height, INPUT_SIZE, INPUT_SIZE)
  }, [])

  useEffect(() => {
    if (imageLoaded) drawBase()
  }, [imageLoaded, drawBase])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImageLoaded(true)
      setResults({ webgl: { status: 'idle' }, wasm: { status: 'idle' } })
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  const drawDetections = useCallback((detections: Detection[]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawBase()
    const ctx = canvas.getContext('2d')!
    for (const det of detections) {
      const x = det.x1 * INPUT_SIZE
      const y = det.y1 * INPUT_SIZE
      const w = (det.x2 - det.x1) * INPUT_SIZE
      const h = (det.y2 - det.y1) * INPUT_SIZE
      ctx.strokeStyle = det.className === 'wheel' ? '#22c55e' : '#ef4444'
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, w, h)
      ctx.fillStyle = ctx.strokeStyle
      ctx.font = '14px sans-serif'
      ctx.fillText(`${det.className} ${det.score.toFixed(2)}`, x, Math.max(y - 4, 10))
    }
  }, [drawBase])

  const runBackend = async (backend: BackendName) => {
    if (!imgRef.current) return
    setResults((prev) => ({ ...prev, [backend]: { status: 'running' } }))

    let model: tf.GraphModel | null = null
    let inputTensor: tf.Tensor4D | null = null
    try {
      await tf.setBackend(backend)
      await tf.ready()

      model = await tf.loadGraphModel(MODEL_URL)
      const inputShape = model.inputs[0]?.shape

      // canvas 已是 INPUT_SIZE x INPUT_SIZE 且完成 letterbox 補黑邊，直接讀取像素即可
      inputTensor = tf.tidy(() => {
        const pixels = tf.browser.fromPixels(canvasRef.current!)
        return pixels.toFloat().div(255).expandDims(0) as tf.Tensor4D
      })

      // warmup（不計時，讓 shader 編譯/wasm 初始化的成本不影響量測）
      // model.outputs[].shape 這個靜態中繼資料在此模型上是空的，改直接讀執行後張量的實際 shape
      const warm = model.execute(inputTensor) as tf.Tensor
      await warm.data()
      const info = `input: [${inputShape}]  output: [${warm.shape}]`
      setModelInfo(info)
      console.log(`[model-spike] (${backend}) ${info}`)
      warm.dispose()

      const perRunMs: number[] = []
      let lastOutput: tf.Tensor | null = null
      for (let i = 0; i < TIMED_RUNS; i++) {
        const t0 = performance.now()
        const out = model.execute(inputTensor) as tf.Tensor
        await out.data()
        const t1 = performance.now()
        perRunMs.push(t1 - t0)
        if (i === TIMED_RUNS - 1) {
          lastOutput = out
        } else {
          out.dispose()
        }
      }
      const avgMs = perRunMs.reduce((a, b) => a + b, 0) / perRunMs.length

      const decodeResult = await decodeYoloOutput(lastOutput!, INPUT_SIZE, INPUT_SIZE)
      lastOutput!.dispose()

      console.log(
        `[model-spike] (${backend}) avg ${avgMs.toFixed(1)}ms over ${TIMED_RUNS} runs, ` +
          `pre-NMS: ${decodeResult.preNmsCount}, post-NMS: ${decodeResult.detections.length}`,
      )
      // 純文字版本，方便直接複製貼上（console.table 在複製貼上時會收合成 "Array(N)"）
      decodeResult.detections.forEach((d, i) => {
        console.log(
          `[model-spike] (${backend}) #${i} ${d.className} conf=${d.score.toFixed(3)} ` +
            `x=${d.x1.toFixed(3)} y=${d.y1.toFixed(3)} w=${(d.x2 - d.x1).toFixed(3)} h=${(d.y2 - d.y1).toFixed(3)}`,
        )
      })
      console.table(
        decodeResult.detections.map((d) => ({
          class: d.className,
          confidence: d.score.toFixed(3),
          x: d.x1.toFixed(3),
          y: d.y1.toFixed(3),
          width: (d.x2 - d.x1).toFixed(3),
          height: (d.y2 - d.y1).toFixed(3),
        })),
      )

      drawDetections(decodeResult.detections)

      setResults((prev) => ({
        ...prev,
        [backend]: {
          status: 'done',
          avgMs,
          perRunMs,
          preNmsCount: decodeResult.preNmsCount,
          detections: decodeResult.detections,
        },
      }))
    } catch (err) {
      console.error(`[model-spike] (${backend}) failed:`, err)
      setResults((prev) => ({
        ...prev,
        [backend]: { status: 'error', error: String(err) },
      }))
    } finally {
      inputTensor?.dispose()
      model?.dispose()
    }
  }

  return (
    <main style={{ padding: 16 }}>
      <h1>任務 1：模型格式轉換驗證（Spike）</h1>
      <p>模型來源：{MODEL_URL}（{modelInfo}）</p>

      <input type="file" accept="image/*" onChange={handleFileChange} />

      <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
        <canvas
          ref={canvasRef}
          width={INPUT_SIZE}
          height={INPUT_SIZE}
          style={{ border: '1px solid #ccc', maxWidth: '100%' }}
        />

        <div style={{ textAlign: 'left', minWidth: 280 }}>
          <div style={{ marginBottom: 12 }}>
            <button onClick={() => runBackend('webgl')} disabled={!imageLoaded}>
              使用 WebGL 推論
            </button>{' '}
            <button onClick={() => runBackend('wasm')} disabled={!imageLoaded}>
              使用 WASM 推論
            </button>
          </div>

          {(['webgl', 'wasm'] as BackendName[]).map((backend) => {
            const r = results[backend]
            return (
              <div key={backend} style={{ marginBottom: 12 }}>
                <strong>{backend}</strong>:{' '}
                {r.status === 'idle' && '尚未執行'}
                {r.status === 'running' && '執行中…'}
                {r.status === 'error' && `❌ ${r.error}`}
                {r.status === 'done' && (
                  <>
                    平均 {r.avgMs!.toFixed(1)}ms（{TIMED_RUNS} 次）， pre-NMS {r.preNmsCount}， post-NMS{' '}
                    {r.detections!.length}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
