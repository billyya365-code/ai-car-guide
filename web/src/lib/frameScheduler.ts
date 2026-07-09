import { useEffect, useRef } from 'react'

// 任務 6（視覺推論）與任務 7（模糊偵測）都要跑在每一影格上但需節流，若各自開一個
// requestAnimationFrame/setInterval 迴圈，等於兩組計時器互相搶主執行緒。這裡改成
// 全域只維護「一條」rAF 迴圈，各消費者用 subscribe() 掛上自己的節流間隔（ms），
// 由這裡統一在每個影格判斷「輪到誰執行」，而不是各自各自節流。

type FrameCallback = (timestamp: number) => void

interface Subscription {
  callback: FrameCallback
  intervalMs: number
  lastRun: number
}

class FrameScheduler {
  private subscriptions = new Map<symbol, Subscription>()
  private rafId: number | null = null

  subscribe(callback: FrameCallback, intervalMs: number): () => void {
    const id = Symbol()
    this.subscriptions.set(id, { callback, intervalMs, lastRun: 0 })
    this.ensureLoop()
    return () => {
      this.subscriptions.delete(id)
      if (this.subscriptions.size === 0) this.stopLoop()
    }
  }

  private ensureLoop() {
    if (this.rafId !== null || typeof requestAnimationFrame === 'undefined') return
    const tick = (timestamp: number) => {
      for (const sub of this.subscriptions.values()) {
        if (timestamp - sub.lastRun >= sub.intervalMs) {
          sub.lastRun = timestamp
          sub.callback(timestamp)
        }
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}

export const frameScheduler = new FrameScheduler()

// enabled 為 false 時暫停訂閱（例如模型尚未載入完成、或該功能被停用），
// 避免呼叫端還要另外用 if 包住 callback 內容。
export function useFrameThrottle(callback: FrameCallback, intervalMs: number, enabled: boolean) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return
    return frameScheduler.subscribe((timestamp) => callbackRef.current(timestamp), intervalMs)
  }, [intervalMs, enabled])
}
