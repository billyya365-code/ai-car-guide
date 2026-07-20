import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'

// 專案設定值放在 .env.local（不進 git，見 web/.env.example），對照 Ciao 提供的
// 04_前端模組規格書與串接資料包.md 裡的 firebaseConfig。Firebase 前端金鑰本身不算
// 機密（安全性由 Firestore/Storage Security Rules 把關，不是靠藏這把 key），放進
// 環境變數主要是方便多人開發/未來換專案時管理，不是為了防外洩。
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const firebaseApp = initializeApp(firebaseConfig)
export const db = getFirestore(firebaseApp)
export const storage = getStorage(firebaseApp)
export const auth = getAuth(firebaseApp)

// Analytics 用 isSupported() 檢查再初始化（官方建議寫法）：部分瀏覽器/隱私模式/
// 非瀏覽器環境呼叫 getAnalytics() 會直接拋錯，這裡失敗也不該影響其他 Firebase
// 功能，純粹是錦上添花的量測，用不到就略過。
isAnalyticsSupported()
  .then((supported) => {
    if (supported) getAnalytics(firebaseApp)
  })
  .catch(() => {
    // 略過
  })

let anonymousAuthPromise: Promise<User> | null = null

// Demo 帳號一律用匿名登入（見 01_SAS 第 8 節），整個 App 生命週期只需要成功一次，
// 用同一個 in-flight promise 快取，避免多個元件各自呼叫時重複觸發登入請求。
export function ensureAnonymousAuth(): Promise<User> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser)
  if (!anonymousAuthPromise) {
    anonymousAuthPromise = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (user) {
            unsubscribe()
            resolve(user)
          }
        },
        (err) => {
          unsubscribe()
          anonymousAuthPromise = null
          reject(err)
        },
      )
      signInAnonymously(auth).catch((err) => {
        unsubscribe()
        anonymousAuthPromise = null
        reject(err)
      })
    })
  }
  return anonymousAuthPromise
}
