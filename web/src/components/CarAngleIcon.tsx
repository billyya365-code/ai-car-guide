import type { CarPosition } from '../config/guideTemplates'

// 簡化的俯視角車輛示意圖：車頭朝上，四個角落用小方塊代表輪胎，金色圓點標示
// 「現在要拍攝哪一個角落」，讓使用者不用讀文字也能一眼看懂該站在車輛的哪個角度拍攝。
const MARKER_POSITION: Record<CarPosition, { cx: number; cy: number }> = {
  front_left: { cx: 8, cy: 16 },
  front_right: { cx: 40, cy: 16 },
  back_left: { cx: 8, cy: 48 },
  back_right: { cx: 40, cy: 48 },
}

export interface CarAngleIconProps {
  position: CarPosition
  size?: number
  // 車身線條顏色：相機滿版畫面背景固定深色，用白色；淺色頁面背景（拍攝前的引導頁）
  // 則要換成深色線條才看得清楚，兩種情境共用同一個圖示，只換這個顏色即可。
  color?: string
}

export function CarAngleIcon({ position, size = 32, color = '#fff' }: CarAngleIconProps) {
  const marker = MARKER_POSITION[position]
  return (
    <svg
      width={size}
      height={(size * 64) / 48}
      viewBox="0 0 48 64"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* 車身 */}
      <rect x="10" y="8" width="28" height="48" rx="8" stroke={color} strokeOpacity="0.85" strokeWidth="2" />
      {/* 車頭方向指示（擋風玻璃＋箭頭） */}
      <path d="M15 20 h18" stroke={color} strokeOpacity="0.5" strokeWidth="1.5" />
      <path d="M20 6 L24 2 L28 6" stroke={color} strokeOpacity="0.6" strokeWidth="1.5" fill="none" />
      {/* 四個輪胎 */}
      <rect x="5" y="14" width="5" height="11" rx="2.5" fill={color} fillOpacity="0.5" />
      <rect x="38" y="14" width="5" height="11" rx="2.5" fill={color} fillOpacity="0.5" />
      <rect x="5" y="39" width="5" height="11" rx="2.5" fill={color} fillOpacity="0.5" />
      <rect x="38" y="39" width="5" height="11" rx="2.5" fill={color} fillOpacity="0.5" />
      {/* 目前拍攝角落標記 */}
      <circle cx={marker.cx} cy={marker.cy} r="6" fill="#d9b85b" stroke="#23261d" strokeWidth="1.5" />
    </svg>
  )
}
