import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore'
import { ref, getDownloadURL } from 'firebase/storage'
import { X } from 'lucide-react'
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

// 只在真的有偵測到車損的照片上方顯示這段說明，沒有損傷的照片不需要多顯示
// 任何車損相關文字，單純顯示原圖跟角度名稱即可。
function summarizeDamages(damages: Damage[]): string {
  const dentCount = damages.filter((d) => d.label === 'dent').length
  const scratchCount = damages.filter((d) => d.label === 'scratch').length
  const parts: string[] = []
  if (dentCount > 0) parts.push(`凹痕 ${dentCount} 處`)
  if (scratchCount > 0) parts.push(`刮傷 ${scratchCount} 處`)
  return `偵測到車損：${parts.join('、')}`
}

// ResultPhotoCard（縮圖格）跟 PhotoLightbox（點擊放大後的檢視）都需要同一張照片
// 的下載網址，抽成共用 hook 避免兩邊各自重複一份 getDownloadURL 邏輯。
function useDownloadUrl(fileName: string): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getDownloadURL(ref(storage, fileName))
      .then((u) => {
        if (!cancelled) setUrl(u)
      })
      .catch((err) => {
        console.error('[ResultPage] 取得照片下載網址失敗', fileName, err)
      })
    return () => {
      cancelled = true
    }
  }, [fileName])

  return url
}

function sortByCarPosition(photos: PhotoWithId[]): PhotoWithId[] {
  return [...photos].sort((a, b) => {
    const ai = CAR_POSITIONS.indexOf(a.photo_type as CarPosition)
    const bi = CAR_POSITIONS.indexOf(b.photo_type as CarPosition)
    return (ai === -1 ? CAR_POSITIONS.length : ai) - (bi === -1 ? CAR_POSITIONS.length : bi)
  })
}

// 座標格式已跟引擎團隊實際資料對過（Firestore 樣本：x1=0.3889/x2=0.42/
// y1=0.7365/y2=0.754 這類 0~1 之間的值）：x1/y1/x2/y2 是相對照片寬高的正規化
// 座標（0~1），不是像素、也不是 0~100 的百分比，所以直接乘以 100 當 CSS 百分比
// 用即可，不需要再除以照片的 naturalWidth/naturalHeight。
function DamageOverlay({ damage }: { damage: Damage }) {
  const leftPercent = damage.x1 * 100
  const topPercent = damage.y1 * 100
  const widthPercent = (damage.x2 - damage.x1) * 100
  const heightPercent = (damage.y2 - damage.y1) * 100
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

function ResultPhotoCard({ photo, onOpen }: { photo: PhotoWithId; onOpen: (photo: PhotoWithId) => void }) {
  const downloadUrl = useDownloadUrl(photo.file_name)
  const hasDamage = photo.damages.length > 0

  return (
    <div className="result-photo-card">
      {hasDamage && <p className="result-photo-damage-summary">{summarizeDamages(photo.damages)}</p>}
      <button
        type="button"
        className="result-photo-frame-button"
        onClick={() => onOpen(photo)}
        aria-label={`放大檢視${photoLabel(photo.photo_type)}`}
      >
        <div className="result-photo-frame">
          {downloadUrl && <img src={downloadUrl} alt={photoLabel(photo.photo_type)} />}
          {photo.damages.map((damage, i) => (
            <DamageOverlay key={i} damage={damage} />
          ))}
        </div>
      </button>
      <p className="photo-label">
        {photoLabel(photo.photo_type)}
        {photo.qc_status === 'analysis_failed' && '（分析失敗）'}
      </p>
    </div>
  )
}

// 點縮圖放大看的全螢幕檢視——標題明確標出這是哪個角度（縮圖底下雖然也有角度
// 名稱，但放大看時原本的縮圖標籤已經不在視線範圍內，這裡要重複顯示一次）。
function PhotoLightbox({ photo, onClose }: { photo: PhotoWithId; onClose: () => void }) {
  const downloadUrl = useDownloadUrl(photo.file_name)
  const hasDamage = photo.damages.length > 0

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-header">
          <span>{photoLabel(photo.photo_type)}</span>
          <button type="button" className="lightbox-close" onClick={onClose} aria-label="關閉">
            <X size={20} />
          </button>
        </div>
        <div className="result-photo-frame">
          {downloadUrl && <img src={downloadUrl} alt={photoLabel(photo.photo_type)} />}
          {photo.damages.map((damage, i) => (
            <DamageOverlay key={i} damage={damage} />
          ))}
        </div>
        {hasDamage && <p className="result-photo-damage-summary">{summarizeDamages(photo.damages)}</p>}
      </div>
    </div>
  )
}

export function ResultPage() {
  const [searchParams] = useSearchParams()
  const rentalId = searchParams.get('rentalId')

  // undefined：還沒收到第一次 snapshot；null：文件不存在。
  const [rental, setRental] = useState<RentalDoc | null | undefined>(undefined)
  const [photos, setPhotos] = useState<PhotoWithId[]>([])
  const [openedPhoto, setOpenedPhoto] = useState<PhotoWithId | null>(null)

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
          <ResultPhotoCard key={photo.id} photo={photo} onOpen={setOpenedPhoto} />
        ))}
      </div>
      <div className="bottom-bar">
        <Link className="btn btn-primary" to="/">
          返回首頁
        </Link>
      </div>
      {openedPhoto && <PhotoLightbox photo={openedPhoto} onClose={() => setOpenedPhoto(null)} />}
    </main>
  )
}
