// 對照 需求規劃/02_SDD_系統規格書.md 第 2 節與第 4.2 節的欄位定義。

export type DamageLabel = 'scratch' | 'dent'

// x1/y1/x2/y2 的座標系統：跟引擎團隊實際資料對過（Firestore 樣本值都落在
// 0~1 之間，例如 x1=0.3889），是相對照片寬高的正規化座標，不是規格書原先寫的
// 像素座標，也不是 0~100 的百分比。Cloud Function 這裡不做任何座標換算，原樣
// 轉存；前端 web/src/pages/ResultPage.tsx 的疊框邏輯直接把這幾個值乘以 100
// 當 CSS 百分比用。
export interface Damage {
  x1: number
  y1: number
  x2: number
  y2: number
  label: DamageLabel
  confidence: number
}

export type PhotoType = 'front_left' | 'front_right' | 'rear_left' | 'rear_right' | `extra_${number}`

export type QcStatus = 'pending' | 'analyzed' | 'analysis_failed'

export interface PhotoDoc {
  rental_id: string
  vehicle_id: string
  stage: 'pickup' | 'return'
  photo_type: PhotoType
  file_name: string
  storage_path: string
  qc_status: QcStatus
  damages: Damage[]
}

export type RiskLevel = 'low' | 'medium' | 'high'

// pickup_analysis_failed 不在 SDD 的狀態定義表內，是這次為了處理 E003_ENGINE_TIMEOUT
// （引擎叫不通/逾時）額外新增的終態，避免前端永遠卡在 pickup_analyzing 的 loading 畫面。
export type RentalStatus =
  | 'pickup_uploading'
  | 'pickup_uploaded'
  | 'pickup_analyzing'
  | 'pickup_analyzed'
  | 'pickup_analysis_failed'
  | 'pickup_reviewed'

export interface RentalDoc {
  vehicle_id: string
  status: RentalStatus
  risk_flag: boolean
  risk_level: RiskLevel | null
  ai_summary: string | null
}

// Cloud Function -> 車損辨識引擎 的請求/回應格式，見 SDD 4.2 節。
export interface AnalyzeBatchRequestPhoto {
  photo_id: string
  storage_path: string
}

export interface AnalyzeBatchRequest {
  rental_id: string
  photos: AnalyzeBatchRequestPhoto[]
}

export interface AnalyzeBatchResponseEntry {
  photo_id: string
  qc_status: string
  damages: Damage[]
}

export type AnalyzeBatchResponse = AnalyzeBatchResponseEntry[]
