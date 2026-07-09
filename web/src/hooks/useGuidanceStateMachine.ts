import { useMemo } from 'react'

// 純邏輯狀態機：集中管理拍照引導的提示優先權，避免畫面同時顯示多個互相衝突的提示。
// 任務 5（陀螺儀）、任務 6（AI 視覺定位/距離）、任務 7（清晰度/OCR）只需回報各自的
// 布林通過與否，顯示邏輯（該顯示哪一則、其餘略過/待定）全部集中在這裡。

export const GuidanceCheck = {
  LEVEL: 'LEVEL',
  UPRIGHT: 'UPRIGHT',
  POSITION: 'POSITION',
  DISTANCE: 'DISTANCE',
  SHARPNESS: 'SHARPNESS',
  PLATE: 'PLATE',
} as const

export type GuidanceCheckKey = (typeof GuidanceCheck)[keyof typeof GuidanceCheck]

export type GuidanceState = GuidanceCheckKey | 'ALL_PASSED'

// passed：已檢查且通過 / failed：已檢查且不通過（= activeGuidance）
// skipped：感測器不可用，該項不參與判斷 / pending：更高優先權項目未通過，尚未輪到判斷
export type GuidanceItemStatus = 'passed' | 'failed' | 'skipped' | 'pending'

export interface GuidanceChecks {
  isLevelOk: boolean
  isUprightOk: boolean
  isPositionOk: boolean
  isDistanceOk: boolean
  isSharpOk: boolean
  isPlateOk: boolean
}

export interface UseGuidanceStateMachineResult {
  // 當前應顯示的唯一提示；全部通過（或已略過）時為 'ALL_PASSED'
  activeGuidance: GuidanceState
  itemStatus: Record<GuidanceCheckKey, GuidanceItemStatus>
}

// 優先權順序（由高到低）：水平 > 直立 > 位置 > 距離 > 清晰度 > 車牌正確
const PRIORITY_ORDER: GuidanceCheckKey[] = [
  GuidanceCheck.LEVEL,
  GuidanceCheck.UPRIGHT,
  GuidanceCheck.POSITION,
  GuidanceCheck.DISTANCE,
  GuidanceCheck.SHARPNESS,
  GuidanceCheck.PLATE,
]

const CHECK_FIELD: Record<GuidanceCheckKey, keyof GuidanceChecks> = {
  LEVEL: 'isLevelOk',
  UPRIGHT: 'isUprightOk',
  POSITION: 'isPositionOk',
  DISTANCE: 'isDistanceOk',
  SHARPNESS: 'isSharpOk',
  PLATE: 'isPlateOk',
}

// 感測器權限被拒絕/不支援時（任務 3.5 回傳 denied），這兩項一律視為不參與判斷，
// 直接從「位置」開始檢查，而非卡在永遠無法通過的水平/直立提示。
const SENSOR_DEPENDENT = new Set<GuidanceCheckKey>([GuidanceCheck.LEVEL, GuidanceCheck.UPRIGHT])

export const GUIDANCE_MESSAGES: Record<GuidanceState, string> = {
  LEVEL: '請保持手機水平',
  UPRIGHT: '請直立鏡頭',
  POSITION: '請對準引導框位置',
  DISTANCE: '請調整拍攝距離',
  SHARPNESS: '畫面不清晰，請保持穩定',
  PLATE: '請確認車牌清楚可辨識',
  ALL_PASSED: '',
}

export function useGuidanceStateMachine(
  checks: GuidanceChecks,
  sensorAvailable: boolean,
): UseGuidanceStateMachineResult {
  const { isLevelOk, isUprightOk, isPositionOk, isDistanceOk, isSharpOk, isPlateOk } = checks

  return useMemo(() => {
    const values: GuidanceChecks = { isLevelOk, isUprightOk, isPositionOk, isDistanceOk, isSharpOk, isPlateOk }
    const itemStatus = {} as Record<GuidanceCheckKey, GuidanceItemStatus>
    let activeGuidance: GuidanceState = 'ALL_PASSED'
    let blocked = false

    for (const key of PRIORITY_ORDER) {
      if (blocked) {
        itemStatus[key] = 'pending'
        continue
      }
      if (SENSOR_DEPENDENT.has(key) && !sensorAvailable) {
        itemStatus[key] = 'skipped'
        continue
      }
      if (values[CHECK_FIELD[key]]) {
        itemStatus[key] = 'passed'
      } else {
        itemStatus[key] = 'failed'
        activeGuidance = key
        blocked = true
      }
    }

    return { activeGuidance, itemStatus }
  }, [isLevelOk, isUprightOk, isPositionOk, isDistanceOk, isSharpOk, isPlateOk, sensorAvailable])
}
