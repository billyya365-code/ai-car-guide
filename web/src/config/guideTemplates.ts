import type { GuideBoxProps } from '../components/CameraCapture'

export type CarPosition = 'front_left' | 'front_right' | 'back_left' | 'back_right'

export const CAR_POSITIONS: CarPosition[] = ['front_left', 'front_right', 'back_left', 'back_right']

export const POSITION_LABELS: Record<CarPosition, string> = {
  front_left: '車頭左側',
  front_right: '車頭右側',
  back_left: '車尾左側',
  back_right: '車尾右側',
}

// 座標依使用者提供的 4 張黃金標準照（golden_photos/）目視估算（無像素級量測工具，
// 用格線比例判斷），精確度為第一版估算值，非模型偵測產出。黃金標準照本身是 624x624
// 正方形，跟實機拍攝的直式（約 3:4）畫面比例不同——因為是各自獨立的百分比座標
// （寬/高分別計算，不受容器長寬比影響），理論上仍可套用，但實際框選手感仍需在
// 實機上用任務 6 的即時「位置/距離」除錯數字驗證、視情況微調。
export const GUIDE_TEMPLATES: Record<CarPosition, GuideBoxProps[]> = {
  front_left: [
    {
      target: 'wheel',
      xPercent: 2,
      yPercent: 60,
      widthPercent: 18,
      heightPercent: 28,
      label: '左前輪（依黃金標準照估算）',
    },
    {
      target: 'license_plate',
      xPercent: 9,
      yPercent: 55,
      widthPercent: 22,
      heightPercent: 10,
      label: '車牌（依黃金標準照估算）',
    },
  ],
  front_right: [
    {
      target: 'wheel',
      xPercent: 26,
      yPercent: 60,
      widthPercent: 22,
      heightPercent: 25,
      label: '右前輪（依黃金標準照估算）',
    },
    {
      target: 'license_plate',
      xPercent: 68,
      yPercent: 58,
      widthPercent: 22,
      heightPercent: 10,
      label: '車牌（依黃金標準照估算）',
    },
  ],
  back_left: [
    {
      target: 'wheel',
      xPercent: 5,
      yPercent: 65,
      widthPercent: 23,
      heightPercent: 25,
      label: '左後輪（依黃金標準照估算）',
    },
    {
      target: 'license_plate',
      xPercent: 62,
      yPercent: 58,
      widthPercent: 20,
      heightPercent: 10,
      label: '車牌（依黃金標準照估算）',
    },
  ],
  back_right: [
    {
      target: 'wheel',
      xPercent: 68,
      yPercent: 62,
      widthPercent: 24,
      heightPercent: 23,
      label: '右後輪（依黃金標準照估算）',
    },
    {
      target: 'license_plate',
      xPercent: 6,
      yPercent: 60,
      widthPercent: 22,
      heightPercent: 10,
      label: '車牌（依黃金標準照估算）',
    },
  ],
}
