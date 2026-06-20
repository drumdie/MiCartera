import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from './firebase'

export function isNativeAuthAvailable() {
  return Capacitor.isNativePlatform()
}

export async function signInNativeWithEmail(email, password) {
  // FIX: email/password mantiene la sesion canonical en Firebase Web Auth.
  // REASON: el plugin nativo no expone una credencial web equivalente para rehidratar auth.currentUser.
  // IMPACT: el uid y el ID token que consume el backend siguen saliendo del mismo SDK.
  return signInWithEmailAndPassword(auth, email, password)
}

export async function signInNativeWithGoogle() {
  const result = await FirebaseAuthentication.signInWithGoogle()
  const idToken = result.credential?.idToken
  const accessToken = result.credential?.accessToken
  // NO caer a signInWithPopup en nativo: en el WebView de Capacitor abre la página web
  // de Firebase (__/auth/handler) que no puede redirigir de vuelta a la app → se cuelga
  // ("el tilde de Firebase que nunca vuelve"). Si el plugin nativo no devolvió credencial,
  // fallamos con un error accionable en vez de dejar al usuario trabado.
  if (!idToken && !accessToken) {
    throw new Error('El login de Google no devolvió credencial. Reintentá; si persiste, verificá la conexión.')
  }
  const credential = GoogleAuthProvider.credential(idToken, accessToken)
  return signInWithCredential(auth, credential)
}

export async function signOutNative() {
  if (Capacitor.isNativePlatform()) await FirebaseAuthentication.signOut()
}
