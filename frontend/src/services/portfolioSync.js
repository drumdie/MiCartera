import { collection, getDocs, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { apiGet, apiPost } from './apiClient'
import { decryptPayload } from './fernet'
import { readLocalPortfolio, saveLocalDocument } from './localPortfolioStore'
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

// SEC-2 · F2 — Lectura server-side. El backend descifra el portfolio con la DEK de sesión
// (POST /api/session/unlock) y devuelve el portfolio EN CLARO. El front ya no lee el
// ciphertext de Firestore ni descifra con Fernet JS para el camino primario.
// Se cachea el plano en el store local (offline-first) best-effort.
//
// Coexistencia transicional: si el backend no está disponible o la sesión está bloqueada,
// el caller cae al camino legacy (pullPortfolioFromFirestore, que sí usa la DEK local).
export async function fetchPortfolioFromBackend(uid) {
  const data = await apiGet('/api/portfolio')   // { acciones_ar: {...}, ..., liquidez: {...} }
  _lastReadDiag = { source: 'backend-dek', firestoreDocs: 0, decryptedOk: 0, decryptErrors: [], cacheErrors: [] }
  // Cachear cada categoría en el store local (best-effort): un fallo de cache no rompe la lectura.
  for (const cat of CATEGORIES) {
    const catData = data?.[cat]
    if (!catData) continue
    try {
      await cachePlainPortfolioDoc(uid, cat, catData)
    } catch (err) {
      _lastReadDiag.cacheErrors.push(`${cat}: ${err?.message || err}`)
    }
  }
  return data
}

// LEGACY (transición) — lectura directa del ciphertext de Firestore + descifrado local con
// la DEK del usuario. Fallback cuando GET /api/portfolio no está disponible. Se elimina en F3.
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

// SEC-2 · F1 — El BACKEND ya escribió el portfolio cifrado (DEK de sesión) en Firestore.
// El front solo cachea el plano en el store local (offline-first). YA NO cifra con Fernet JS
// ni escribe ciphertext en Firestore (eso lo hacía el front antes; ahora lo hace el backend).
export async function cacheBrokerPortfolioLocally(uid, portfolio) {
  await Promise.all(CATEGORIES.map(async cat => {
    const data = portfolio[cat]
    if (!data) return
    try {
      await cachePlainPortfolioDoc(uid, cat, data)
    } catch (err) {
      console.warn(`[portfolioSync] cache local falló para ${cat} (no fatal):`, err?.message || err)
    }
  }))
}

const BROKER_CRED_KEYS = ['authorized_client', 'client_key', 'api_key', 'api_secret', 'account_number']

export async function syncBrokerPortfolioToDevice(uid) {
  // SEC-2 F1: el BACKEND descifra las credenciales del broker server-side (DEK desbloqueada
  // vía /api/session/unlock), llama al broker, construye el portfolio, lo CIFRA con la DEK de
  // sesión y lo ESCRIBE en Firestore. Devuelve el portfolio en claro para cachearlo localmente.
  // El front ya no manda creds ni escribe ciphertext.
  const result = await apiPost('/api/portfolio/sync-source', null)

  // Diagnóstico (sin tocar creds en el front): las gestiona el backend.
  const diag = {
    credsLoaded: true,
    decryptError: null,
    presentKeys: [...BROKER_CRED_KEYS],
    missingKeys: [],
    usedUserCreds: true,
    status: result?.status ?? null,
    totalPosiciones: result?.total_posiciones ?? 0,
    // Detalle real de PPI cuando el backend devuelve sin_datos_frescos.
    backendError: result?.error_detail ?? null,
  }

  if (result?.portfolio) {
    await cacheBrokerPortfolioLocally(uid, result.portfolio)
    // Snapshot diario para el rendimiento 30d (device-owned, cifrado con la DEK).
    await recordDailySnapshot(uid, computeTotalARS(result.portfolio))
  }
  return { ...result, _diag: diag }
}
