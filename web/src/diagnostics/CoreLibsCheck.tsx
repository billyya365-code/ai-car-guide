import { useEffect, useState } from 'react'

type LibStatus = 'checking' | 'ok' | 'error'

interface LibState {
  status: LibStatus
  detail: string
}

const INITIAL: LibState = { status: 'checking', detail: '' }

// 任務 0 驗收用診斷元件：確認核心套件皆可成功 import 且無 console error。
// 僅於開發模式掛載（見 WelcomePage），正式環境不渲染。
// tesseract.js 已隨車牌 OCR 改用自訓練字元偵測模型移除，不再是本專案依賴，故不列入檢查。
export function CoreLibsCheck() {
  const [tfjs, setTfjs] = useState<LibState>(INITIAL)
  const [opencv, setOpencv] = useState<LibState>(INITIAL)

  useEffect(() => {
    let cancelled = false

    import('@tensorflow/tfjs')
      .then(async (tf) => {
        await tf.ready()
        if (cancelled) return
        setTfjs({ status: 'ok', detail: `backend: ${tf.getBackend()}` })
      })
      .catch((err) => {
        if (cancelled) return
        setTfjs({ status: 'error', detail: String(err) })
      })

    import('@techstark/opencv-js')
      .then(async (mod) => {
        const cvModule = mod.default as any
        const cv = cvModule instanceof Promise ? await cvModule : cvModule
        if (!cv.Mat) {
          await new Promise<void>((resolve) => {
            cv.onRuntimeInitialized = () => resolve()
          })
        }
        if (cancelled) return
        setOpencv({ status: 'ok', detail: `version: ${cv.CV_VERSION ?? 'loaded'}` })
      })
      .catch((err) => {
        if (cancelled) return
        setOpencv({ status: 'error', detail: String(err) })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const rows: Array<[string, LibState]> = [
    ['@tensorflow/tfjs', tfjs],
    ['@techstark/opencv-js', opencv],
  ]

  return (
    <section style={{ marginTop: 24, fontSize: 14, textAlign: 'left', display: 'inline-block' }}>
      <h2>核心套件載入診斷（僅開發模式顯示）</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {rows.map(([name, state]) => (
          <li key={name}>
            {name}: {state.status === 'checking' ? '檢查中…' : state.status === 'ok' ? '✅ ' + state.detail : '❌ ' + state.detail}
          </li>
        ))}
      </ul>
    </section>
  )
}
