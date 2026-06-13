import { BrowserRouter } from 'react-router-dom'
import { AppProvider, useApp } from './store/AppContext'
import Dashboard   from './pages/Dashboard'
import Login       from './pages/Login'
import LockScreen  from './components/ui/LockScreen'
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
  const { isLocked, isReauthing, reAuthError, unlock } = useSessionSecurity(user)
  const { keyState, setup, markReady, unlock: keyUnlock, recover } = useUserKey(user)
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
  return <Dashboard />
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
