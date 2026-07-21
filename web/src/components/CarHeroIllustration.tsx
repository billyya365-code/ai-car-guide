import { CAR_MODEL_IMAGES, type CarModel } from '../config/carModels'

// 首頁中央的車輛主視覺：依目前選擇的車款顯示對應的實際車輛照片（public/car-models/，
// 已去背成透明 PNG）。去背後不再需要卡片邊框/陰影把它框起來——那樣反而會露出一個
// 看起來空空的矩形卡片，直接讓車輛本身浮在頁面背景上即可。
//
// drop-shadow 濾鏡是依圖片本身的透明度輪廓算陰影（不是矩形 box-shadow），陰影形狀
// 會貼合車身輪廓，比較像實際擺在地上的樣子，找回去背時一併被拿掉的地面陰影立體感。
export interface CarHeroIllustrationProps {
  carModel: CarModel
}

export function CarHeroIllustration({ carModel }: CarHeroIllustrationProps) {
  return (
    <div style={{ width: '100%', maxWidth: 320, margin: '0 auto 24px' }}>
      <img
        src={`${import.meta.env.BASE_URL}car-models/${CAR_MODEL_IMAGES[carModel]}`}
        alt=""
        aria-hidden="true"
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          filter: 'drop-shadow(0 14px 16px rgba(0,0,0,0.25))',
        }}
      />
    </div>
  )
}
