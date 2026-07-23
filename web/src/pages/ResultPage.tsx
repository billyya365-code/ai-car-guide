import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore'
import { ref, getDownloadURL } from 'firebase/storage'
import { db, storage, ensureAnonymousAuth } from '../lib/firebase'
import { CAR_POSITIONS, POSITION_LABELS, type CarPosition } from '../config/guideTemplates'

type DamageLabel = 'scratch' | 'dent'

interface Damage {
  x1: number
  y1: number
  x2: number
  y2: number
  label: DamageLabel
  confidence: number
}

type RiskLevel = 'low' | 'medium' | 'high'

// pickup_analysis_failed 不在 02_SDD 的狀態定義表內，是 Cloud Function
// （functions/src/index.ts）為了處理引擎逾時/叫不通額外加的終態，見該檔案註解。
type RentalStatus =
  | 'pickup_uploading'
  | 'pickup_uploaded'
  | 'pickup_analyzing'
  | 'pickup_analyzed'
  | 'pickup_analysis_failed'
  | 'pickup_reviewed'

interface RentalDoc {
  status: RentalStatus
  risk_level: RiskLevel | null
  ai_summary: string | null
}

interface PhotoDoc {
  photo_type: string
  file_name: string
  qc_status: 'pending' | 'analyzed' | 'analysis_failed'
  damages: Damage[]
}

interface PhotoWithId extends PhotoDoc {
  id: string
}

const RISK_LABEL: Record<RiskLevel, string> = { low: '低風險', medium: '中風險', high: '高風險' }
const RISK_BADGE_CLASS: Record<RiskLevel, string> = { low: 'badge-ok', medium: 'badge-warn', high: 'badge-danger' }
const DAMAGE_LABEL: Record<DamageLabel, string> = { scratch: '刮傷', dent: '凹痕' }

function photoLabel(photoType: string): string {
  return POSITION_LABELS[photoType as CarPosition] ?? photoType
}

function sortByCarPosition(photos: PhotoWithId[]): PhotoWithId[] {
  return [...photos].sort((a, b) => {
    const ai = CAR_POSITIONS.indexOf(a.photo_type as CarPosition)
    const bi = CAR_POSITIONS.indexOf(b.photo_type as CarPosition)
    return (ai === -1 ? CAR_POSITIONS.length : ai) - (bi === -1 ? CAR_POSITIONS.length : bi)
  })
}

// ⚠️ 待確認：這裡假設引擎回傳的 x1/y1/x2/y2 是「已存下來的正方形照片」的原始
// 像素座標（座標換算責任在引擎端，見 02_SDD 4.2 節），所以用 <img> 的
// naturalWidth/naturalHeight 換算成百分比再疊上去——但這個假設尚未跟車損辨識
// 引擎團隊實際對齊過實作格式（截至寫這段程式碼時，對方也還沒確認）。如果引擎
// 實際回傳的是百分比（0~100 或 0~1），這裡的除法會把框縮到接近 0，需要改成
// 直接把 x1/y1/x2/y2 當百分比用（0~1 的話要先 *100），不能再除 naturalWidth/
// naturalHeight。跟引擎團隊對齊格式後，這個假設要重新確認一次。
function DamageOverlay({ damage, naturalWidth, naturalHeight }: { damage: Damage; naturalWidth: number; naturalHeight: number }) {
  const leftPercent = (damage.x1 / naturalWidth) * 100
  const topPercent = (damage.y1 / naturalHeight) * 100
  const widthPercent = ((damage.x2 - damage.x1) / naturalWidth) * 100
  const heightPercent = ((damage.y2 - damage.y1) / naturalHeight) * 100
  const color = damage.label === 'dent' ? 'var(--danger)' : 'var(--warning)'

  return (
    <div
      className="damage-box"
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        width: `${widthPercent}%`,
        height: `${heightPercent}%`,
        borderColor: color,
      }}
    >
      <span className="damage-box-label" style={{ background: color, color: 'var(--bg-card)' }}>
        {DAMAGE_LABEL[damage.label]}（{Math.round(damage.confidence * 100)}%）
      </span>
    </div>
  )
}

