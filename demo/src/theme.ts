import { loadFont } from '@remotion/google-fonts/NotoSansTC'

// 全片統一字體：Noto Sans TC。只載入實際會用到的字重與子集合（繁中 + 拉丁），
// 避免 loadFonts() 預設抓全部字重造成不必要的下載與 render 變慢。
const { fontFamily } = loadFont('normal', {
  weights: ['400', '500', '900'],
  subsets: ['chinese-traditional', 'latin'],
  // Noto Sans TC 這類 CJK 字型在 Google Fonts 上是切成上百個 unicode-range 分片提供，
  // 属正常現象（不是設定錯誤），這裡關掉警告訊息即可。
  ignoreTooManyRequestsWarning: true,
})

export const FONT_FAMILY = fontFamily

// 主標題 Bold/Black、副標題 Medium、內文 Regular 的字重分工，統一從這裡取用，
// 避免各場景各自寫死數字。
export const WEIGHT = {
  title: 900,
  subtitle: 500,
  body: 400,
} as const

// 延伸自 web/src/index.css 的深色主題（--bg、--accent 系列），
// 影片走深色科技風，所以背景比 App 的深色主題再更深一階，其餘沿用同一組藍灰色系，
// 讓 demo 影片的色調跟真正的 App 畫面截圖放在一起時不會突兀。
export const COLORS = {
  bgDeep: '#0a0d10',
  bg: '#14181b',
  bgCard: '#1b2024',
  border: '#2c3338',
  accent: '#93aec2',
  accentStrong: '#b7cbd9',
  textH: '#f5f3ea',
  text: '#b7c2c9',

  // 背景流動光線專用，比上面 UI 用的 accent 系列更飽和、更偏藍，
  // 跟文字/UI 元件的藍灰色分開調，讓背景更有「科技藍」的氛圍感。
  glowDeep: '#15335c',
  glowMid: '#2f6fb0',
  glowBright: '#6fb2e8',

  // 車損標記／狀態色，數值直接取自 web/src/index.css 深色主題的
  // --success/--warning/--danger，跟真正 App 的辨識結果配色一致。
  success: '#a3bb95',
  warning: '#d9b85b',
  danger: '#c98a7a',
} as const

// 對應 web/src/index.css 淺色主題（App 實際介面用的配色），用來在影片的深色背景上
// 忠實重現「輸入車牌」畫面截圖那張卡片本身的樣子——卡片內部維持 App 原本的淺色調，
// 才會像一張真的貼上來的 App 截圖，而不是整個套用影片的深色主題。
export const UI_LIGHT = {
  bg: '#f2f2f5',
  bgCard: '#ffffff',
  border: '#e5e5ea',
  text: '#6b6b70',
  textH: '#1c1c1e',
  accent: '#5e7892',
  accentStrong: '#46596d',
  accentBg: 'rgba(94,120,146,0.1)',
  accentBorder: 'rgba(94,120,146,0.35)',

  // 第二支影片（手機模擬畫面）用的車損/風險等級色，數值直接取自
  // web/src/index.css 亮色主題的 --success/--warning/--danger 系列，
  // 跟真實 App 的亮色介面一致。
  success: '#6b8f5e',
  successBg: 'rgba(142,158,131,0.16)',
  warning: '#ab8a2c',
  warningBg: 'rgba(171,138,44,0.14)',
  danger: '#a85d4e',
  dangerBg: 'rgba(168,93,78,0.14)',
} as const
