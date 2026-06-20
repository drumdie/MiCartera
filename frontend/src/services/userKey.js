import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

// ---------------------------------------------------------------------------
// Envelope encryption por usuario (P1.2)
//
// DEK  = 32 bytes aleatorios = la clave Fernet real que cifra portfolio/contratos.
// KEK  = clave AES-GCM derivada de un secreto del usuario (PBKDF2-SHA256).
// La DEK se guarda en Firestore SOLO envuelta (cifrada) bajo dos KEKs independientes:
//   - KEK derivada de la PASSPHRASE del usuario
//   - KEK derivada de un RECOVERY CODE generado en el onboarding
// Cualquiera de los dos secretos desenvuelve la misma DEK. Firestore/ backend nunca ven
// la DEK ni los secretos en claro. AES-GCM es autenticado: un secreto incorrecto hace
// fallar el decrypt (no devuelve una DEK basura silenciosamente).
// ---------------------------------------------------------------------------

const KEYWRAP_VERSION = 1
const KDF = 'PBKDF2-SHA256'
const PBKDF2_ITERATIONS = 600000   // OWASP 2023 para PBKDF2-SHA256

export class DEKLockedError extends Error {
  constructor(msg = 'DEK bloqueada: el usuario debe ingresar su passphrase') {
    super(msg)
    this.name = 'DEKLockedError'
  }
}

// --- DEK cacheada en memoria por sesión (no se persiste en claro) -----------
let _dekMaterial = null   // Uint8Array(32) | null

// Suscriptores que reaccionan a cambios de disponibilidad de la DEK (desbloqueo/logout).
// Lo usa AppContext para disparar el auto-sync recién cuando la DEK está lista (post-passphrase),
// no apenas hay user (que es antes del gate, con la DEK bloqueada).
const _dekListeners = new Set()

export function isDEKReady() {
  return _dekMaterial !== null
}

export function onDEKChange(cb) {
  _dekListeners.add(cb)
  return () => _dekListeners.delete(cb)
}

function _notifyDEK() {
  for (const cb of _dekListeners) {
    try { cb(isDEKReady()) } catch { /* un listener no debe romper a los demás */ }
  }
}

export function getCachedDEKMaterial() {
  return _dekMaterial
}

export function clearDEK() {
  if (_dekMaterial) _dekMaterial.fill(0)   // best-effort: borrar de memoria
  _dekMaterial = null
  _notifyDEK()
}

function cacheDEK(material) {
  _dekMaterial = material
  _notifyDEK()
}

// --- helpers base64 / bytes -------------------------------------------------
function b64(bytes) {
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s)
}
function unb64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}

// --- recovery code (base32 Crockford, alta entropía, legible) ---------------
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'   // sin I, L, O, U

function toBase32(bytes) {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

function generateRecoveryCode() {
  // 20 bytes = 160 bits de entropía → ~32 chars base32, agrupados de a 4.
  const raw = crypto.getRandomValues(new Uint8Array(20))
  return toBase32(raw).match(/.{1,4}/g).join('-')
}

// El recovery code se usa como secreto de KDF igual que una passphrase. Se normaliza
// (sin guiones/espacios, mayúsculas) para que el formato de display no afecte la derivación.
function normalizeRecovery(code) {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

// --- primitivas cripto ------------------------------------------------------
async function deriveKEK(secret, salt, iterations) {
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function wrapDEK(dekBytes, kek) {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, kek, dekBytes))
  return { nonce: b64(nonce), wrappedDek: b64(ct) }
}

async function unwrapDEK(blob, kek) {
  const nonce = unb64(blob.nonce)
  const ct = unb64(blob.wrappedDek)
  const dek = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, kek, ct))
  if (dek.length !== 32) throw new Error('DEK con tamaño inválido')
  return dek
}

