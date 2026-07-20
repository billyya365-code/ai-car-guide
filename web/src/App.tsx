import { Suspense, lazy, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { WelcomePage } from './pages/WelcomePage'
import { PreparingPage } from './pages/PreparingPage'
import { ResultPage } from './pages/ResultPage'
import { GuidanceStateMachineSpikePage } from './pages/GuidanceStateMachineSpikePage'
import { SplashScreen } from './components/SplashScreen'

// 任務 6 起，CameraCapture 透過 useVisionGuidance 靜態 import tfjs，
// 因此 CaptureGuidePage 也一併用 lazy 避免拖大首頁的主要 bundle
const CaptureGuidePage = lazy(() =>
  import('./pages/CaptureGuidePage').then((m) => ({ default: m.CaptureGuidePage })),
)
const ModelSpikePage = lazy(() =>
  import('./pages/ModelSpikePage').then((m) => ({ default: m.ModelSpikePage })),
)
// firebase SDK 只有這裡跟 CaptureGuidePage（透過 lib/firebaseUpload）會用到，lazy
// load 避免拖大首頁主要 bundle（跟 ModelSpikePage 拆開 tfjs 是同樣的考量）。
const FirebaseSpikePage = lazy(() =>
  import('./pages/FirebaseSpikePage').then((m) => ({ default: m.FirebaseSpikePage })),
)

// App 啟動時顯示一次品牌識別畫面，~1.5 秒後自動淡出（不是獨立路由，只是疊在最上層
// 的畫面）——底下的 <Routes> 從一開始就照常掛載渲染，WelcomePage 的模型背景預載
// 不會被 Splash 擋住而延後開始。
const SPLASH_DURATION_MS = 1500

function App() {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const id = setTimeout(() => setShowSplash(false), SPLASH_DURATION_MS)
    return () => clearTimeout(id)
  }, [])

  return (
    <>
      <AnimatePresence>{showSplash && <SplashScreen />}</AnimatePresence>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/preparing" element={<PreparingPage />} />
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
        <Route
          path="/dev/firebase-spike"
          element={
            <Suspense fallback={<p>載入中…</p>}>
              <FirebaseSpikePage />
            </Suspense>
          }
        />
      </Routes>
    </>
  )
}

export default App
