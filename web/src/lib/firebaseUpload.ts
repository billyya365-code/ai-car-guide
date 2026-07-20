import { doc, setDoc, addDoc, updateDoc, increment, serverTimestamp, collection } from 'firebase/firestore'
import { ref, uploadBytesResumable } from 'firebase/storage'
import { db, storage } from './firebase'
import type { CarPosition } from '../config/guideTemplates'

// 對照 02_SDD 2.3 節：CarPosition 的四個值（front_left/front_right/rear_left/
// rear_right）跟後端 photo_type 列舉值定義完全一致，不需要另外做一份中英對照表。

export interface CreateRentalResult {
  rentalId: string
}

// 見 02_SDD 2.2 節／04 文件第 5 節：rental_id 格式 Rental_{vehicle_id}_{timestamp}，
// 建立時欄位必須齊全，且 risk_flag/reviewed_by_staff 一定要是 false，否則會被
// Firestore Security Rules（03_IAM 第 3 節）拒絕寫入。
export async function createRental(vehicleId: string): Promise<CreateRentalResult> {
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
  const timestamp = Date.now()
  const fileName = `${rentalId}_${vehicleId}_${photoType}_${timestamp}.jpg`
  const storageRef = ref(storage, fileName)

  const uploadTask = uploadBytesResumable(storageRef, blob, { contentType: 'image/jpeg' })
  await new Promise<void>((resolve, reject) => {
    uploadTask.on('state_changed', undefined, reject, () => resolve())
  })

  return { fileName, storagePath: `gs://${storage.app.options.storageBucket}/${fileName}` }
}

export interface CreatePhotoRecordParams {
  rentalId: string
  vehicleId: string
  photoType: CarPosition
  fileName: string
  storagePath: string
}

// GPS 欄位（gps_lat/gps_lng）這次先固定存 null——目前拍照方式（getUserMedia 直接
// 擷取畫面）產生的照片沒有 EXIF，規格書預期的「從照片 EXIF 解析 GPS」這條路線
// 對我們不成立，來源要怎麼處理待之後另外決定，見討論紀錄。
export async function createPhotoRecord({
  rentalId,
  vehicleId,
  photoType,
  fileName,
  storagePath,
}: CreatePhotoRecordParams): Promise<void> {
  await addDoc(collection(db, 'photos'), {
    rental_id: rentalId,
    vehicle_id: vehicleId,
    stage: 'pickup',
    photo_type: photoType,
    file_name: fileName,
    storage_path: storagePath,
    gps_lat: null,
    gps_lng: null,
    uploaded_at: serverTimestamp(),
    server_uploaded_at: serverTimestamp(),
    qc_status: 'pending',
    damages: [],
  })

  await updateDoc(doc(db, 'rentals', rentalId), { pickup_photo_count: increment(1) })
}

// 四張皆上傳完成後呼叫，見 02_SDD status 狀態定義表：pickup_uploading → pickup_uploaded。
export async function markPickupUploaded(rentalId: string): Promise<void> {
  await updateDoc(doc(db, 'rentals', rentalId), { status: 'pickup_uploaded' })
}
