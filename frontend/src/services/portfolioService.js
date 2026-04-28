import {
  collection, doc,
  onSnapshot, getDoc,
  setDoc, updateDoc, arrayRemove,
} from 'firebase/firestore'
import { db } from './firebase'

// /users/{uid}/portfolio/{categoria} — un doc por categoría
// /users/{uid}/catalysts/data        — doc único con array proximos
// /market/cotizaciones               — doc único, escribe solo el backend

export function onSnapshotPortfolio(uid, callback) {
  const colRef = collection(db, 'users', uid, 'portfolio')
  return onSnapshot(colRef, (snap) => {
    const data = {}
    snap.forEach(d => { data[d.id] = d.data() })
    callback(data)
  })
}

export function onSnapshotCotizaciones(callback) {
  return onSnapshot(doc(db, 'market', 'cotizaciones'), (snap) => {
    callback(snap.exists() ? snap.data() : null)
  })
}

export function onSnapshotCatalysts(uid, callback) {
  return onSnapshot(doc(db, 'users', uid, 'catalysts', 'data'), (snap) => {
    callback(snap.exists() ? (snap.data().proximos ?? []) : [])
  })
}

export async function addPosicion(uid, categoria, posicion) {
  const ref = doc(db, 'users', uid, 'portfolio', categoria)
  const snap = await getDoc(ref)
  const posiciones = snap.exists() ? (snap.data().posiciones ?? []) : []
  await setDoc(ref, { posiciones: [...posiciones, posicion] }, { merge: true })
}

export async function updatePosicion(uid, categoria, ticker, data) {
  const ref = doc(db, 'users', uid, 'portfolio', categoria)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const posiciones = (snap.data().posiciones ?? []).map(p =>
    p.ticker === ticker ? { ...p, ...data } : p
  )
  await updateDoc(ref, { posiciones })
}

export async function deletePosicion(uid, categoria, posicion) {
  const ref = doc(db, 'users', uid, 'portfolio', categoria)
  await updateDoc(ref, { posiciones: arrayRemove(posicion) })
}
