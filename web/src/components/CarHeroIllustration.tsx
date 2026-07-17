// 首頁中央的車輛主視覺：使用者提供的 AI 生成車輛照片，已去背成透明 PNG，放在
// public/car-angles/hero.png。去背後不再需要卡片邊框/陰影把它框起來——那樣反而會
// 露出一個看起來空空的矩形卡片，直接讓車輛本身浮在頁面背景上即可。之後如果有正式
// 品牌插畫/照片，直接換掉這個檔案或改這裡的 src 即可，呼叫端（WelcomePage）不用改動。
//
// drop-shadow 濾鏡是依圖片本身的透明度輪廓算陰影（不是矩形 box-shadow），陰影形狀
// 會貼合車身輪廓，比較像實際擺在地上的樣子，找回去背時一併被拿掉的地面陰影立體感。
export function CarHeroIllustration() {
  return (
    <div style={{ width: '100%', maxWidth: 320, margin: '0 auto 24px' }}>
      <img
        src={`${import.meta.env.BASE_URL}car-angles/hero.png`}
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
