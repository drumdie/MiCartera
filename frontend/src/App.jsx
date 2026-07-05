import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { AppProvider, useApp } from './store/AppContext'
import DashboardWeb    from './pages/DashboardWeb'
import DashboardMobile from './pages/DashboardMobile'
import Perfil      from './pages/Perfil'
import PerfilInversion from './pages/PerfilInversion'
import MayorPosicionDetail from './pages/detail/MayorPosicionDetail'
import GpDetail    from './pages/detail/GpDetail'
import PosicionesDetail from './pages/detail/PosicionesDetail'
import LiquidezDetail from './pages/detail/LiquidezDetail'
import MepDetail   from './pages/detail/MepDetail'
import RiesgoPaisDetail from './pages/detail/RiesgoPaisDetail'
import Login       from './pages/Login'

// apk nativa (Capacitor) → UI mobile rediseñada · browser → UI web "como antes".
// Override para previsualizar la UI mobile en el navegador: ?ui=mobile (persistido) · ?ui=web vuelve.
function resolveMobileUI() {
  if (Capacitor.isNativePlatform()) return true
  try {
    const p = new URLSearchParams(window.location.search).get('ui')
    if (p === 'mobile') { localStorage.setItem('micartera_ui', 'mobile'); return true }
    if (p === 'web')    { localStorage.removeItem('micartera_ui'); return false }
    return localStorage.getItem('micartera_ui') === 'mobile'
  } catch {
    return false
  }
}
const IS_NATIVE = resolveMobileUI()
import LockScreen  from './components/ui/LockScreen'
import AndroidBackHandler from './components/ui/AndroidBackHandler'
import { PassphraseSetup, PassphraseUnlock } from './components/ui/PassphraseGate'
import { DataContract } from './components/ui/DataContract'
import { BrokerOnboarding } from './components/ui/BrokerOnboarding'
import { useSessionSecurity } from './hooks/useSessionSecurity'
import { useUserKey } from './hooks/useUserKey'
import { useOnboarding } from './hooks/useOnboarding'

function Spinner() {
  return (
    <div style={{
      background: 'var(--bg)', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em' }}>
        Cargando…
      </div>
    </div>
  )
}

function AuthGate() {
  const { user, authLoading } = useApp()
  const { keyState, setup, markReady, unlock: keyUnlock, recover, relock } = useUserKey(user)
  const { isLocked, isReauthing, reAuthError, unlock } = useSessionSecurity(user, relock)
  // El onboarding (contrato + broker) corre solo con la DEK lista: guardar creds requiere cifrar.
  const { onbState, acceptContract, submitBroker, skipBroker } = useOnboarding(user, keyState === 'ready')

  if (authLoading)            return <Spinner />
  if (!user)                  return <Login />
  if (keyState === 'loading') return <Spinner />
  // Gate de cifrado por usuario (P1.2): definir/desbloquear la DEK antes del Dashboard.
  if (keyState === 'setup')   return <PassphraseSetup onSetup={setup} onReady={markReady} />
  if (keyState === 'locked')  return <PassphraseUnlock onUnlock={keyUnlock} onRecover={recover} />
  // Onboarding primer login (P1.4 contrato → P1.3 broker).
  if (onbState === 'loading')  return <Spinner />
  if (onbState === 'contract') return <DataContract onAccept={acceptContract} />
  if (onbState === 'broker')   return <BrokerOnboarding onSubmit={submitBroker} onSkip={skipBroker} />
  if (isLocked)               return <LockScreen onUnlock={unlock} isReauthing={isReauthing} reAuthError={reAuthError} />

  // Ambas UIs usan rutas: Perfil y sub-pantallas son compartidas.
  const Dashboard = IS_NATIVE ? DashboardMobile : DashboardWeb

  return (
    <>
    <AndroidBackHandler />
    <Routes>
      <Route path="/"                   element={<Dashboard />} />
      <Route path="/perfil"             element={<Perfil />} />
      <Route path="/perfil/inversion"   element={<PerfilInversion />} />
      {/* Drill-downs mobile (en web no se navegan, pero las rutas no molestan) */}
      <Route path="/detalle/mayor-posicion" element={<MayorPosicionDetail />} />
      <Route path="/detalle/gp"         element={<GpDetail />} />
      <Route path="/detalle/posiciones" element={<PosicionesDetail />} />
      <Route path="/detalle/liquidez"   element={<LiquidezDetail />} />
      <Route path="/detalle/mep"        element={<MepDetail />} />
      <Route path="/detalle/rp"         element={<RiesgoPaisDetail />} />
      <Route path="*"                   element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AuthGate />
      </AppProvider>
    </BrowserRouter>
  )
}
