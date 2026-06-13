import { useState, useEffect } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from '../services/firebase'
import {
  isNativeAuthAvailable,
  signInNativeWithEmail,
  signInNativeWithGoogle,
  signOutNative,
} from '../services/nativeAuth'
import { clearLocalUser } from '../services/localPortfolioStore'
import { clearDEK } from '../services/userKey'

const provider = new GoogleAuthProvider()

export function useAuth() {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return unsub
  }, [])

  const signIn = () => isNativeAuthAvailable()
    ? signInNativeWithGoogle()
    : signInWithPopup(auth, provider)

  const signInWithEmail = (email, password) => signInNativeWithEmail(email, password)

  const signOut = async () => {
    // Purgar el cache local (SQLite/localStorage) ANTES de desloguear: el plaintext
    // descifrado del usuario no debe quedar en el dispositivo para el próximo usuario.
    const uid = auth.currentUser?.uid
    if (uid) {
      try { await clearLocalUser(uid) } catch { /* best-effort */ }
    }
    clearDEK()   // borrar la DEK desbloqueada de memoria
    await signOutNative()
    return firebaseSignOut(auth)
  }

  return { user, loading, signIn, signInWithEmail, signOut, isNativeAuth: isNativeAuthAvailable() }
}
