import type { AnalyzeBatchRequest, AnalyzeBatchResponse } from './types'

const ENGINE_TIMEOUT_MS = 240_000

export class EngineError extends Error {}

// 見 需求規劃/02_SDD_系統規格書.md 第 4.2 節：POST {endpoint_url}/analyze-batch，
// 一次送整批（4 張）。逾時/連不上/回應格式不對都算 E003_ENGINE_TIMEOUT 類的失敗，
// 統一包成 EngineError 讓呼叫端走失敗流程（見 index.ts）。
export async function analyzeBatch(endpointUrl: string, request: AnalyzeBatchRequest): Promise<AnalyzeBatchResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ENGINE_TIMEOUT_MS)

  try {
    const res = await fetch(`${endpointUrl.replace(/\/+$/, '')}/analyze-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new EngineError(`引擎回應非 2xx：${res.status} ${res.statusText}`)
    }

    const body = (await res.json()) as unknown
    if (!Array.isArray(body)) {
      throw new EngineError('引擎回應格式錯誤：預期是陣列')
    }
    return body as AnalyzeBatchResponse
  } catch (err) {
    if (err instanceof EngineError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new EngineError('引擎呼叫逾時（E003_ENGINE_TIMEOUT）')
    }
    throw new EngineError(`引擎呼叫失敗：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timeout)
  }
}
