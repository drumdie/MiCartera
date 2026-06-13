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
    await signOutNative()
    return firebaseSignOut(auth)
  }

  return { user, loading, signIn, signInWithEmail, signOut, isNativeAuth: isNativeAuthAvailable() }
}
