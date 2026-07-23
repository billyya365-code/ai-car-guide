import { motion } from 'framer-motion'
import { UploadCloud } from 'lucide-react'

// 幾個小圓點從雲朵下方不斷往上飄、淡出，模擬「資料正在被送上雲端」的感覺——
// 純裝飾用途，跟實際上傳進度（CarProgressTrack 顯示的張數）沒有關聯，中途重複
// 拍照重試也不影響這個動畫本身，一直循環播放即可。
const DOTS = [
  { offsetX: -14, delay: 0 },
  { offsetX: 0, delay: 0.5 },
  { offsetX: 14, delay: 1 },
]

export function CloudUploadAnimation() {
  return (
    <div
      style={{
        position: 'relative',
        width: 96,
        height: 96,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <UploadCloud size={60} color="var(--accent)" strokeWidth={1.5} />
      {DOTS.map((dot, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            bottom: 30,
            left: `calc(50% + ${dot.offsetX}px - 3px)`,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--accent)',
          }}
          animate={{ y: [16, -30], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: dot.delay, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}
