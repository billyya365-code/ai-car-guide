// 首頁中央的車輛插圖佔位（placeholder）：沿用 CarAngleIcon 的簡化車身線稿風格
// （3/4 角度示意），維持全站插畫語彙一致；之後有真正的插畫/照片時直接整個替換
// 這個元件即可，呼叫端（WelcomePage）不用改動。
export function CarHeroIllustration() {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 260,
        aspectRatio: '1',
        margin: '0 auto 24px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--accent-bg) 0%, transparent 72%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="70%" viewBox="0 0 100 60" fill="none" aria-hidden="true">
        <path
          d="M10 46 L8 40 L8 34 L16 24 L32 12 L62 12 C70 12 76 16 78 22 L90 30 L90 46 Z"
          stroke="var(--accent-strong)"
          strokeOpacity={0.9}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
        <path d="M34 14 L26 24" stroke="var(--accent-strong)" strokeOpacity={0.5} strokeWidth={1.6} />
        <path d="M46 12 L44 46" stroke="var(--accent-strong)" strokeOpacity={0.4} strokeWidth={1.4} />
        <circle cx={24} cy={46} r={7} stroke="var(--accent-strong)" strokeOpacity={0.9} strokeWidth={2.4} />
        <circle cx={78} cy={46} r={7} stroke="var(--accent-strong)" strokeOpacity={0.9} strokeWidth={2.4} />
      </svg>
    </div>
  )
}
