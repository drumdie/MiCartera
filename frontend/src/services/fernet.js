import { getUserDEKMaterial } from './deviceKey'

const ENCRYPTED_MARKER = 'fernet-v1'
const VERSION = 0x80

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

function bytesToBase64Url(bytes) {
  let raw = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    raw += String.fromCharCode(...bytes.slice(i, i + 0x8000))
  }
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function concatBytes(...chunks) {
  const len = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(len)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

function pkcs7Pad(bytes) {
  const remainder = bytes.length % 16
  const pad = remainder === 0 ? 16 : 16 - remainder
  const out = new Uint8Array(bytes.length + pad)
  out.set(bytes)
  out.fill(pad, bytes.length)
  return out
}

function pkcs7Unpad(bytes) {
  const pad = bytes[bytes.length - 1]
  if (pad < 1 || pad > 16 || pad > bytes.length) throw new Error('Padding Fernet invalido')
  for (let i = bytes.length - pad; i < bytes.length; i += 1) {
    if (bytes[i] !== pad) throw new Error('Padding Fernet invalido')
  }
  return bytes.slice(0, bytes.length - pad)
}

async function importHmacKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

async function importAesKey(raw, usages) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-CBC', length: 128 }, false, usages)
}

function splitFernetMaterial(material) {
  if (material.length !== 32) throw new Error('La DEK Fernet debe tener 32 bytes')
  return {
    signingKey: material.slice(0, 16),
    encryptionKey: material.slice(16, 32),
  }
}

export async function encryptPayload(payload) {
  const material = await getUserDEKMaterial()
  const { signingKey, encryptionKey } = splitFernetMaterial(material)
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const now = Math.floor(Date.now() / 1000)
  const ts = new Uint8Array(8)
  new DataView(ts.buffer).setBigUint64(0, BigInt(now), false)

  const raw = stableStringify(payload)
  const data = pkcs7Pad(new TextEncoder().encode(raw))
  const aesKey = await importAesKey(encryptionKey, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, data))
  const signed = concatBytes(new Uint8Array([VERSION]), ts, iv, ciphertext)
  const hmacKey = await importHmacKey(signingKey)
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, signed))

  return {
    _encrypted: true,
    _enc_alg: ENCRYPTED_MARKER,
    payload: bytesToBase64Url(concatBytes(signed, mac)),
  }
}

export async function decryptPayload(document) {
  if (!document) return {}
  if (!document._encrypted) return document
  if (document._enc_alg !== ENCRYPTED_MARKER) throw new Error('Algoritmo de cifrado no soportado')
  if (!document.payload || typeof document.payload !== 'string') {
    throw new Error('Documento cifrado sin payload')
  }

  const token = base64UrlToBytes(document.payload)
  if (token.length < 73 || token[0] !== VERSION) throw new Error('Token Fernet invalido')

  const material = await getUserDEKMaterial()
  const { signingKey, encryptionKey } = splitFernetMaterial(material)
  const signed = token.slice(0, token.length - 32)
  const mac = token.slice(token.length - 32)
  const hmacKey = await importHmacKey(signingKey)
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, signed))
  if (!timingSafeEqual(mac, expected)) throw new Error('Firma Fernet invalida')

  const iv = token.slice(9, 25)
  const ciphertext = token.slice(25, token.length - 32)
  const aesKey = await importAesKey(encryptionKey, ['decrypt'])
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext))
  const raw = new TextDecoder().decode(pkcs7Unpad(padded))
  return JSON.parse(raw)
}
