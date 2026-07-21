import { doc, setDoc, addDoc, updateDoc, increment, serverTimestamp, collection } from 'firebase/firestore'
import { ref, uploadBytesResumable } from 'firebase/storage'
import { db, storage } from './firebase'
import type { CarPosition } from '../config/guideTemplates'
import type { DetectedBox } from '../hooks/useVisionGuidance'
import type { CaptureMode } from '../components/AutoShutter'

// 對照 02_SDD 2.3 節：CarPosition 的四個值（front_left/front_right/rear_left/
// rear_right）跟後端 photo_type 列舉值定義完全一致，不需要另外做一份中英對照表。

// 沒有寫進 02_SDD 規格書、屬於我們額外加值的欄位——跟使用者討論後決定加入
// 這幾項，理由是這些資料在拍照當下都已經算好，幾乎零成本，且對數據儀表板／
// 後續除錯有實際價值（見對話紀錄）：拍照當下時間、觸發方式（自動/手動）、
// 清晰度分數、AI 偵測結果、App 版本、裝置資訊。Firestore 沒有固定 schema，
// 多這些欄位不會影響 02_SDD 既有欄位的讀寫。
export const APP_VERSION = '1.0.0'

function getDeviceInfo() {
  return {
    platform: navigator.platform || null,
    user_agent: navigator.userAgent,
  }
}

export interface CreateRentalResult {
  rentalId: string
}

// 見 02_SDD 2.2 節／04 文件第 5 節：rental_id 格式 Rental_{vehicle_id}_{timestamp}，
// 建立時欄位必須齊全，且 risk_flag/reviewed_by_staff 一定要是 false，否則會被
// Firestore Security Rules（03_IAM 第 3 節）拒絕寫入。carModel 不在 02_SDD 定義
// 內（車款理論上應該來自 vehicles.model，但那張表是後端手動建立的測試資料，
// 前端目前沒有查詢管道）——先當作額外欄位存進 rentals，之後接上真正的選車
// 流程、能查到 vehicles 資料時再決定要不要改用那邊的權威值。
export async function createRental(vehicleId: string, carModel: string): Promise<CreateRentalResult> {
  const rentalId = `Rental_${vehicleId}_${Date.now()}`
  await setDoc(doc(db, 'rentals', rentalId), {
    vehicle_id: vehicleId,
    status: 'pickup_uploading',
    created_at: serverTimestamp(),
    pickup_photo_count: 0,
    return_photo_count: 0,
    risk_flag: false,
    risk_level: null,
    ai_summary: null,
    reviewed_by_staff: false,
    review_notes: null,
    reviewed_at: null,
    car_model: carModel,
  })
  return { rentalId }
}

// 拍照存的是 base64 dataURL（CameraCapture 的既有輸出格式），Storage SDK 的
// uploadBytesResumable 要吃 Blob/File，這裡用瀏覽器原生 fetch 做轉換，不需要
// 額外套件（fetch 支援直接解析 data: URL）。
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

export interface UploadCapturePhotoParams {
  imageDataUrl: string
  vehicleId: string
  rentalId: string
  photoType: CarPosition
}

export interface UploadCapturePhotoResult {
  fileName: string
  storagePath: string
  // 檔名裡用的同一個時間點（前端本地時間），一併回傳給 createPhotoRecord 當
  // uploaded_at 用，避免檔名跟 Firestore 文件各自取一次 Date.now() 兜不起來。
  uploadedAt: Date
}

