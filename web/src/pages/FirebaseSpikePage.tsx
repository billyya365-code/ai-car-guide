import { useEffect, useState } from 'react'
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage, ensureAnonymousAuth } from '../lib/firebase'

// 驗證用診斷頁面：確認 Firebase 專案設定（.env.local）連得通——匿名登入、
// Firestore 寫入、Firestore 讀取三件事各自成功與否，分開顯示，方便排查是
// 卡在哪一步（例如專案還沒開 Authentication 的匿名登入、或 Firestore Rules
// 擋掉未預期的存取）。這份文件現在接的是個人測試用 Firebase 專案，不是
// 04 文件裡團隊共用的正式專案，可以放心寫測試資料。

type StepStatus = 'idle' | 'running' | 'ok' | 'error'

// 產生一張小紅色方塊 PNG 當測試用假照片，不需要真的接相機——這裡只驗證 Storage
// 上傳/取得下載網址這條路通不通，不是驗證拍照功能本身。
function createTestImageBlob(): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#e74c3c'
  ctx.fillRect(0, 0, 64, 64)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob 失敗'))), 'image/png')
  })
}

export function FirebaseSpikePage() {
  const [authStatus, setAuthStatus] = useState<StepStatus>('idle')
  const [authDetail, setAuthDetail] = useState('')
  const [writeStatus, setWriteStatus] = useState<StepStatus>('idle')
  const [writeDetail, setWriteDetail] = useState('')
  const [readStatus, setReadStatus] = useState<StepStatus>('idle')
  const [readDetail, setReadDetail] = useState('')
  const [storageStatus, setStorageStatus] = useState<StepStatus>('idle')
  const [storageDetail, setStorageDetail] = useState('')

  useEffect(() => {
    setAuthStatus('running')
    ensureAnonymousAuth()
      .then((user) => {
        setAuthStatus('ok')
        setAuthDetail(`已登入，UID: ${user.uid}`)
      })
      .catch((err) => {
        setAuthStatus('error')
        setAuthDetail(String(err))
      })
  }, [])

  const testWrite = async () => {
    setWriteStatus('running')
    try {
      const docRef = await addDoc(collection(db, '_connection_test'), {
        message: 'hello from FirebaseSpikePage',
        created_at: serverTimestamp(),
      })
      setWriteStatus('ok')
      setWriteDetail(`寫入成功，doc id: ${docRef.id}`)
    } catch (err) {
      setWriteStatus('error')
      setWriteDetail(String(err))
    }
  }

  const testRead = async () => {
    setReadStatus('running')
    try {
      const snapshot = await getDocs(collection(db, '_connection_test'))
      setReadStatus('ok')
      setReadDetail(`讀取成功，目前共 ${snapshot.size} 筆文件`)
    } catch (err) {
      setReadStatus('error')
      setReadDetail(String(err))
    }
  }

  const testStorageUpload = async () => {
    setStorageStatus('running')
    try {
      const blob = await createTestImageBlob()
      const fileName = `_connection_test/test-${Date.now()}.png`
      const storageRef = ref(storage, fileName)
      await uploadBytes(storageRef, blob, { contentType: 'image/png' })
      const url = await getDownloadURL(storageRef)
      setStorageStatus('ok')
      setStorageDetail(`上傳成功：${fileName}\n下載網址：${url}`)
    } catch (err) {
      setStorageStatus('error')
      setStorageDetail(String(err))
    }
  }

  const statusLabel = (status: StepStatus) =>
    ({ idle: '⏳ 尚未開始', running: '🔄 執行中…', ok: '✅ 成功', error: '❌ 失敗' })[status]

  return (
    <main style={{ padding: 16 }}>
      <h1>Firebase 連線測試</h1>
      <p>目前使用的專案：{import.meta.env.VITE_FIREBASE_PROJECT_ID}</p>

      <section style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16 }}>1. 匿名登入</h2>
        <p>{statusLabel(authStatus)}</p>
        {authDetail && <p style={{ wordBreak: 'break-all', color: authStatus === 'error' ? 'crimson' : undefined }}>{authDetail}</p>}
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16 }}>2. Firestore 寫入測試</h2>
        <button type="button" onClick={testWrite} disabled={authStatus !== 'ok'}>
          寫入一筆測試文件（collection: _connection_test）
        </button>
        <p>{statusLabel(writeStatus)}</p>
        {writeDetail && (
          <p style={{ wordBreak: 'break-all', color: writeStatus === 'error' ? 'crimson' : undefined }}>{writeDetail}</p>
        )}
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16 }}>3. Firestore 讀取測試</h2>
        <button type="button" onClick={testRead} disabled={authStatus !== 'ok'}>
          讀取 _connection_test 集合
        </button>
        <p>{statusLabel(readStatus)}</p>
        {readDetail && (
          <p style={{ wordBreak: 'break-all', color: readStatus === 'error' ? 'crimson' : undefined }}>{readDetail}</p>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 16 }}>4. Storage 上傳測試</h2>
        <button type="button" onClick={testStorageUpload} disabled={authStatus !== 'ok'}>
          上傳一張測試圖片
        </button>
        <p>{statusLabel(storageStatus)}</p>
        {storageDetail && (
          <p style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap', color: storageStatus === 'error' ? 'crimson' : undefined }}>
            {storageDetail}
          </p>
        )}
      </section>
    </main>
  )
}
