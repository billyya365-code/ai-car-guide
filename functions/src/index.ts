import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions/v2'
import { analyzeBatch, EngineError } from './engineClient'
import { computeRiskLevel, buildAiSummary } from './riskRules'
import type { AnalyzeBatchResponseEntry, Damage, PhotoDoc, QcStatus, RentalDoc } from './types'

initializeApp()
const db = getFirestore()

const REGION = 'asia-east1'
const EXPECTED_PHOTO_COUNT = 4

// 見規劃文件 需求規劃/02_SDD_系統規格書.md：pickup_uploading -> pickup_uploaded
// （前端四張都上傳完成後寫入，見 web/src/lib/firebaseUpload.ts 的 markPickupUploaded）
// -> pickup_analyzing -> pickup_analyzed。pickup_analysis_failed 不在規格書內，是
// 這次為了處理 E003_ENGINE_TIMEOUT（引擎逾時/叫不通）額外加的終態，避免前端卡在
// loading 畫面永遠等不到結果。
export const analyzeRentalOnUpload = onDocumentUpdated(
  { document: 'rentals/{rentalId}', region: REGION, timeoutSeconds: 300, memory: '512MiB' },
  async (event) => {
    const rentalId = event.params.rentalId
    const after = event.data?.after.data() as RentalDoc | undefined
    const before = event.data?.before.data() as RentalDoc | undefined
    if (!after || before?.status === after.status || after.status !== 'pickup_uploaded') {
      return
    }

    const rentalRef = db.collection('rentals').doc(rentalId)

    // 用 transaction 當「認領」機制：Eventarc 觸發是 at-least-once，理論上可能重送，
    // 這裡確保同一筆 rental 只有一個執行實例真的會往下跑分析流程。
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(rentalRef)
      if (snap.get('status') !== 'pickup_uploaded') return false
      tx.update(rentalRef, { status: 'pickup_analyzing' })
      return true
    })
    if (!claimed) {
      logger.info(`[analyzeRentalOnUpload] ${rentalId} 已被其他執行實例認領，略過`)
      return
    }

    try {
      const photosSnap = await db.collection('photos').where('rental_id', '==', rentalId).get()
      const photoDocs = photosSnap.docs

      if (photoDocs.length !== EXPECTED_PHOTO_COUNT) {
        throw new EngineError(
          `預期 ${EXPECTED_PHOTO_COUNT} 張照片，實際查到 ${photoDocs.length} 張，資料不齊全，略過分析`,
        )
      }

      const configSnap = await db.collection('configs').doc('detection_engine').get()
      const endpointUrl = configSnap.get('endpoint_url') as string | undefined
      if (!endpointUrl) {
        throw new EngineError('configs/detection_engine 缺少 endpoint_url')
      }

      const engineResults = await analyzeBatch(endpointUrl, {
        rental_id: rentalId,
        photos: photoDocs.map((doc) => ({
          photo_id: doc.id,
          storage_path: (doc.data() as PhotoDoc).storage_path,
        })),
      })

      const resultByPhotoId = new Map<string, AnalyzeBatchResponseEntry>(
        engineResults.map((entry) => [entry.photo_id, entry]),
      )
      const missing = photoDocs.filter((doc) => !resultByPhotoId.has(doc.id))
      if (missing.length > 0) {
        throw new EngineError(`引擎回應缺少 ${missing.length} 張照片的結果`)
      }

      const allDamages: Damage[] = []
      const summaryPhotos = photoDocs.map((doc) => {
        const photo = doc.data() as PhotoDoc
        const damages = resultByPhotoId.get(doc.id)!.damages
        allDamages.push(...damages)
        return { photo_type: photo.photo_type, damages }
      })

      const { riskLevel, riskFlag } = computeRiskLevel(allDamages)
      const aiSummary = buildAiSummary(riskLevel, summaryPhotos)

      const batch = db.batch()
      for (const doc of photoDocs) {
        const result = resultByPhotoId.get(doc.id)!
        batch.update(doc.ref, { qc_status: 'analyzed' as QcStatus, damages: result.damages })
      }
      batch.update(rentalRef, {
        risk_flag: riskFlag,
        risk_level: riskLevel,
        ai_summary: aiSummary,
        status: 'pickup_analyzed',
        analyzed_at: FieldValue.serverTimestamp(),
      })
      await batch.commit()

      logger.info(`[analyzeRentalOnUpload] ${rentalId} 分析完成，risk_level=${riskLevel}`)
    } catch (err) {
      logger.error(`[analyzeRentalOnUpload] ${rentalId} 分析失敗`, err)
      await markAnalysisFailed(rentalRef, rentalId)
    }
  },
)

async function markAnalysisFailed(rentalRef: FirebaseFirestore.DocumentReference, rentalId: string): Promise<void> {
  const batch = db.batch()
  const photosSnap = await db.collection('photos').where('rental_id', '==', rentalId).get()
  for (const doc of photosSnap.docs) {
    batch.update(doc.ref, { qc_status: 'analysis_failed' as QcStatus })
  }
  batch.update(rentalRef, { status: 'pickup_analysis_failed' })
  await batch.commit()
}
