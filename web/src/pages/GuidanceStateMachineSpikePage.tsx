import { useState } from 'react'
import {
  GUIDANCE_MESSAGES,
  useGuidanceStateMachine,
  type GuidanceCheckKey,
  type GuidanceChecks,
} from '../hooks/useGuidanceStateMachine'

// 任務 4 驗收用診斷頁面：手動切換各檢查項的通過/不通過，確認狀態機只顯示
// 最高優先權的那一則提示，且 sensorAvailable=false 時水平/直立會被標記為略過，
// 直接從「位置」開始判斷。

const CHECK_LABELS: Array<{ key: keyof GuidanceChecks; stateKey: GuidanceCheckKey; label: string }> = [
  { key: 'isLevelOk', stateKey: 'LEVEL', label: '水平 (LEVEL)' },
  { key: 'isUprightOk', stateKey: 'UPRIGHT', label: '直立 (UPRIGHT)' },
  { key: 'isPositionOk', stateKey: 'POSITION', label: '位置 (POSITION)' },
  { key: 'isDistanceOk', stateKey: 'DISTANCE', label: '距離 (DISTANCE)' },
  { key: 'isSharpOk', stateKey: 'SHARPNESS', label: '清晰度 (SHARPNESS)' },
  { key: 'isPlateOk', stateKey: 'PLATE', label: '車牌正確 (PLATE)' },
]

const STATUS_LABELS = {
  passed: '✅ 通過',
  failed: '❌ 不通過（= 目前顯示）',
  skipped: '⏭️ 已略過（裝置不支援或未授權）',
  pending: '⏳ 尚未判斷',
}

export function GuidanceStateMachineSpikePage() {
  const [checks, setChecks] = useState<GuidanceChecks>({
    isLevelOk: true,
    isUprightOk: true,
    isPositionOk: true,
    isDistanceOk: true,
    isSharpOk: true,
    isPlateOk: true,
  })
  const [sensorAvailable, setSensorAvailable] = useState(true)

  const { activeGuidance, itemStatus } = useGuidanceStateMachine(checks, sensorAvailable)

  return (
    <main style={{ padding: 16 }}>
      <h1>任務 4：狀態機驗證頁面</h1>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={sensorAvailable}
          onChange={(e) => setSensorAvailable(e.target.checked)}
        />{' '}
        sensorAvailable（勾掉模擬感測器 denied，水平/直立應變為略過）
      </label>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {CHECK_LABELS.map(({ key, stateKey, label }) => (
          <li key={key} style={{ marginBottom: 4 }}>
            <label>
              <input
                type="checkbox"
                checked={checks[key]}
                onChange={(e) => setChecks((c) => ({ ...c, [key]: e.target.checked }))}
              />{' '}
              {label}
            </label>{' '}
            — {STATUS_LABELS[itemStatus[stateKey]]}
          </li>
        ))}
      </ul>

      <p style={{ marginTop: 16, fontWeight: 'bold' }}>
        目前應顯示提示：{activeGuidance === 'ALL_PASSED' ? '（全部通過，無提示）' : GUIDANCE_MESSAGES[activeGuidance]}
        （狀態鍵：{activeGuidance}）
      </p>
    </main>
  )
}
