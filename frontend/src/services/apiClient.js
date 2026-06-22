import { auth } from './firebase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function authHeaders() {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

// SEC-2 · F5 — re-unlock transparente. El backend tiene un TTL de sesión (3 min); si vence
// mientras el front sigue desbloqueado, responde 401 con detail "needs_unlock". Acá se
// re-desbloquea con la passphrase que sessionApi guarda en RAM y se reintenta UNA vez,
// invisible para el usuario. Si no hay passphrase guardada (inactividad real → relock), el
// 401 se propaga y el flujo normal de "locked" del front re-pide la clave.
const NEEDS_UNLOCK = 'needs_unlock'
let _reunlockHandler = null
// sessionApi registra acá su re-unlock (inversión de control → sin import circular).
export function setReunlockHandler(fn) { _reunlockHandler = fn }

async function _fetch(path, init) {
  const headers = await authHeaders()
  return fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
}

async function _request(path, init, _retried = false) {
  const resp = await _fetch(path, init)
  if (resp.ok) return resp.json()
  const data = await resp.json().catch(() => ({}))
  if (resp.status === 401 && data.detail === NEEDS_UNLOCK && _reunlockHandler && !_retried) {
    try {
      if (await _reunlockHandler()) return _request(path, init, true)
    } catch { /* cae al throw de abajo */ }
  }
  throw new Error(data.detail || `Error ${resp.status}`)
}

export async function apiGet(path) {
  return _request(path, { method: 'GET' })
}

export async function apiPost(path, body = null) {
  return _request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
}
