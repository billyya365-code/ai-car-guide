// 對照 需求規劃/02_SDD_系統規格書.md 第 2 節與第 4.2 節的欄位定義。

export type DamageLabel = 'scratch' | 'dent'

// ⚠️ x1/y1/x2/y2 的座標系統：規格書寫的是原始照片像素座標（換算責任在引擎端，
// 這裡跟 Cloud Function 都不再做一次換算，見 SDD 4.2 節），但截至目前為止還沒
// 跟車損辨識引擎團隊實際對齊過真正的輸出格式（有可能其實是百分比）。這個型別
// 本身不受影響（都是 number），但前端 web/src/pages/ResultPage.tsx 的疊框換算
// 邏輯是照這個假設寫的，格式一旦跟引擎對齊後不同，那邊要跟著調整。
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
