import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { History, Settings } from 'lucide-react'
import { CoreLibsCheck } from '../diagnostics/CoreLibsCheck'
import { usePreloadResources } from '../lib/usePreloadResources'
import { CarAngleIcon } from '../components/CarAngleIcon'
import { CarHeroIllustration } from '../components/CarHeroIllustration'
import { CAR_POSITIONS, POSITION_LABELS } from '../config/guideTemplates'

export function WelcomePage() {
  const preload = usePreloadResources()
  const navigate = useNavigate()

  return (
    // .bottom-bar 特意放在 motion.div 外面（是 <main> 的另一個直屬子元素，不是被
    // 動畫包住的內容的一部分）：framer-motion 只要動畫的屬性包含位移/縮放，就會在
    // 元件上留著一個 transform 樣式（即使動畫結束、位移是 0），而只要祖先有非 none
    // 的 transform，就會變成內部所有 position: fixed 子元素的定位容器而非瀏覽器
    // 視窗——之前 CameraCapture 的滿版相機畫面就是因為這個原因整個跑版，這裡先避開。
    <main className="container" style={{ paddingBottom: 96 }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <p className="eyebrow">智能檢車 · 引導式車況檢測</p>
        <h1>四個角度，AI 陪你把車況拍清楚</h1>
        <p className="subtitle">
          對準引導框、保持穩定，系統會自動確認水平、位置、距離與清晰度，並在對的時機自動拍照——不用自己抓角度、不用猜快門時機。
        </p>

        <CarHeroIllustration />

        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          <Link to="/history" className="btn btn-secondary" style={{ flex: 1 }}>
            <History size={16} strokeWidth={2} />
            拍攝紀錄
          </Link>
          <Link to="/settings" className="btn btn-secondary" style={{ flex: 1 }}>
            <Settings size={16} strokeWidth={2} />
            設定
          </Link>
        </div>

        <p className="eyebrow" style={{ marginBottom: 10 }}>
          拍攝順序
        </p>
        <div className="angle-preview-grid">
          {CAR_POSITIONS.map((p) => (
            <div key={p} className="angle-preview-item">
              <CarAngleIcon position={p} size={28} color="var(--text-h)" />
              <span>{POSITION_LABELS[p]}</span>
            </div>
          ))}
        </div>

        {preload.status !== 'done' && (
          <div className="card" style={{ marginBottom: 24 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>
              {preload.status === 'error'
                ? '背景預載模型失敗（不影響使用，開始檢測時會自動重新下載）'
                : `背景預載模型中${preload.currentLabel ? `：${preload.currentLabel}` : ''}…`}
            </p>
            {preload.status === 'loading' && (
              <>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.round(preload.progress * 100)}%` }} />
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text)' }}>
                  {Math.round(preload.progress * 100)}%
                </p>
              </>
            )}
          </div>
        )}

        {import.meta.env.DEV && (
          <div className="card">
            <p className="eyebrow" style={{ marginBottom: 12 }}>
              開發工具（僅開發模式顯示）
            </p>
            <CoreLibsCheck />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              <Link to="/dev/model-spike">任務 1：模型驗證頁面</Link>
              <Link to="/dev/guidance-spike">任務 4：狀態機驗證頁面</Link>
            </div>
          </div>
        )}
      </motion.div>

      <div className="bottom-bar">
        <button type="button" className="btn btn-primary" onClick={() => navigate('/preparing')}>
          開始拍攝
        </button>
      </div>
    </main>
  )
}
