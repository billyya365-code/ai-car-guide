import { useState } from 'react'
import { CameraCapture } from '../components/CameraCapture'
import { CAR_POSITIONS, GUIDE_TEMPLATES, POSITION_LABELS, type CarPosition } from '../config/guideTemplates'

export function CaptureGuidePage() {
  const [positionIndex, setPositionIndex] = useState(0)
  // 目前尚無車輛資料輸入流程（車牌號碼會來自車輛查詢/掃描，尚未實作），
  // 先用手動輸入框讓任務 7 的車牌 OCR 核對可以被實際觸發、測試
  const [expectedPlateNumber, setExpectedPlateNumber] = useState('')
  const [capturedPhotos, setCapturedPhotos] = useState<Partial<Record<CarPosition, string>>>({})

  const isDone = positionIndex >= CAR_POSITIONS.length
  const position: CarPosition | null = isDone ? null : CAR_POSITIONS[positionIndex]

  // 任務 8：自動快門觸發後呼叫這裡，拍完自動換下一個方位（不需使用者手動點擊切換）
  const handleCapture = (base64Image: string) => {
    if (!position) return
    setCapturedPhotos((prev) => ({ ...prev, [position]: base64Image }))
    setPositionIndex((i) => i + 1)
  }

  const handleRestart = () => {
    setPositionIndex(0)
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

      {isDone ? (
        <div>
          <p>四個方位皆已拍攝完成。</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {CAR_POSITIONS.map((p) => (
              <div key={p}>
                <p style={{ margin: 0, fontSize: 12 }}>{POSITION_LABELS[p]}</p>
                {capturedPhotos[p] && <img src={capturedPhotos[p]} alt={POSITION_LABELS[p]} style={{ width: 120 }} />}
              </div>
            ))}
          </div>
          <button type="button" onClick={handleRestart}>
            重新拍攝
          </button>
        </div>
      ) : (
        <>
          <p>
            目前方位：{POSITION_LABELS[position!]}（{positionIndex + 1}/{CAR_POSITIONS.length}）
          </p>
          <CameraCapture
            guideBoxes={GUIDE_TEMPLATES[position!]}
            expectedPlateNumber={expectedPlateNumber || undefined}
            onCapture={handleCapture}
          />
        </>
      )}
    </main>
  )
}
