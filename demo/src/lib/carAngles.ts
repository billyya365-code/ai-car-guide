// 車輛四角度共用設定，AiGuideCapture（正式場景）跟 Calibration（給使用者自己讀座標的
// 工具頁）都吃同一份設定，確保在校正工具上看到的畫面／座標跟正式影片裡完全一致。

export const POSITIONS = ['front_left', 'front_right', 'rear_right', 'rear_left'] as const
export type Position = (typeof POSITIONS)[number]

export const LABELS: Record<Position, string> = {
  front_left: '車頭左側',
  front_right: '車頭右側',
  rear_right: '車尾右側',
  rear_left: '車尾左側',
}

// 車輛照片本身是完整車身側前/側後 3/4 視角（車頭在其中一側、車尾在另一側），
// 這裡只放大保留「重點那一半」：車頭角度只留車頭那一半、車尾角度只留車尾那一半。
// 裁切方向依各張圖實際車頭/車尾在圖片哪一側而定。
export const CROP_SIDE: Record<Position, 'left' | 'right'> = {
  front_left: 'left',
  front_right: 'right',
  rear_right: 'left',
  rear_left: 'right',
}

// 裁切比例：顯示原圖寬度的 1/CROP_ZOOM。2 = 剛好裁一半，數字越小裁得越少（保留更多車身）。
export const CROP_ZOOM = 1.5

export interface GuideBox {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

// 車輪／車牌偵測框座標，相對「裁切＋放大後、實際顯示出來那一半」畫面的
// xPercent/yPercent/寬高%。可以到 Calibration composition 對照格線自行調整這裡的數字。
export const GUIDE_BOXES: Record<Position, { wheel: GuideBox; plate: GuideBox }> = {
  front_left: {
    wheel: { xPercent: 65, yPercent: 50, widthPercent: 22, heightPercent: 30 },
    plate: { xPercent: 15, yPercent: 57, widthPercent: 20, heightPercent: 8 },
  },
  front_right: {
    wheel: { xPercent: 20, yPercent: 50, widthPercent: 22, heightPercent: 30 },
    plate: { xPercent: 72, yPercent: 57, widthPercent: 20, heightPercent: 8 },
  },
  rear_right: {
    wheel: { xPercent: 66, yPercent: 51, widthPercent: 22, heightPercent: 30 },
    plate: { xPercent: 16, yPercent: 48, widthPercent: 20, heightPercent: 8 },
  },
  rear_left: {
    wheel: { xPercent: 17, yPercent: 51, widthPercent: 22, heightPercent: 30 },
    plate: { xPercent: 68, yPercent: 48, widthPercent: 20, heightPercent: 8 },
  },
}
