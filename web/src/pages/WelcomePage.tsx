import { Link } from 'react-router-dom'
import { CoreLibsCheck } from '../diagnostics/CoreLibsCheck'

export function WelcomePage() {
  return (
    <main>
      <h1>智能檢車</h1>
      <p>引導式車損檢測拍照</p>
      <Link to="/capture">開始檢測車況</Link>
      {import.meta.env.DEV && (
        <>
          <CoreLibsCheck />
          <p>
            <Link to="/dev/model-spike">任務 1：模型驗證頁面</Link>
          </p>
          <p>
            <Link to="/dev/guidance-spike">任務 4：狀態機驗證頁面</Link>
          </p>
        </>
      )}
    </main>
  )
}
