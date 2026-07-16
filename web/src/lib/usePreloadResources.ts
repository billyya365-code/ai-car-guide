import { useEffect, useState } from 'react'

// 任務 11：歡迎畫面背景預載模型檔案，讓使用者進到拍照頁時模型多半已經在瀏覽器快取裡，
// 不用等到真正要用的時候才臨時下載。這裡只負責「把檔案讀進瀏覽器快取」，之後
// useVisionGuidance/usePlateOCR 呼叫 tf.loadGraphModel() 時還是各自獨立抓一次，
// 但同一個 URL 在同個瀏覽器工作階段內幾乎都會命中快取，不會重複真正下載。
// 分批依序載入（先車輪/車牌模型，再車牌字元模型），不要同時發出全部請求塞爆頻寬。

export interface PreloadState {
  status: 'idle' | 'loading' | 'done' | 'error'
  progress: number // 0-1
  currentLabel: string | null
}

interface WeightsManifestEntry {
  paths: string[]
}

const BASE = import.meta.env.BASE_URL

const RESOURCE_GROUPS: { label: string; modelJsonUrl: string }[] = [
  { label: '車輪/車牌位置偵測模型', modelJsonUrl: `${BASE}model/model.json` },
  { label: '車牌字元辨識模型', modelJsonUrl: `${BASE}char_model/model.json` },
]

async function fetchWithProgress(url: string, onBytesRead: (delta: number) => void): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    await res.arrayBuffer().catch(() => {})
    return
  }
  const reader = res.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    onBytesRead(value.byteLength)
  }
}

async function resolveGroupFiles(modelJsonUrl: string): Promise<string[]> {
  const dir = modelJsonUrl.slice(0, modelJsonUrl.lastIndexOf('/') + 1)
  const manifest = await fetch(modelJsonUrl).then((r) => r.json())
  const weightPaths: string[] = (manifest.weightsManifest ?? []).flatMap(
    (m: WeightsManifestEntry) => m.paths,
  )
  return [modelJsonUrl, ...weightPaths.map((p) => `${dir}${p}`)]
}

async function getContentLength(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return Number(res.headers.get('content-length') ?? 0)
  } catch {
    return 0
  }
}

const INITIAL_STATE: PreloadState = { status: 'idle', progress: 0, currentLabel: null }

export function usePreloadResources(): PreloadState {
  const [state, setState] = useState<PreloadState>(INITIAL_STATE)

  useEffect(() => {
    let cancelled = false

    async function run() {
      setState({ status: 'loading', progress: 0, currentLabel: RESOURCE_GROUPS[0]?.label ?? null })

      const groups: { label: string; urls: string[]; totalBytes: number }[] = []
      for (const group of RESOURCE_GROUPS) {
        try {
          const urls = await resolveGroupFiles(group.modelJsonUrl)
          let totalBytes = 0
          for (const url of urls) totalBytes += await getContentLength(url)
          groups.push({ label: group.label, urls, totalBytes })
        } catch (err) {
          console.warn('[usePreloadResources] 讀取模型清單失敗，略過預載這個模型:', group.label, err)
        }
        if (cancelled) return
      }

      const grandTotal = groups.reduce((sum, g) => sum + g.totalBytes, 0) || 1
      let loadedSoFar = 0

      for (const group of groups) {
        if (cancelled) return
        setState({ status: 'loading', progress: loadedSoFar / grandTotal, currentLabel: group.label })
        for (const url of group.urls) {
          if (cancelled) return
          await fetchWithProgress(url, (delta) => {
            loadedSoFar += delta
            setState({
              status: 'loading',
              progress: Math.min(1, loadedSoFar / grandTotal),
              currentLabel: group.label,
            })
          })
        }
      }

      if (!cancelled) setState({ status: 'done', progress: 1, currentLabel: null })
    }

    run().catch((err) => {
      // 預載純粹是效能優化，失敗也不影響功能本身（真正要用模型時 useVisionGuidance/
      // usePlateOCR 還是會自己重新抓一次），只記錄不阻擋使用者繼續操作。
      console.warn('[usePreloadResources] 預載失敗（不影響功能，實際使用時會重新下載）:', err)
      if (!cancelled) setState({ status: 'error', progress: 0, currentLabel: null })
    })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
