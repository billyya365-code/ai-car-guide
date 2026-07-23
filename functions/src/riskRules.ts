import type { Damage, PhotoType, RiskLevel } from './types'

// 見 需求規劃/02_SDD_系統規格書.md 第 4.4 節：依 label 種類判斷（不是依數量），
// R1 (dent) 優先序高於 R2 (scratch)。
export function computeRiskLevel(allDamages: Damage[]): { riskLevel: RiskLevel; riskFlag: boolean } {
  if (allDamages.some((d) => d.label === 'dent')) {
    return { riskLevel: 'high', riskFlag: true }
  }
  if (allDamages.some((d) => d.label === 'scratch')) {
    return { riskLevel: 'medium', riskFlag: true }
  }
  return { riskLevel: 'low', riskFlag: false }
}

export interface AiSummaryPhoto {
  photo_type: PhotoType
  damages: Damage[]
}

// 原樣搬自 需求規劃/02_SDD_系統規格書.md 第 4.5 節的參考實作，樣板字串組合，
// 不呼叫生成式 AI。
export function buildAiSummary(riskLevel: RiskLevel, photos: AiSummaryPhoto[]): string {
  const damages = photos.flatMap((p) => p.damages.map((d) => ({ ...d, photo_type: p.photo_type })))
  const scratchCount = damages.filter((d) => d.label === 'scratch').length
  const dentCount = damages.filter((d) => d.label === 'dent').length
  const lowConfidence = damages.filter((d) => d.confidence < 0.5)
  const angles = [...new Set(damages.map((d) => d.photo_type))].join('、')

  if (damages.length === 0) {
    return '本次取車照片未偵測到明顯車損，風險等級：低。'
  }

  let summary = `本次取車照片偵測到刮傷 ${scratchCount} 處、凹痕 ${dentCount} 處，涉及角度：${angles}。風險等級：${riskLevel}。`
  if (lowConfidence.length > 0) {
    summary += `其中 ${lowConfidence.length} 處信心分數低於 50%，建議複核人員優先人工確認。`
  }
  return summary
}
