import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// 用 HashRouter 而非 BrowserRouter：GitHub Pages 是純靜態託管，沒有伺服器端 rewrite，
// 直接連到 /capture 這類子路徑會 404；HashRouter 的路由都在 # 後面，靜態主機不需要額外設定
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
