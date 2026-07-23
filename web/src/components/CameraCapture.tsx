import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Camera } from 'lucide-react'
import * as tf from '@tensorflow/tfjs'
import { useCameraCapture } from '../platform/useCameraCapture'
import { useSensorPermission, type SensorPermissionState } from '../platform/useSensorPermission'
import { useGeolocation, type CaptureLocation, type GeolocationPermissionState } from '../platform/useGeolocation'
import { useOrientationGuard } from '../platform/useOrientationGuard'
import { useGyroscopeGuard } from '../platform/useGyroscopeGuard'
import { GUIDANCE_MESSAGES, GuidanceCheck, useGuidanceStateMachine } from '../hooks/useGuidanceStateMachine'
import {
  DISTANCE_DIRECTION_MESSAGES,
  POSITION_DIRECTION_MESSAGES,
  useVisionGuidance,
  type DetectedBox,
} from '../hooks/useVisionGuidance'
import { useBlurDetection } from '../hooks/useBlurDetection'
import { usePlateOCR } from '../hooks/usePlateOCR'
import { computeSquareLetterboxTransform, mapPercentBoxToSquare } from '../lib/squareLetterbox'
import { AutoShutter, type CaptureMode } from './AutoShutter'

// 內層引導方格的定位參數：相對外層相機容器的百分比座標（不是絕對像素），
// 之後四個方位模板（front_left / front_right / rear_left / rear_right）各自傳入不同數值。
// target 對應任務 2 模型的兩個偵測類別，之後任務 6 會用這個欄位比對 AI 偵測結果落在哪一個引導框內。
export interface GuideBoxProps {
  target: 'wheel' | 'license_plate'
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
  label?: string
}

// 拍照當下一併記錄的中繼資料，供之後（任務 9 串接後端）判斷照片品質/佐證拍攝條件
// 使用。guideBoxes/detectedBoxes 都是「相對 image 這張縮放＋補邊後的正方形照片
// （0~100%）」的座標（見 lib/squareLetterbox.ts 的 mapPercentBoxToSquare 換算），
// 不是 guideTemplates.ts 原始定義的「相對中央正方形有效拍攝區域」座標，也不是原始
// 影格（未經正方形轉換）的座標——三者都不一樣，取用時要注意對應到哪一套。
export interface CapturedPhoto {
  image: string
  capturedAt: string
  guideBoxes: GuideBoxProps[]
  detectedBoxes: DetectedBox[]
  sharpnessVariance: number | null
  location: CaptureLocation | null
  captureMode: CaptureMode
}

// 靜態目標引導框（黃金位置）：白色半透明虛線，代表「該對準的位置」——比原本的實心
// 灰色更輕、更不搶畫面，同時跟即時偵測框的藍/綠有明顯區隔（一個是「目標」一個是
// 「目前狀態」）。
const GUIDE_BOX_COLOR = 'rgba(255,255,255,0.75)'
// 即時偵測框：中心點落在對應的虛線引導框內時為綠色（已對準／完全符合），框外時為
// 藍色（已辨識到、但尚未對準——比橘色更中性、更有「AI 正在追蹤」的科技感，不會讓
// 使用者誤以為是警示/錯誤色）。
const DETECTED_BOX_COLOR_INSIDE = '#22c55e'
const DETECTED_BOX_COLOR_OUTSIDE = '#3b82f6'

// 拍攝畫面上所有浮動小標籤/提示的共用底色：黑色不透明度＋毛玻璃模糊，取代原本
// 實心的深色/警示色色塊——讓文字/圖示還讀得到，但不會像一塊不透明貼紙蓋在畫面上，
// 相機即時畫面本身才是主角，狀態顏色改用文字顏色表達（紅字＝錯誤、琥珀＝提示）。
// 底色不透明度先前從 0.4 降到 0.22 時，毛玻璃霧面模糊感也跟著淡到快看不出來，
// 曾改回 0.3 平衡兩者；後來陸續調到 0.2＋blur 22px、0.12＋blur 28px、0.07＋
// blur 32px，這次改成 0.05＋blur 28px（模糊強度稍微收回一點，試試看透明度更低
// 但模糊不用一直往上加是否也還撐得住質感）。
const FROSTED_GLASS_STYLE: CSSProperties = {
  background: 'rgba(0,0,0,0.05)',
  backdropFilter: 'blur(28px)',
  WebkitBackdropFilter: 'blur(28px)',
}

// 只用偵測框「中心點」是否落在引導框矩形範圍內判斷，不要求偵測框整個框完全被包住
// （引導框跟偵測框大小本來就不會完全一致，用中心點夠直覺也夠穩定）。
function isCenterInsideGuideBox(centerXPercent: number, centerYPercent: number, guideBox: GuideBoxProps): boolean {
  return (
    centerXPercent >= guideBox.xPercent &&
    centerXPercent <= guideBox.xPercent + guideBox.widthPercent &&
    centerYPercent >= guideBox.yPercent &&
    centerYPercent <= guideBox.yPercent + guideBox.heightPercent
  )
}

