import { motion } from 'framer-motion'
import { Car } from 'lucide-react'

// App 啟動時顯示約 1.5 秒的品牌識別畫面（實際顯示時間、退場時機由 App.tsx 控制），
// 這裡只負責畫面本身跟進場動畫。淡出動畫交給 App.tsx 用 framer-motion 的
// AnimatePresence 處理（這個元件從 DOM 移除時會自動套用 exit 動畫，不用自己管計時器）。
export function SplashScreen() {
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
    </motion.div>
  )
}
