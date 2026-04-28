import { AppProvider } from './store/AppContext'
import Dashboard from './pages/Dashboard'

// En Fase 2 se agrega React Router + AuthProvider + ruta de Login
export default function App() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  )
}
