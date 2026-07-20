// 拍照輸出统一轉成正方形，但不裁切——直接裁切會固定丟失原始影格較長那一邊的內容
// （例如車輪或車牌剛好卡在被裁掉的邊緣就整個消失），使用者明確要求不能有這個問題。
// 改用「等比例縮放到能完整放進正方形＋上下或左右補邊」的做法（跟畫面上相機容器
// 用 CSS min() 做 contain-fit 是同一個概念）：整張影格內容都會保留，縮放時寬高用
// 同一個倍率，不會有拉伸變形，只是短邊那側會出現實色補邊。

export const CAPTURE_SQUARE_SIZE = 1024
const LETTERBOX_FILL_COLOR = '#000'

export interface SquareLetterboxTransform {
  scale: number
  offsetXPx: number
  offsetYPx: number
  targetSize: number
}

export function computeSquareLetterboxTransform(
  sourceWidth: number,
  sourceHeight: number,
  targetSize: number = CAPTURE_SQUARE_SIZE,
): SquareLetterboxTransform {
  const scale = targetSize / Math.max(sourceWidth, sourceHeight)
  return {
    scale,
    offsetXPx: (targetSize - sourceWidth * scale) / 2,
    offsetYPx: (targetSize - sourceHeight * scale) / 2,
    targetSize,
  }
}

export interface PercentBox {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

// 把「相對原始影格（0~100%）」的座標，換算成「相對縮放＋補邊後的正方形照片
// （0~100%）」的座標——供任何跟著這張照片一起存下來的框選資訊使用（引導框快照、
// AI 偵測框快照、車牌 OCR 裁切範圍），確保座標跟實際存下來的那張正方形照片對得上。
export function mapPercentBoxToSquare<T extends PercentBox>(
  box: T,
  sourceWidth: number,
  sourceHeight: number,
  transform: SquareLetterboxTransform,
): T {
  const { scale, offsetXPx, offsetYPx, targetSize } = transform
  const xPx = (box.xPercent / 100) * sourceWidth * scale + offsetXPx
  const yPx = (box.yPercent / 100) * sourceHeight * scale + offsetYPx
  const wPx = (box.widthPercent / 100) * sourceWidth * scale
  const hPx = (box.heightPercent / 100) * sourceHeight * scale
  return {
    ...box,
    xPercent: (xPx / targetSize) * 100,
    yPercent: (yPx / targetSize) * 100,
    widthPercent: (wPx / targetSize) * 100,
    heightPercent: (hPx / targetSize) * 100,
  }
}

// 把 <video> 當下畫面畫成固定尺寸的正方形 canvas：先填滿底色，再依 contain-fit
// 換算好的縮放/位移把整張影格畫進去，短邊兩側自然留白，不裁切、不拉伸。
export function drawVideoToSquareCanvas(
  video: HTMLVideoElement,
  targetSize: number = CAPTURE_SQUARE_SIZE,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = targetSize
  canvas.height = targetSize
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = LETTERBOX_FILL_COLOR
  ctx.fillRect(0, 0, targetSize, targetSize)

  const { scale, offsetXPx, offsetYPx } = computeSquareLetterboxTransform(
    video.videoWidth,
    video.videoHeight,
    targetSize,
  )
  ctx.drawImage(
    video,
    0,
    0,
    video.videoWidth,
    video.videoHeight,
    offsetXPx,
    offsetYPx,
    video.videoWidth * scale,
    video.videoHeight * scale,
  )
  return canvas
}
