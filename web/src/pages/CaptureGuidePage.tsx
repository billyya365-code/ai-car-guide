import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
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
  // 車牌號碼、車款現在在首頁（WelcomePage）輸入/選擇，透過路由 state 帶過來——
  // 這裡不再提供輸入框，車牌同時兼作任務 7 車牌 OCR 核對用的期望車牌，跟
  // Firebase 要求的 vehicle_id。直接用網址列進到這頁（沒有經過首頁）時會沒有
  // 這兩個值，見下方 guard。
  const location = useLocation()
  const routeState = location.state as { plateNumber?: string; carModel?: string } | null
  const expectedPlateNumber = routeState?.plateNumber ?? ''
  const carModel = routeState?.carModel ?? ''

  const [capturedPhotos, setCapturedPhotos] = useState<Partial<Record<CarPosition, CapturedPhoto>>>({})
  // 使用者可以自由選擇、隨時切換要拍的角度，不再是固定依序——一進畫面就直接是
  // 即時相機畫面（預設對準第一個角度），畫面上方的四個角度圖示隨時可以點來切換，
  // 不需要另外跳出一個選擇畫面。已經拍過的角度不能再選（避免同一個 photo_type
  // 在 Firestore 裡出現重複文件），要整個重來請用下方「重新拍攝」。
  const [selectedPosition, setSelectedPosition] = useState<CarPosition>(CAR_POSITIONS[0])
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

  const doneFlags = CAR_POSITIONS.map((p) => Boolean(capturedPhotos[p]))
  const doneCount = doneFlags.filter(Boolean).length
  const isDone = doneCount >= CAR_POSITIONS.length

  // CameraCapture 內部已經處理完「拍照 → 車牌核對通過 → 使用者按確認」整個流程，
  // 呼叫這裡時代表這個角度已經確定完成，接著要把照片實際上傳到 Firebase（Storage
  // + Firestore photos 文件）；成功後自動切到下一個還沒拍的角度（省去使用者再
  // 點一次圖示的操作），使用者隨時仍可以點別的角度圖示改拍別的。失敗則留在
  // 目前這個角度讓使用者直接重試。
  //
  // isUploading 擋重複觸發：CameraCapture 的確認對話框一按下就會立刻關閉、回到
  // 即時拍攝畫面（不會等這個函式做完），如果使用者剛好又站得夠穩，AutoShutter
  // 可能在上一張還在上傳時就自動觸發下一次拍照——這裡直接擋掉，畫面上也會蓋一層
  // 「上傳中」全螢幕遮罩，讓使用者清楚知道現在不能拍、不是卡住。
  const handleCapture = async (capture: CapturedPhoto) => {
    if (isUploading) return
    const position = selectedPosition

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
        const result = await createRental(vehicleId, carModel)
        currentRentalId = result.rentalId
        setRentalId(currentRentalId)
      }

      const { fileName, storagePath, uploadedAt } = await uploadCapturePhoto({
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
        uploadedAt,
        gpsLat: capture.location?.latitude ?? null,
        gpsLng: capture.location?.longitude ?? null,
        capturedAt: new Date(capture.capturedAt),
        captureMode: capture.captureMode,
        sharpnessVariance: capture.sharpnessVariance,
        detectedBoxes: capture.detectedBoxes,
      })

      const updatedPhotos = { ...capturedPhotos, [position]: capture }
      if (CAR_POSITIONS.every((p) => updatedPhotos[p])) {
        await markPickupUploaded(currentRentalId)
      } else {
        const next = CAR_POSITIONS.find((p) => !updatedPhotos[p])
        if (next) setSelectedPosition(next)
      }

      setCapturedPhotos(updatedPhotos)
    } catch (err) {
      console.error('[CaptureGuidePage] 照片上傳失敗', err)
      setUploadError('照片上傳失敗，請檢查網路後重新拍攝這個角度')
    } finally {
      setIsUploading(false)
    }
  }

  const handleRestart = () => {
    setCapturedPhotos({})
    setSelectedPosition(CAR_POSITIONS[0])
    setRentalId(null)
    setUploadError(null)
  }

  // 沒有經過首頁輸入車牌/選車款就直接連進這個網址（例如書籤、重新整理後 state
  // 遺失）時，沒有 vehicle_id 可用——直接導回首頁重新輸入，而不是讓後面的上傳
  // 流程用空字串出錯，也不需要使用者自己按一次「回首頁」才能繼續。
  if (!expectedPlateNumber || !carModel) {
    return <Navigate to="/" replace />
  }

  if (isDone) {
    return (
      <main className="container page-enter" style={{ paddingBottom: 96 }}>
        <p className="eyebrow">拍照引導 · 已完成</p>
        <h1>四個角度都拍完了</h1>
        <div style={{ marginBottom: 20 }}>
          <CaptureProgressSteps labels={SHORT_LABELS} doneFlags={doneFlags} />
        </div>
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
      </main>
    )
  }

  return (
    <>
      <CameraCapture
        headerIcon={
          <div style={{ display: 'flex', gap: 6 }}>
            {CAR_POSITIONS.map((p) => {
              const done = Boolean(capturedPhotos[p])
              const active = p === selectedPosition
              return (
                <button
                  key={p}
                  type="button"
                  disabled={done}
                  onClick={() => setSelectedPosition(p)}
                  aria-label={POSITION_LABELS[p]}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    border: active ? '2px solid #fff' : '2px solid transparent',
                    background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
                    padding: 0,
                    cursor: done ? 'default' : 'pointer',
                    opacity: done ? 0.4 : 1,
                    flexShrink: 0,
                  }}
                >
                  <CarAnglePhoto position={p} size={30} />
                  {done && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: '#22c55e',
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                      }}
                    >
                      ✓
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        }
        guideBoxes={GUIDE_TEMPLATES[selectedPosition]}
        expectedPlateNumber={expectedPlateNumber || undefined}
        onCapture={handleCapture}
        paused={isUploading}
      />

      {/* 上傳中的全螢幕遮罩：蓋在 CameraCapture 之上（比它的 zIndex:30 高），
          擋住畫面互動與視覺，避免使用者在上一張還在上傳時又觸發下一次拍照
          （見上面 handleCapture 的說明）。用實心黑色（不透明）而非半透明，
          避免底下暫停前最後一刻的引導框/狀態列畫面透出來造成視覺雜訊。
          CameraCapture 本身維持掛載不拆（鏡頭串流才不會中斷、換角度不用
          重新要求相機權限），只靠 paused 暫停它內部的即時辨識運算。 */}
      {isUploading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: '#000',
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

      {uploadError && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 45,
            background: 'rgba(0,0,0,0.75)',
            color: '#f87171',
            padding: '8px 16px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            maxWidth: '90vw',
            textAlign: 'center',
          }}
        >
          {uploadError}
        </div>
      )}
    </>
  )
}
