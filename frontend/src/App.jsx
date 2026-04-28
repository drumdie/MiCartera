import { BrowserRouter } from 'react-router-dom'
import { AppProvider, useApp } from './store/AppContext'
import Dashboard   from './pages/Dashboard'
import Login       from './pages/Login'
import LockScreen  from './components/ui/LockScreen'
import { useSessionSecurity } from './hooks/useSessionSecurity'

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

  if (authLoading) return <Spinner />
  if (!user)       return <Login />
  if (isLocked)    return <LockScreen onUnlock={unlock} isReauthing={isReauthing} reAuthError={reAuthError} />
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
