import { useState } from 'react'
import { CameraCapture, type CapturedPhoto } from '../components/CameraCapture'
import { CarAnglePhoto } from '../components/CarAnglePhoto'
import { CaptureProgressSteps } from '../components/CaptureProgressSteps'
import {
  CAR_POSITIONS,
  GUIDE_TEMPLATES,
  POSITION_LABELS,
  POSITION_LABELS_SHORT,
  type CarPosition,
} from '../config/guideTemplates'

const SHORT_LABELS = CAR_POSITIONS.map((p) => POSITION_LABELS_SHORT[p])

export function CaptureGuidePage() {
  const [positionIndex, setPositionIndex] = useState(0)
  // 目前尚無車輛資料輸入流程（車牌號碼會來自車輛查詢/掃描，尚未實作），
  // 先用手動輸入框讓任務 7 的車牌 OCR 核對可以被實際觸發、測試
  const [expectedPlateNumber, setExpectedPlateNumber] = useState('')
  const [capturedPhotos, setCapturedPhotos] = useState<Partial<Record<CarPosition, CapturedPhoto>>>({})

  const isDone = positionIndex >= CAR_POSITIONS.length
  const position: CarPosition | null = isDone ? null : CAR_POSITIONS[positionIndex]

  // CameraCapture 內部已經處理完「拍照 → 車牌核對通過 → 使用者按確認」整個流程，
  // 呼叫這裡時代表這個角度已經確定完成，直接存下照片（含時間戳記/引導框座標/
  // GPS 等中繼資料）、換下一個方位即可。
  const handleCapture = (capture: CapturedPhoto) => {
    if (!position) return
    setCapturedPhotos((prev) => ({ ...prev, [position]: capture }))
    setPositionIndex((i) => i + 1)
  }

  const handleRestart = () => {
    setPositionIndex(0)
    setCapturedPhotos({})
  }

  return (
    <main className="container page-enter" style={isDone ? { paddingBottom: 96 } : undefined}>
      <p className="eyebrow">拍照引導 · {isDone ? '已完成' : `${positionIndex + 1} / ${CAR_POSITIONS.length}`}</p>
      {isDone ? (
        <h1>四個角度都拍完了</h1>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <CarAnglePhoto position={position!} size={64} />
          <h1 style={{ margin: 0 }}>目前方位：{POSITION_LABELS[position!]}</h1>
        </div>
      )}

      <div className="field">
        <label htmlFor="plate-number">車牌號碼（測試用，之後由車輛資料流程帶入）</label>
        <input
          id="plate-number"
          type="text"
          value={expectedPlateNumber}
          onChange={(e) => setExpectedPlateNumber(e.target.value)}
          placeholder="例如 RFX-2325"
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <CaptureProgressSteps currentIndex={positionIndex} labels={SHORT_LABELS} />
      </div>

      {isDone ? (
        <>
          <div className="card">
            <p style={{ margin: '0 0 12px', color: 'var(--text)' }}>四個方位皆已拍攝完成。</p>
            <div className="photo-grid">
              {CAR_POSITIONS.map((p) => (
                <div key={p} className="photo-thumb">
                  {capturedPhotos[p] && <img src={capturedPhotos[p].image} alt={POSITION_LABELS[p]} />}
                  <p className="photo-label">{POSITION_LABELS[p]}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bottom-bar">
            <button type="button" className="btn btn-secondary" onClick={handleRestart}>
              重新拍攝
            </button>
          </div>
        </>
      ) : (
        <CameraCapture
          headerIcon={<CarAnglePhoto position={position!} size={40} />}
          progressSteps={
            <CaptureProgressSteps currentIndex={positionIndex} labels={SHORT_LABELS} dark showLabels={false} />
          }
          guideBoxes={GUIDE_TEMPLATES[position!]}
          expectedPlateNumber={expectedPlateNumber || undefined}
          onCapture={handleCapture}
        />
      )}
    </main>
  )
}
