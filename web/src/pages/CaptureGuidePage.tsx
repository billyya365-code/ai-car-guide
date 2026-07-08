import { useState } from 'react'
import { CameraCapture } from '../components/CameraCapture'
import { CAR_POSITIONS, GUIDE_TEMPLATES, POSITION_LABELS, type CarPosition } from '../config/guideTemplates'

export function CaptureGuidePage() {
  const [position, setPosition] = useState<CarPosition>('front_left')

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

      <CameraCapture guideBoxes={GUIDE_TEMPLATES[position]} />
    </main>
  )
}
