import type { CarPosition } from '../config/guideTemplates'

// 四個拍攝角度的實際車輛照片（使用者用 Gemini 生成、裁切成單一角度），取代原本手繪
// 的線稿圖示。放在 public/car-angles/ 底下，用 BASE_URL 而非寫死 '/'，部署到
// GitHub Pages 這類子路徑時才能正確解析（見任務 1 的慣例）。
export interface CarAnglePhotoProps {
  position: CarPosition
  size?: number
}

export function CarAnglePhoto({ position, size = 40 }: CarAnglePhotoProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}car-angles/${position}.png`}
      alt=""
      aria-hidden="true"
      style={{
        width: size,
        height: 'auto',
        aspectRatio: '682 / 384',
        objectFit: 'contain',
        flexShrink: 0,
        borderRadius: 6,
      }}
    />
  )
}
