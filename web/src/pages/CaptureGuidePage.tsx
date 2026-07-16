import { useState } from 'react'
import { CameraCapture } from '../components/CameraCapture'
import { CAR_POSITIONS, GUIDE_TEMPLATES, POSITION_LABELS, type CarPosition } from '../config/guideTemplates'

export function CaptureGuidePage() {
  const [positionIndex, setPositionIndex] = useState(0)
  // 目前尚無車輛資料輸入流程（車牌號碼會來自車輛查詢/掃描，尚未實作），
  // 先用手動輸入框讓任務 7 的車牌 OCR 核對可以被實際觸發、測試
  const [expectedPlateNumber, setExpectedPlateNumber] = useState('')
  const [capturedPhotos, setCapturedPhotos] = useState<Partial<Record<CarPosition, string>>>({})
  // 拍完後先停在原地等使用者確認，不自動消失/自動換角度——避免使用者還沒看清楚
  // 拍攝結果，畫面就已經跳到下一個角度。
  const [captureMessage, setCaptureMessage] = useState<string | null>(null)

  const isDone = positionIndex >= CAR_POSITIONS.length
  const position: CarPosition | null = isDone ? null : CAR_POSITIONS[positionIndex]

  // 任務 8：自動快門觸發後呼叫這裡；先存下照片、跳出「拍攝完成」提示，但先不換角度，
  // 等使用者點確認按鈕才真的換到下一個方位（見 handleConfirmNext）。
  const handleCapture = (base64Image: string) => {
    if (!position) return
    setCapturedPhotos((prev) => ({ ...prev, [position]: base64Image }))
    const nextPosition = CAR_POSITIONS[positionIndex + 1]
    setCaptureMessage(
      nextPosition ? `拍攝完成！請確認後拍攝下一個角度：${POSITION_LABELS[nextPosition]}` : '拍攝完成！四個角度皆已拍攝完成',
    )
  }

  const handleConfirmNext = () => {
    setCaptureMessage(null)
    setPositionIndex((i) => i + 1)
  }

  const handleRestart = () => {
    setPositionIndex(0)
    setCapturedPhotos({})
    setCaptureMessage(null)
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
          <div style={{ position: 'relative' }}>
            <CameraCapture
              guideBoxes={GUIDE_TEMPLATES[position!]}
              expectedPlateNumber={expectedPlateNumber || undefined}
              // 等待使用者確認換下一個角度時暫停自動快門，避免同一個角度在確認畫面
              // 顯示期間因為條件重新滿足（例如手部些微晃動又恢復靜止）而重複觸發拍攝
              onCapture={captureMessage ? undefined : handleCapture}
            />
            {captureMessage && (
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  zIndex: 20,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 'bold',
                    background: 'rgba(22,163,74,0.9)',
                    padding: '6px 14px',
                    borderRadius: 4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {captureMessage}
                </p>
                <button type="button" onClick={handleConfirmNext}>
                  {CAR_POSITIONS[positionIndex + 1] ? '確認，拍攝下一個角度' : '確認完成'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}
