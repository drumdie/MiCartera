import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'

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

function shouldReplace(current, incoming) {
  const currentAt = getUpdatedAt(current)
  const incomingAt = getUpdatedAt(incoming)
  if (!currentAt || !incomingAt) return true
  return incomingAt >= currentAt
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
  const db = await getDb()
  const cachedAt = new Date().toISOString()
  const updatedAt = getUpdatedAt(payload)
  if (!db) {
    const data = await readFallback(uid)
    const current = data?.[collectionName]?.[docId]
    if (shouldReplace(current, payload)) {
      data[collectionName] = { ...(data[collectionName] || {}), [docId]: payload }
      await writeFallback(uid, data)
    }
    return
  }

  const current = await db.query(
    'SELECT payload_json FROM portfolio_cache WHERE uid = ? AND collection_name = ? AND doc_id = ? LIMIT 1',
    [uid, collectionName, docId],
  )
  const currentPayload = current.values?.[0]?.payload_json
    ? JSON.parse(current.values[0].payload_json)
    : null
  if (!shouldReplace(currentPayload, payload)) return

  await db.run(
    `INSERT OR REPLACE INTO portfolio_cache
      (uid, collection_name, doc_id, payload_json, updated_at, cached_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uid, collectionName, docId, JSON.stringify(payload), updatedAt, cachedAt],
  )
}

export async function readLocalCollection(uid, collectionName) {
  const db = await getDb()
  if (!db) {
    const data = await readFallback(uid)
    return data[collectionName] || {}
  }
  const rows = await db.query(
    'SELECT doc_id, payload_json FROM portfolio_cache WHERE uid = ? AND collection_name = ?',
    [uid, collectionName],
  )
  const out = {}
  for (const row of rows.values || []) out[row.doc_id] = JSON.parse(row.payload_json)
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
