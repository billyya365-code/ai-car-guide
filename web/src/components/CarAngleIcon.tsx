import type { CarPosition } from '../config/guideTemplates'

// 簡化的車輛側視圖示（3/4 角度示意，車頭/車尾其中一端畫成略為收窄的斜面，暗示
// 「從前方/後方角落看過去」的透視感），橘色圓點標示現在要拍攝的角落。基礎圖形固定
// 畫成「車頭朝左」，right 系列直接把整張圖水平鏡像（含標記點），不用另外算座標。
const FRONT_MARKER = { cx: 12, cy: 38 }
const BACK_MARKER = { cx: 86, cy: 38 }

const MARKER_BY_POSITION: Record<CarPosition, { cx: number; cy: number }> = {
  front_left: FRONT_MARKER,
  front_right: FRONT_MARKER,
  back_left: BACK_MARKER,
  back_right: BACK_MARKER,
}

const MIRRORED_POSITIONS = new Set<CarPosition>(['front_right', 'back_right'])

export interface CarAngleIconProps {
  position: CarPosition
  size?: number
  // 車身線條顏色：相機滿版畫面背景固定深色，用白色；淺色頁面背景（拍攝前的引導頁）
  // 則要換成深色線條才看得清楚，兩種情境共用同一份圖示，只換這個顏色即可。
  color?: string
}

export function CarAngleIcon({ position, size = 40, color = '#fff' }: CarAngleIconProps) {
  const marker = MARKER_BY_POSITION[position]
  const mirrored = MIRRORED_POSITIONS.has(position)

  return (
    <svg
      width={size}
      height={size * 0.6}
      viewBox="0 0 100 60"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <g transform={mirrored ? 'matrix(-1,0,0,1,100,0)' : undefined}>
        {/* 車身輪廓（側視，其中一端收窄暗示前/後角落透視感） */}
        <path
          d="M10 46 L8 40 L8 34 L16 24 L32 12 L62 12 C70 12 76 16 78 22 L90 30 L90 46 Z"
          stroke={color}
          strokeOpacity={0.85}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
        {/* 擋風玻璃、車門線 */}
        <path d="M34 14 L26 24" stroke={color} strokeOpacity={0.5} strokeWidth={1.4} />
        <path d="M46 12 L44 46" stroke={color} strokeOpacity={0.4} strokeWidth={1.2} />
        {/* 兩個輪胎 */}
        <circle cx={24} cy={46} r={7} stroke={color} strokeOpacity={0.85} strokeWidth={2.2} />
        <circle cx={78} cy={46} r={7} stroke={color} strokeOpacity={0.85} strokeWidth={2.2} />
        {/* 目前拍攝角落標記 */}
        <circle cx={marker.cx} cy={marker.cy} r={6} fill="#ff9f0a" stroke="#1c1c1e" strokeWidth={1.5} />
      </g>
    </svg>
  )
}
