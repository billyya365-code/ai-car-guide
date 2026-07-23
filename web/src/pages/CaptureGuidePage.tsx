import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { RotateCcw } from 'lucide-react'
import { CameraCapture, type CapturedPhoto } from '../components/CameraCapture'
import { CarAnglePhoto } from '../components/CarAnglePhoto'
import { CarProgressTrack } from '../components/CarProgressTrack'
import { CAR_POSITIONS, GUIDE_TEMPLATES, POSITION_LABELS, type CarPosition } from '../config/guideTemplates'
import { db, ensureAnonymousAuth } from '../lib/firebase'
import { createRental, uploadCapturePhoto, createPhotoRecord, markPickupUploaded } from '../lib/firebaseUpload'

// pending：還在拍照/確認階段；uploading：批次上傳中；analyzing：4 張都上傳完成，
// 等 Cloud Function 分析完成（見 functions/src/index.ts）；error：上傳本身失敗。
// 分析完成/分析失敗都會直接 navigate 到 /result，不會停留在這個 phase 上，所以
// 不需要額外的 'success'/'analyzed' 狀態。
type UploadPhase = 'pending' | 'uploading' | 'error' | 'analyzing'

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
  // 四張都拍完後不會馬上上傳，先進到確認畫面讓使用者檢查有沒有想重拍的角度，
  // 按下「確認上傳」（見下方 confirmed）才真正開始跑批次上傳。
  const [confirmed, setConfirmed] = useState(false)
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
    // 畫面上車牌顯示/OCR 核對都保留 "-"（例如 ABC-1234）方便閱讀，但寫進 Firebase
    // 的 vehicle_id（連帶 rental_id、檔名都會用到這個值）不需要這個分隔符號，
    // 這裡統一拿掉，後端資料庫看到的都是純英數字。
    const vehicleId = expectedPlateNumber.trim().replace(/-/g, '')
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
      // 上傳完成不代表分析完成——切到 analyzing，畫面繼續停在這頁監聽 Firestore
      // 的 rentals 文件狀態（見下方 useEffect），等真的分析完成/失敗才 navigate
      // 到 /result，把「上傳中」跟「AI 辨識中」合併成同一個畫面，不用中途跳頁。
      setUploadPhase('analyzing')
    } catch (err) {
      console.error('[CaptureGuidePage] 批次上傳失敗', err)
      setUploadErrorMsg('照片上傳失敗，請檢查網路後重試（已成功的角度不會重傳）')
      setUploadPhase('error')
    }
  }

  // 使用者在確認畫面按下「確認上傳」後才觸發批次上傳，不再是四張拍完就自動上傳——
  // 讓使用者有機會先檢查、重拍不滿意的角度。
  useEffect(() => {
    if (isDone && confirmed && uploadPhase === 'pending') {
      void runBatchUpload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone, confirmed])

  // 上傳完成、進入 analyzing 階段後，監聽這筆訂單的 Firestore 文件，等 Cloud
  // Function（functions/src/index.ts）把分析結果寫回來、status 變成終態
  // （pickup_analyzed 或這次新加的 pickup_analysis_failed）才離開這頁去看結果，
  // 中間的「分析中」畫面就停留在同一個 CaptureGuidePage，不需要提早跳頁。
  useEffect(() => {
    if (uploadPhase !== 'analyzing' || !rentalId) return
    const unsubscribe = onSnapshot(doc(db, 'rentals', rentalId), (snap) => {
      const status = snap.data()?.status
      if (status === 'pickup_analyzed' || status === 'pickup_analysis_failed') {
        navigate(`/result?rentalId=${encodeURIComponent(rentalId)}`, { replace: true })
      }
    })
    return unsubscribe
  }, [uploadPhase, rentalId, navigate])

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

  // 確認畫面上點某個角度的縮圖＝要重拍那個角度：從 capturedPhotos 移除該角度
  // （isDone 因此自動變回 false，畫面會自然掉回相機鏡頭），並把 selectedPosition
  // 切過去，使用者一進鏡頭就是對著那個角度，不用自己再點一次角度圖示。
  const handleRetake = (position: CarPosition) => {
    setCapturedPhotos((prev) => {
      const next = { ...prev }
      delete next[position]
      return next
    })
    setSelectedPosition(position)
  }

  // 沒有經過首頁輸入車牌/選車款就直接連進這個網址（例如書籤、重新整理後 state
  // 遺失）時，沒有 vehicle_id 可用——直接導回首頁重新輸入，而不是讓後面的上傳
  // 流程用空字串出錯，也不需要使用者自己按一次「回首頁」才能繼續。
  if (!expectedPlateNumber || !carModel) {
    return <Navigate to="/" replace />
  }

  // 四張都拍完、還沒按確認：先進到確認畫面，讓使用者檢查每個角度、點縮圖可以
  // 重拍，不滿意可以隨時重來，不會一拍完第四張就直接開始上傳。
  if (isDone && !confirmed) {
    return (
      <main className="container page-enter" style={{ paddingBottom: 96 }}>
        <h1>確認照片</h1>
        <p className="subtitle">請確認四個角度都清楚對焦，點選照片即可重新拍攝該角度</p>
        <div className="photo-grid">
          {CAR_POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              className="photo-thumb photo-thumb-button"
              onClick={() => handleRetake(p)}
              aria-label={`重新拍攝${POSITION_LABELS[p]}`}
            >
              {capturedPhotos[p] && <img src={capturedPhotos[p].image} alt={POSITION_LABELS[p]} />}
              <span className="photo-thumb-retake-badge">
                <RotateCcw size={14} />
              </span>
              <p className="photo-label">{POSITION_LABELS[p]}</p>
            </button>
          ))}
        </div>
        <div className="bottom-bar">
          <button type="button" className="btn btn-primary" onClick={() => setConfirmed(true)}>
            確認上傳
          </button>
        </div>
      </main>
    )
  }

  // 確認上傳後：上傳中／AI 分析中／上傳失敗畫面，合併成同一個進度畫面，中間不
  // 跳頁——分析完成/分析失敗才會離開這頁（見上方 useEffect），去 /result 看結果。
  if (isDone && confirmed) {
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
        {uploadPhase === 'analyzing' && (
          <>
            <h2 style={{ marginBottom: 0 }}>AI 分析中…</h2>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              正在偵測車損，請稍候
            </p>
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
