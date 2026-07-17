// 首頁中央的車輛插圖佔位（placeholder）：比原本純線稿再精緻一點的向量插畫——車身
// 用漸層模擬烤漆光澤、加一條高光線、輪胎用放射漸層模擬鋁圈質感，但終究是 SVG/CSS
// 畫出來的向量圖，不是照片級的 3D 渲染（這個環境沒有圖像生成工具，畫不出那種效果）。
// 之後若有真正的插畫或實際車輛照片，直接整個替換這個元件即可，呼叫端（WelcomePage）
// 不用改動。
export function CarHeroIllustration() {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 300,
        margin: '0 auto 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="100%" viewBox="0 0 240 110" aria-hidden="true">
        <defs>
          <linearGradient id="hero-car-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: '#93acbf' }} />
            <stop offset="50%" style={{ stopColor: 'var(--accent)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--accent-strong)' }} />
          </linearGradient>
          <linearGradient id="hero-car-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: '#d3dee5', stopOpacity: 0.95 }} />
            <stop offset="100%" style={{ stopColor: '#7f95a1', stopOpacity: 0.55 }} />
          </linearGradient>
          <radialGradient id="hero-car-wheel" cx="35%" cy="32%" r="75%">
            <stop offset="0%" style={{ stopColor: '#dfe4e7' }} />
            <stop offset="55%" style={{ stopColor: '#6b7680' }} />
            <stop offset="100%" style={{ stopColor: '#181c1f' }} />
          </radialGradient>
          <radialGradient id="hero-car-shadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.3)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        <ellipse cx="120" cy="90" rx="104" ry="8" fill="url(#hero-car-shadow)" />

        {/* 車身：低車身、長引擎蓋的跑車輪廓 */}
        <path
          d="M8 68 C8 62 12 58 20 56 L34 53 C42 40 56 27 78 22 C96 18 118 17 138 19
             C156 21 168 27 176 36 L188 52 L214 56 C224 58 230 63 231 69 L229 74 L8 74 Z"
          fill="url(#hero-car-body)"
          stroke="var(--accent-strong)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* 車窗 */}
        <path
          d="M40 53 C48 39 60 29 78 25 C94 21 112 20 128 22 L124 53 Z"
          fill="url(#hero-car-glass)"
        />
        <path d="M128 22 C142 24 154 29 163 37 L172 53 L128 53 Z" fill="url(#hero-car-glass)" />
        <path d="M124 22 L126 53" stroke="var(--accent-strong)" strokeWidth={1} opacity={0.5} />

        {/* 車肩線高光，模擬烤漆反光 */}
        <path
          d="M22 58 C70 50 170 50 218 60"
          stroke="#eef4f7"
          strokeWidth={2.2}
          strokeLinecap="round"
          opacity={0.6}
          fill="none"
        />

        {/* 車門線 */}
        <path d="M150 24 L146 68" stroke="var(--accent-strong)" strokeWidth={1} opacity={0.35} />

        {/* 輪胎 */}
        <circle cx="62" cy="72" r="16" fill="url(#hero-car-wheel)" stroke="#1a1f24" strokeWidth={1.5} />
        <circle cx="62" cy="72" r="5.5" fill="#e4e8ea" />
        <circle cx="188" cy="72" r="16" fill="url(#hero-car-wheel)" stroke="#1a1f24" strokeWidth={1.5} />
        <circle cx="188" cy="72" r="5.5" fill="#e4e8ea" />
      </svg>
    </div>
  )
}