interface FrameRect {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

// 中央「有效拍攝區域」：畫面上實際呈現出來的正方形（依真實的寬高比換算，而非單純
// 假設引導框的百分比座標系統本身是正方形），吃滿畫面較短的那一邊、置中裁切較長的那邊。
// aspectRatio 未知時（尚未量到影格尺寸）直接視為滿版，避免畫面短暫閃一塊遮罩。
function computeEffectiveAreaRect(aspectRatio: number | null): FrameRect {
  if (!aspectRatio) return { xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100 }
  if (aspectRatio >= 1) {
    const widthPercent = 100 / aspectRatio
    return { xPercent: (100 - widthPercent) / 2, yPercent: 0, widthPercent, heightPercent: 100 }
  }
  const heightPercent = 100 * aspectRatio
  return { xPercent: 0, yPercent: (100 - heightPercent) / 2, widthPercent: 100, heightPercent }
}

// guideTemplates.ts 裡的引導框座標現在是「相對於中央正方形有效拍攝區域」的百分比
// （0~100 為正方形內部），而不是相對於整個畫面——這樣不同手機寬高比下，引導框永遠
// 會落在使用者看得到的正方形範圍內，不會被裁到遮罩底下。這裡換算回「相對整個畫面」
// 的百分比，供渲染定位與 useVisionGuidance 的偵測比對使用（兩者都是以整個畫面為基準）。
function squareRelativeToFrame(box: FrameRect, square: FrameRect): FrameRect {
  return {
    xPercent: square.xPercent + (box.xPercent / 100) * square.widthPercent,
    yPercent: square.yPercent + (box.yPercent / 100) * square.heightPercent,
    widthPercent: (box.widthPercent / 100) * square.widthPercent,
    heightPercent: (box.heightPercent / 100) * square.heightPercent,
  }
}

// 快門觸發瞬間的全螢幕閃白效果時長（模擬「螢幕截圖」的視覺回饋，讓使用者清楚感受
// 到「有拍到」）。車牌號碼辨識刻意延後到這段效果播完才開始（見下方 runPlateRecognition
// 的觸發 useEffect），視覺上才會是「先拍照 → 才核對車牌」而不是兩件事疊在一起發生。
const CAPTURE_FLASH_MS = 200

// 把拍下來的 dataURL 載入成 <img>，車牌辨識要對著這張「凍結」的照片跑，而不是
// 一直讀取還在播放的即時 <video>——見下方 runPlateRecognition 的說明。
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('載入拍攝照片失敗'))
    img.src = src
  })
}

const SENSOR_PERMISSION_LABELS: Record<SensorPermissionState, string> = {
  granted: '已授權',
  denied: '已拒絕（將使用手動拍照模式）',
  not_required: '不需要授權（Android/桌機）',
}

const GEOLOCATION_PERMISSION_LABELS: Record<GeolocationPermissionState, string> = {
  granted: '已取得',
  denied: '已拒絕/逾時',
  unsupported: '裝置不支援',
}

// 簡潔狀態列的短標籤（取代原本的原始數值除錯文字）
const STATUS_CHIP_LABELS: Record<string, string> = {
  [GuidanceCheck.LEVEL]: '水平',
  [GuidanceCheck.UPRIGHT]: '直立',
  [GuidanceCheck.POSITION]: '位置',
  [GuidanceCheck.DISTANCE]: '距離',
  [GuidanceCheck.SHARPNESS]: '清晰',
}
// 水平/直立這兩項判斷邏輯仍然存在（陀螺儀資料照樣影響 activeGuidance/自動快門
// 是否觸發，見下方 useGuidanceStateMachine 呼叫），只是使用者要求拍照引導畫面上
// 不要再顯示這兩項相關的說明文字/狀態，只保留位置、距離、清晰度這幾項——所以這裡
// 刻意不放 LEVEL/UPRIGHT，跟下方 guidanceMessage 的判斷（略過這兩個狀態不顯示提示）
// 要一起看。
const STATUS_CHIP_ORDER = [GuidanceCheck.POSITION, GuidanceCheck.DISTANCE, GuidanceCheck.SHARPNESS] as const

export interface CameraCaptureProps {
  // 與 progressSteps 並排顯示的圖示（例如 CarAnglePhoto），讓使用者不用讀文字也能
  // 一眼看懂現在該站在車輛的哪個角度拍攝——CameraCapture 本身不認識 CarPosition
  // 這個型別，圖示交由呼叫端（CaptureGuidePage）決定要放什麼，維持元件的通用性。
  headerIcon?: ReactNode
  // 左上角小徽章的進度內容（例如 CaptureProgressSteps），拍攝進入滿版畫面後，
  // 外層頁面原本的進度資訊會被蓋住，改由這裡承接顯示。同樣不綁定特定型別，
  // 呼叫端決定要放什麼。
  progressSteps?: ReactNode
  // 不傳 guideBoxes 時為一般取景模式（例如任務 9 的補拍相機），不套用任何引導框
  guideBoxes?: GuideBoxProps[]
  // 不傳時跳過車牌 OCR 核對——目前尚無車輛資料輸入流程可取得此值
  expectedPlateNumber?: string
  // 傳入時啟用任務 8 的自動快門（水平/直立/位置/距離/清晰度全通過且靜止 1 秒後自動拍攝）。
  // 拍完後不會立刻呼叫這個 callback——會先跳出車牌核對窗格，核對通過（或本來就沒有
  // 車牌號碼可核對）且使用者按下確認後才會呼叫，見下方 pendingCaptureImage。
  // 不傳（例如任務 9 的一般取景補拍相機）則完全不啟用自動快門邏輯。
  onCapture?: (capture: CapturedPhoto) => void
  onStreamReady?: (info: { stream: MediaStream; aspectRatio: number }) => void
  onSensorPermissionChange?: (state: SensorPermissionState) => void
  // 呼叫端在做跟這個角度無關的事情時（例如上一張照片還在上傳）可以暫停即時辨識——
  // AI 位置/距離偵測、清晰度偵測都會停止運算，畫面上的引導框/狀態列維持在暫停前
  // 最後一次的結果，不會繼續變動，避免使用者看到跟目前情境無關的畫面資訊持續閃動。
  paused?: boolean
}

