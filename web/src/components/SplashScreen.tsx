import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Car } from 'lucide-react'
import { CarProgressTrack } from './CarProgressTrack'

export interface SplashScreenProps {
  // 模型預載進度（0~1），App.tsx 直到預載完成才會讓這個畫面淡出，顯示進度條
  // 避免載入時間較長時看起來像卡住。
  progress: number
}

// 真實進度在一開始有一段時間會停在 0%——usePreloadResources 要先跟伺服器要
// model.json 清單、再逐一 HEAD 每個權重檔取得檔案大小加總，這幾次網路來回都
// 還沒有任何實際下載量可以回報，這段時間畫面會顯示 0% 卡住不動，容易讓使用者
// 誤以為沒有在動作。1 秒後如果真實進度還是很低，先墊高到一個固定的假進度
// （5%，落在使用者要求的 1~10% 區間），純粹是視覺安慰劑；一旦真實進度追上、
// 超過這個假底線，就自然改用真實值，不會讓數字倒退。
const FAKE_PROGRESS_DELAY_MS = 1000
const FAKE_PROGRESS_FLOOR = 0.05

// App 啟動時顯示的品牌識別畫面，實際顯示時間、退場時機由 App.tsx 控制（綁定模型
// 預載完成 + 最短顯示時間）。這裡只負責畫面本身跟進場動畫。淡出動畫交給 App.tsx
// 用 framer-motion 的 AnimatePresence 處理（這個元件從 DOM 移除時會自動套用 exit
// 動畫，不用自己管計時器）。
export function SplashScreen({ progress }: SplashScreenProps) {
  const [progressFloor, setProgressFloor] = useState(0)

  useEffect(() => {
    const id = setTimeout(() => setProgressFloor(FAKE_PROGRESS_FLOOR), FAKE_PROGRESS_DELAY_MS)
    return () => clearTimeout(id)
  }, [])

  const displayProgress = Math.max(progress, progressFloor)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: 'var(--bg)',
      }}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        style={{
          width: 84,
          height: 84,
          borderRadius: 24,
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow)',
        }}
      >
        <Car size={44} color="#fff" strokeWidth={1.75} />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        style={{ textAlign: 'center' }}
      >
        <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-h)' }}>智能檢車</p>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text)' }}>畫面載入中...</p>
      </motion.div>
      <div style={{ width: 160 }}>
        <CarProgressTrack progress={displayProgress} />
      </div>
    </motion.div>
  )
}
