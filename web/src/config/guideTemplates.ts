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

// 🧪 待校準：因為每個角度模板是固定約 45 度斜角拍攝，車牌實際呈現梯形透視變形，
// 這裡的四角座標應該要反映「變形後的車牌真實四個角落」在裁切框內的相對位置
// （0-1 比例，左上/右上/右下/左下），送進 warpQuadToRect() 拉直後再做 OCR。
//
// 目前先放「不做任何校正」的預設值（完美矩形四角），因為手上沒有黃金標準照無法
// 準確估算實際變形方向與幅度——用猜的座標可能比不校正更糟。正式啟用前務必對照
// golden_photos/ 量測校準，量測方式可比照 GUIDE_TEMPLATES 當初的 10% 格線疊圖法：
// 在車牌裁切圖上找出車牌四個實際角落，換算成相對裁切框的比例座標填入下方。
function identityQuad(): Quad {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]
}

// front_right：依實拍參考照量測車牌四角像素座標換算（見 test_pic/test_platezoom.png，
// 已换算回含 12% 裁切外擴邊界後的相對座標）。其餘三個角度尚待比照同樣方式量測校準。
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
