import type { GuideBoxProps } from '../components/CameraCapture'

export type CarPosition = 'front_left' | 'front_right' | 'rear_left' | 'rear_right'

export const CAR_POSITIONS: CarPosition[] = ['front_left', 'front_right', 'rear_right', 'rear_left']

export const POSITION_LABELS: Record<CarPosition, string> = {
  front_left: '車頭左側',
  front_right: '車頭右側',
  rear_left: '車尾左側',
  rear_right: '車尾右側',
}

// 拍攝進度指示器空間有限，用簡短版本（左前/右前/左後/右後）取代完整的「車頭左側」
export const POSITION_LABELS_SHORT: Record<CarPosition, string> = {
  front_left: '左前',
  front_right: '右前',
  rear_left: '左後',
  rear_right: '右後',
}

// 座標依使用者提供的 4 張黃金標準照（golden_photos/）估算：在照片上疊加 10% 格線
// 後再讀取車輪/車牌邊界對應的格線位置，比純目視估算精確，但仍非模型逐像素偵測
// 產出。這裡的 xPercent/yPercent/widthPercent/heightPercent 是相對「畫面中央正方形
// 有效拍攝區域」的座標（0~100，由 CameraCapture 依實際寬高比換算回整個畫面），
// 而不是相對整個（直式）畫面——黃金標準照本身是 624x624 正方形，這樣換算後兩者的
// 參考框反而更接近，但實際框選手感仍需在實機上用即時「位置/距離」狀態驗證微調。
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
  // front_right 跟 front_left 是同一台車的左右鏡射視角，座標以 front_left 為基準
  // 鏡像算出（x = 100 − 左邊 x − 寬度，y 沿用左邊的值），大小（寬高）也保持一致。
  front_right: [
    {
      target: 'wheel',
      xPercent: 23,
      yPercent: 49,
      widthPercent: 17,
      heightPercent: 29,
      label: '右前輪',
    },
    {
      target: 'license_plate',
      xPercent: 77,
      yPercent: 56,
      widthPercent: 16,
      heightPercent: 14,
      label: '車牌',
    },
  ],
  rear_left: [
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
      label: '車牌',
    },
  ],
  // rear_right 跟 rear_left 是同一台車的左右鏡射視角，座標以 rear_left 為基準
  // 鏡像算出（x = 100 − 左邊 x − 寬度，y 沿用左邊的值），大小（寬高）也保持一致。
  rear_right: [
    {
      target: 'wheel',
      xPercent: 57,
      yPercent: 55.5,
      widthPercent: 17,
      heightPercent: 29,
      label: '右後輪',
    },
    {
      target: 'license_plate',
      xPercent: 11,
      yPercent: 48,
      widthPercent: 16,
      heightPercent: 14,
      label: '車牌',
    },
  ],
}
