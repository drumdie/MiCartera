import { useState, useEffect, useCallback } from 'react'
import {
  loadProfile,
  saveConsent,
  saveBrokerCreds,
  completeOnboarding,
  CONTRACT_VERSION,
} from '../services/profileService'

// Estado del onboarding post-passphrase:
//   loading  → leyendo perfil
//   contract → falta firmar el contrato de uso de datos (P1.4)
//   broker   → falta cargar (u omitir) las credenciales del broker (P1.3)
//   done     → onboarding completo → Dashboard
//
// `enabled` debe ser true solo cuando la DEK está desbloqueada (keyState === 'ready'),
// porque guardar las creds del broker requiere cifrar con la DEK.
export function useOnboarding(user, enabled) {
  const [onbState, setOnbState] = useState('loading')

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      const p = await loadProfile(user.uid)
      const consented = (p?.consentimiento?.version || 0) >= CONTRACT_VERSION
      const onboarded = !!p?.onboarding_completo
      setOnbState(!consented ? 'contract' : !onboarded ? 'broker' : 'done')
    } catch {
      // Si no se puede leer el perfil, empezar por el contrato (re-intentable).
      setOnbState('contract')
    }
  }, [user])

  useEffect(() => {
    if (!user || !enabled) { setOnbState('loading'); return }
    refresh()
  }, [user, enabled, refresh])

  const acceptContract = useCallback(async () => {
    await saveConsent(user.uid)
    setOnbState('broker')
  }, [user])

  const submitBroker = useCallback(async (creds) => {
    await saveBrokerCreds(user.uid, creds)
    setOnbState('done')
  }, [user])

  const skipBroker = useCallback(async () => {
    await completeOnboarding(user.uid)
    setOnbState('done')
  }, [user])

  return { onbState, acceptContract, submitBroker, skipBroker }
}
