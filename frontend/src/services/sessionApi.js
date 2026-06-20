import { apiGet, apiPost } from './apiClient'

// SEC-1 — Sesión backend-managed.
// El backend desenvuelve la DEK con la passphrase y la cachea en RAM (TTL corto);
// luego descifra las credenciales del broker server-side. El frontend nunca ve creds.

// Desbloquea la sesión en el backend. La passphrase viaja solo por TLS y NO se persiste.
export async function unlockBackendSession(passphrase) {
  return apiPost('/api/session/unlock', { passphrase })
}

// { unlocked: bool } — para saber si hay que re-desbloquear (cache-miss).
export async function backendSessionStatus() {
  return apiGet('/api/session/status')
}

// F1c (diagnóstico): el backend descifra las creds y hace login PPI → { ok, login, posiciones }.
export async function verifyBroker() {
  return apiPost('/api/session/verify-broker')
}
