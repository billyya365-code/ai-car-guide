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
          // 不指定 aspectRatio：實測發現要求 9:16 這種較極端的直式比例，
          // 部分手機會用「裁切感光元件原生視野」來滿足這個比例，導致畫面看起來像被放大
          // （視野變窄），而不是單純選錯鏡頭。改成不主動要求比例，讓相機回傳原生預設framing，
          // 畫面比例交由 getSettings() 讀實際值、容器 CSS 動態對應（本來就是這樣設計的）
          //
          // width/height 用 ideal（非 exact）：完全不指定時，部分瀏覽器會回退到很保守的
          // 預設解析度（實測畫質明顯低於原生相機 App），導致畫面模糊。ideal 只是「盡量」，
          // 相機仍會依實際感光元件與目前 facingMode/framing 選擇最接近的可用解析度。
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      const track = stream.getVideoTracks()[0]
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
