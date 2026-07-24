// Page 4（UploadAnalysis）→ Page 5（ResultReveal）的交接參數。這兩頁改成真的
// 時間軸重疊（見 Root.tsx 用 Series.Sequence 的負 offset 讓 ResultReveal 提早
// 開始播放），不是用 CrossFade 轉場效果模擬——UploadAnalysis 尾端雲朵原地縮小
// 淡出，跟 ResultReveal 開頭主照片從同一個位置「長出來」，兩個動作要花一樣長
// 的時間、共用同一段重疊窗口才會對得起來，所以抽成共用常數，不要兩邊各自寫
// 一份數字容易兜不齊。
export const HANDOFF_OVERLAP_FRAMES = 30
