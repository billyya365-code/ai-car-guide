import { Link } from 'react-router-dom'

export function SettingsPage() {
  return (
    <main className="container page-enter">
      <p className="eyebrow">設定</p>
      <h1>此功能尚未實作</h1>
      <p className="subtitle">帳號、通知等設定項目待後續需求確定後再實作。</p>
      <Link to="/" className="btn btn-secondary">
        回首頁
      </Link>
    </main>
  )
}
