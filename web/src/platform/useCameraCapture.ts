import { useCallback, useEffect, useRef, useState } from 'react'

// 瀏覽器專屬 API 統一包一層 hook，供 Phase 2 用 Capacitor 封裝時只需替換此檔內部實作
// （改接 @capacitor/camera），呼叫端元件不需修改（回傳值格式盡量保持一致）。

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
          aspectRatio: { ideal: 16 / 9 }, // 用 ideal 而非 exact，避免裝置不支援時 getUserMedia 直接拋 OverconstrainedError
        },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      const track = stream.getVideoTracks()[0]
      const settings = track.getSettings()
      const aspectRatio =
        settings.aspectRatio ?? (settings.width && settings.height ? settings.width / settings.height : 16 / 9)

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
