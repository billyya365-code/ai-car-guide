import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { WelcomePage } from './pages/WelcomePage'
import { ResultPage } from './pages/ResultPage'
import { GuidanceStateMachineSpikePage } from './pages/GuidanceStateMachineSpikePage'

// 任務 6 起，CameraCapture 透過 useVisionGuidance 靜態 import tfjs，
// 因此 CaptureGuidePage 也一併用 lazy 避免拖大首頁的主要 bundle
const CaptureGuidePage = lazy(() =>
  import('./pages/CaptureGuidePage').then((m) => ({ default: m.CaptureGuidePage })),
)
const ModelSpikePage = lazy(() =>
  import('./pages/ModelSpikePage').then((m) => ({ default: m.ModelSpikePage })),
)

function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route
        path="/capture"
        element={
          <Suspense fallback={<p>載入中…</p>}>
            <CaptureGuidePage />
          </Suspense>
        }
      />
      <Route path="/result" element={<ResultPage />} />
      <Route path="/dev/guidance-spike" element={<GuidanceStateMachineSpikePage />} />
      <Route
        path="/dev/model-spike"
        element={
          <Suspense fallback={<p>載入中…</p>}>
            <ModelSpikePage />
          </Suspense>
        }
      />
    </Routes>
  )
}

export default App
