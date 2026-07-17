import { Link } from 'react-router-dom'

export function HistoryPage() {
  return (
    <main className="container page-enter">
      <p className="eyebrow">拍攝紀錄</p>
      <h1>此功能尚未實作</h1>
      <p className="subtitle">車輛檢測歷史紀錄需要後端 API 支援，規格確定後才會實作。</p>
      <Link to="/" className="btn btn-secondary">
        回首頁
      </Link>
    </main>
  )
}
