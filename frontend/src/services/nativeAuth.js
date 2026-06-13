import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
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
  if (!idToken && !accessToken) return signInWithPopup(auth, new GoogleAuthProvider())
  const credential = GoogleAuthProvider.credential(idToken, accessToken)
  return signInWithCredential(auth, credential)
}

export async function signOutNative() {
  if (Capacitor.isNativePlatform()) await FirebaseAuthentication.signOut()
}
