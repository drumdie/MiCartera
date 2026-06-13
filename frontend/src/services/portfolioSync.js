import { collection, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { apiPost } from './apiClient'
import { decryptPayload, encryptPayload } from './fernet'
import { readLocalPortfolio, saveLocalDocument } from './localPortfolioStore'

const CATEGORIES = ['acciones_ar', 'cedears', 'bonos', 'ons', 'fci', 'liquidez']

async function cachePlainPortfolioDoc(uid, docId, data) {
  await saveLocalDocument(uid, 'portfolio', docId, data)
}

export async function pullPortfolioFromFirestore(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'portfolio'))
  await Promise.all(snap.docs.map(async item => {
    const plain = await decryptPayload(item.data())
    await cachePlainPortfolioDoc(uid, item.id, plain)
  }))
  return readLocalPortfolio(uid)
}

export function subscribeEncryptedPortfolio(uid, onData, onError) {
  return onSnapshot(
    collection(db, 'users', uid, 'portfolio'),
    async snap => {
      try {
        await Promise.all(snap.docs.map(async item => {
          const plain = await decryptPayload(item.data())
          await cachePlainPortfolioDoc(uid, item.id, plain)
        }))
        onData(await readLocalPortfolio(uid))
      } catch (err) {
        onError?.(err)
      }
    },
    err => onError?.(err),
  )
}

export async function readCachedPortfolio(uid) {
  return readLocalPortfolio(uid)
}

export async function persistBrokerPortfolio(uid, portfolio) {
  await Promise.all(CATEGORIES.map(async cat => {
    const data = portfolio[cat]
    if (!data) return
    const encrypted = await encryptPayload(data)
    await setDoc(doc(db, 'users', uid, 'portfolio', cat), encrypted)
    await cachePlainPortfolioDoc(uid, cat, data)
  }))
}

export async function syncBrokerPortfolioToDevice(uid) {
  const result = await apiPost('/api/portfolio/sync-source')
  if (result?.portfolio) {
    await persistBrokerPortfolio(uid, result.portfolio)
  }
  return result
}
