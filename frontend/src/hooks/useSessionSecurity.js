import { useState, useEffect, useRef, useCallback } from 'react'
import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth'
import { auth } from '../services/firebase'

const INACTIVITY_TIMEOUT = 3 * 60 * 1000 // 3 minutos

const provider = new GoogleAuthProvider()

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']

export function useSessionSecurity(user) {
  const [isLocked,   setIsLocked]   = useState(false)
  const [isReauthing, setIsReauthing] = useState(false)
  const [reAuthError, setReAuthError] = useState(null)

  const timerRef    = useRef(null)
  const isLockedRef = useRef(false)

  const lock = useCallback(() => {
    isLockedRef.current = true
    setIsLocked(true)
  }, [])

  const resetTimer = useCallback(() => {
    if (!user || isLockedRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(lock, INACTIVITY_TIMEOUT)
  }, [user, lock])

  const unlock = useCallback(async () => {
    const currentUser = auth.currentUser
    if (!currentUser) return

    setIsReauthing(true)
    setReAuthError(null)
    try {
      await reauthenticateWithPopup(currentUser, provider)
      isLockedRef.current = false
      setIsLocked(false)
      resetTimer()
    } catch {
      setReAuthError('No se pudo verificar la identidad. Intentá de nuevo.')
    } finally {
      setIsReauthing(false)
    }
  }, [resetTimer])

  useEffect(() => {
    if (!user) {
      clearTimeout(timerRef.current)
      return
    }

    const handleActivity = () => resetTimer()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))
    resetTimer()

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity))
      clearTimeout(timerRef.current)
    }
  }, [user, resetTimer])

  return { isLocked, isReauthing, reAuthError, lock, unlock }
}
