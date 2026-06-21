import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { encryptPayload } from './fernet'

// Versión del contrato de uso de datos. Subir cuando cambien los términos → re-consent.
export const CONTRACT_VERSION = 1

function userRef(uid) {
  return doc(db, 'users', uid)
}
function brokerRef(uid) {
  return doc(db, 'users', uid, 'broker', 'data')
}

// Perfil = doc /users/{uid}: flags de consentimiento y onboarding (no sensibles).
export async function loadProfile(uid) {
  const snap = await getDoc(userRef(uid))
  return snap.exists() ? snap.data() : {}
}

export async function saveConsent(uid) {
  await setDoc(userRef(uid), {
    consentimiento: { version: CONTRACT_VERSION, acceptedAt: new Date().toISOString() },
  }, { merge: true })
}

export async function completeOnboarding(uid) {
  await setDoc(userRef(uid), { onboarding_completo: true }, { merge: true })
}

// Credenciales del broker: SENSIBLES. Se cifran con la DEK del usuario (device-encrypt) y se
// guardan como ciphertext en /users/{uid}/broker/data. SEC-1 (F3): el FRONT ya NO las descifra
// nunca — se eliminó loadBrokerCreds. El BACKEND las descifra server-side con la DEK de sesión
// (/api/session/unlock). Acá solo se permite RE-ESCRIBIRLAS (write-only).
export async function saveBrokerCreds(uid, creds) {
  const encrypted = await encryptPayload(creds)
  await setDoc(brokerRef(uid), encrypted)
  await completeOnboarding(uid)
}
