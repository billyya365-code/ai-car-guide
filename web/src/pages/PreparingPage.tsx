import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { usePreloadResources } from '../lib/usePreloadResources'
import { CarProgressTrack } from '../components/CarProgressTrack'

// 「開始拍攝」按下後、真正進入相機畫面前的短暫轉場——不是純假動畫，完成時機
// 綁定 usePreloadResources 的真實模型載入狀態，同時設一個最短顯示時間，避免
// 模型早就快取過、瞬間跳轉造成的閃爍感（兩個條件取時間較長的那個）。
const MIN_DISPLAY_MS = 900

export function PreparingPage() {
  const navigate = useNavigate()
  const preload = usePreloadResources()
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS)
    return () => clearTimeout(id)
  }, [])

  const modelsReady = preload.status === 'done' || preload.status === 'error'

  useEffect(() => {
    if (modelsReady && minTimeElapsed) {
      navigate('/capture', { replace: true })
    }
  }, [modelsReady, minTimeElapsed, navigate])

  return (
    <main
      className="container page-enter"
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        textAlign: 'center',
      }}
    >
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: 'var(--accent-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Sparkles size={34} color="var(--accent)" strokeWidth={1.75} />
      </motion.div>
      <div>
        <h2 style={{ marginBottom: 4 }}>載入中...</h2>
        <p className="subtitle" style={{ marginBottom: 0 }}>
          請勿關閉畫面
        </p>
      </div>
      <div style={{ width: '100%', maxWidth: 220 }}>
        <CarProgressTrack progress={preload.progress} />
      </div>
    </main>
  )
}
