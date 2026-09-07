// 車輛四角度共用設定，AiGuideCapture（正式場景）跟 Calibration（給使用者自己讀座標的
// 工具頁）都吃同一份設定，確保在校正工具上看到的畫面／座標跟正式影片裡完全一致。
//
// 這組照片改成真實拍攝的 Corolla Altis 4 角度照（見 D:\AI_Car_Guide\car_plate_ocr\
// ChatGPT Image...png 來源，去背+補陰影處理過，front_right 是 front_left 的水平鏡像，
// 因為原始素材那兩張角度太像、不是真的鏡像對稱）之後，每張本身就已經是單一角度的
// 特寫（不是像舊的 CGI 那樣一張圖橫跨車頭到車尾、需要再裁一半），改成單純
// object-fit: cover 置中裁切成正方形即可，不再需要 CROP_SIDE/CROP_ZOOM 這組設定。

export const POSITIONS = ['front_left', 'front_right', 'rear_right', 'rear_left'] as const
export type Position = (typeof POSITIONS)[number]

export const LABELS: Record<Position, string> = {
  front_left: '車頭左側',
  front_right: '車頭右側',
  rear_right: '車尾右側',
  rear_left: '車尾左側',
}

export interface GuideBox {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

// 車輪／車牌偵測框座標，相對「object-fit: cover 置中裁成正方形後」實際顯示出來
// 那個正方形畫面的 xPercent/yPercent/寬高%。可以到 Calibration composition 對照
// 格線自行調整這裡的數字。
export const GUIDE_BOXES: Record<Position, { wheel: GuideBox; plate: GuideBox }> = {
  front_left: {
    wheel: { xPercent: 50, yPercent: 60, widthPercent: 22, heightPercent: 32 },
    plate: { xPercent: 2, yPercent: 66, widthPercent: 18, heightPercent: 14 },
  },
  front_right: {
    wheel: { xPercent: 28, yPercent: 60, widthPercent: 22, heightPercent: 32 },
    plate: { xPercent: 80, yPercent: 66, widthPercent: 18, heightPercent: 14 },
  },
  rear_right: {
    wheel: { xPercent: 28, yPercent: 60, widthPercent: 22, heightPercent: 28 },
    plate: { xPercent: 78, yPercent: 48, widthPercent: 18, heightPercent: 11 },
  },
  rear_left: {
    wheel: { xPercent: 50, yPercent: 60, widthPercent: 22, heightPercent: 28 },
    plate: { xPercent: 4, yPercent: 48, widthPercent: 18, heightPercent: 11 },
  },
}
