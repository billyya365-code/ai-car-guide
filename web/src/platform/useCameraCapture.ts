import { useCallback, useEffect, useRef, useState } from 'react'

// 瀏覽器專屬 API 統一包一層 hook，供 Phase 2 用 Capacitor 封裝時只需替換此檔內部實作
// （改接 @capacitor/camera），呼叫端元件不需修改（回傳值格式盡量保持一致）。

// zoom 是非標準擴充能力（Media Capture and Streams Extensions 草案），
// 標準 lib.dom.d.ts 未宣告，部分多鏡頭手機（尤其 iPhone）透過此能力才能重設回 1x 廣角
interface ZoomCapability {
  zoom?: { min: number; max: number; step: number }
}

export type CameraStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'error'

export interface CameraCaptureState {
  stream: MediaStream | null
  // 務必用 track.getSettings() 讀到的實際值，不可寫死假設（不同裝置實際取得的比例會不同）
  aspectRatio: number | null
  width: number | null
  height: number | null
  status: CameraStatus
  error: string | null
}

export interface UseCameraCaptureResult extends CameraCaptureState {
  requestCamera: () => Promise<MediaStream>
}

const INITIAL_STATE: CameraCaptureState = {
  stream: null,
  aspectRatio: null,
  width: null,
  height: null,
  status: 'idle',
  error: null,
}

export function useCameraCapture(): UseCameraCaptureResult {
  const [state, setState] = useState<CameraCaptureState>(INITIAL_STATE)
  const streamRef = useRef<MediaStream | null>(null)

  const requestCamera = useCallback(async () => {
    setState((s) => ({ ...s, status: 'requesting', error: null }))
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          // 主要使用情境是手機直式拍照，理想框型為「高 > 寬」；用 ideal 而非 exact，
          // 避免裝置不支援時 getUserMedia 直接拋 OverconstrainedError
          aspectRatio: { ideal: 9 / 16 },
        },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      const track = stream.getVideoTracks()[0]

      // 部分多鏡頭手機（尤其 iPhone）預設綁定的鏡頭不是原生相機 App 的 1x 廣角，
      // 畫面會看起來像被「放大」。若瀏覽器回報支援 zoom capability，明確設回最小值（通常代表 1x）
      try {
        const capabilities = track.getCapabilities?.() as (MediaTrackCapabilities & ZoomCapability) | undefined
        if (capabilities?.zoom) {
          await track.applyConstraints({
            advanced: [{ zoom: capabilities.zoom.min } as unknown as MediaTrackConstraintSet],
          })
          console.log(`[useCameraCapture] 偵測到 zoom capability，已重設為 ${capabilities.zoom.min}`)
        }
      } catch (zoomErr) {
        console.warn('[useCameraCapture] 重設 zoom 失敗（裝置可能不支援）：', zoomErr)
      }

      const settings = track.getSettings()
      const aspectRatio =
        settings.aspectRatio ?? (settings.width && settings.height ? settings.width / settings.height : 9 / 16)

      streamRef.current = stream
      setState({
        stream,
        aspectRatio,
        width: settings.width ?? null,
        height: settings.height ?? null,
        status: 'granted',
        error: null,
      })
      return stream
    } catch (err) {
      setState((s) => ({ ...s, status: 'denied', error: String(err) }))
      throw err
    }
  }, [])

  // 卸載時釋放相機，避免鏡頭指示燈持續亮著
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return { ...state, requestCamera }
}
