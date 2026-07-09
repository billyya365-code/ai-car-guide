import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { WelcomePage } from './pages/WelcomePage'
import { CaptureGuidePage } from './pages/CaptureGuidePage'
import { ResultPage } from './pages/ResultPage'
import { GuidanceStateMachineSpikePage } from './pages/GuidanceStateMachineSpikePage'

// 內含 tfjs 的診斷頁面，用 lazy 避免拖大正式頁面的主要 bundle
const ModelSpikePage = lazy(() =>
  import('./pages/ModelSpikePage').then((m) => ({ default: m.ModelSpikePage })),
)

function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/capture" element={<CaptureGuidePage />} />
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
