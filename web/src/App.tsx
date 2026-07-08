import { Route, Routes } from 'react-router-dom'
import { WelcomePage } from './pages/WelcomePage'
import { CaptureGuidePage } from './pages/CaptureGuidePage'
import { ResultPage } from './pages/ResultPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/capture" element={<CaptureGuidePage />} />
      <Route path="/result" element={<ResultPage />} />
    </Routes>
  )
}

export default App
