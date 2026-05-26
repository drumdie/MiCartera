import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
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

// Estructura vacía para usuario logueado sin portfolio cargado aún
const EMPTY_PORTFOLIO = {
  acciones_ar: { subtotal_ars: 0, pct_cartera: 0, posiciones: [] },
  cedears:     { subtotal_ars: 0, pct_cartera: 0, posiciones: [] },
  bonos:       { subtotal_ars: 0, pct_cartera: 0, posiciones: [] },
  ons:         { subtotal_ars: 0, pct_cartera: 0, posiciones: [] },
  fci:         { subtotal_ars: 0, pct_cartera: 0, posiciones: [] },
  liquidez:    { subtotal_ars: 0, pct_cartera: 0, usd_total_aprox: 0, detalle: [] },
  _valor_total_ars: 0,
}

const EMPTY_RESUMEN = {
  valor_total_ars: 0,
  composicion_pct: { acciones_ar: 0, cedears: 0, bonos: 0, ons: 0, fci: 0, liquidez: 0 },
  rend_30d_usd_mep_pct: 0,
  rend_30d_ars_pct: 0,
}

export function AppProvider({ children }) {
  const [activeCurrency, setActiveCurrency] = useState('MEP')
  const [privacyOn,      setPrivacyOn]      = useState(false)
  const [distMode,       setDistMode]       = useState('instrumento')

  const [syncing,   setSyncing]   = useState(false)
  const [syncError, setSyncError] = useState(null)
  const [lastSync,  setLastSync]  = useState(null)

  const { user, loading: authLoading, signIn, signOut } = useAuth()

  const {
    portfolio:     fsPortfolio,
    cotizaciones:  fsCotizaciones,
    resumen:       fsResumen,
    catalizadores: fsCatalizadores,
    stressTest:    fsStressTest,
    refreshStress,
    fundamental:   fsFundamental,
    isStale:       fsIsStale,
    ultimaSync:    fsUltimaSync,
    rend30d:       fsRend30d,
  } = usePortfolio(user?.uid)

  // isDemo: solo cuando no hay sesión activa
  const isDemo = !user

  // Cuando el usuario está logueado, los datos de Firestore pueden tardar un ciclo
  // en llegar. Usamos estructuras vacías como fallback en lugar de null.
  const portfolio    = isDemo ? MOCK_PORTFOLIO    : (fsPortfolio    ?? EMPTY_PORTFOLIO)
  const cotizaciones = isDemo ? MOCK_COTIZACIONES : (fsCotizaciones ?? MOCK_COTIZACIONES)
  const resumen      = isDemo ? MOCK_RESUMEN      : (fsResumen      ?? EMPTY_RESUMEN)
  const catalizadores = isDemo ? MOCK_CATALIZADORES : (fsCatalizadores ?? [])
  const stressTest   = isDemo ? MOCK_STRESS_TEST  : fsStressTest
  const fundamental  = isDemo ? MOCK_FUNDAMENTAL  : (fsFundamental  ?? [])

  const syncPPI = useCallback(async () => {
    if (!user) return
    setSyncing(true)
    setSyncError(null)
    try {
      await apiPost('/api/prices/refresh')
      const result = await apiPost('/api/portfolio/sync')
      // status "sin_datos_frescos": PPI no disponible, Firestore intacto
      if (result.status === 'sin_datos_frescos') {
        setSyncError('Mercado cerrado — mostrando últimos datos conocidos')
        setLastSync(result.ultima_sync_exitosa ?? null)
      } else {
        setLastSync(result.timestamp ?? new Date().toISOString())
        await refreshStress()
      }
    } catch (err) {
      setSyncError(err.message || 'Error al sincronizar con PPI')
    } finally {
      setSyncing(false)
    }
  }, [user, refreshStress])

  // Auto-sync al login: dispara una sola vez cuando el usuario se autentica.
  // Si el mercado está cerrado o PPI no responde, deja los últimos datos conocidos.
  const _autoSyncDone = useRef(false)
  useEffect(() => {
    if (!user || _autoSyncDone.current) return
    _autoSyncDone.current = true
    syncPPI()
  }, [user, syncPPI])

  return (
    <AppContext.Provider value={{
      user, authLoading, signIn, signOut, isDemo,
      activeCurrency, setActiveCurrency,
      privacyOn, setPrivacyOn,
      distMode, setDistMode,
      portfolio, cotizaciones, resumen,
      catalizadores, stressTest, fundamental,
      syncPPI, syncing, syncError, lastSync,
      isStale: !isDemo && (fsIsStale ?? false),
      ultimaSync: !isDemo ? (fsUltimaSync ?? null) : null,
      rend30d: !isDemo ? (fsRend30d ?? null) : null,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
