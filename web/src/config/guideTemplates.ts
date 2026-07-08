import type { GuideBoxProps } from '../components/CameraCapture'

export type CarPosition = 'front_left' | 'front_right' | 'back_left' | 'back_right'

export const CAR_POSITIONS: CarPosition[] = ['front_left', 'front_right', 'back_left', 'back_right']

export const POSITION_LABELS: Record<CarPosition, string> = {
  front_left: '車頭左側',
  front_right: '車頭右側',
  back_left: '車尾左側',
  back_right: '車尾右側',
}

// ⚠️ 目前座標為暫定示範值（左右鏡像），尚未用實際黃金標準照校準。
// 對應文件「待確認事項 1」：是否每個方位都需要一張黃金標準照來換算精確的百分比座標，
// 待確認後、任務 6 串接 AI 視覺定位時，這裡的數值需要用真實照片重新校準。
// 每個方位同時包含 wheel 與 license_plate 兩個引導框，對應任務 2 模型的兩個偵測類別。
export const GUIDE_TEMPLATES: Record<CarPosition, GuideBoxProps[]> = {
  front_left: [
    {
      target: 'wheel',
      xPercent: 10,
      yPercent: 50,
      widthPercent: 35,
      heightPercent: 35,
      label: '左前輪（示範，待校準）',
    },
    {
      target: 'license_plate',
      xPercent: 40,
      yPercent: 60,
      widthPercent: 20,
      heightPercent: 10,
      label: '車牌（示範，待校準）',
    },
  ],
  front_right: [
    {
      target: 'wheel',
      xPercent: 55,
      yPercent: 50,
      widthPercent: 35,
      heightPercent: 35,
      label: '右前輪（示範，待校準）',
    },
    {
      target: 'license_plate',
      xPercent: 40,
      yPercent: 60,
      widthPercent: 20,
      heightPercent: 10,
      label: '車牌（示範，待校準）',
    },
  ],
  back_left: [
    {
      target: 'wheel',
      xPercent: 10,
      yPercent: 45,
      widthPercent: 35,
      heightPercent: 35,
      label: '左後輪（示範，待校準）',
    },
    {
      target: 'license_plate',
      xPercent: 40,
      yPercent: 55,
      widthPercent: 20,
      heightPercent: 10,
      label: '車牌（示範，待校準）',
    },
  ],
  back_right: [
    {
      target: 'wheel',
      xPercent: 55,
      yPercent: 45,
      widthPercent: 35,
      heightPercent: 35,
      label: '右後輪（示範，待校準）',
    },
    {
      target: 'license_plate',
      xPercent: 40,
      yPercent: 55,
      widthPercent: 20,
      heightPercent: 10,
      label: '車牌（示範，待校準）',
    },
  ],
}
