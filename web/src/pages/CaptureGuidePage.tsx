import { useEffect, useState } from 'react'
import { CameraCapture, type CapturedPhoto } from '../components/CameraCapture'
import { CarAnglePhoto } from '../components/CarAnglePhoto'
import { CaptureProgressSteps } from '../components/CaptureProgressSteps'
import {
  CAR_POSITIONS,
  GUIDE_TEMPLATES,
  POSITION_LABELS,
  POSITION_LABELS_SHORT,
  type CarPosition,
} from '../config/guideTemplates'
import { ensureAnonymousAuth } from '../lib/firebase'
import { createRental, uploadCapturePhoto, createPhotoRecord, markPickupUploaded } from '../lib/firebaseUpload'

const SHORT_LABELS = CAR_POSITIONS.map((p) => POSITION_LABELS_SHORT[p])

export function CaptureGuidePage() {
  const [positionIndex, setPositionIndex] = useState(0)
  // 目前尚無車輛查詢/掃描流程，先用手動輸入框當「選車」的暫代方案——同一個值
  // 兼作任務 7 車牌 OCR 核對用的期望車牌，跟 Firebase 這邊要求的 vehicle_id。
  const [expectedPlateNumber, setExpectedPlateNumber] = useState('')
  const [capturedPhotos, setCapturedPhotos] = useState<Partial<Record<CarPosition, CapturedPhoto>>>({})
  // 第一張照片上傳前才建立訂單（這時 vehicle_id 才確定不會再變），之後同一趟
  // 拍攝的四張照片都沿用同一個 rentalId。
  const [rentalId, setRentalId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // 進到這頁就先嘗試匿名登入，拍到第一張照片時才不用等登入完成，減少上傳延遲；
  // 登入失敗先記錄下來，實際要上傳時 handleCapture 裡會再擋一次並顯示錯誤。
  useEffect(() => {
    ensureAnonymousAuth().catch((err) => {
      console.error('[CaptureGuidePage] 匿名登入失敗', err)
    })
  }, [])

  const isDone = positionIndex >= CAR_POSITIONS.length
  const position: CarPosition | null = isDone ? null : CAR_POSITIONS[positionIndex]

  // CameraCapture 內部已經處理完「拍照 → 車牌核對通過 → 使用者按確認」整個流程，
  // 呼叫這裡時代表這個角度已經確定完成，接著要把照片實際上傳到 Firebase（Storage
  // + Firestore photos 文件），全部成功才換下一個方位；任何一步失敗都不推進
  // positionIndex，讓使用者可以直接重拍這個角度重試。
  //
  // isUploading 擋重複觸發：CameraCapture 的確認對話框一按下就會立刻關閉、回到
  // 即時拍攝畫面（不會等這個函式做完），如果使用者剛好又站得夠穩，AutoShutter
  // 可能在上一張還在上傳時就自動觸發下一次拍照——這裡直接擋掉，畫面上也會蓋一層
  // 「上傳中」全螢幕遮罩，讓使用者清楚知道現在不能拍、不是卡住。
  const handleCapture = async (capture: CapturedPhoto) => {
    if (!position || isUploading) return

    const vehicleId = expectedPlateNumber.trim()
    if (!vehicleId) {
      setUploadError('請先輸入車牌號碼再開始拍攝')
      return
    }

    setIsUploading(true)
    setUploadError(null)
    try {
      await ensureAnonymousAuth()

      let currentRentalId = rentalId
      if (!currentRentalId) {
        const result = await createRental(vehicleId)
        currentRentalId = result.rentalId
        setRentalId(currentRentalId)
      }

      const { fileName, storagePath } = await uploadCapturePhoto({
        imageDataUrl: capture.image,
        vehicleId,
        rentalId: currentRentalId,
        photoType: position,
      })
      await createPhotoRecord({
        rentalId: currentRentalId,
        vehicleId,
        photoType: position,
        fileName,
        storagePath,
      })

      const nextIndex = positionIndex + 1
      if (nextIndex >= CAR_POSITIONS.length) {
        await markPickupUploaded(currentRentalId)
      }

      setCapturedPhotos((prev) => ({ ...prev, [position]: capture }))
      setPositionIndex(nextIndex)
    } catch (err) {
      console.error('[CaptureGuidePage] 照片上傳失敗', err)
      setUploadError('照片上傳失敗，請檢查網路後重新拍攝這個角度')
    } finally {
      setIsUploading(false)
    }
  }

  const handleRestart = () => {
    setPositionIndex(0)
    setCapturedPhotos({})
    setRentalId(null)
    setUploadError(null)
  }

  return (
    <main className="container page-enter" style={isDone ? { paddingBottom: 96 } : undefined}>
      <p className="eyebrow">拍照引導 · {isDone ? '已完成' : `${positionIndex + 1} / ${CAR_POSITIONS.length}`}</p>
      {isDone ? (
        <h1>四個角度都拍完了</h1>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <CarAnglePhoto position={position!} size={64} />
          <h1 style={{ margin: 0 }}>目前方位：{POSITION_LABELS[position!]}</h1>
        </div>
      )}

      <div className="field">
        <label htmlFor="plate-number">車牌號碼（測試用，之後由選車流程帶入）</label>
        <input
          id="plate-number"
          type="text"
          value={expectedPlateNumber}
          onChange={(e) => setExpectedPlateNumber(e.target.value)}
          placeholder="例如 RFX-2325"
          // 車牌一旦用來建立過訂單（rentalId 已確定），中途換車牌會讓同一筆訂單底下
          // 出現對不上的 vehicle_id，所以鎖住不能再改，要換車請「重新拍攝」。
          disabled={rentalId !== null}
        />
      </div>

      {uploadError && (
        <p className="field" style={{ color: '#c0392b', fontSize: 14 }}>
          {uploadError}
        </p>
      )}

      <div style={{ marginBottom: 20 }}>
        <CaptureProgressSteps currentIndex={positionIndex} labels={SHORT_LABELS} />
      </div>

      {isDone ? (
        <>
          <div className="card">
            <p style={{ margin: '0 0 12px', color: 'var(--text)' }}>四個方位皆已拍攝完成，已上傳。</p>
            <div className="photo-grid">
              {CAR_POSITIONS.map((p) => (
                <div key={p} className="photo-thumb">
                  {capturedPhotos[p] && <img src={capturedPhotos[p].image} alt={POSITION_LABELS[p]} />}
                  <p className="photo-label">{POSITION_LABELS[p]}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bottom-bar">
            <button type="button" className="btn btn-secondary" onClick={handleRestart}>
              重新拍攝
            </button>
          </div>
        </>
      ) : (
        <>
          <CameraCapture
            headerIcon={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CarAnglePhoto position={position!} size={56} />
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {POSITION_LABELS[position!]}
                </span>
              </div>
            }
            progressSteps={
              <CaptureProgressSteps currentIndex={positionIndex} labels={SHORT_LABELS} dark showLabels={false} />
            }
            guideBoxes={GUIDE_TEMPLATES[position!]}
            expectedPlateNumber={expectedPlateNumber || undefined}
            onCapture={handleCapture}
          />

          {/* 上傳中的全螢幕遮罩：蓋在 CameraCapture 之上（比它的 zIndex:30 高），
              擋住畫面互動與視覺，避免使用者在上一張還在上傳時又觸發下一次拍照
              （見上面 handleCapture 的說明）。CameraCapture 本身維持掛載不拆
              （鏡頭串流才不會中斷、下一步不用重新要求相機權限）。 */}
          {isUploading && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 40,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              照片上傳中…
            </div>
          )}
        </>
      )}
    </main>
  )
}
