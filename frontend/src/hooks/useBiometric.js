import { useState, useCallback } from 'react'

// SEAM de desbloqueo por biometría (huella).
// La preferencia se persiste localmente, pero la integración nativa NO está hecha:
// activar/desactivar acá solo guarda la intención del usuario.
//
// TODO (tarea aparte — Android Keystore + plugin Capacitor):
//   - Al ACTIVAR: envolver la DEK (o la passphrase) bajo una clave del Android Keystore
//     protegida por biometría (BiometricPrompt). Reemplaza/duplica el unlock por passphrase.
//   - Al DESACTIVAR: borrar ese material del Keystore.
//   - Exponer `available` real según haya hardware/credencial biométrica enrolada.
const KEY = 'micartera_biometric_enabled'

function load() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function useBiometric() {
  const [enabled, setEnabled] = useState(load)

  const setBiometricEnabled = useCallback(async (next) => {
    // Punto de enganche para la integración nativa (ver TODO arriba).
    try { localStorage.setItem(KEY, next ? '1' : '0') } catch { /* degradar sin persistencia */ }
    setEnabled(next)
    return next
  }, [])

  return {
    enabled,
    setBiometricEnabled,
    available: false,   // pasa a true cuando exista la integración nativa
  }
}