// 檔名規則見 02_SDD 第 3 節：{rental_id}_{vehicle_id}_{photo_type}_{unix_timestamp}.jpg，
// 不分資料夾、直接放在 bucket 根目錄——格式必須完全符合，否則 Storage Rules
// （03_IAM 第 4 節，僅檢查大小/型別，不檢查檔名格式）雖然不會擋，但後端組路徑時
// 會對不上，所以還是要照規則產生。
export async function uploadCapturePhoto({
  imageDataUrl,
  vehicleId,
  rentalId,
  photoType,
}: UploadCapturePhotoParams): Promise<UploadCapturePhotoResult> {
  const blob = await dataUrlToBlob(imageDataUrl)
  const uploadedAt = new Date()
  const fileName = `${rentalId}_${vehicleId}_${photoType}_${uploadedAt.getTime()}.jpg`
  const storageRef = ref(storage, fileName)

  const uploadTask = uploadBytesResumable(storageRef, blob, { contentType: 'image/jpeg' })
  await new Promise<void>((resolve, reject) => {
    uploadTask.on('state_changed', undefined, reject, () => resolve())
  })

  return { fileName, storagePath: `gs://${storage.app.options.storageBucket}/${fileName}`, uploadedAt }
}

export interface CreatePhotoRecordParams {
  rentalId: string
  vehicleId: string
  photoType: CarPosition
  fileName: string
  storagePath: string
  uploadedAt: Date
  // 目前拍照方式（getUserMedia 直接擷取畫面）產生的照片沒有 EXIF，02_SDD 預期的
  // 「從照片 EXIF 解析 GPS」這條路線對我們不成立，改用瀏覽器 Geolocation API
  // （見 CameraCapture.tsx 的 useGeolocation），沒有定位權限/不支援時為 null。
  gpsLat: number | null
  gpsLng: number | null
  // 以下皆為 02_SDD 沒有定義、額外加值的欄位（見上方 APP_VERSION 註解）
  capturedAt: Date
  captureMode: CaptureMode
  sharpnessVariance: number | null
  detectedBoxes: DetectedBox[]
}

// uploaded_at / server_uploaded_at 特意不是同一種寫法：02_SDD 2.3 節明確定義
// uploaded_at 是「前端本地時間」、server_uploaded_at 才是「伺服器實際收到時間
// （權威）」——兩者本來就該有差（可能因為網路延遲、裝置時鐘飄移而不同，落差本身
// 也是後端可以用來判斷資料可信度的訊號），所以前者傳入前端產生的 Date（Firestore
// SDK 寫入時會自動轉成 Timestamp），後者才用 serverTimestamp()，不能兩個都用
// serverTimestamp() 蓋掉這個語意差異。
export async function createPhotoRecord({
  rentalId,
  vehicleId,
  photoType,
  fileName,
  storagePath,
  uploadedAt,
  gpsLat,
  gpsLng,
  capturedAt,
  captureMode,
  sharpnessVariance,
  detectedBoxes,
}: CreatePhotoRecordParams): Promise<void> {
  await addDoc(collection(db, 'photos'), {
    rental_id: rentalId,
    vehicle_id: vehicleId,
    stage: 'pickup',
    photo_type: photoType,
    file_name: fileName,
    storage_path: storagePath,
    gps_lat: gpsLat,
    gps_lng: gpsLng,
    uploaded_at: uploadedAt,
    server_uploaded_at: serverTimestamp(),
    qc_status: 'pending',
    damages: [],
    // 額外加值欄位（不在 02_SDD 定義內，見檔案開頭註解）
    captured_at: capturedAt,
    capture_mode: captureMode,
    sharpness_score: sharpnessVariance,
    app_version: APP_VERSION,
    device: getDeviceInfo(),
    detections: detectedBoxes.map((box) => ({
      target: box.target,
      x_percent: box.xPercent,
      y_percent: box.yPercent,
      width_percent: box.widthPercent,
      height_percent: box.heightPercent,
      score: box.score,
    })),
  })

  await updateDoc(doc(db, 'rentals', rentalId), { pickup_photo_count: increment(1) })
}

// 四張皆上傳完成後呼叫，見 02_SDD status 狀態定義表：pickup_uploading → pickup_uploaded。
export async function markPickupUploaded(rentalId: string): Promise<void> {
  await updateDoc(doc(db, 'rentals', rentalId), { status: 'pickup_uploaded' })
}
