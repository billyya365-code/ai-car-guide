import type { GuideBoxProps } from '../components/CameraCapture'

export type CarPosition = 'front_left' | 'front_right' | 'back_left' | 'back_right'

export const CAR_POSITIONS: CarPosition[] = ['front_left', 'front_right', 'back_left', 'back_right']

export const POSITION_LABELS: Record<CarPosition, string> = {
  front_left: '車頭左側',
  front_right: '車頭右側',
  back_left: '車尾左側',
  back_right: '車尾右側',
}

// 座標依使用者提供的 4 張黃金標準照（golden_photos/）估算：在照片上疊加 10% 格線
// 後再讀取車輪/車牌邊界對應的格線位置，比純目視估算精確，但仍非模型逐像素偵測
// 產出。黃金標準照本身是 624x624 正方形，跟實機拍攝的直式（約 3:4）畫面比例不同
// ——因為是各自獨立的百分比座標（寬/高分別計算，不受容器長寬比影響），理論上仍
// 可套用，但實際框選手感仍需在實機上用任務 6 的即時「位置/距離」除錯數字驗證。
export const GUIDE_TEMPLATES: Record<CarPosition, GuideBoxProps[]> = {
  front_left: [
    {
      target: 'wheel',
      xPercent: 60,
      yPercent: 49,
      widthPercent: 17,
      heightPercent: 29,
      label: '左前輪',
    },
    {
      target: 'license_plate',
      xPercent: 7,
      yPercent: 56,
      widthPercent: 16,
      heightPercent: 14,
      label: '車牌',
    },
  ],
  front_right: [
    {
      target: 'wheel',
      xPercent: 23,
      yPercent: 51,
      widthPercent: 17,
      heightPercent: 29,
      label: '右前輪',
    },
    {
      target: 'license_plate',
      xPercent: 79.5,
      yPercent: 61,
      widthPercent: 16,
      heightPercent: 14,
      label: '車牌',
    },
  ],
  back_left: [
    {
      target: 'wheel',
      xPercent: 26,
      yPercent: 55.5,
      widthPercent: 17,
      heightPercent: 29,
      label: '左後輪',
    },
    {
      target: 'license_plate',
      xPercent: 73,
      yPercent: 48,
      widthPercent: 16,
      heightPercent: 14,
      label: '車牌）',
    },
  ],
  back_right: [
    {
      target: 'wheel',
      xPercent: 61,
      yPercent: 57,
      widthPercent: 17,
      heightPercent: 29,
      label: '右後輪',
    },
    {
      target: 'license_plate',
      xPercent: 6.5,
      yPercent: 48.5,
      widthPercent: 16,
      heightPercent: 14,
      label: '車牌）',
    },
  ],
}
