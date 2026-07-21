import { motion } from 'framer-motion'
import { Car } from 'lucide-react'
import { CarProgressTrack } from './CarProgressTrack'

export interface SplashScreenProps {
  // 模型預載進度（0~1），App.tsx 直到預載完成才會讓這個畫面淡出，顯示進度條
  // 避免載入時間較長時看起來像卡住。
  progress: number
}

// App 啟動時顯示的品牌識別畫面，實際顯示時間、退場時機由 App.tsx 控制（綁定模型
// 預載完成 + 最短顯示時間）。這裡只負責畫面本身跟進場動畫。淡出動畫交給 App.tsx
// 用 framer-motion 的 AnimatePresence 處理（這個元件從 DOM 移除時會自動套用 exit
// 動畫，不用自己管計時器）。
export function SplashScreen({ progress }: SplashScreenProps) {
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
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-h)' }}
      >
        智能檢車
      </motion.p>
      <div style={{ width: 160 }}>
        <CarProgressTrack progress={progress} />
      </div>
    </motion.div>
  )
}