function ResultPhotoCard({ photo }: { photo: PhotoWithId }) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    getDownloadURL(ref(storage, photo.file_name))
      .then((url) => {
        if (!cancelled) setDownloadUrl(url)
      })
      .catch((err) => {
        console.error('[ResultPage] 取得照片下載網址失敗', photo.file_name, err)
      })
    return () => {
      cancelled = true
    }
  }, [photo.file_name])

  return (
    <div className="result-photo-card">
      <div className="result-photo-frame">
        {downloadUrl && (
          <img
            src={downloadUrl}
            alt={photoLabel(photo.photo_type)}
            onLoad={(e) => {
              const img = e.currentTarget
              setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
            }}
          />
        )}
        {naturalSize &&
          photo.damages.map((damage, i) => (
            <DamageOverlay key={i} damage={damage} naturalWidth={naturalSize.width} naturalHeight={naturalSize.height} />
          ))}
      </div>
      <p className="photo-label">
        {photoLabel(photo.photo_type)}
        {photo.qc_status === 'analysis_failed' && '（分析失敗）'}
      </p>
    </div>
  )
}

export function ResultPage() {
  const [searchParams] = useSearchParams()
  const rentalId = searchParams.get('rentalId')

  // undefined：還沒收到第一次 snapshot；null：文件不存在。
  const [rental, setRental] = useState<RentalDoc | null | undefined>(undefined)
  const [photos, setPhotos] = useState<PhotoWithId[]>([])

  useEffect(() => {
    ensureAnonymousAuth().catch((err) => {
      console.error('[ResultPage] 匿名登入失敗', err)
    })
  }, [])

  useEffect(() => {
    if (!rentalId) return
    const unsubscribe = onSnapshot(
      doc(db, 'rentals', rentalId),
      (snap) => setRental(snap.exists() ? (snap.data() as RentalDoc) : null),
      (err) => {
        console.error('[ResultPage] 讀取 rental 失敗', err)
        setRental(null)
      },
    )
    return unsubscribe
  }, [rentalId])

  useEffect(() => {
    if (!rentalId) return
    const photosQuery = query(collection(db, 'photos'), where('rental_id', '==', rentalId))
    const unsubscribe = onSnapshot(
      photosQuery,
      (snap) => {
        setPhotos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PhotoDoc) })))
      },
      (err) => {
        console.error('[ResultPage] 讀取 photos 失敗', err)
      },
    )
    return unsubscribe
  }, [rentalId])

  const sortedPhotos = useMemo(() => sortByCarPosition(photos), [photos])

  if (!rentalId) {
    return <Navigate to="/" replace />
  }

  if (rental === undefined) {
    return (
      <main className="container page-enter" style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="subtitle">載入中…</p>
      </main>
    )
  }

  if (rental === null) {
    return (
      <main className="container page-enter" style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
        <h2>找不到這筆訂單</h2>
        <p className="subtitle">連結可能有誤，或訂單已被移除。</p>
        <Link className="btn btn-primary" to="/">
          回首頁
        </Link>
      </main>
    )
  }

  if (rental.status === 'pickup_uploading' || rental.status === 'pickup_uploaded' || rental.status === 'pickup_analyzing') {
    return (
      <main className="container page-enter" style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 0 }}>AI 分析中…</h2>
        <p className="subtitle" style={{ marginBottom: 0 }}>正在偵測車損，請稍候，此頁面會自動更新</p>
      </main>
    )
  }

  if (rental.status === 'pickup_analysis_failed') {
    return (
      <main className="container page-enter" style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 0, color: 'var(--danger)' }}>分析失敗</h2>
        <p className="subtitle" style={{ marginBottom: 0 }}>車損辨識引擎目前無法回應，請稍後再試或聯繫客服。</p>
        <Link className="btn btn-secondary" to="/">
          回首頁
        </Link>
      </main>
    )
  }

  // pickup_analyzed / pickup_reviewed：完整結果畫面。
  const riskLevel = rental.risk_level
  return (
    <main className="container page-enter" style={{ paddingBottom: 96 }}>
      <h1>檢測結果</h1>
      {riskLevel && (
        <div className="card" style={{ marginBottom: 16 }}>
          <span className={`badge ${RISK_BADGE_CLASS[riskLevel]}`}>{RISK_LABEL[riskLevel]}</span>
          {rental.ai_summary && (
            <p style={{ margin: '10px 0 0', color: 'var(--text)' }}>{rental.ai_summary}</p>
          )}
        </div>
      )}
      <div className="photo-grid">
        {sortedPhotos.map((photo) => (
          <ResultPhotoCard key={photo.id} photo={photo} />
        ))}
      </div>
      <div className="bottom-bar">
        <Link className="btn btn-primary" to="/">
          返回首頁
        </Link>
      </div>
    </main>
  )
}
