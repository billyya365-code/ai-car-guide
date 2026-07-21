import { CAR_MODEL_IMAGES, type CarModel } from '../config/carModels'

// 首頁中央的車輛主視覺：依目前選擇的車款顯示對應的實際車輛照片（public/car-models/，
// 已去背成透明 PNG，並裁切掉四周多餘的透明留白只留車身本身）。去背後不再需要卡片
// 邊框/陰影把它框起來——那樣反而會露出一個看起來空空的矩形卡片，直接讓車輛本身浮在
// 頁面背景上即可。
//
// 5 張照片來源不同、原始構圖（車身在畫面中佔比、拍攝角度）差異很大，即使都裁到只剩
// 車身本身，車身寬高比仍然各自不同（房車、掀背車、休旅車形狀本來就不一樣）。用固定
// 寬高比的容器＋object-fit: contain 讓每張照片都縮放到同一個「舞台」大小裡展示，
// 車款切換時視覺尺寸才會一致，不會有些看起來明顯比較大或比較小。
const STAGE_ASPECT_RATIO = '19 / 10'

// drop-shadow 濾鏡是依圖片本身的透明度輪廓算陰影（不是矩形 box-shadow），陰影形狀
// 會貼合車身輪廓，比較像實際擺在地上的樣子，找回去背時一併被拿掉的地面陰影立體感。
export interface CarHeroIllustrationProps {
  carModel: CarModel
}

export function CarHeroIllustration({ carModel }: CarHeroIllustrationProps) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 320,
        aspectRatio: STAGE_ASPECT_RATIO,
        margin: '0 auto 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        src={`${import.meta.env.BASE_URL}car-models/${CAR_MODEL_IMAGES[carModel]}`}
        alt=""
        aria-hidden="true"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          filter: 'drop-shadow(0 14px 16px rgba(0,0,0,0.25))',
        }}
      />
    </div>
  )
}
