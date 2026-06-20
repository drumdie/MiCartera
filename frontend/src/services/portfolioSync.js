import { collection, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { apiPost } from './apiClient'
import { decryptPayload, encryptPayload } from './fernet'
import { readLocalPortfolio, saveLocalDocument } from './localPortfolioStore'
import { loadBrokerCreds } from './profileService'
import { recordDailySnapshot } from './portfolioHistory'

const CATEGORIES = ['acciones_ar', 'cedears', 'bonos', 'ons', 'fci', 'liquidez']

// Total ARS del portfolio (mismo criterio que computePortfolio: posiciones + liquidez).
function computeTotalARS(portfolio) {
  let total = 0
  for (const cat of CATEGORIES) {
    const c = portfolio[cat]
    if (!c) continue
    if (cat === 'liquidez') {
      total += (c.detalle ?? []).reduce((s, d) => s + (d.valor_ars ?? 0), 0)
    } else {
      total += (c.posiciones ?? []).reduce((s, p) => s + (p.valor_corriente_ars ?? 0), 0)
    }
  }
  return total
}

async function cachePlainPortfolioDoc(uid, docId, data) {
  await saveLocalDocument(uid, 'portfolio', docId, data)
}

// Descifra cada doc del snapshot con la DEK del usuario y los cachea best-effort en SQLite.
//
// CLAVE (fix mobile): el cacheo es independiente del descifrado. Antes ambos iban juntos en el
// mismo `await`, así que un fallo de CACHE (SQLite roto/no disponible en algunos dispositivos)
// hacía contar el doc como fallido → si TODOS fallaban al cachear, se lanzaba "ilegible" aunque
// se hubieran descifrado bien → el caller caía al fallback legacy /api/portfolio, que NO puede
// leer datos cifrados con la DEK del usuario → cartera vacía SOLO en mobile (la web usa
// localStorage y no pega ese fallo). Ahora: solo lanzamos si ningún doc se pudo DESCIFRAR
// (datos realmente ilegibles / clave global legacy); un fallo de cache se loguea y se sigue
// con el dato ya descifrado en memoria.
// Diagnóstico de la última lectura (read path). Lo consume la UI para mostrar exactamente
// dónde se pierde el portfolio persistido: cuántos docs hay en Firestore, cuántos se
// descifraron, qué error tiró cada uno, si se cacheó, etc. Sin valores secretos.
let _lastReadDiag = null
export function getLastReadDiag() { return _lastReadDiag }

async function decryptDocs(uid, docs, diag = null) {
  const out = {}
  let decryptedOk = 0
  for (const item of docs) {
    let plain
    try {
      plain = await decryptPayload(item.data())
    } catch (err) {
      if (diag) diag.decryptErrors.push(`${item.id}: ${err?.message || err}`)
      continue   // ilegible con la DEK actual (probablemente clave global legacy) → se saltea
    }
    decryptedOk++
    out[item.id] = plain
    try {
      await cachePlainPortfolioDoc(uid, item.id, plain)
    } catch (err) {
      if (diag) diag.cacheErrors.push(`${item.id}: ${err?.message || err}`)
      console.warn(`[portfolioSync] cache local falló para ${item.id} (se usa el dato en memoria):`, err?.message || err)
    }
  }
  if (diag) diag.decryptedOk = decryptedOk
  if (docs.length > 0 && decryptedOk === 0) {
    throw new Error('Portfolio cifrado ilegible con la DEK actual')
  }
  return out
}

// Combina los docs descifrados en memoria (autoritativos) con el cache local, para no perder
// categorías que no vinieron en este snapshot. El cache es opcional: si falla, usamos solo
// lo descifrado en memoria.
async function buildPortfolio(uid, decrypted) {
  let cached = {}
  try { cached = await readLocalPortfolio(uid) } catch { /* cache opcional */ }
  return { ...cached, ...decrypted }
}

export async function pullPortfolioFromFirestore(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'portfolio'))
  const diag = {
    firestoreDocs: snap.size,
    docIds: snap.docs.map(d => d.id),
    decryptedOk: 0,
    decryptErrors: [],
    cacheErrors: [],
  }
  try {
    const decrypted = await decryptDocs(uid, snap.docs, diag)
    _lastReadDiag = diag
    return buildPortfolio(uid, decrypted)
  } catch (err) {
    diag.threw = err?.message || String(err)
    _lastReadDiag = diag
    throw err
  }
}

export function subscribeEncryptedPortfolio(uid, onData, onError) {
  return onSnapshot(
    collection(db, 'users', uid, 'portfolio'),
    async snap => {
      try {
        const decrypted = await decryptDocs(uid, snap.docs)
        onData(await buildPortfolio(uid, decrypted))
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

const BROKER_CRED_KEYS = ['authorized_client', 'client_key', 'api_key', 'api_secret', 'account_number']

export async function syncBrokerPortfolioToDevice(uid) {
  // Diagnóstico: capturamos dónde corta el flujo sin exponer ningún valor secreto
  // (solo nombres de campos presentes/faltantes y conteos). Lo consume la UI para
  // mostrar por qué un sync "OK" puede venir sin posiciones.
  const diag = { credsLoaded: false, decryptError: null, presentKeys: [], missingKeys: [...BROKER_CRED_KEYS] }

  let brokerCredentials = null
  try {
    brokerCredentials = await loadBrokerCreds(uid)
    diag.credsLoaded = !!brokerCredentials
  } catch (err) {
    // No abortar: registramos el fallo de descifrado y seguimos (el backend puede
    // usar sus propias credenciales). Esto evita que un cred ilegible tire todo el sync.
    diag.decryptError = err?.message || 'No se pudieron descifrar las credenciales'
  }

  diag.presentKeys = BROKER_CRED_KEYS.filter(k => String(brokerCredentials?.[k] || '').trim())
  diag.missingKeys = BROKER_CRED_KEYS.filter(k => !diag.presentKeys.includes(k))
  const hasBrokerCredentials = diag.missingKeys.length === 0

  const body = hasBrokerCredentials
    ? { broker_credentials: brokerCredentials }
    : null
  const result = await apiPost('/api/portfolio/sync-source', body)
  diag.status = result?.status ?? null
  diag.totalPosiciones = result?.total_posiciones ?? 0
  diag.usedUserCreds = hasBrokerCredentials
  // Detalle del error real de PPI cuando el backend devuelve sin_datos_frescos
  // (ej. "PPIError: PPI login fallo (HTTP 401)" o "ReadTimeout: ...").
  diag.backendError = result?.error_detail ?? null

  if (result?.portfolio) {
    await persistBrokerPortfolio(uid, result.portfolio)
    // Snapshot diario para el rendimiento 30d (device-owned, cifrado con la DEK).
    await recordDailySnapshot(uid, computeTotalARS(result.portfolio))
  }
  return { ...result, _diag: diag }
}
