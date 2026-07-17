import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import * as tf from '@tensorflow/tfjs'
import { useCameraCapture } from '../platform/useCameraCapture'
import { useSensorPermission, type SensorPermissionState } from '../platform/useSensorPermission'
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
import { AutoShutter } from './AutoShutter'

// 內層引導方格的定位參數：相對外層相機容器的百分比座標（不是絕對像素），
// 之後四個方位模板（front_left / front_right / back_left / back_right）各自傳入不同數值。
// target 對應任務 2 模型的兩個偵測類別，之後任務 6 會用這個欄位比對 AI 偵測結果落在哪一個引導框內。
export interface GuideBoxProps {
  target: 'wheel' | 'license_plate'
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
  label?: string
}

// 靜態目標引導框（黃金位置）：灰色虛線，代表「該對準的位置」
const GUIDE_BOX_COLOR = '#9ca3af'
// 即時偵測框：中心點落在對應的虛線引導框內時為綠色（已對準），框外時為橘色（尚未對準）
const DETECTED_BOX_COLOR_INSIDE = '#22c55e'
const DETECTED_BOX_COLOR_OUTSIDE = '#f97316'

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

// 簡潔狀態列的短標籤（取代原本的原始數值除錯文字）
const STATUS_CHIP_LABELS: Record<string, string> = {
  [GuidanceCheck.LEVEL]: '水平',
  [GuidanceCheck.UPRIGHT]: '直立',
  [GuidanceCheck.POSITION]: '位置',
  [GuidanceCheck.DISTANCE]: '距離',
  [GuidanceCheck.SHARPNESS]: '清晰',
}
const STATUS_CHIP_ORDER = [
  GuidanceCheck.LEVEL,
  GuidanceCheck.UPRIGHT,
  GuidanceCheck.POSITION,
  GuidanceCheck.DISTANCE,
  GuidanceCheck.SHARPNESS,
] as const

export interface CameraCaptureProps {
  // 與 progressSteps 並排顯示的圖示（例如 CarAngleIcon），讓使用者不用讀文字也能
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
  onCapture?: (base64Image: string) => void
  onStreamReady?: (info: { stream: MediaStream; aspectRatio: number }) => void
  onSensorPermissionChange?: (state: SensorPermissionState) => void
}

