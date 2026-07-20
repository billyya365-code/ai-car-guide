import { useEffect, useRef, useState, type RefObject } from 'react'
import { useStillnessDetector } from '../platform/useStillnessDetector'
import { useHapticFeedback } from '../platform/useHapticFeedback'
import type { SensorPermissionState } from '../platform/useSensorPermission'
import { drawVideoToSquareCanvas } from '../lib/squareLetterbox'

const STILL_DURATION_MS = 1000
const TIMEOUT_MS = 18000
const TICK_MS = 50
const RING_SIZE = 72
const RING_RADIUS = 32
const RING_STROKE_WIDTH = 5
const BUTTON_SIZE = 56

export interface AutoShutterProps {
  // 對應狀態機 activeGuidance === 'ALL_PASSED'（優先權 1~6 全數通過）
  active: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  sensorPermission: SensorPermissionState | null
  onCapture: (base64Image: string) => void
}

// 輸出固定正方形，但用縮放＋補邊而不是裁切——原始影格不是正方形時，裁切會固定
// 丟失較長那一邊的內容（例如車輪/車牌剛好在被裁掉的邊緣），使用者要求不能有這個
// 問題；等比例縮放（contain-fit）維持寬高同一倍率，也不會有拉伸變形。
function captureFrame(video: HTMLVideoElement): string {
  return drawVideoToSquareCanvas(video).toDataURL('image/jpeg', 0.92)
}

// 用 Web Audio API 產生簡短提示音，不需額外的音效素材檔案；部分瀏覽器/靜音模式會擋
// AudioContext，快門音效非關鍵功能，失敗時靜默略過即可，不影響實際拍攝流程
function playShutterSound() {
  try {
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioContextCtor()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
  } catch {
    // 略過
  }
}

// 圓形快門鍵（白色圓環＋實心圓），外觀比照一般相機 App，供下方「不支援自動偵測」
// 跟「18 秒逃生」兩種手動拍攝情境共用。
function ShutterButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="手動拍攝"
      style={{
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: '50%',
        border: '3px solid rgba(255,255,255,0.9)',
        background: '#fff',
        padding: 0,
        cursor: 'pointer',
      }}
    />
  )
}

export function AutoShutter({ active, videoRef, sensorPermission, onCapture }: AutoShutterProps) {
  const { isStill, supported } = useStillnessDetector(sensorPermission)
  const { vibrate } = useHapticFeedback()
  const [progress, setProgress] = useState(0)
  const [showEscapeHatch, setShowEscapeHatch] = useState(false)
  const stillSinceRef = useRef<number | null>(null)
  const activeSinceRef = useRef<number | null>(null)
  const capturedRef = useRef(false)

  // isStill 用 ref 讀取（而非放進下面 interval effect 的依賴陣列），避免手部自然的
  // 晃動/靜止反覆切換時一直重建 effect、連帶讓 activeSinceRef 逾時計時被誤重置，
  // 導致 18 秒逃生機制永遠無法觸發
  const isStillRef = useRef(isStill)
  useEffect(() => {
    isStillRef.current = isStill
  }, [isStill])

  const doCapture = () => {
    const video = videoRef.current
    if (!video || capturedRef.current) return
    capturedRef.current = true
    vibrate(100)
    playShutterSound()
    onCapture(captureFrame(video))
  }

  // active 每次由 false 轉為 true 都代表使用者重新對準（例如換到下一個拍攝方位），
  // 靜止計時與逾時計時都要從頭開始，capturedRef 也要解鎖才能再次觸發拍攝
  useEffect(() => {
    if (!active || !supported) {
      setProgress(0)
      setShowEscapeHatch(false)
      stillSinceRef.current = null
      activeSinceRef.current = null
      capturedRef.current = false
      return
    }

    capturedRef.current = false
    stillSinceRef.current = null
    activeSinceRef.current = performance.now()
    setProgress(0)
    setShowEscapeHatch(false)

    const id = setInterval(() => {
      const now = performance.now()

      if (isStillRef.current) {
        if (stillSinceRef.current === null) stillSinceRef.current = now
        const elapsed = now - stillSinceRef.current
        const p = Math.min(1, elapsed / STILL_DURATION_MS)
        setProgress(p)
        if (p >= 1) doCapture()
      } else {
        stillSinceRef.current = null
        setProgress(0)
      }

      if (!capturedRef.current && activeSinceRef.current !== null && now - activeSinceRef.current >= TIMEOUT_MS) {
        setShowEscapeHatch(true)
      }
    }, TICK_MS)

    return () => clearInterval(id)
    // doCapture 每次 render 都是新的函式參考，只依賴 active/supported 重新啟動計時器即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, supported])

  // 條件還沒全部通過時完全不顯示任何東西（不像 UI 侵入感調整前那個版本一直顯示但變暗）
  // ——避免使用者誤以為隨時可以手動拍照，拍到一張構圖還不合格的照片。
  if (!active) return null

  // 感測器權限被拒絕/裝置不支援時，完全沒有事件可判斷靜止，直接退回手動快門，
  // 不顯示進度圈或逃生訊息（本身就已經是手動模式，逃生訊息沒有意義）
  if (!supported) {
    return <ShutterButton onClick={doCapture} />
  }

  const circumference = 2 * Math.PI * RING_RADIUS

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {/* 進度圈填滿即觸發拍攝，代表「保持不動、快門即將自動觸發」的倒數 */}
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={RING_STROKE_WIDTH}
          fill="none"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="#7c97ad"
          strokeWidth={RING_STROKE_WIDTH}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          style={{ transition: 'stroke-dashoffset 0.05s linear' }}
        />
      </svg>

      {showEscapeHatch && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <p
            style={{
              margin: 0,
              color: '#f87171',
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              padding: '5px 14px',
              borderRadius: 8,
              whiteSpace: 'nowrap',
            }}
          >
            偵測到手部持續晃動，是否改為手動拍攝？
          </p>
          <ShutterButton onClick={doCapture} />
        </div>
      )}
    </div>
  )
}
