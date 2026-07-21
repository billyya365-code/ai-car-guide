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
// 進度圈跑滿後，先讓整個按鈕「亮起」一小段時間再真正觸發拍照——單純把
// doCapture() 接在進度到 100% 的同一個 tick 會導致這個元件幾乎立刻被父層
// isPaused 邏輯卸載（拍照後畫面轉成上傳/確認狀態），使用者根本來不及看到
// 亮起的瞬間；延後這一小段時間讓亮起效果先播完，才是使用者實際會感受到的
// 「啊，拍到了」回饋。
const FLASH_DURATION_MS = 180

// 拍照當下實際是哪種方式觸發的：'auto' = 靜止 1 秒後自動觸發；'manual' = 使用者
// 自己點了快門鍵（可能是裝置不支援靜止偵測、或 18 秒逃生手動點擊）——供上傳時
// 一併記錄，讓數據儀表板能統計自動快門的實際成功率。
export type CaptureMode = 'auto' | 'manual'

export interface AutoShutterProps {
  // 對應狀態機 activeGuidance === 'ALL_PASSED'（優先權 1~6 全數通過）
  active: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  sensorPermission: SensorPermissionState | null
  onCapture: (base64Image: string, mode: CaptureMode) => void
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
// 跟「18 秒逃生」兩種手動拍攝情境共用。18 秒逃生（dimmed=false）維持原本一直是
// 明顯的實心白；不支援自動偵測時則常駐顯示、依 dimmed 呼應「淺灰半透明→亮起」
// 的同一套視覺語彙，讓使用者不會因為裝置剛好不支援動作感測器就完全看不到任何
// 可以按的東西（例如 iOS 動作感測器授權請求失敗時）。
function ShutterButton({ onClick, dimmed = false }: { onClick: () => void; dimmed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="手動拍攝"
      style={{
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: '50%',
        border: dimmed ? '3px solid rgba(255,255,255,0.4)' : '3px solid rgba(255,255,255,0.9)',
        background: dimmed ? 'rgba(255,255,255,0.25)' : '#fff',
        padding: 0,
        cursor: 'pointer',
        transition: 'background 0.25s ease, border-color 0.25s ease',
      }}
    />
  )
}

export function AutoShutter({ active, videoRef, sensorPermission, onCapture }: AutoShutterProps) {
  const { isStill, supported } = useStillnessDetector(sensorPermission)
  const { vibrate } = useHapticFeedback()
  const [progress, setProgress] = useState(0)
  const [isFlashing, setIsFlashing] = useState(false)
  const [showEscapeHatch, setShowEscapeHatch] = useState(false)
  const stillSinceRef = useRef<number | null>(null)
  const activeSinceRef = useRef<number | null>(null)
  const capturedRef = useRef(false)
  // 進度到 100% 後、真正呼叫 doCapture 前有一段延遲（見上方 FLASH_DURATION_MS），
  // 用這個 ref 確保這段延遲只被排程一次，不會每個 tick 都再排一次 setTimeout。
  const flashTriggeredRef = useRef(false)

  // isStill 用 ref 讀取（而非放進下面 interval effect 的依賴陣列），避免手部自然的
  // 晃動/靜止反覆切換時一直重建 effect、連帶讓 activeSinceRef 逾時計時被誤重置，
  // 導致 18 秒逃生機制永遠無法觸發
  const isStillRef = useRef(isStill)
  useEffect(() => {
    isStillRef.current = isStill
  }, [isStill])

  const doCapture = (mode: CaptureMode) => {
    const video = videoRef.current
    if (!video || capturedRef.current) return
    capturedRef.current = true
    vibrate(100)
    playShutterSound()
    onCapture(captureFrame(video), mode)
  }

  // active 每次由 false 轉為 true 都代表使用者重新對準（例如換到下一個拍攝方位），
  // 靜止計時與逾時計時都要從頭開始，capturedRef 也要解鎖才能再次觸發拍攝
  useEffect(() => {
    if (!active || !supported) {
      setProgress(0)
      setIsFlashing(false)
      setShowEscapeHatch(false)
      stillSinceRef.current = null
      activeSinceRef.current = null
      capturedRef.current = false
      flashTriggeredRef.current = false
      return
    }

    capturedRef.current = false
    flashTriggeredRef.current = false
    stillSinceRef.current = null
    activeSinceRef.current = performance.now()
    setProgress(0)
    setIsFlashing(false)
    setShowEscapeHatch(false)

    const id = setInterval(() => {
      const now = performance.now()

      if (isStillRef.current) {
        if (stillSinceRef.current === null) stillSinceRef.current = now
        const elapsed = now - stillSinceRef.current
        const p = Math.min(1, elapsed / STILL_DURATION_MS)
        setProgress(p)
        if (p >= 1 && !flashTriggeredRef.current) {
          flashTriggeredRef.current = true
          setIsFlashing(true)
          setTimeout(() => doCapture('auto'), FLASH_DURATION_MS)
        }
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

  // 感測器權限被拒絕/裝置不支援時，完全沒有事件可判斷靜止，退回手動快門——常駐顯示
  // （不再等 active 才出現，跟下面自動快門圈的「一直存在、只是亮度不同」原則一致），
  // 拍攝條件還沒全部通過時只是看起來偏淡，使用者仍可以直接手動按下去（本來就沒有
  // 自動判斷可用，不應該讓使用者連手動選項都看不到、卡在畫面上不知道能不能拍）。
  if (!supported) {
    return <ShutterButton onClick={() => doCapture('manual')} dimmed={!active} />
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
      {/* 比照相機快門鍵外觀：外圈跑進度（保持不動、快門即將自動觸發的倒數），中間
          疊一個圓形按鈕標示「自動拍攝」。這個按鈕全程常駐（不再等條件全部通過才
          出現），預設是淺灰半透明、看起來像未啟用的狀態；一旦拍攝條件全部通過
          （active），才轉為明亮的實心白，讓使用者清楚看到「現在準備要拍了」這個
          狀態轉換，而不是它突然憑空冒出來。進度跑滿的瞬間（isFlashing）整個按鈕
          再亮一階，作為「已經拍到了」的視覺回饋——這個中間圓本身不可點擊，全程都是
          自動觸發，維持「使用者無法提早手動搶拍」的設計。 */}
      <div style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE }}>
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
        <div
          style={{
            position: 'absolute',
            top: (RING_SIZE - BUTTON_SIZE) / 2,
            left: (RING_SIZE - BUTTON_SIZE) / 2,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            borderRadius: '50%',
            background: isFlashing
              ? '#fff'
              : active
                ? 'rgba(255,255,255,0.9)'
                : 'rgba(255,255,255,0.25)',
            boxShadow: isFlashing ? '0 0 20px 6px rgba(255,255,255,0.95)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.25s ease, box-shadow 0.15s ease',
          }}
        >
          <span
            style={{
              fontSize: 26,
              lineHeight: 1,
              color: isFlashing || active ? '#1c1c1e' : 'rgba(255,255,255,0.7)',
              transition: 'color 0.25s ease',
            }}
            aria-hidden="true"
          >
            ◉
          </span>
        </div>
      </div>

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
          <ShutterButton onClick={() => doCapture('manual')} />
        </div>
      )}
    </div>
  )
}