export function CameraCapture({
  headerIcon,
  progressSteps,
  guideBoxes,
  expectedPlateNumber,
  onCapture,
  onStreamReady,
  onSensorPermissionChange,
}: CameraCaptureProps) {
  const { stream, aspectRatio: trackAspectRatio, width, height, status, error, requestCamera } = useCameraCapture()
  const { sensorPermission, requestSensorPermission } = useSensorPermission()
  const orientation = useOrientationGuard()
  const { isLevelOk, isUprightOk, sensorAvailable } = useGyroscopeGuard(sensorPermission)
  const videoRef = useRef<HTMLVideoElement>(null)
  // 背景模糊層專用的第二個 <video>，跟主畫面共用同一個 MediaStream（同一支鏡頭可以
  // 同時餵給多個 <video> 元素顯示，不會佔用第二份鏡頭資源）。這個純粹是視覺裝飾，
  // 填滿整個螢幕、鋪一層模糊放大的即時畫面取代生硬的黑邊，不參與任何座標換算。
  const bgVideoRef = useRef<HTMLVideoElement>(null)

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
  const { modelLoadError, isPositionOk, positionDirection, isDistanceOk, distanceDirection, detectedBoxes } =
    useVisionGuidance(videoRef, visionTargets, status === 'granted' && visionTargets.length > 0)

  const { isSharpOk, variance } = useBlurDetection(videoRef, status === 'granted')

  const {
    isPlateOk,
    isRecognizing,
    needsManualConfirmation,
    recognizedText,
    debugLastError,
    modelLoadError: plateModelLoadError,
    triggerOnce,
    confirmManually,
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

  // 自動快門拍到的照片先暫存在這裡，不會立刻交給外層的 onCapture——要等車牌核對
  // 通過（或本來就沒有期望車牌可核對）、使用者在跳出的窗格內按下確認後，才算這個
  // 角度真正拍攝完成，才會呼叫外層 onCapture 換到下一步。每個角度都要重新核對一次
  // （不沿用前一個角度已經核對成功的結果），確認時一併呼叫 resetPlateOCR()。
  const [pendingCaptureImage, setPendingCaptureImage] = useState<string | null>(null)
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

  const handleAutoCapture = (base64Image: string) => {
    pendingPlateBoxRef.current = detectedBoxes.find((b) => b.target === 'license_plate') ?? null
    setPendingCaptureImage(base64Image)
  }

  // 拍照完成的那一刻自動觸發一次車牌辨識（沒有期望車牌時這裡會直接 no-op）。
  useEffect(() => {
    if (!pendingCaptureImage) return
    void runPlateRecognition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCaptureImage])

  // 沒有期望車牌可核對時視為直接通過；有的話必須辨識成功（isPlateOk === true）
  // 才能按下確認鈕——辨識失敗時使用者不能跳過，只能重新辨識或等連續失敗後的
  // 手動確認逃生選項（needsManualConfirmation）。
  const canConfirmNext = !expectedPlateNumber || isPlateOk === true

  const handleConfirmNext = () => {
    if (!pendingCaptureImage || !canConfirmNext) return
    onCapture?.(pendingCaptureImage)
    setPendingCaptureImage(null)
    pendingPlateBoxRef.current = null
    resetPlateOCR()
  }

  // 「重新拍攝」：跟「重新辨識」不同——重新辨識是對著同一張照片再跑一次模型
  // （多數辨識失敗只是模型雜訊，原圖通常沒問題，重跑最快）；如果使用者覺得這張
  // 照片本身就有問題（例如反光、車牌被擋到一部分），才需要整個放棄、回到即時
  // 畫面重新對準拍攝，不用等連續失敗達到上限才能有這個選項。
  const handleRetake = () => {
    setPendingCaptureImage(null)
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
    // 同步呼叫堆疊內觸發，因此排在 getUserMedia 之前呼叫，不等相機權限先取得才觸發，
    // 否則 iOS Safari 會判定不是使用者主動操作而擋下。
    await requestSensorPermission()

    // 感測器授權被拒絕/不需要，都不影響相機——相機本身仍要正常運作，
    // 只是任務 5/8 之後會依 sensorPermission 決定是否啟用自動防呆與自動快門
    try {
      await requestCamera()
    } catch {
      // 錯誤已記錄於 hook 的 error 狀態，完整降級 UI 由任務 10 補上
    }
  }

  if (status === 'idle' || status === 'requesting') {
    return (
      <div>
        <button type="button" className="btn btn-primary" onClick={handleStart} disabled={status === 'requesting'}>
          {status === 'requesting' ? '請求相機權限中…' : '開始檢測車況'}
        </button>
      </div>
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
  const frameStyle: CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: '#000',
    ['--ar' as unknown as string]: aspectRatio ?? 0.75,
    width: 'min(100vw, 100dvh * var(--ar))',
    height: 'min(100dvh, 100vw / var(--ar))',
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
          這層一起被置中放大而位移到螢幕外。 */}
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

      {/* 黃金位置（靜態目標引導框）：灰色虛線 */}
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
            <span style={{ color: GUIDE_BOX_COLOR, fontSize: 12, background: 'rgba(0,0,0,0.5)' }}>
              {box.label}
            </span>
          )}
        </div>
      ))}

      {/* 即時偵測框：模型當下實際看到的位置；中心點落在對應虛線引導框內為綠色，
          框外為橘色，讓使用者一眼就能看出有沒有對準。信心分數顯示在框外（上方），避免蓋住畫面內容 */}
      {detectedBoxes.map((box, i) => {
        const guideBox = frameGuideBoxes.find((g) => g.target === box.target)
        const centerXPercent = box.xPercent + box.widthPercent / 2
        const centerYPercent = box.yPercent + box.heightPercent / 2
        const isAligned = guideBox ? isCenterInsideGuideBox(centerXPercent, centerYPercent, guideBox) : false
        const color = isAligned ? DETECTED_BOX_COLOR_INSIDE : DETECTED_BOX_COLOR_OUTSIDE

        return (
          <div
            key={`detected-${box.target}-${i}`}
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
          >
            <span
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                color,
                fontSize: 10,
                background: 'rgba(0,0,0,0.5)',
                whiteSpace: 'nowrap',
              }}
            >
              {box.score.toFixed(2)}
            </span>
          </div>
        )
      })}

      {/* 頂部引導提示：黑邊（letterbox）留白夠不夠寬因裝置而異，用 bottom: 100% 貼在
          「影格自己的頂邊」正上方，而不是螢幕頂邊的固定距離——這樣不管黑邊多窄，提示
          文字永遠貼在畫面外面，不會疊在鏡頭實際內容上面。這兩塊要放在 frameStyle 內部
          （影格的子元素），才能用 100% 相對到影格自己的高度，而不是整個螢幕的高度。 */}
      {(progressSteps || headerIcon) && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            marginBottom: 8,
            left: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(0,0,0,0.5)',
            padding: '6px 12px',
            borderRadius: 999,
          }}
        >
          {headerIcon}
          {progressSteps}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: '100%',
          marginBottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {modelLoadError && (
          <p
            style={{
              margin: 0,
              color: '#fff',
              fontSize: 12,
              background: 'rgba(168,93,78,0.92)',
              padding: '5px 14px',
              borderRadius: 8,
              whiteSpace: 'nowrap',
            }}
          >
            AI 定位模型載入失敗，請自行對準引導框後手動拍照
          </p>
        )}

        {!modelLoadError && activeGuidance !== 'ALL_PASSED' && (
          <p
            style={{
              margin: 0,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              background: 'rgba(171,138,44,0.92)',
              padding: '5px 14px',
              borderRadius: 8,
              whiteSpace: 'nowrap',
            }}
          >
            {guidanceMessage}
          </p>
        )}

        {expectedPlateNumber && plateModelLoadError && (
          <p
            style={{
              margin: 0,
              color: '#fff',
              fontSize: 11,
              background: 'rgba(168,93,78,0.92)',
              padding: '4px 12px',
              borderRadius: 8,
              whiteSpace: 'nowrap',
            }}
          >
            車牌字元模型載入失敗，無法進行車牌 OCR
          </p>
        )}
      </div>

      {/* 簡潔狀態列：取代原本的原始數值除錯文字，所有需要的條件一次列出——已達到打
          綠色勾，尚未達到（含還沒輪到判斷的 pending，本質上也是「還沒過」）打紅色叉。
          只有感測器不支援、真的不參與判斷的項目（skipped）才不顯示。原本用固定距離貼
          在螢幕下方，黑邊較窄的裝置上會疊到鏡頭畫面內容——改成用 top: 100% 貼在
          「影格自己的下邊」正下方，永遠落在畫面外，不會蓋住實際拍攝內容。 */}
      {!modelLoadError && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            marginTop: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: '90%',
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
                  background: 'rgba(0,0,0,0.55)',
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
      </div>

      {onCapture && guideBoxes && guideBoxes.length > 0 && !pendingCaptureImage && orientation !== 'landscape' && (
        <AutoShutter
          active={activeGuidance === 'ALL_PASSED'}
          videoRef={videoRef}
          sensorPermission={sensorPermission}
          onCapture={handleAutoCapture}
        />
      )}

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

            {expectedPlateNumber && (
              <>
                <p style={{ margin: 0, fontSize: 13, color: '#c7c2ac' }}>期望車牌：{expectedPlateNumber}</p>

                {isRecognizing && <p style={{ margin: 0 }}>車牌核對中，請稍候…</p>}

                {!isRecognizing && debugLastError && (
                  <p style={{ margin: 0, color: '#e3a89a' }}>⚠️ 辨識發生錯誤：{debugLastError}</p>
                )}

                {!isRecognizing && !debugLastError && (
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 700,
                        fontFamily: 'var(--mono)',
                        color: isPlateOk ? '#a8c398' : isPlateOk === false ? '#e3a89a' : undefined,
                      }}
                    >
                      {recognizedText || '（無法辨識）'}
                    </p>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: 13,
                        fontWeight: 600,
                        color: isPlateOk ? '#a8c398' : '#e3a89a',
                      }}
                    >
                      {isPlateOk
                        ? '✓ 辨識成功'
                        : '✗ 辨識失敗，可以先重新辨識同一張照片；如果照片本身有問題（反光、被擋住），再重新拍攝'}
                    </p>
                  </div>
                )}

                {needsManualConfirmation && (
                  <div>
                    <p style={{ margin: 0, color: '#e3a89a' }}>車牌辨識連續失敗，請手動確認</p>
                    <button type="button" className="btn-camera-secondary" onClick={confirmManually}>
                      手動確認車牌
                    </button>
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {expectedPlateNumber && !isRecognizing && isPlateOk !== true && (
                <>
                  <button type="button" className="btn-camera-secondary" onClick={runPlateRecognition}>
                    重新辨識
                  </button>
                  <button type="button" className="btn-camera-secondary" onClick={handleRetake}>
                    重新拍攝
                  </button>
                </>
              )}
              <button type="button" className="btn-camera-primary" onClick={handleConfirmNext} disabled={!canConfirmNext}>
                確認，前往下一步
              </button>
            </div>
          </div>
        </div>
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
