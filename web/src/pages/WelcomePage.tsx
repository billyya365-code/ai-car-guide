import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CoreLibsCheck } from '../diagnostics/CoreLibsCheck'
import { usePreloadResources } from '../lib/usePreloadResources'
import { CarAnglePhoto } from '../components/CarAnglePhoto'
import { CarHeroIllustration } from '../components/CarHeroIllustration'
import { CarProgressTrack } from '../components/CarProgressTrack'
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
        <p className="eyebrow">快速、輕鬆抓好角度</p>
        <h1>跟著 AI 指引完成拍攝</h1>
        <p className="subtitle">
          請依序拍攝車輛左前、右前、左後、右後四個角度，系統將即時偵測車輪與車牌位置，並於水平、對齊、距離、清晰度皆符合標準後自動拍攝，確保影像品質符合車損判讀規範。
        </p>

        <CarHeroIllustration />

        <p className="eyebrow" style={{ marginBottom: 10 }}>
          拍攝順序
        </p>
        <div className="angle-preview-grid">
          {CAR_POSITIONS.map((p) => (
            <div key={p} className="angle-preview-item">
              <CarAnglePhoto position={p} size={40} />
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
            {preload.status === 'loading' && <CarProgressTrack progress={preload.progress} />}
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
