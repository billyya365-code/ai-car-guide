import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { CameraCapture, type CapturedPhoto } from '../components/CameraCapture'
import { CarAnglePhoto } from '../components/CarAnglePhoto'
import { CarProgressTrack } from '../components/CarProgressTrack'
import { CAR_POSITIONS, GUIDE_TEMPLATES, POSITION_LABELS, type CarPosition } from '../config/guideTemplates'
import { ensureAnonymousAuth } from '../lib/firebase'
import { createRental, uploadCapturePhoto, createPhotoRecord, markPickupUploaded } from '../lib/firebaseUpload'

type UploadPhase = 'pending' | 'uploading' | 'error' | 'success'

export function CaptureGuidePage() {
  // 車牌號碼、車款現在在首頁（WelcomePage）輸入/選擇，透過路由 state 帶過來——
  // 這裡不再提供輸入框，車牌同時兼作任務 7 車牌 OCR 核對用的期望車牌，跟
  // Firebase 要求的 vehicle_id。直接用網址列進到這頁（沒有經過首頁）時會沒有
  // 這兩個值，見下方 guard。
  const location = useLocation()
  const navigate = useNavigate()
  const routeState = location.state as { plateNumber?: string; carModel?: string } | null
  const expectedPlateNumber = routeState?.plateNumber ?? ''
  const carModel = routeState?.carModel ?? ''

  // 四張照片先只存在記憶體，全部拍完才一次上傳（見下方 runBatchUpload），拍攝
  // 過程中完全不用等網路——避免每拍一張都要停下來等上傳完成才能拍下一張。
  const [capturedPhotos, setCapturedPhotos] = useState<Partial<Record<CarPosition, CapturedPhoto>>>({})
  // 使用者可以自由選擇、隨時切換要拍的角度，不再是固定依序——一進畫面就直接是
  // 即時相機畫面（預設對準第一個角度），畫面上方的四個角度圖示隨時可以點來切換，
  // 不需要另外跳出一個選擇畫面。已經拍過的角度不能再選（避免同一個 photo_type
  // 在 Firestore 裡出現重複文件），要整個重來請用下方「重新拍攝」。
  const [selectedPosition, setSelectedPosition] = useState<CarPosition>(CAR_POSITIONS[0])
  // 第一次批次上傳前才建立訂單（這時 vehicle_id 才確定不會再變）。
  const [rentalId, setRentalId] = useState<string | null>(null)
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('pending')
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null)
  // 批次上傳過程中，每張照片各自成功與否——重試上傳時會跳過已經成功的角度，
  // 避免同一個 photo_type 在 Firestore 裡重複寫入兩筆文件。
  const [uploadedFlags, setUploadedFlags] = useState<Partial<Record<CarPosition, boolean>>>({})

  // 進到這頁就先嘗試匿名登入，四張都拍完要開始批次上傳時才不用等登入完成。
  useEffect(() => {
    ensureAnonymousAuth().catch((err) => {
      console.error('[CaptureGuidePage] 匿名登入失敗', err)
    })
  }, [])

  const doneFlags = CAR_POSITIONS.map((p) => Boolean(capturedPhotos[p]))
  const doneCount = doneFlags.filter(Boolean).length
  const isDone = doneCount >= CAR_POSITIONS.length
  const uploadedCount = CAR_POSITIONS.filter((p) => uploadedFlags[p]).length

  // 四張都拍完後（見下方 useEffect）才一次跑完整批次上傳：建立訂單 → 依序上傳
  // 每張照片到 Storage + 寫入 Firestore photos 文件 → 全部成功才更新訂單狀態。
  // 已經成功的角度會跳過（uploadedFlags），所以失敗後重試不會產生重複文件，
  // 只會接著補傳還沒成功的部分。
  const runBatchUpload = async () => {
    const vehicleId = expectedPlateNumber.trim()
    setUploadPhase('uploading')
    setUploadErrorMsg(null)
    try {
      await ensureAnonymousAuth()

      let currentRentalId = rentalId
      if (!currentRentalId) {
        const result = await createRental(vehicleId, carModel)
        currentRentalId = result.rentalId
        setRentalId(currentRentalId)
      }

      for (const position of CAR_POSITIONS) {
        if (uploadedFlags[position]) continue
        const capture = capturedPhotos[position]
        if (!capture) continue

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
        setUploadedFlags((prev) => ({ ...prev, [position]: true }))
      }

      await markPickupUploaded(currentRentalId)
      // 上傳全部完成後直接導去看分析結果，不再停留在這頁的靜態完成畫面——
      // 用 query param（不是 location.state）帶 rentalId，因為 /result 這頁使用者
      // 常常會在等待 AI 分析時重新整理或分享連結，state 撐不過整頁重新整理。
      navigate(`/result?rentalId=${encodeURIComponent(currentRentalId)}`, { replace: true })
    } catch (err) {
      console.error('[CaptureGuidePage] 批次上傳失敗', err)
      setUploadErrorMsg('照片上傳失敗，請檢查網路後重試（已成功的角度不會重傳）')
      setUploadPhase('error')
    }
  }

  // 四張都拍完的那一刻自動觸發批次上傳，不需要使用者再按一次按鈕。
  useEffect(() => {
    if (isDone && uploadPhase === 'pending') {
      void runBatchUpload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone])

  // CameraCapture 內部已經處理完「拍照 → 車牌核對通過 → 使用者按確認」整個流程，
  // 呼叫這裡時代表這個角度已經確定完成——純粹存進記憶體，不做任何網路請求，
  // 拍下一張不用等待。自動切到下一個還沒拍的角度（省去使用者再點一次圖示的
  // 操作），使用者隨時仍可以點別的角度圖示改拍別的。
  const handleCapture = (capture: CapturedPhoto) => {
    const position = selectedPosition
    const updatedPhotos = { ...capturedPhotos, [position]: capture }
    setCapturedPhotos(updatedPhotos)
    const next = CAR_POSITIONS.find((p) => !updatedPhotos[p])
    if (next) setSelectedPosition(next)
  }

  // 沒有經過首頁輸入車牌/選車款就直接連進這個網址（例如書籤、重新整理後 state
  // 遺失）時，沒有 vehicle_id 可用——直接導回首頁重新輸入，而不是讓後面的上傳
  // 流程用空字串出錯，也不需要使用者自己按一次「回首頁」才能繼續。
  if (!expectedPlateNumber || !carModel) {
    return <Navigate to="/" replace />
  }

  if (isDone) {
    // 上傳中／上傳失敗畫面：四張都拍完後才會出現，比起每張各自等待，整趟拍攝
    // 過程完全不會被網路速度打斷，只有最後這一段需要等待。上傳成功後直接在
    // runBatchUpload 裡 navigate 到 /result，不會停留在這個畫面，所以這裡不需要
    // 處理 uploadPhase === 'success' 的情況。
    return (
      <main
        className="container page-enter"
        style={{
          minHeight: '100svh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          textAlign: 'center',
        }}
      >
        {uploadPhase === 'uploading' && (
          <>
            <h2 style={{ marginBottom: 0 }}>上傳中…</h2>
            <p className="subtitle" style={{ marginBottom: 8 }}>
              請勿關閉畫面
            </p>
            <div style={{ width: '100%', maxWidth: 220 }}>
              <CarProgressTrack progress={uploadedCount / CAR_POSITIONS.length} />
            </div>
          </>
        )}
        {uploadPhase === 'error' && (
          <>
            <h2 style={{ marginBottom: 0, color: '#c0392b' }}>上傳失敗</h2>
            <p className="subtitle" style={{ marginBottom: 8 }}>
              {uploadErrorMsg}
            </p>
            <button type="button" className="btn btn-primary" onClick={runBatchUpload}>
              重試上傳
            </button>
          </>
        )}
      </main>
    )
  }

  return (
    <CameraCapture
      headerIcon={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
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
                    width: 72,
                    height: 72,
                    borderRadius: 14,
                    // 每個角度都有外框，目前拍攝的角度用實色白框＋淡白底凸顯，其餘三個
                    // 用較淡的半透明白框保持黯淡但仍看得出邊界，不是完全沒有框線。
                    border: active ? '2px solid rgba(255,255,255,0.9)' : '2px solid rgba(255,255,255,0.25)',
                    background: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)',
                    padding: 0,
                    cursor: done ? 'default' : 'pointer',
                    opacity: done ? 0.4 : 1,
                    flexShrink: 0,
                  }}
                >
                  <CarAnglePhoto position={p} size={54} />
                  {done && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#22c55e',
                        color: '#fff',
                        fontSize: 10,
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
          {/* 現在正在拍攝哪個角度——圖示放大後單靠圖案不夠一眼確認，加上文字標籤直接
              寫出角度全名，跟圖示列一起放在同一個 headerIcon 裡（不佔用 CameraCapture
              另外的錨點位置，避免又多引入一組獨立定位、互相干擾高度）。 */}
          <span style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>
            {POSITION_LABELS[selectedPosition]}
          </span>
        </div>
      }
      guideBoxes={GUIDE_TEMPLATES[selectedPosition]}
      expectedPlateNumber={expectedPlateNumber || undefined}
      onCapture={handleCapture}
    />
  )
}
