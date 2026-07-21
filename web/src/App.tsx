import { Suspense, lazy, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { WelcomePage } from './pages/WelcomePage'
import { ResultPage } from './pages/ResultPage'
import { GuidanceStateMachineSpikePage } from './pages/GuidanceStateMachineSpikePage'
import { SplashScreen } from './components/SplashScreen'
import { usePreloadResources } from './lib/usePreloadResources'

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

// App 啟動時顯示品牌識別畫面，直到模型真正預載完成才淡出進首頁——首頁不再自己背景
// 預載（原本的做法），改成在這裡一次做完，使用者進首頁時模型已經就緒，按下「開始
// 拍攝」可以直接進相機，不需要再經過一個額外的 Preparing 轉場頁等待。額外設一個
// 最短顯示時間，避免模型剛好已經被瀏覽器快取、瞬間跳轉造成的閃爍感（兩個條件取
// 時間較長的那個，跟先前 PreparingPage 的設計是同一個考量）。
const MIN_SPLASH_MS = 900

function App() {
  const preload = usePreloadResources()
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const id = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS)
    return () => clearTimeout(id)
  }, [])

  const modelsReady = preload.status === 'done' || preload.status === 'error'

  useEffect(() => {
    if (modelsReady && minTimeElapsed) setShowSplash(false)
  }, [modelsReady, minTimeElapsed])

  return (
    <>
      <AnimatePresence>{showSplash && <SplashScreen progress={preload.progress} />}</AnimatePresence>
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
