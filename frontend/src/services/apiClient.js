import { auth } from './firebase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function authHeaders() {
  const user = auth.currentUser
  if (!user) throw new Error('No autenticado')
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

export async function apiGet(path) {
  const headers = await authHeaders()
  const resp = await fetch(`${API_URL}${path}`, { headers })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.detail || `Error ${resp.status}`)
  }
  return resp.json()
}

export async function apiPost(path, body = null) {
  const headers = await authHeaders()
  const resp = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}))
    throw new Error(data.detail || `Error ${resp.status}`)
  }
  return resp.json()
}
