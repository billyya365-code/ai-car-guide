import type { GuideBoxProps } from '../components/CameraCapture'
import type { Quad } from '../lib/perspective'

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
      xPercent: 20,
      yPercent: 51,
      widthPercent: 23,
      heightPercent: 29,
      label: '右前輪',
    },
    {
      target: 'license_plate',
      xPercent: 78,
      yPercent: 60,
      widthPercent: 19,
      heightPercent: 16,
      label: '車牌',
    },
  ],
  back_left: [
    {
      target: 'wheel',
      xPercent: 26,
      yPercent: 56,
      widthPercent: 17,
      heightPercent: 28,
      label: '左後輪',
    },
    {
      target: 'license_plate',
      xPercent: 74,
      yPercent: 50,
      widthPercent: 14,
      heightPercent: 10,
      label: '車牌）',
    },
  ],
  back_right: [
    {
      target: 'wheel',
      xPercent: 59,
      yPercent: 56,
      widthPercent: 21,
      heightPercent: 31,
      label: '右後輪',
    },
    {
      target: 'license_plate',
      xPercent: 5,
      yPercent: 49,
      widthPercent: 19,
      heightPercent: 13,
      label: '車牌）',
    },
  ],
}

// 🧪 用於「梯形校正 vs 不校正」並排比較（見 usePlateOCR.ts），只有 front_right 有依
// 實拍參考照量測的校準值，其餘三個角度尚待比照同樣方式量測校準，暫用不校正的
// 預設值（完美矩形四角）。
function identityQuad(): Quad {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]
}

export const PLATE_SKEW_CORNERS: Record<CarPosition, Quad> = {
  front_left: identityQuad(),
  front_right: [
    { x: 0.11, y: 0.435 },
    { x: 0.903, y: 0.097 },
    { x: 0.876, y: 0.519 },
    { x: 0.097, y: 0.903 },
  ],
  back_left: identityQuad(),
  back_right: identityQuad(),
}
