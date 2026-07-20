import { motion } from 'framer-motion'
import { Car } from 'lucide-react'

export interface CarProgressTrackProps {
  // 0~1
  progress: number
}

// 共用的「車子沿路線跑」進度條，取代原本純色 .progress-track/.progress-fill
// 長條——首頁背景預載卡片、拍攝前的 AI 準備轉場頁都用同一份，維持視覺一致。
// 車子位置對應真實進度（用 framer-motion 補間平滑過渡，避免進度跳格時位置生硬
// 跳動），下方另外顯示百分比數字。
export function CarProgressTrack({ progress }: CarProgressTrackProps) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ width: '100%', position: 'relative', height: 28 }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 3,
            transform: 'translateY(-50%)',
            borderRadius: 999,
            background:
              'repeating-linear-gradient(to right, var(--border) 0, var(--border) 8px, transparent 8px, transparent 16px)',
          }}
        />
        <motion.div
          animate={{ left: `${Math.round(progress * 100)}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ position: 'absolute', top: '50%' }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow)',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <Car size={16} color="#fff" strokeWidth={2} />
          </div>
        </motion.div>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text)', textAlign: 'center' }}>
        {Math.round(progress * 100)}%
      </p>
    </div>
  )
}
