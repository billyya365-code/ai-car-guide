import { Link } from 'react-router-dom'
import { CoreLibsCheck } from '../diagnostics/CoreLibsCheck'
import { usePreloadResources } from '../lib/usePreloadResources'

export function WelcomePage() {
  const preload = usePreloadResources()

  return (
    <main className="container page-enter" style={{ paddingBottom: 96 }}>
      <p className="eyebrow">智能檢車 · 引導式車況檢測</p>
      <h1>四個角度，AI 陪你把車況拍清楚</h1>
      <p className="subtitle">
        對準引導框、保持穩定，系統會自動確認水平、位置、距離與清晰度，並在對的時機自動拍照——不用自己抓角度、不用猜快門時機。
      </p>

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

      <div className="bottom-bar">
        <Link to="/capture" className="btn btn-primary">
          開始檢測車況
        </Link>
      </div>
    </main>
  )
}
