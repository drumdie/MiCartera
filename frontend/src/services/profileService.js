import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { encryptPayload, decryptPayload } from './fernet'

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
// guardan como ciphertext en /users/{uid}/broker/data. El backend nunca las ve en claro
// desde Firestore (las recibirá por request cuando se implemente P1.5).
export async function saveBrokerCreds(uid, creds) {
  const encrypted = await encryptPayload(creds)
  await setDoc(brokerRef(uid), encrypted)
  await completeOnboarding(uid)
}

export async function loadBrokerCreds(uid) {
  const snap = await getDoc(brokerRef(uid))
  if (!snap.exists()) return null
  return decryptPayload(snap.data())
}