// Construye un blob {salt, nonce, wrappedDek} envolviendo la DEK con KEK(secret).
async function wrapUnderSecret(dekBytes, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const kek = await deriveKEK(secret, salt, PBKDF2_ITERATIONS)
  const wrapped = await wrapDEK(dekBytes, kek)
  return { salt: b64(salt), iterations: PBKDF2_ITERATIONS, ...wrapped }
}

async function unwrapUnderSecret(blob, secret) {
  const kek = await deriveKEK(secret, unb64(blob.salt), blob.iterations || PBKDF2_ITERATIONS)
  return unwrapDEK(blob, kek)
}

// --- Firestore: /users/{uid}/keywrap/data -----------------------------------
function keywrapRef(uid) {
  return doc(db, 'users', uid, 'keywrap', 'data')
}

async function loadKeywrap(uid) {
  const snap = await getDoc(keywrapRef(uid))
  return snap.exists() ? snap.data() : null
}

async function saveKeywrap(uid, data) {
  await setDoc(keywrapRef(uid), data)
}

export async function isKeySetup(uid) {
  return (await loadKeywrap(uid)) !== null
}

// --- API pública ------------------------------------------------------------

// Primer login: genera DEK + recovery code, envuelve la DEK bajo passphrase y recovery,
// persiste el keywrap y cachea la DEK. Devuelve el recovery code para mostrarlo UNA vez.
export async function setupUserKey(uid, passphrase) {
  const dek = crypto.getRandomValues(new Uint8Array(32))
  const recoveryCode = generateRecoveryCode()

  const data = {
    version: KEYWRAP_VERSION,
    kdf: KDF,
    passphrase: await wrapUnderSecret(dek, passphrase),
    recovery: await wrapUnderSecret(dek, normalizeRecovery(recoveryCode)),
    createdAt: new Date().toISOString(),
  }
  await saveKeywrap(uid, data)
  cacheDEK(dek)
  return recoveryCode
}

// Login siguiente: desenvuelve la DEK con la passphrase. Lanza si es incorrecta.
export async function unlockWithPassphrase(uid, passphrase) {
  const data = await loadKeywrap(uid)
  if (!data) throw new Error('No hay clave configurada para este usuario')
  const dek = await unwrapUnderSecret(data.passphrase, passphrase)   // AES-GCM falla si la passphrase es incorrecta
  cacheDEK(dek)
}

// Cambio de passphrase: desenvuelve la DEK con la passphrase ACTUAL y la re-envuelve bajo
// una NUEVA, re-guardando el keywrap. El recovery code NO cambia (sigue abriendo la misma DEK).
// Lanza si la passphrase actual es incorrecta (AES-GCM falla el decrypt).
export async function changePassphrase(uid, currentPassphrase, newPassphrase) {
  if (!newPassphrase || newPassphrase.length < 8) {
    throw new Error('La nueva passphrase debe tener al menos 8 caracteres')
  }
  const data = await loadKeywrap(uid)
  if (!data) throw new Error('No hay clave configurada para este usuario')
  const dek = await unwrapUnderSecret(data.passphrase, currentPassphrase)   // falla si la actual es incorrecta
  data.passphrase = await wrapUnderSecret(dek, newPassphrase)
  data.updatedAt = new Date().toISOString()
  await saveKeywrap(uid, data)
  cacheDEK(dek)
}

// Recuperación: desenvuelve la DEK con el recovery code y re-envuelve la passphrase con
// una nueva. Lanza si el recovery code es incorrecto.
export async function unlockWithRecovery(uid, recoveryCode, newPassphrase) {
  const data = await loadKeywrap(uid)
  if (!data) throw new Error('No hay clave configurada para este usuario')
  const dek = await unwrapUnderSecret(data.recovery, normalizeRecovery(recoveryCode))
  if (newPassphrase) {
    data.passphrase = await wrapUnderSecret(dek, newPassphrase)
    data.updatedAt = new Date().toISOString()
    await saveKeywrap(uid, data)
  }
  cacheDEK(dek)
}
