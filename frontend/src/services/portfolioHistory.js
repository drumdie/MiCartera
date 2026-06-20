import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { encryptPayload, decryptPayload } from './fernet'
import { apiGet } from './apiClient'

// Historial diario del valor total, propiedad del DISPOSITIVO (modelo device-encrypt).
// Antes lo escribía el backend en cada /sync, pero con device-encrypt el sync corre en el
// dispositivo y el backend ya no ve el portfolio → el snapshot dejó de escribirse.
// Acá lo escribe el propio sync del dispositivo, cifrado con la DEK del usuario, y el
// Dashboard lo lee de /users/{uid}/meta/history_device. {YYYY-MM-DD: total_ars}.

function historyRef(uid) {
  return doc(db, 'users', uid, 'meta', 'history_device')
}

function todayBA() {
  const s = new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
  return new Date(s).toISOString().slice(0, 10)
}

export async function readDeviceHistory(uid) {
  if (!uid) return {}
  try {
    const snap = await getDoc(historyRef(uid))
    if (!snap.exists()) return {}
    const data = await decryptPayload(snap.data())   // requiere DEK lista
    return data?.history ?? {}
  } catch {
    // DEK aún no desbloqueada o doc ilegible → sin historial por ahora
    return {}
  }
}

async function writeDeviceHistory(uid, history) {
  await setDoc(historyRef(uid), await encryptPayload({ history }))
}

// Registra (o actualiza) el snapshot de HOY con el último total conocido.
export async function recordDailySnapshot(uid, totalARS) {
  if (!uid || !(totalARS > 0)) return
  try {
    const history = await readDeviceHistory(uid)
    history[todayBA()] = Math.round(totalARS * 100) / 100
    await writeDeviceHistory(uid, history)
  } catch {
    // No romper el sync si falla la escritura del historial
  }
}

// Importa una sola vez los días viejos que escribió el backend (si todavía son legibles
// vía /history) y los fusiona, para no perder el historial previo a device-encrypt.
export async function importLegacyHistoryOnce(uid) {
  if (!uid) return
  try {
    const existing = await readDeviceHistory(uid)
    if (Object.keys(existing).length > 1) return   // ya tenemos historial propio acumulado
    const legacy = await apiGet('/api/portfolio/history')
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy) && Object.keys(legacy).length) {
      await writeDeviceHistory(uid, { ...legacy, ...existing })
    }
  } catch {
    // backend sin historial legible → seguimos solo con el device
  }
}
