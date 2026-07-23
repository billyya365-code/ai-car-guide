import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CoreLibsCheck } from '../diagnostics/CoreLibsCheck'
import { CarHeroIllustration } from '../components/CarHeroIllustration'
import { PlateNumberInput } from '../components/PlateNumberInput'
import { CAR_MODELS, type CarModel } from '../config/carModels'

// 首頁跟原本獨立的「輸入車牌」步驟合併成一頁：模型已經在 Splash 階段預載完成
// （見 App.tsx），這裡不再需要顯示背景預載進度卡片；只保留拍攝介紹跟車輛資訊
// 輸入（車款、車牌），拿掉原本的四角度流程圖預覽，畫面更精簡。車牌號碼／車款
// 透過路由 state 帶給 CaptureGuidePage（車牌同時兼作任務 7 車牌 OCR 核對用的
// 期望車牌，跟 Firebase 要求的 vehicle_id）。
export function WelcomePage() {
  const navigate = useNavigate()
  const [plateLetters, setPlateLetters] = useState('')
  const [plateDigits, setPlateDigits] = useState('')
  const [plateError, setPlateError] = useState<string | null>(null)
  const [carModel, setCarModel] = useState<CarModel>(CAR_MODELS[0])

  const handleStart = () => {
    if (plateLetters.length !== 3 || plateDigits.length !== 4) {
      setPlateError('請輸入完整車牌號碼（3 碼英文＋4 碼數字）')
      return
    }
    navigate('/capture', { state: { plateNumber: `${plateLetters}-${plateDigits}`, carModel } })
  }

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
        <h1>跟著 AI 指引完成拍攝</h1>
        <p className="subtitle">AI 協助抓好角度、距離與清晰度，完成後自動拍照</p>

        <CarHeroIllustration carModel={carModel} />

        <div className="field">
          <label htmlFor="car-model">車款</label>
          <select
            id="car-model"
            value={carModel}
            onChange={(e) => setCarModel(e.target.value as CarModel)}
          >
            {CAR_MODELS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>車牌號碼</label>
          <PlateNumberInput
            letters={plateLetters}
            digits={plateDigits}
            onLettersChange={(v) => {
              setPlateLetters(v)
              setPlateError(null)
            }}
            onDigitsChange={(v) => {
              setPlateDigits(v)
              setPlateError(null)
            }}
          />
          {plateError && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#c0392b' }}>{plateError}</p>
          )}
        </div>

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
        <button type="button" className="btn btn-primary" onClick={handleStart}>
          開始拍照
        </button>
      </div>
    </main>
  )
}
