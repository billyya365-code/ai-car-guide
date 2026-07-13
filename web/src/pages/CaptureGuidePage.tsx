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

  return (
    <main>
      <h1>拍照引導</h1>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        {CAR_POSITIONS.map((p) => (
          <button key={p} type="button" onClick={() => setPosition(p)} disabled={p === position}>
            {POSITION_LABELS[p]}
          </button>
        ))}
      </div>

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

      <CameraCapture
        guideBoxes={GUIDE_TEMPLATES[position]}
        plateSkewCorners={PLATE_SKEW_CORNERS[position]}
        expectedPlateNumber={expectedPlateNumber || undefined}
      />
    </main>
  )
}
