import { useState, useEffect } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from '../services/firebase'

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

  const signIn = () => signInWithPopup(auth, provider)

  const signOut = () => firebaseSignOut(auth)

  return { user, loading, signIn, signOut }
}
