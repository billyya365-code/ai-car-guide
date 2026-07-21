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
      setState({
        status: 'loading',
        progress: 0,
        currentLabel: RESOURCE_GROUPS.map((g) => g.label).join(' / '),
      })

      // 兩個模型、以及同一個模型內的各個 shard 檔案都平行抓取（而非逐一等待），
      // 縮短的是來回延遲疊加的時間，不是總下載量本身——瀏覽器對同源仍有並發連線
      // 數上限，並非真的同時全速跑完全部請求，但仍比完全序列快上不少。
      const resolved = await Promise.all(
        RESOURCE_GROUPS.map(async (group) => {
          try {
            const urls = await resolveGroupFiles(group.modelJsonUrl)
            const sizes = await Promise.all(urls.map((url) => getContentLength(url)))
            return { label: group.label, urls, totalBytes: sizes.reduce((sum, n) => sum + n, 0) }
          } catch (err) {
            console.warn('[usePreloadResources] 讀取模型清單失敗，略過預載這個模型:', group.label, err)
            return null
          }
        }),
      )
      if (cancelled) return
      const groups = resolved.filter((g): g is { label: string; urls: string[]; totalBytes: number } => g !== null)

      const grandTotal = groups.reduce((sum, g) => sum + g.totalBytes, 0) || 1
      let loadedSoFar = 0

      await Promise.all(
        groups.flatMap((group) =>
          group.urls.map((url) =>
            fetchWithProgress(url, (delta) => {
              if (cancelled) return
              loadedSoFar += delta
              setState({ status: 'loading', progress: Math.min(1, loadedSoFar / grandTotal), currentLabel: null })
            }),
          ),
        ),
      )

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
