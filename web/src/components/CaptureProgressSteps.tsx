// 拍攝進度視覺化：●──●──○──○ 這種連接式步驟指示器，取代單純的「2 / 4」文字，
// 讓使用者一眼看出目前拍到第幾個角度、還剩哪些角度沒拍，而不用心算數字。
export interface CaptureProgressStepsProps {
  // 目前所在的步驟（0-based）；大於等於 labels.length 代表全部完成
  currentIndex: number
  labels: string[]
  // 相機拍攝畫面背景固定深色，用亮色圓點；引導頁背景淺色則要換成強調色，
  // 兩種情境共用同一份邏輯，只切換這組顏色。
  dark?: boolean
  // 相機畫面上的頂部小徽章空間有限，關掉文字標籤只留下圓點＋連接線
  showLabels?: boolean
}

export function CaptureProgressSteps({
  currentIndex,
  labels,
  dark = false,
  showLabels = true,
}: CaptureProgressStepsProps) {
  const activeColor = dark ? '#fff' : 'var(--accent)'
  const mutedColor = dark ? 'rgba(255,255,255,0.4)' : 'var(--border)'
  const mutedTextColor = dark ? 'rgba(255,255,255,0.6)' : 'var(--text)'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {labels.map((label, i) => {
        const done = i < currentIndex
        const current = i === currentIndex
        const dotColor = done || current ? activeColor : mutedColor
        const lineActive = i <= currentIndex

        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <div
                style={{
                  width: showLabels ? 20 : 12,
                  height: 2,
                  background: lineActive ? activeColor : mutedColor,
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
                  background: done || current ? dotColor : 'transparent',
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
