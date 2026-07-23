import { describe, expect, it } from 'vitest'
import { buildAiSummary, computeRiskLevel } from './riskRules'
import type { Damage } from './types'

function damage(overrides: Partial<Damage>): Damage {
  return { x1: 0, y1: 0, x2: 10, y2: 10, label: 'scratch', confidence: 0.9, ...overrides }
}

describe('computeRiskLevel', () => {
  it('R3: no damages -> low, riskFlag false', () => {
    expect(computeRiskLevel([])).toEqual({ riskLevel: 'low', riskFlag: false })
  })

  it('R2: scratch only -> medium, riskFlag true', () => {
    expect(computeRiskLevel([damage({ label: 'scratch' })])).toEqual({ riskLevel: 'medium', riskFlag: true })
  })

  it('R1: dent only -> high, riskFlag true', () => {
    expect(computeRiskLevel([damage({ label: 'dent' })])).toEqual({ riskLevel: 'high', riskFlag: true })
  })

  it('R1 takes priority over R2 when both present, regardless of count', () => {
    const damages = [
      damage({ label: 'scratch' }),
      damage({ label: 'scratch' }),
      damage({ label: 'scratch' }),
      damage({ label: 'dent' }),
    ]
    expect(computeRiskLevel(damages)).toEqual({ riskLevel: 'high', riskFlag: true })
  })
})

describe('buildAiSummary', () => {
  it('reports no damage detected when empty', () => {
    expect(buildAiSummary('low', [{ photo_type: 'front_left', damages: [] }])).toBe(
      '本次取車照片未偵測到明顯車損，風險等級：低。',
    )
  })

  it('counts scratch/dent and lists distinct angles', () => {
    const summary = buildAiSummary('high', [
      { photo_type: 'front_left', damages: [damage({ label: 'scratch' })] },
      { photo_type: 'rear_right', damages: [damage({ label: 'dent' }), damage({ label: 'dent' })] },
    ])
    expect(summary).toBe('本次取車照片偵測到刮傷 1 處、凹痕 2 處，涉及角度：車頭左側、車尾右側。風險等級：high。')
  })

  it('flags low-confidence detections at the 0.5 boundary (exclusive)', () => {
    const summaryAtBoundary = buildAiSummary('medium', [
      { photo_type: 'front_left', damages: [damage({ label: 'scratch', confidence: 0.5 })] },
    ])
    expect(summaryAtBoundary).not.toContain('信心分數低於 50%')

    const summaryBelowBoundary = buildAiSummary('medium', [
      { photo_type: 'front_left', damages: [damage({ label: 'scratch', confidence: 0.49 })] },
    ])
    expect(summaryBelowBoundary).toContain('其中 1 處信心分數低於 50%，建議複核人員優先人工確認。')
  })
})
