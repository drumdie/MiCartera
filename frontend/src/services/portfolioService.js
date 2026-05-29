import {
  collection, doc,
  onSnapshot, getDoc,
  setDoc, updateDoc, arrayRemove,
} from 'firebase/firestore'
import { db } from './firebase'

// /users/{uid}/portfolio/{categoria} queda cifrado y se lee/escribe via backend API.
// /users/{uid}/catalysts/data mantiene lectura directa porque no contiene saldos.
// /market/cotizaciones lo escribe solo el backend.

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

// Fundamentales: coleccion /users/{uid}/fundamentals/{ticker}
// Cada doc tiene metricas de yfinance + analisis Claude (tesis, escenarios, accion_tactica).
export function onSnapshotFundamentals(uid, callback) {
  return onSnapshot(collection(db, 'users', uid, 'fundamentals'), (snap) => {
    const data = {}
    snap.forEach(d => { data[d.id] = d.data() })
    callback(data)
  })
}

export async function addCatalyst(uid, catalyst) {
  const ref  = doc(db, 'users', uid, 'catalysts', 'data')
  const snap = await getDoc(ref)
  const proximos = snap.exists() ? (snap.data().proximos ?? []) : []
  await setDoc(ref, { proximos: [...proximos, catalyst] }, { merge: true })
}

export async function deleteCatalyst(uid, catalyst) {
  const ref = doc(db, 'users', uid, 'catalysts', 'data')
  await updateDoc(ref, { proximos: arrayRemove(catalyst) })
}
