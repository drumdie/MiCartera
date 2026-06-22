import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { getDashboardBack } from '../../services/backNav'

// Maneja el botón back físico de Android (Capacitor). Jerarquía:
//   1. Ruta no-principal (perfil, detalle/*) → navigate(-1).
//   2. En "/" → delega en el dashboard (cierra modal o vuelve al tab principal).
//   3. En "/" ya en estado raíz → doble-tap para salir (toast de aviso).
// En web/no-nativo no hace nada (no hay botón back de SO).
export default function AndroidBackHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  const locRef = useRef(location)
  locRef.current = location
  const lastBackRef = useRef(0)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove = () => {}

    CapApp.addListener('backButton', () => {
      const path = locRef.current.pathname

      // 1. Cualquier ruta que no sea la principal → volver atrás.
      if (path !== '/') { navigate(-1); return }

      // 2. En "/" → el dashboard decide (modal abierto / tab no-principal).
      const dash = getDashboardBack()
      if (dash?.handleBack?.()) return

      // 3. Pantalla principal, estado raíz → doble-tap para salir.
      const now = Date.now()
      if (now - lastBackRef.current < 2000) {
        CapApp.exitApp()
        return
      }
      lastBackRef.current = now
      dash?.showToast?.('Presioná de nuevo para salir')
    }).then(handle => { remove = () => handle.remove() })

    return () => remove()
  }, [navigate])

  return null
}
