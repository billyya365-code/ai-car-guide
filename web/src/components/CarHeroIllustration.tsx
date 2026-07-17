// 首頁中央的車輛主視覺：使用者提供的 AI 生成車輛照片（裁切去除文字標籤角度），
// 放在 public/car-angles/hero.png。之後如果有正式品牌插畫/照片，直接換掉這個檔案
// 或改這裡的 src 即可，呼叫端（WelcomePage）不用改動。
export function CarHeroIllustration() {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 320,
        margin: '0 auto 24px',
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: 'var(--shadow)',
      }}
    >
      <img
        src={`${import.meta.env.BASE_URL}car-angles/hero.png`}
        alt=""
        aria-hidden="true"
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
    </div>
  )
}
