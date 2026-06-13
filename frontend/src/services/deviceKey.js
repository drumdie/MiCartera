import { getCachedDEKMaterial, DEKLockedError } from './userKey'

// Seam de la DEK por usuario (P1.2 — reemplaza el stub de desarrollo).
// fernet.js / SQLite / sync consumen SOLO getUserDEKMaterial(): los 32 bytes crudos de la
// DEK del usuario, desenvuelta en el dispositivo desde el keywrap (passphrase / recovery).
// Si la DEK no está desbloqueada (el usuario no ingresó su passphrase en esta sesión),
// lanza DEKLockedError — el gate de UI (PassphraseGate) garantiza que esto no ocurra
// mientras el Dashboard está montado.
export async function getUserDEKMaterial() {
  const dek = getCachedDEKMaterial()
  if (!dek) throw new DEKLockedError()
  return dek
}