export function CameraCapture({
  headerIcon,
  progressSteps,
  guideBoxes,
  expectedPlateNumber,
  onCapture,
  onStreamReady,
  onSensorPermissionChange,
  paused = false,
}: CameraCaptureProps) {
  const { stream, aspectRatio: trackAspectRatio, width, height, status, error, requestCamera } = useCameraCapture()
  const { sensorPermission, requestSensorPermission } = useSensorPermission()
  const { location, permissionState: geolocationPermissionState, requestLocation } = useGeolocation()
  // GPS 是強制條件，這兩個 state 只服務「開始拍照」按鈕在等待/擋下定位時的
  // 顯示（請求中文案、拒絕後的錯誤提示＋重試），跟 useGeolocation 本身的
  // permissionState 分開管理。
  const [isRequestingLocation, setIsRequestingLocation] = useState(false)
  const [locationBlocked, setLocationBlocked] = useState(false)
  const orientation = useOrientationGuard()
  const { isLevelOk, isUprightOk, sensorAvailable } = useGyroscopeGuard(sensorPermission)
  const videoRef = useRef<HTMLVideoElement>(null)
  // 背景模糊層專用的第二個 <video>，跟主畫面共用同一個 MediaStream（同一支鏡頭可以
  // 同時餵給多個 <video> 元素顯示，不會佔用第二份鏡頭資源）。這個純粹是視覺裝飾，
  // 填滿整個螢幕、鋪一層模糊放大的即時畫面取代生硬的黑邊，不參與任何座標換算。
  const bgVideoRef = useRef<HTMLVideoElement>(null)

  // 上/下控制區（角度圖示列、狀態列＋快門鍵）要保留多少空間，改成直接量測這兩塊
  // 內容實際渲染出來的高度，而不是用猜的固定像素數字——先前用固定數字時，只要
  // 內容變化（圖示放大、狀態徽章換行、快門鍵逃生提示文字出現）跟猜測的預算對不上，
  // 就會發生「保留區不夠、內容蓋到拍攝畫面」或「保留區太多、影格變窄」，每次都要
  // 重新猜一次數字。改用 ResizeObserver 量測真實高度，兩塊控制區永遠剛好保留出
  // 它們實際需要的空間，中間拍攝舞台自動拿到最大剩餘高度，不會overlap，也不會浪費。
  const topContentRef = useRef<HTMLDivElement>(null)
  const bottomContentRef = useRef<HTMLDivElement>(null)
  // 頂部控制區用 top: 8（見下方 style）跟螢幕頂端保持一點間距，量到的高度要另外
  // 加回這段間距，保留區才會是「螢幕頂端到控制區最下緣」的完整距離，不只是控制區
  // 內容自己的高度。
  const TOP_CONTENT_OFFSET_PX = 8
  // 量測結果還沒回來前（首次渲染）用一個大略的預設值墊著，避免舞台瞬間變成滿版
  // 又立刻縮回去的閃爍感；數值不需要精準，只是短暫的初始狀態。
  const [topReservedPx, setTopReservedPx] = useState(120)
  const [bottomReservedPx, setBottomReservedPx] = useState(160)

  useEffect(() => {
    const topEl = topContentRef.current
    const bottomEl = bottomContentRef.current
    // status 還沒到 'granted' 之前，元件回傳的是另一個分支（權限請求畫面），這兩個
    // ref 根本沒有掛到任何 DOM 節點上——這個 effect 依賴 status，狀態轉成 'granted'、
    // 真正的拍攝畫面（含這兩個 ref 節點）掛載後才會重新執行一次，重新抓到節點並
    // 開始觀察；不能只用空陣列只跑一次，那樣會在權限畫面階段就撲空、之後再也不會
    // 重新嘗試。
    if (!topEl || !bottomEl) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height)
        if (entry.target === topEl) setTopReservedPx(height + TOP_CONTENT_OFFSET_PX)
        else if (entry.target === bottomEl) setBottomReservedPx(height)
      }
    })
    observer.observe(topEl)
    observer.observe(bottomEl)
    return () => observer.disconnect()
  }, [status])

  // track.getSettings() 在部分手機瀏覽器上回報的是感光元件「未旋轉」的原生尺寸（例如 4:3 橫式數字），
  // 跟 <video> 實際顯示（瀏覽器內部已處理好旋轉）的畫面比例對不上，導致容器形狀跟畫面內容不一致。
  // 改用 <video> 的 videoWidth/videoHeight（loadedmetadata 事件），這是瀏覽器真正要渲染的畫面尺寸，
  // 用它來決定容器比例才會跟畫面內容一致。這裡提前計算（搬到 visionTargets 之前），因為引導框
  // 換算成「相對整個畫面」的座標需要先知道正方形有效拍攝區域，而後者要依賴這個實際寬高比。
  const [renderedAspectRatio, setRenderedAspectRatio] = useState<number | null>(null)
  const aspectRatio = renderedAspectRatio ?? trackAspectRatio
  const effectiveAreaRect = computeEffectiveAreaRect(aspectRatio)

  // guideTemplates.ts 的座標是相對「中央正方形有效拍攝區域」，換算成相對整個畫面的座標，
  // 渲染定位、位置比對、AI 視覺定位的目標，全部統一以這組換算後的座標為準。
  const frameGuideBoxes: GuideBoxProps[] = (guideBoxes ?? []).map((box) => ({
    ...box,
    ...squareRelativeToFrame(box, effectiveAreaRect),
  }))

  // 直接把引導框（虛線框）本身的邊界傳給 useVisionGuidance，位置判斷改成「偵測框中心點
  // 是否落在這個矩形內」；面積百分比則是寬高百分比的乘積（相對容器的百分比，不需再除以 100 兩次）。
  const visionTargets = frameGuideBoxes.map((box) => ({
    target: box.target,
    boxXPercent: box.xPercent,
    boxYPercent: box.yPercent,
    boxWidthPercent: box.widthPercent,
    boxHeightPercent: box.heightPercent,
    targetAreaPercent: (box.widthPercent * box.heightPercent) / 100,
  }))
  // 車牌核對視窗顯示中（已經拍到照片，正在看辨識結果、還沒按確認/重拍）也視同
  // 暫停：這段期間使用者看的是凍結的照片，背景鏡頭畫面即時偵測/清晰度運算繼續跑
  // 沒有意義，還可能造成使用者沒有點任何按鈕、畫面卻突然自己變化的困惑（懷疑
  // 是背景持續運算間接影響到的異常，先排除掉這條路徑）。
  const [pendingCaptureImage, setPendingCaptureImage] = useState<string | null>(null)
  const isPaused = paused || pendingCaptureImage !== null
  // 全螢幕閃白效果的開關：拍照瞬間設為 true、下一個 tick 再設回 false，靠 CSS
  // transition 從「不透明」淡回「透明」，需要先讓瀏覽器真的畫出 true 那一幀，
  // 否則兩次 state 更新會被同一輪 render 合併，畫面上完全看不到閃白（見下方
  // handleAutoCapture 用 requestAnimationFrame 而非直接同步呼叫的原因）。
  const [captureFlashOn, setCaptureFlashOn] = useState(false)

  const { modelLoadError, isPositionOk, positionDirection, isDistanceOk, distanceDirection, detectedBoxes } =
    useVisionGuidance(videoRef, visionTargets, status === 'granted' && visionTargets.length > 0 && !isPaused)

  const { isSharpOk, variance } = useBlurDetection(videoRef, status === 'granted' && !isPaused)

  const {
    isPlateOk,
    isRecognizing,
    modelLoadError: plateModelLoadError,
    triggerOnce,
    reset: resetPlateOCR,
  } = usePlateOCR()

  // 任務 8 的自動快門/引導狀態機只依賴水平/直立/位置/距離/清晰度這 5 項——車牌核對
  // 現在改成拍攝完成後才進行（見下方 pendingCaptureImage），不再是拍攝前的守門條件，
  // 所以固定傳 true，PLATE 這個優先權項目在拍照前的即時畫面上不會再被觸發。
  const { activeGuidance, itemStatus } = useGuidanceStateMachine(
    { isLevelOk, isUprightOk, isPositionOk, isDistanceOk, isSharpOk, isPlateOk: true },
    sensorAvailable,
  )
  const guidanceMessage =
    activeGuidance === 'POSITION' && positionDirection
      ? POSITION_DIRECTION_MESSAGES[positionDirection]
      : activeGuidance === 'DISTANCE' && distanceDirection
        ? DISTANCE_DIRECTION_MESSAGES[distanceDirection]
        : GUIDANCE_MESSAGES[activeGuidance]
  // 水平/直立沒過還是會擋住自動快門（activeGuidance/active 判斷完全不變），只是
  // 使用者要求畫面上不要顯示這兩項的提示文字，只保留位置/距離/清晰度相關的說明。
  const isGuidanceHintSuppressed = activeGuidance === 'LEVEL' || activeGuidance === 'UPRIGHT'

  // 自動快門拍到的照片先暫存在這裡，不會立刻交給外層的 onCapture——要等車牌核對
  // 通過（或本來就沒有期望車牌可核對）、使用者在跳出的窗格內按下確認後，才算這個
  // 角度真正拍攝完成，才會呼叫外層 onCapture 換到下一步。每個角度都要重新核對一次
  // （不沿用前一個角度已經核對成功的結果），確認時一併呼叫 resetPlateOCR()。
  // （pendingCaptureImage 本身的宣告已經移到上面，跟 isPaused 放一起，這裡沿用。）
  // 跟 pendingCaptureImage 同時建立/清空的中繼資料快照（時間戳記、引導框/偵測框
  // 座標、清晰度變異數、GPS 定位）——快門觸發當下的畫面狀態，等使用者按下確認才會
  // 隨 pendingCaptureImage 一起交給外層 onCapture，見下方 handleConfirmNext。
  const [pendingCaptureMeta, setPendingCaptureMeta] = useState<Omit<CapturedPhoto, 'image'> | null>(null)
  // 拍下瞬間的車牌偵測框（連同照片一起凍結），車牌辨識、每次「重新辨識」都固定
  // 對著同一張照片、同一個裁切範圍重跑，結果才會穩定——如果每次都重新讀當下的
  // detectedBoxes（還在跟著即時畫面變動），使用者拍完後手部稍微一晃、或當下畫面
  // 剛好沒偵測到車牌，辨識結果就會變來變去，甚至按「重新辨識」看起來完全沒反應
  // （這正是先前回報「卡卡」的原因：辨識其實是在讀已經跟畫面對不上的即時影格）。
  const pendingPlateBoxRef = useRef<DetectedBox | null>(null)

  const runPlateRecognition = async () => {
    if (!expectedPlateNumber || !pendingCaptureImage) return
    const plateBox = pendingPlateBoxRef.current
    if (!plateBox) return
    const img = await loadImage(pendingCaptureImage)
    void triggerOnce(img, img.naturalWidth, img.naturalHeight, plateBox, expectedPlateNumber)
  }

  const handleAutoCapture = (base64Image: string, mode: CaptureMode) => {
    // captureFrame() 現在輸出的是縮放＋補邊後的正方形照片，不是原始影格——引導框/
    // 偵測框座標（本來相對原始影格）必須用同一組換算，改成相對這張正方形照片，
    // 才會跟實際存下來的 base64Image 對得上（車牌 OCR 裁切範圍也要用換算後的值，
    // 否則會裁到錯誤位置）。
    const video = videoRef.current
    const transform = video ? computeSquareLetterboxTransform(video.videoWidth, video.videoHeight) : null
    const mapBox = <T extends { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number }>(
      box: T,
    ): T => (video && transform ? mapPercentBoxToSquare(box, video.videoWidth, video.videoHeight, transform) : box)

    const mappedDetectedBoxes = detectedBoxes.map(mapBox)
    pendingPlateBoxRef.current = mappedDetectedBoxes.find((b) => b.target === 'license_plate') ?? null
    setPendingCaptureMeta({
      capturedAt: new Date().toISOString(),
      guideBoxes: frameGuideBoxes.map(mapBox),
      detectedBoxes: mappedDetectedBoxes,
      sharpnessVariance: variance,
      location,
      captureMode: mode,
    })
    setPendingCaptureImage(base64Image)
    setCaptureFlashOn(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setCaptureFlashOn(false)))
  }

  // 拍照完成後，先讓「螢幕截圖」閃白效果播完，才開始車牌辨識——視覺上先讓使用者
  // 感受到「拍到了」，車牌核對是接下來才發生的下一步，而不是兩者同時疊在一起。
  // 沒有期望車牌時 runPlateRecognition() 會直接 no-op。
  useEffect(() => {
    if (!pendingCaptureImage) return
    const id = setTimeout(() => void runPlateRecognition(), CAPTURE_FLASH_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCaptureImage])

  // 沒有期望車牌可核對時視為直接通過；有的話必須辨識成功（isPlateOk === true）
  // 才能按下確認鈕——辨識失敗時使用者不能跳過，只能重新拍攝。
  const canConfirmNext = !expectedPlateNumber || isPlateOk === true

  const handleConfirmNext = () => {
    if (!pendingCaptureImage || !pendingCaptureMeta || !canConfirmNext) return
    onCapture?.({ image: pendingCaptureImage, ...pendingCaptureMeta })
    setPendingCaptureImage(null)
    setPendingCaptureMeta(null)
    pendingPlateBoxRef.current = null
    resetPlateOCR()
  }

  // 「重新拍攝」：跟「重新辨識」不同——重新辨識是對著同一張照片再跑一次模型
  // （多數辨識失敗只是模型雜訊，原圖通常沒問題，重跑最快）；如果使用者覺得這張
  // 照片本身就有問題（例如反光、車牌被擋到一部分），才需要整個放棄、回到即時
  // 畫面重新對準拍攝，不用等連續失敗達到上限才能有這個選項。
  const handleRetake = () => {
    setPendingCaptureImage(null)
    setPendingCaptureMeta(null)
    pendingPlateBoxRef.current = null
    resetPlateOCR()
  }

  // 🧪 除錯用：顯示 tfjs 實際選用的後端（webgl/wasm/cpu）。cpu 後端純 JS 運算，
  // 車牌字元模型在 cpu 後端要 15 秒以上才跑完一次推論，藉此確認手機上是否不小心
  // 落到這個最慢的 fallback（例如 webgl 初始化失敗但沒有拋出使用者看得到的錯誤）。
  const [tfBackendName, setTfBackendName] = useState<string | null>(null)
  useEffect(() => {
    if (status !== 'granted') return
    const id = setInterval(() => setTfBackendName(tf.getBackend() ?? null), 500)
    return () => clearInterval(id)
  }, [status])

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
    if (bgVideoRef.current && stream) {
      bgVideoRef.current.srcObject = stream
    }
  }, [stream])

  useEffect(() => {
    if (status === 'granted' && stream && aspectRatio) {
      onStreamReady?.({ stream, aspectRatio })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (sensorPermission) {
      onSensorPermissionChange?.(sensorPermission)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensorPermission])

  // 相機滿版接管畫面時，把瀏覽器網址列/狀態列的底色也跟著換成黑色（iOS Safari 15+
  // 支援依 theme-color 換底色），讓瀏覽器自己的介面也融入相機畫面，離開時換回來，
  // 減少「這其實是網頁」的視覺線索。
  useEffect(() => {
    if (status !== 'granted') return
    const meta = document.querySelector('meta[name="theme-color"]')
    const original = meta?.getAttribute('content') ?? null
    meta?.setAttribute('content', '#000000')
    return () => {
      if (original !== null) meta?.setAttribute('content', original)
    }
  }, [status])

  const handleStart = async () => {
    // iOS 13+ 的 DeviceMotionEvent/DeviceOrientationEvent.requestPermission() 必須在使用者手勢的
    // 同步呼叫堆疊內觸發，否則 iOS Safari 會判定不是使用者主動操作而擋下——這裡改成
    // 進畫面就自動觸發（見下方 useEffect），已經不是嚴格意義的同步手勢，iOS 上這個
    // 特定的動作感測器授權有機率請求失敗；失敗時 sensorAvailable 會是 false，狀態機
    // 本來就有對應的降級處理（水平/直立檢查直接跳過，不影響拍照本身），可接受。
    await requestSensorPermission()

    // GPS 定位改成強制條件：沒有定位就不給拍照，直接擋在相機開啟之前。整趟拍攝
    // 流程只取一次（車輛拍攝過程中不會移動，四個角度共用同一組座標），拒絕/逾時/
    // 裝置不支援時 requestLocation() 回傳 null，這裡直接中止、不呼叫 requestCamera()，
    // 顯示錯誤讓使用者開啟定位權限後重試。
    setIsRequestingLocation(true)
    const location = await requestLocation()
    setIsRequestingLocation(false)
    if (!location) {
      setLocationBlocked(true)
      return
    }
    setLocationBlocked(false)

    // 感測器授權被拒絕/不需要，都不影響相機——相機本身仍要正常運作，
    // 只是任務 5/8 之後會依 sensorPermission 決定是否啟用自動防呆與自動快門
    try {
      await requestCamera()
    } catch {
      // 錯誤已記錄於 hook 的 error 狀態，完整降級 UI 由任務 10 補上
    }
  }

  // 進畫面就自動開始請求權限，不用使用者在這裡再按一次「開始拍照」——首頁按下
  // 開始拍照、導頁進來後，緊接著就是這個自動觸發，體感上只需要按一次。用 ref
  // 擋只觸發一次（React 18 開發模式下 effect 會故意重複執行一次來抓副作用寫法
  // 問題，這裡若真的重複呼叫會變成連續跳兩次權限請求）。
  const hasAutoStartedRef = useRef(false)
  useEffect(() => {
    if (status === 'idle' && !hasAutoStartedRef.current) {
      hasAutoStartedRef.current = true
      void handleStart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // 首頁按下「開始拍照」導頁進來後、真正看到即時相機畫面前的這段等待——畫面上
  // 同時在跟使用者要相機／定位權限，用跟 Splash 一致的「畫面載入中...」視覺語彙
  // （置中圖示＋文字），讓使用者清楚這是同一趟「準備中」的體驗延續，而不是一段
  // 沒有任何說明、看起來像卡住的空白畫面。
  if (status === 'idle' || status === 'requesting') {
    return (
      <main
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 30,
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          textAlign: 'center',
          padding: 24,
        }}
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: 'var(--accent-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Camera size={32} color="var(--accent)" strokeWidth={1.75} />
        </motion.div>
        <div>
          <h2 style={{ marginBottom: 4 }}>畫面載入中...</h2>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {locationBlocked
              ? '需要開啟定位權限才能開始拍攝，請允許定位存取後再試一次。'
              : isRequestingLocation
                ? '正在請求定位權限…'
                : '正在準備相機，請允許存取權限'}
          </p>
        </div>
        {locationBlocked && (
          <button type="button" className="btn btn-primary" onClick={handleStart}>
            重試
          </button>
        )}
      </main>
    )
  }

  if (status === 'denied' || status === 'error') {
    return <p>無法取得相機權限：{error}</p>
  }

  // 滿版拍攝：相機畫面固定佔滿螢幕（不再是頁面裡一個置中的小方框），但「吃滿到
  // 螢幕邊緣、不留黑邊」（cover-fit，CSS max()）實際測試發現會裁掉一部分鏡頭視野，
  // 視覺上等同「畫面被放大」——手機螢幕寬高比跟相機實際拍到的畫面比例不一致時，
  // 裁切幅度可能很明顯，引導框（以整個影格為基準）跟著等比例放大，反而更難對準、
  // 看起來也不合理。改回 CSS min()（object-fit: contain 的效果）：保留完整鏡頭
  // 視野，維持影格真實寬高比、盡量撐滿螢幕，撐不滿的地方留給外層黑色背景當邊框，
  // 犧牲一點「無黑邊」的美觀，換回正確的視野範圍與引導框準確度。
  //
  // 影格上/下方原本用「螢幕高度扣掉影格實際佔用高度」算出來的剩餘黑邊放角度圖示/
  // 引導文字（上）跟狀態列/快門鍵（下），但實機測試發現：只要鏡頭寬高比跟螢幕接近，
  // 這塊剩餘空間會薄到內容還是溢出——單純「在剩餘空間內找位置放」這個策略本身就不夠
  // 穩。改成反過來：先各自保留一塊固定高度的上／下控制區（不管鏡頭寬高比為何都固定
  // 扣掉），影格本身只在剩下的「中段舞台」（stageStyle）內置中並縮小，這樣上下控制區
  // 永遠有這麼多空間可用。
  //
  // 這裡不能只把 frameStyle 的高度縮小、中心點往上移（先前的做法）——那樣只是把
  // 「剩餘黑邊」這塊預算整個搬到影格上方，影格本身的上緣仍然可能貼到螢幕最頂端
  // （沒有真的保留出上方空間），螢幕頂端沒有黑邊可用時，錨在影格上緣之上的角度
  // 圖示列就會被裁到螢幕外面——這正是實機回報「角度圖示被截斷」的原因。改用一個
  // 獨立的 stageStyle 容器：它的 top/bottom 直接扣掉上下兩塊固定保留區，影格再用
  // flex 置中「疊在 stageStyle 裡面」，這樣影格的上緣、下緣都不可能超出 stageStyle
  // 的範圍，等於是真的保留出這兩塊空間，而不是換個地方繼續依賴剩餘計算。
  // 上/下保留區的高度直接決定中間拍攝舞台能有多高，進而決定 frameStyle 的寬度
  // （寬 = 舞台高 × 鏡頭寬高比）——topReservedPx/bottomReservedPx 現在是實際量測
  // 出來的控制區高度（見上方 ResizeObserver），不是猜測的固定數字，舞台永遠拿到
  // 當下真正剩餘的最大高度，兩塊控制區也永遠剛好保留出自己需要的空間。
  const STAGE_HEIGHT_EXPR = `calc(100dvh - ${topReservedPx + bottomReservedPx}px)`

  const stageStyle: CSSProperties = {
    position: 'absolute',
    top: topReservedPx,
    left: 0,
    right: 0,
    bottom: bottomReservedPx,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const frameStyle: CSSProperties = {
    position: 'relative',
    background: '#000',
    width: `min(100%, calc(${STAGE_HEIGHT_EXPR} * var(--ar)))`,
    height: `min(${STAGE_HEIGHT_EXPR}, calc(100vw / var(--ar)))`,
  }

  // 狀態列跟快門鍵的容器：只設 bottom（不設 top/height），高度完全由內容決定並從
  // 螢幕底部往上長——ResizeObserver 量到的高度會回饋更新 bottomReservedPx，讓
  // stageStyle 保留出來的下方空間跟這裡的實際內容高度隨時保持一致，理論上不會再
  // 發生內容比保留空間高、蓋到拍攝畫面的情況。
  const belowFrameStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        overflow: 'hidden',
        zIndex: 30,
        // 避免雙指縮放/雙擊放大這類瀏覽器手勢誤觸，減少「這其實是網頁」的感覺
        touchAction: 'manipulation',
        ['--ar' as unknown as string]: aspectRatio ?? 0.75,
      }}
    >
      {/* 背景模糊層：contain-fit 撐不滿螢幕時留下的黑邊，改用同一支鏡頭畫面模糊放大
          鋪滿全螢幕取代純黑色（類似 Spotify 播放頁、iOS 相簿的做法），視覺上比較
          融合、有沉浸感，同時完全不影響上面主畫面的座標換算——這層純粹是裝飾，
          物件位置/大小都跟真正的影格層無關，隨便裁切、模糊都不影響引導框準確度。 */}
      <video
        ref={bgVideoRef}
        autoPlay
        playsInline
        muted
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scale(1.15)',
          filter: 'blur(28px) brightness(0.55)',
        }}
      />

      {/* 影格層：跟著影片內容一起被裁切的部分（畫面本身、引導框、偵測框、正方形
          遮罩），跟下面的「機體控制列」層分開——控制列要固定貼在螢幕邊緣，不能跟著
          這層一起被置中放大而位移到螢幕外。stageStyle 這層先把上下固定保留區扣掉，
          frameStyle 只在剩下的中段範圍內用 flex 置中，確保影格本身不會貼到螢幕頂端
          （見上方註解）。 */}
      <div style={stageStyle}>
      <div style={frameStyle}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (v.videoWidth && v.videoHeight) {
              setRenderedAspectRatio(v.videoWidth / v.videoHeight)
            }
          }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />

        {/* 中央「有效拍攝區域」以外的畫面用半透明黑色蓋住，引導使用者專注在正方形範圍內
            構圖——用巨大的 box-shadow 往外擴散剛好可以「挖」出正方形範圍，不需要另外
            拼四塊遮罩，父層 overflow: hidden 會把超出舞台的擴散範圍裁掉。 */}
        <div
          style={{
            position: 'absolute',
            left: `${effectiveAreaRect.xPercent}%`,
            top: `${effectiveAreaRect.yPercent}%`,
            width: `${effectiveAreaRect.widthPercent}%`,
            height: `${effectiveAreaRect.heightPercent}%`,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            pointerEvents: 'none',
          }}
        />

      {/* 黃金位置（靜態目標引導框）：白色半透明虛線，標籤改成浮在框上方、帶頭尾分隔線的
          小標籤（呼應 Vision Pro 那種懸浮膠囊標籤的做法），不再直接貼在框線內側 */}
      {frameGuideBoxes.map((box, i) => (
        <div
          key={`${box.target}-${i}`}
          style={{
            position: 'absolute',
            left: `${box.xPercent}%`,
            top: `${box.yPercent}%`,
            width: `${box.widthPercent}%`,
            height: `${box.heightPercent}%`,
            border: `2px dashed ${GUIDE_BOX_COLOR}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        >
          {box.label && (
            <span
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: 4,
                display: 'inline-block',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 10px',
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                borderTop: '1px solid rgba(255,255,255,0.5)',
                borderBottom: '1px solid rgba(255,255,255,0.5)',
                whiteSpace: 'nowrap',
              }}
            >
              {box.label}
            </span>
          )}
        </div>
      ))}

      {/* 即時偵測框：模型當下實際看到的位置；中心點落在對應虛線引導框內為綠色（已鎖定，
          外加一圈柔光呼應「完全符合」），框外時為藍色並帶呼吸動畫（代表「已辨識到、
          持續追蹤中」的科技感）。信心分數顯示在框外（上方），避免蓋住畫面內容 */}
      {detectedBoxes.map((box, i) => {
        const guideBox = frameGuideBoxes.find((g) => g.target === box.target)
        const centerXPercent = box.xPercent + box.widthPercent / 2
        const centerYPercent = box.yPercent + box.heightPercent / 2
        const isAligned = guideBox ? isCenterInsideGuideBox(centerXPercent, centerYPercent, guideBox) : false
        const color = isAligned ? DETECTED_BOX_COLOR_INSIDE : DETECTED_BOX_COLOR_OUTSIDE

        return (
          <div
            key={`detected-${box.target}-${i}`}
            className={isAligned ? 'detection-box-locked' : 'detection-box-tracking'}
            style={{
              position: 'absolute',
              left: `${box.xPercent}%`,
              top: `${box.yPercent}%`,
              width: `${box.widthPercent}%`,
              height: `${box.heightPercent}%`,
              border: `2px solid ${color}`,
              boxSizing: 'border-box',
              pointerEvents: 'none',
            }}
          />
        )
      })}

      {/* 拍攝提示詞（如「請往前一點」「請保持手機水平」等）：使用者要一邊看著即時
          畫面調整、一邊讀提示，放在畫面外的話視線要一直上下移動；改成疊在影格內部
          最上方（frameStyle 是這裡的定位基準，見上方 position:'relative'），跟即時
          畫面在同一個視野內，讀提示跟看畫面不用切換焦點。角度圖示/角度名稱這些不會
          頻繁變動的說明性文字則維持在畫面外（見下方 stageStyle 內、frameStyle 外的
          區塊），只有這種每一刻都可能變化的即時引導提示才移進來。 */}
      {(modelLoadError || (activeGuidance !== 'ALL_PASSED' && !modelLoadError && !isGuidanceHintSuppressed)) && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
          }}
        >
          {modelLoadError ? (
            <p
              style={{
                margin: 0,
                color: '#f87171',
                fontSize: 12,
                fontWeight: 600,
                ...FROSTED_GLASS_STYLE,
                padding: '5px 14px',
                borderRadius: 8,
                whiteSpace: 'nowrap',
              }}
            >
              AI 定位模型載入失敗，請自行對準引導框後手動拍照
            </p>
          ) : (
            <p
              style={{
                margin: 0,
                color: '#fbbf24',
                fontSize: 14,
                fontWeight: 700,
                ...FROSTED_GLASS_STYLE,
                padding: '5px 14px',
                borderRadius: 8,
                whiteSpace: 'nowrap',
              }}
            >
              {guidanceMessage}
            </p>
          )}
        </div>
      )}

      </div>
      </div>

      {/* 角度圖示／角度名稱這類不常變動的說明性文字，要放在真正保證保留出來的頂部
          黑色區域內——先前這裡用 top: 0 相對 stageStyle 定位，但 stageStyle 自己的
          頂邊就已經是「舞台」的頂邊（＝影格最多可以長到的頂端位置），如果鏡頭寬高比
          跟舞台本身的寬高比接近、影格幾乎填滿整個舞台高度時，影格的頂邊也會幾乎貼到
          舞台頂邊——這排說明文字跟影格就會疊在同一個位置，而不是真的分開在影格外面
          （這正是實機回報「角度圖示疊在鏡頭畫面上」的原因）。改成移到 stageStyle 外面
          自己獨立一層，直接以整個螢幕的頂端（外層 position:fixed 容器）為基準定位，
          這樣不管影格在舞台內實際長多高、飄在哪裡，這排說明都保證在畫面最上方那塊
          頂部保留區高度裡，物理上就不可能跟影格重疊——這塊保留區的高度就是量測
          這個 div 本身（ref={topContentRef}）算出來的，見上方 ResizeObserver。 */}
      <div
        ref={topContentRef}
        style={{
          position: 'absolute',
          top: TOP_CONTENT_OFFSET_PX,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {expectedPlateNumber && plateModelLoadError && (
          <p
            style={{
              margin: 0,
              color: '#f87171',
              fontSize: 11,
              fontWeight: 600,
              ...FROSTED_GLASS_STYLE,
              padding: '4px 12px',
              borderRadius: 8,
              whiteSpace: 'nowrap',
            }}
          >
            車牌字元模型載入失敗，無法進行車牌 OCR
          </p>
        )}

        {(progressSteps || headerIcon) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 999,
            }}
          >
            {headerIcon}
            {progressSteps}
          </div>
        )}
      </div>

      {/* 狀態列跟快門鍵放在影格下方的黑邊留白區（belowFrameStyle）——維持在即時拍攝
          畫面之外，不會疊在鏡頭實際內容上面。同一個 flex 直向容器讓兩者自然疊放
          （快門鍵的 18 秒逃生提示文字也在同一個容器內，撐高時自然把整組內容往上推，
          不用手動猜測固定間距），先前改成疊在影格內部是為了避免黑邊太薄時內容溢到
          影格裡，但這樣狀態列會蓋住即時畫面；改回黑邊留白區，優先維持鏡頭畫面本身
          乾淨，黑邊夠不夠寬則交給裝置實際狀況。 */}
      <div ref={bottomContentRef} style={belowFrameStyle}>
        {!modelLoadError && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: '92vw',
            }}
          >
            {STATUS_CHIP_ORDER.filter((key) => itemStatus[key] !== 'skipped').map((key) => {
              const passed = itemStatus[key] === 'passed'
              return (
                <span
                  key={key}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    color: passed ? '#22c55e' : '#ef4444',
                    ...FROSTED_GLASS_STYLE,
                    padding: '3px 8px',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {passed ? '✓' : '✗'} {STATUS_CHIP_LABELS[key]}
                </span>
              )
            })}
          </div>
        )}

        {onCapture && guideBoxes && guideBoxes.length > 0 && !isPaused && orientation !== 'landscape' && (
          <div style={{ marginTop: 'auto' }}>
            <AutoShutter
              active={activeGuidance === 'ALL_PASSED'}
              videoRef={videoRef}
              sensorPermission={sensorPermission}
              onCapture={handleAutoCapture}
            />
          </div>
        )}
      </div>

      {/* 原始數值除錯資訊只在開發模式顯示，正式使用者畫面上已經有上方的簡潔狀態列可看，
          不需要再看這些原始數字（比例/後端/清晰度變異數等） */}
      {import.meta.env.DEV && (
        <p
          style={{
            position: 'absolute',
            bottom: 4,
            left: 4,
            margin: 0,
            maxWidth: '90%',
            color: '#fff',
            fontSize: 10,
            lineHeight: 1.4,
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 6px',
            overflowWrap: 'break-word',
            pointerEvents: 'none',
          }}
        >
          比例: {aspectRatio?.toFixed(3)}（{width}x{height}）/ 後端: {tfBackendName ?? '-'} / 清晰度變異數:{' '}
          {variance?.toFixed(0) ?? '-'}
          {sensorPermission && (
            <>
              {' '}
              / 感測器: {SENSOR_PERMISSION_LABELS[sensorPermission]}
            </>
          )}
          {' '}
          / 定位:{' '}
          {location
            ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
            : geolocationPermissionState
              ? GEOLOCATION_PERMISSION_LABELS[geolocationPermissionState]
              : '取得中…'}
        </p>
      )}


      {pendingCaptureImage && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 10,
          }}
        >
          <div
            style={{
              background: '#23261d',
              color: '#f2f0e6',
              borderRadius: 10,
              padding: 18,
              width: '100%',
              maxWidth: 320,
              maxHeight: '90%',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 17 }}>拍攝完成！</h2>

            {!expectedPlateNumber && <p style={{ margin: 0 }}>未輸入期望車牌號碼，略過核對。</p>}

            {/* 使用者畫面只需要知道「還在核對」「失敗，重拍」「成功，可以繼續」這三種狀態即可，
                辨識出的文字、原始錯誤訊息等除錯細節不需要出現在正式流程裡（開發階段要看細節
                改看 console.error 或下方 DEV-only 除錯列）。needsManualConfirmation（連續失敗
                上限）目前也直接併入「失敗」顯示同一組文字/重新拍攝按鈕，不再提供手動確認逃生
                選項——ENABLE_MANUAL_CONFIRMATION_LOCK 之後如果改回 true，這裡的行為需要一併重新檢視。 */}
            {expectedPlateNumber && isRecognizing && <p style={{ margin: 0 }}>車牌核對中，請稍候…</p>}

            {expectedPlateNumber && !isRecognizing && isPlateOk === false && (
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e3a89a' }}>✗ 辨識失敗，請重新拍攝</p>
            )}

            {expectedPlateNumber && !isRecognizing && isPlateOk === true && (
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#a8c398' }}>✓ 車牌號碼辨識成功</p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {expectedPlateNumber && !isRecognizing && isPlateOk === false && (
                <button type="button" className="btn-camera-secondary" onClick={handleRetake}>
                  重新拍攝
                </button>
              )}
              {canConfirmNext && (
                <button type="button" className="btn-camera-primary" onClick={handleConfirmNext}>
                  拍攝下一個角度
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 「螢幕截圖」閃白效果：拍照瞬間鋪滿全螢幕（蓋住上面剛跳出的核對視窗），再靠
          CSS transition 淡出，讓使用者先感受到明確的拍照回饋，車牌辨識則是等這段
          效果播完才真正開始（見 CAPTURE_FLASH_MS 與觸發它的 useEffect）。 */}
      {pendingCaptureImage && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: '#fff',
            zIndex: 20,
            pointerEvents: 'none',
            opacity: captureFlashOn ? 1 : 0,
            transition: `opacity ${CAPTURE_FLASH_MS}ms ease-out`,
          }}
        />
      )}

      {orientation === 'landscape' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 16,
          }}
        >
          <p style={{ fontSize: 32, margin: 0 }}>↻</p>
          <p style={{ margin: '8px 0 0' }}>請將手機轉為直式繼續拍攝</p>
        </div>
      )}
    </div>
  )
}
