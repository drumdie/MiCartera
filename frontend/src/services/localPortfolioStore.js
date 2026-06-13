import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { encryptPayload, decryptPayload } from './fernet'

const DB_NAME = 'micartera_user_cache'
const CATEGORIES = ['acciones_ar', 'cedears', 'bonos', 'ons', 'fci', 'liquidez']
let dbPromise = null

function storageKey(uid) {
  return `micartera_sqlite_fallback_${uid}`
}

async function openNativeDb() {
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  const db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)
  await db.open()
  await db.execute(`
    CREATE TABLE IF NOT EXISTS portfolio_cache (
      uid TEXT NOT NULL,
      collection_name TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT,
      cached_at TEXT NOT NULL,
      PRIMARY KEY (uid, collection_name, doc_id)
    );
  `)
  return db
}

async function getDb() {
  if (!Capacitor.isNativePlatform()) return null
  if (!dbPromise) dbPromise = openNativeDb()
  return dbPromise
}

function getUpdatedAt(payload) {
  return payload?.updatedAt || payload?.ultima_sync || payload?.actualizado || null
}

// LWW por timestamp. Comparamos los timestamps en claro (columna updated_at / campo
// updatedAt) para no tener que descifrar el payload solo para decidir si reemplazar.
function shouldReplaceTs(currentTs, incomingTs) {
  if (!currentTs || !incomingTs) return true
  return incomingTs >= currentTs
}

// El payload sensible se guarda CIFRADO en reposo (Fernet con la DEK del usuario), tanto en
// SQLite (columna payload_json) como en el fallback localStorage. Solo el timestamp de LWW
// queda en claro. Con el stub de DEK esto aún no da confidencialidad real (clave en el
// bundle); con P1.2 — clave por usuario derivada on-device — pasa a ser cifrado-at-rest de
// verdad sin tocar este módulo.
async function decodeStored(stored) {
  // Soporta ciphertext nuevo y, por robustez en transición, plaintext de un cache viejo.
  if (stored && stored._encrypted) return decryptPayload(stored)
  return stored
}

async function readFallback(uid) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(uid)) || '{}')
  } catch {
    return {}
  }
}

async function writeFallback(uid, data) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(data))
  } catch {
    // Fallback best-effort para web; Android usa SQLite nativo.
  }
}

export async function saveLocalDocument(uid, collectionName, docId, payload) {
  const cachedAt = new Date().toISOString()
  const updatedAt = getUpdatedAt(payload)
  const db = await getDb()

  if (!db) {
    const data = await readFallback(uid)
    const current = data?.[collectionName]?.[docId]
    if (!shouldReplaceTs(current?.updatedAt, updatedAt)) return
    const cipher = await encryptPayload(payload)
    data[collectionName] = { ...(data[collectionName] || {}), [docId]: { updatedAt, cipher } }
    await writeFallback(uid, data)
    return
  }

  const current = await db.query(
    'SELECT updated_at FROM portfolio_cache WHERE uid = ? AND collection_name = ? AND doc_id = ? LIMIT 1',
    [uid, collectionName, docId],
  )
  const currentTs = current.values?.[0]?.updated_at || null
  if (!shouldReplaceTs(currentTs, updatedAt)) return

  const cipher = await encryptPayload(payload)
  await db.run(
    `INSERT OR REPLACE INTO portfolio_cache
      (uid, collection_name, doc_id, payload_json, updated_at, cached_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uid, collectionName, docId, JSON.stringify(cipher), updatedAt, cachedAt],
  )
}

export async function readLocalCollection(uid, collectionName) {
  const db = await getDb()
  const out = {}

  if (!db) {
    const data = await readFallback(uid)
    const coll = data[collectionName] || {}
    for (const [docId, entry] of Object.entries(coll)) {
      try {
        out[docId] = entry?.cipher ? await decryptPayload(entry.cipher) : await decodeStored(entry)
      } catch {
        // Doc corrupto/ilegible: se saltea (el cache es reconstruible desde Firestore).
      }
    }
    return out
  }

  const rows = await db.query(
    'SELECT doc_id, payload_json FROM portfolio_cache WHERE uid = ? AND collection_name = ?',
    [uid, collectionName],
  )
  for (const row of rows.values || []) {
    try {
      out[row.doc_id] = await decodeStored(JSON.parse(row.payload_json))
    } catch {
      // Doc corrupto/ilegible: se saltea.
    }
  }
  return out
}

export async function readLocalPortfolio(uid) {
  const docs = await readLocalCollection(uid, 'portfolio')
  const portfolio = {}
  for (const cat of CATEGORIES) {
    portfolio[cat] = docs[cat] || (cat === 'liquidez'
      ? { detalle: [], subtotal_ars: 0 }
      : { posiciones: [], subtotal_ars: 0 })
  }
  return portfolio
}

// Purga el cache local de un usuario (logout). Evita que el plaintext descifrado quede en
// el dispositivo para el siguiente usuario que inicie sesión.
export async function clearLocalUser(uid) {
  const db = await getDb()
  if (!db) {
    try { localStorage.removeItem(storageKey(uid)) } catch { /* best-effort */ }
    return
  }
  await db.run('DELETE FROM portfolio_cache WHERE uid = ?', [uid])
}
