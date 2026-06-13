const DEV_DEK_SEED = 'micartera-dev-user-dek-v1'
const _rawByKey = new WeakMap()

async function sha256(text) {
  const bytes = new TextEncoder().encode(text)
  return crypto.subtle.digest('SHA-256', bytes)
}

function bytesToBase64Url(bytes) {
  const raw = String.fromCharCode(...bytes)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function importAesKey(raw) {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-CBC', length: 128 },
    true,
    ['encrypt', 'decrypt'],
  )
}

// FIX: seam unico para la DEK por usuario.
// REASON: P1.2 reemplaza solo este modulo por unwrap real de la DEK del usuario.
// IMPACT: Fernet, Firestore sync y SQLite no dependen de la clave global del backend.
export async function getUserDEK() {
  const digest = new Uint8Array(await sha256(DEV_DEK_SEED))
  const fernetKey = bytesToBase64Url(digest)
  const keyBytes = digest.slice(16, 32)
  const key = await importAesKey(keyBytes)
  _rawByKey.set(key, digest)
  key.fernetKey = fernetKey
  return key
}

export async function getUserDEKMaterial() {
  const key = await getUserDEK()
  const raw = _rawByKey.get(key)
  if (!raw) {
    throw new Error('DEK no exportable: integrar P1.2 debe proveer material Fernet o migrar algoritmo')
  }
  return raw
}
