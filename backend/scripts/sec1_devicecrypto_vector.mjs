// SEC-1 · F1a — Generador de VECTOR DE PRUEBA (descartable, sin secretos reales).
//
// Replica con WebCrypto las primitivas exactas del frontend:
//   - userKey.js  -> wrapUnderSecret (PBKDF2-SHA256 600k + AES-GCM)
//   - fernet.js   -> encryptPayload  (Fernet estándar: AES-128-CBC + HMAC-SHA256)
//
// Emite por stdout un JSON con un keywrap + un documento cifrado generados con una
// passphrase y un payload CONOCIDOS, para que el port de Python (device_crypto.py)
// demuestre que descifra lo que cifra el front. NO usa datos reales del usuario.
//
// Uso:  node backend/scripts/sec1_devicecrypto_vector.mjs

import { webcrypto } from 'node:crypto'
const crypto = globalThis.crypto ?? webcrypto

const PBKDF2_ITERATIONS = 600000
const VERSION = 0x80
const ENCRYPTED_MARKER = 'fernet-v1'

function b64(bytes) {
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s)
}
function bytesToBase64Url(bytes) {
  let raw = ''
  for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.slice(i, i + 0x8000))
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}
function concatBytes(...chunks) {
  const len = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}
function pkcs7Pad(bytes) {
  const rem = bytes.length % 16
  const pad = rem === 0 ? 16 : 16 - rem
  const out = new Uint8Array(bytes.length + pad)
  out.set(bytes)
  out.fill(pad, bytes.length)
  return out
}

async function deriveKEK(secret, salt, iterations) {
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function wrapUnderSecret(dekBytes, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const kek = await deriveKEK(secret, salt, PBKDF2_ITERATIONS)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, kek, dekBytes))
  return { salt: b64(salt), iterations: PBKDF2_ITERATIONS, nonce: b64(nonce), wrappedDek: b64(ct) }
}

async function encryptPayload(payload, material) {
  const signingKey = material.slice(0, 16)
  const encryptionKey = material.slice(16, 32)
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const now = Math.floor(Date.now() / 1000)
  const ts = new Uint8Array(8)
  new DataView(ts.buffer).setBigUint64(0, BigInt(now), false)

  const data = pkcs7Pad(new TextEncoder().encode(stableStringify(payload)))
  const aesKey = await crypto.subtle.importKey('raw', encryptionKey, { name: 'AES-CBC', length: 128 }, false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, data))
  const signed = concatBytes(new Uint8Array([VERSION]), ts, iv, ciphertext)
  const hmacKey = await crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, signed))

  return { _encrypted: true, _enc_alg: ENCRYPTED_MARKER, payload: bytesToBase64Url(concatBytes(signed, mac)) }
}

// --- decrypt (espejo de fernet.js decryptPayload) — para probar Python -> JS ---
function unb64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)) }
function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}
function pkcs7Unpad(bytes) {
  const pad = bytes[bytes.length - 1]
  if (pad < 1 || pad > 16 || pad > bytes.length) throw new Error('Padding invalido')
  return bytes.slice(0, bytes.length - pad)
}
async function decryptPayload(payloadB64u, material) {
  const signingKey = material.slice(0, 16)
  const encryptionKey = material.slice(16, 32)
  const token = base64UrlToBytes(payloadB64u)
  const signed = token.slice(0, token.length - 32)
  const mac = token.slice(token.length - 32)
  const hmacKey = await crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  if (!(await crypto.subtle.verify('HMAC', hmacKey, mac, signed))) throw new Error('Firma Fernet invalida')
  const iv = token.slice(9, 25)
  const ciphertext = token.slice(25, token.length - 32)
  const aesKey = await crypto.subtle.importKey('raw', encryptionKey, { name: 'AES-CBC', length: 128 }, false, ['decrypt'])
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext))
  return JSON.parse(new TextDecoder().decode(pkcs7Unpad(padded)))
}

const passphrase = 'vector-passphrase-123'
const payload = {
  authorized_client: 'API_CLI_REST',
  client_key: 'pp00CliApp00',
  api_key: 'ZmFrZS1hcGkta2V5PQ==',   // termina en '=', como las reales (chequea base64)
  api_secret: 'fake-secret-uuid-0000',
  account_number: '000000',
}

if (process.argv[2] === 'decrypt') {
  // node sec1_devicecrypto_vector.mjs decrypt <dek_b64> <payload_base64url>
  const dekArg = unb64(process.argv[3])
  process.stdout.write(JSON.stringify(await decryptPayload(process.argv[4], dekArg)))
} else {
  const dek = crypto.getRandomValues(new Uint8Array(32))
  const keywrap_blob = await wrapUnderSecret(dek, passphrase)
  const broker_doc = await encryptPayload(payload, dek)
  process.stdout.write(JSON.stringify({
    passphrase,
    dek_b64: b64(dek),
    keywrap_blob,
    broker_doc,
    expected_payload: payload,
  }))
}
