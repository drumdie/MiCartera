import { BrowserRouter } from 'react-router-dom'
import { AppProvider, useApp } from './store/AppContext'
import Dashboard from './pages/Dashboard'
import Login     from './pages/Login'

function AuthGate() {
  const { user, authLoading } = useApp()

  if (authLoading) return (
    <div style={{
      background: 'var(--bg)', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--muted)', letterSpacing: '.1em' }}>
        Cargando…
      </div>
    </div>
  )

  return user ? <Dashboard /> : <Login />
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
