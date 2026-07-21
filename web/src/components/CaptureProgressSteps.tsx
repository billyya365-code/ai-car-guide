// 拍攝進度視覺化：●──●──○──○ 這種連接式步驟指示器，取代單純的「2 / 4」文字，
// 讓使用者一眼看出哪些角度已經拍完、哪個角度正在拍。使用者現在可以自由選擇
// 拍攝順序（不是固定依序），所以不再用單一 currentIndex 表示進度，改成每個
// 角度各自獨立的完成狀態（doneFlags）＋目前正在拍攝哪一個（activeIndex，純粹
// 用於高亮顯示，不代表「之前的都完成了」）。連接線只做視覺分組，不再用顏色
// 暗示「已經過這裡」，因為順序不再固定。
export interface CaptureProgressStepsProps {
  labels: string[]
  // 跟 labels 一一對應：true 代表這個角度已經拍攝完成。
  doneFlags: boolean[]
  // 目前正在拍攝中的角度索引，只影響高亮顯示；null 代表沒有特定進行中的角度
  // （例如顯示在角度選擇畫面時）。
  activeIndex?: number | null
  // 相機拍攝畫面背景固定深色，用亮色圓點；引導頁背景淺色則要換成強調色，
  // 兩種情境共用同一份邏輯，只切換這組顏色。
  dark?: boolean
  // 相機畫面上的頂部小徽章空間有限，關掉文字標籤只留下圓點＋連接線
  showLabels?: boolean
}

export function CaptureProgressSteps({
  labels,
  doneFlags,
  activeIndex = null,
  dark = false,
  showLabels = true,
}: CaptureProgressStepsProps) {
  const activeColor = dark ? '#fff' : 'var(--accent)'
  const mutedColor = dark ? 'rgba(255,255,255,0.4)' : 'var(--border)'
  const mutedTextColor = dark ? 'rgba(255,255,255,0.6)' : 'var(--text)'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {labels.map((label, i) => {
        const done = doneFlags[i]
        const current = i === activeIndex
        const dotColor = done || current ? activeColor : mutedColor

        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <div
                style={{
                  width: showLabels ? 20 : 12,
                  height: 2,
                  background: mutedColor,
                  marginBottom: showLabels ? 16 : 0,
                }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  display: 'block',
                  width: current ? 11 : 8,
                  height: current ? 11 : 8,
                  borderRadius: '50%',
                  background: done ? dotColor : 'transparent',
                  border: `2px solid ${dotColor}`,
                  boxSizing: 'border-box',
                }}
              />
              {showLabels && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: current ? 700 : 500,
                    color: current || done ? (dark ? '#fff' : 'var(--text-h)') : mutedTextColor,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
