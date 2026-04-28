import { createContext, useContext, useState, useCallback } from 'react'
import {
  MOCK_COTIZACIONES, MOCK_RESUMEN,
  MOCK_ACCIONES_AR, MOCK_CEDEARS, MOCK_BONOS,
  MOCK_ONS, MOCK_FCI, MOCK_LIQUIDEZ,
  MOCK_CATALIZADORES, MOCK_STRESS_TEST, MOCK_FUNDAMENTAL,
} from '../data/mockPortfolio'
import { useAuth }      from '../hooks/useAuth'
import { usePortfolio } from '../hooks/usePortfolio'
import { apiPost }      from '../services/apiClient'

export const AppContext = createContext(null)

const MOCK_PORTFOLIO = {
  acciones_ar: MOCK_ACCIONES_AR,
  cedears:     MOCK_CEDEARS,
  bonos:       MOCK_BONOS,
  ons:         MOCK_ONS,
  fci:         MOCK_FCI,
  liquidez:    MOCK_LIQUIDEZ,
}

export function AppProvider({ children }) {
  const [activeCurrency, setActiveCurrency] = useState('MEP')
  const [privacyOn,      setPrivacyOn]      = useState(false)
  const [distMode,       setDistMode]       = useState('instrumento')

  // Sincronización con PPI
  const [syncing,   setSyncing]   = useState(false)
  const [syncError, setSyncError] = useState(null)
  const [lastSync,  setLastSync]  = useState(null)

  const { user, loading: authLoading, signIn, signOut } = useAuth()

  const {
    portfolio:    fsPortfolio,
    cotizaciones: fsCotizaciones,
    resumen:      fsResumen,
    catalizadores: fsCatalizadores,
    stressTest:   fsStressTest,
    refreshStress,
    fundamental:  fsFundamental,
    loading:      portfolioLoading,
  } = usePortfolio(user?.uid)

  const isDemo = !user || (portfolioLoading && !fsPortfolio)

  const portfolio    = isDemo ? MOCK_PORTFOLIO    : fsPortfolio
  const cotizaciones = isDemo ? MOCK_COTIZACIONES : fsCotizaciones
  const resumen      = isDemo ? MOCK_RESUMEN      : fsResumen
  const catalizadores= isDemo ? MOCK_CATALIZADORES: fsCatalizadores
  const stressTest   = isDemo ? MOCK_STRESS_TEST  : fsStressTest
  const fundamental  = isDemo ? MOCK_FUNDAMENTAL  : fsFundamental

  const syncPPI = useCallback(async () => {
    if (!user) return
    setSyncing(true)
    setSyncError(null)
    try {
      const result = await apiPost('/api/portfolio/sync')
      setLastSync(result.timestamp ?? new Date().toISOString())
      // Re-calculamos stress test con la cartera recién sincronizada
      await refreshStress()
    } catch (err) {
      setSyncError(err.message || 'Error al sincronizar con PPI')
    } finally {
      setSyncing(false)
    }
  }, [user, refreshStress])

  return (
    <AppContext.Provider value={{
      user, authLoading, signIn, signOut, isDemo,
      activeCurrency, setActiveCurrency,
      privacyOn, setPrivacyOn,
      distMode, setDistMode,
      portfolio, cotizaciones, resumen,
      catalizadores, stressTest, fundamental,
      syncPPI, syncing, syncError, lastSync,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
