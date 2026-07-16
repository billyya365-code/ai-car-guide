import { useState } from 'react'
import { CameraCapture } from '../components/CameraCapture'
import {
  CAR_POSITIONS,
  GUIDE_TEMPLATES,
  PLATE_SKEW_CORNERS,
  POSITION_LABELS,
  type CarPosition,
} from '../config/guideTemplates'

export function CaptureGuidePage() {
  const [position, setPosition] = useState<CarPosition>('front_left')
  // 目前尚無車輛資料輸入流程（車牌號碼會來自車輛查詢/掃描，尚未實作），
  // 先用手動輸入框讓任務 7 的車牌 OCR 核對可以被實際觸發、測試
  const [expectedPlateNumber, setExpectedPlateNumber] = useState('')
  const [capturedPhotos, setCapturedPhotos] = useState<Partial<Record<CarPosition, string>>>({})

  const allCaptured = CAR_POSITIONS.every((p) => capturedPhotos[p])

  // 任務 8 的自動快門觸發後呼叫這裡；拍完自動換到下一個「還沒拍過」的方位，
  // 全部拍過就停留在目前角度（使用者仍可用上方按鈕手動切換、重拍任一角度）。
  const handleCapture = (base64Image: string) => {
    setCapturedPhotos((prev) => {
      const updated = { ...prev, [position]: base64Image }
      const currentIndex = CAR_POSITIONS.indexOf(position)
      const next =
        CAR_POSITIONS.slice(currentIndex + 1).find((p) => !updated[p]) ??
        CAR_POSITIONS.find((p) => !updated[p])
      if (next) setPosition(next)
      return updated
    })
  }

  const handleRestart = () => {
    setPosition('front_left')
    setCapturedPhotos({})
  }

  return (
    <main>
      <h1>拍照引導</h1>

      <div style={{ marginBottom: 12 }}>
        <label>
          車牌號碼（測試用，之後由車輛資料流程帶入）：{' '}
          <input
            type="text"
            value={expectedPlateNumber}
            onChange={(e) => setExpectedPlateNumber(e.target.value)}
            placeholder="例如 RFX-2325"
          />
        </label>
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {CAR_POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPosition(p)}
            disabled={p === position}
            style={{ fontWeight: p === position ? 'bold' : 'normal' }}
          >
            {POSITION_LABELS[p]}
            {capturedPhotos[p] ? ' ✓' : ''}
          </button>
        ))}
      </div>

      <p>目前方位：{POSITION_LABELS[position]}</p>

      <CameraCapture
        guideBoxes={GUIDE_TEMPLATES[position]}
        plateSkewCorners={PLATE_SKEW_CORNERS[position]}
        expectedPlateNumber={expectedPlateNumber || undefined}
        onCapture={handleCapture}
      />

      {allCaptured && (
        <div style={{ marginTop: 16 }}>
          <p>四個方位皆已拍攝完成，仍可點上方按鈕重拍任一角度。</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {CAR_POSITIONS.map((p) => (
              <div key={p}>
                <p style={{ margin: 0, fontSize: 12 }}>{POSITION_LABELS[p]}</p>
                {capturedPhotos[p] && <img src={capturedPhotos[p]} alt={POSITION_LABELS[p]} style={{ width: 120 }} />}
              </div>
            ))}
          </div>
          <button type="button" onClick={handleRestart}>
            全部重新拍攝
          </button>
        </div>
      )}
    </main>
  )
}
