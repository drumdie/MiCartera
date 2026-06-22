import { apiGet, apiPost, setReunlockHandler } from './apiClient'

// SEC-1 — Sesión backend-managed.
// El backend desenvuelve la DEK con la passphrase y la cachea en RAM (TTL corto);
// luego descifra las credenciales del broker server-side. El frontend nunca ve creds.

// SEC-2 · F5 — passphrase en RAM (NUNCA se persiste ni se loguea) para el re-unlock
// transparente cuando el TTL de sesión del backend vence con el front todavía desbloqueado.
// Se borra en lock/logout → tras inactividad real, el user la re-ingresa (gate de seguridad).
let _passphrase = null

// Desbloquea la sesión en el backend. La passphrase viaja solo por TLS y NO se persiste.
export async function unlockBackendSession(passphrase) {
  const res = await apiPost('/api/session/unlock', { passphrase })
  _passphrase = passphrase   // guardar SOLO tras un unlock exitoso
  return res
}

// Descarta la DEK en el backend (al bloquearse el front por inactividad).
export async function lockBackendSession() {
  _passphrase = null         // limpiar primero: aunque falle el POST, no queda en RAM
  return apiPost('/api/session/lock')
}

// Limpia la passphrase en RAM sin tocar la red (para el logout / cambio de usuario).
export function clearStoredPassphrase() {
  _passphrase = null
}

// Re-unlock transparente con la passphrase en RAM. Devuelve true si re-desbloqueó.
// Lo invoca el apiClient ante un 401 needs_unlock. Sin passphrase guardada → false
// (el flujo "locked" del front re-pedirá la clave).
async function reunlockBackendSession() {
  if (!_passphrase) return false
  try {
    await apiPost('/api/session/unlock', { passphrase: _passphrase })
    return true
  } catch {
    _passphrase = null       // la passphrase ya no sirve → forzar gate manual
    return false
  }
}

// Registrar el re-unlock en el apiClient (inversión de control → sin import circular).
setReunlockHandler(reunlockBackendSession)

// { unlocked: bool } — para saber si hay que re-desbloquear (cache-miss).
export async function backendSessionStatus() {
  return apiGet('/api/session/status')
}

// F1c (diagnóstico): el backend descifra las creds y hace login PPI → { ok, login, posiciones }.
export async function verifyBroker() {
  return apiPost('/api/session/verify-broker')
}
