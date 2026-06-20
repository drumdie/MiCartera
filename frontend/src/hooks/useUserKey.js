import { useState, useEffect, useCallback } from 'react'
import {
  isKeySetup,
  setupUserKey,
  unlockWithPassphrase,
  unlockWithRecovery,
  getCachedDEKMaterial,
  clearDEK,
} from '../services/userKey'

// Estado del gate de clave por usuario:
//   loading → averiguando si el usuario ya tiene keywrap
//   setup   → primer login: definir passphrase (devuelve recovery code)
//   locked  → tiene keywrap pero la DEK no está desbloqueada esta sesión
//   ready   → DEK desbloqueada en memoria; el Dashboard puede cifrar/descifrar
export function useUserKey(user) {
  const [keyState, setKeyState] = useState('loading')

  useEffect(() => {
    if (!user) {
      clearDEK()
      setKeyState('loading')
      return
    }
    let active = true
    ;(async () => {
      if (getCachedDEKMaterial()) {
        if (active) setKeyState('ready')
        return
      }
      try {
        const exists = await isKeySetup(user.uid)
        if (active) setKeyState(exists ? 'locked' : 'setup')
      } catch {
        // Si no se puede leer el keywrap (offline/permite), quedamos en locked para reintentar.
        if (active) setKeyState('locked')
      }
    })()
    return () => { active = false }
  }, [user])

  // setup NO salta a 'ready': la DEK queda cacheada pero el gate sigue mostrando el
  // recovery code hasta que el usuario confirme que lo guardó (markReady).
  const setup = useCallback(async (passphrase) => {
    return setupUserKey(user.uid, passphrase)
  }, [user])

  const markReady = useCallback(() => setKeyState('ready'), [])

  const unlock = useCallback(async (passphrase) => {
    await unlockWithPassphrase(user.uid, passphrase)
    setKeyState('ready')
  }, [user])

  const recover = useCallback(async (recoveryCode, newPassphrase) => {
    await unlockWithRecovery(user.uid, recoveryCode, newPassphrase)
    setKeyState('ready')
  }, [user])

  // Vuelve al gate de passphrase sin desloguear (para el lock de inactividad).
  const relock = useCallback(() => {
    clearDEK()
    setKeyState('locked')
  }, [])

  return { keyState, setup, markReady, unlock, recover, relock }
}
