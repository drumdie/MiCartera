import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import {
  MOCK_COTIZACIONES, MOCK_RESUMEN,
  MOCK_ACCIONES_AR, MOCK_CEDEARS, MOCK_BONOS,
  MOCK_ONS, MOCK_FCI, MOCK_LIQUIDEZ,
  MOCK_CATALIZADORES, MOCK_STRESS_TEST, MOCK_FUNDAMENTAL,
} from '../data/mockPortfolio'
import { useAuth }      from '../hooks/useAuth'
import { usePortfolio } from '../hooks/usePortfolio'
import { apiPost } from '../services/apiClient'
import { syncBrokerPortfolioToDevice } from '../services/portfolioSync'
import { isDEKReady, onDEKChange } from '../services/userKey'

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

// Privacidad: se persiste en localStorage para que el toggle 👁/🙈 sobreviva
// a F5, cerrar pestaña o cerrar/reabrir la PWA (persiste por origen, no por sesión).
const PRIVACY_KEY = 'micartera_privacy_on'

function loadPrivacy() {
  try {
    return localStorage.getItem(PRIVACY_KEY) === '1'
  } catch {
    return false
  }
}

export function AppProvider({ children }) {
  const [activeCurrency, setActiveCurrency] = useState('MEP')
  const [privacyOn,      setPrivacyOn]      = useState(loadPrivacy)
  const [distMode,       setDistMode]       = useState('instrumento')

  useEffect(() => {
    try {
      localStorage.setItem(PRIVACY_KEY, privacyOn ? '1' : '0')
    } catch {
      // localStorage no disponible (modo privado/cuotas) → degradar sin persistencia
    }
  }, [privacyOn])

  const [syncing,   setSyncing]   = useState(false)
  const [syncError, setSyncError] = useState(null)
  const [lastSync,  setLastSync]  = useState(null)
  const [syncDiag,  setSyncDiag]  = useState(null)

  const { user, loading: authLoading, signIn, signInWithEmail, signOut, isNativeAuth } = useAuth()

  const {
    portfolio:     fsPortfolio,
    cotizaciones:  fsCotizaciones,
    resumen:       fsResumen,
    catalizadores: fsCatalizadores,
    stressTest:    fsStressTest,
    refreshPortfolio,
    refreshStress,
    fundamental:   fsFundamental,
    isStale:       fsIsStale,
    ultimaSync:    fsUltimaSync,
    rend30d:       fsRend30d,
    readDiag:      fsReadDiag,
  } = usePortfolio(user?.uid)

  // isDemo: solo cuando no hay sesión activa
  const isDemo = !user

  // hasFreshData: true cuando es demo O cuando ya se completó un sync en esta sesión.
  // lastSync se setea SOLO después de que syncPPI resuelve exitosamente (incluso
  // con 'sin_datos_frescos'). Mientras lastSync sea null, ninguna pantalla debe mostrar
  // datos reales — podrían ser datos cacheados/stale de una sesión anterior.
  const hasFreshData = isDemo || lastSync != null

  // Cuando el usuario está logueado, los datos de Firestore pueden tardar un ciclo
  // en llegar. Usamos estructuras vacías como fallback en lugar de null.
  const portfolio    = isDemo ? MOCK_PORTFOLIO    : (fsPortfolio    ?? EMPTY_PORTFOLIO)
  const cotizaciones = isDemo ? MOCK_COTIZACIONES : (fsCotizaciones ?? MOCK_COTIZACIONES)
  const resumen      = isDemo ? MOCK_RESUMEN      : (fsResumen      ?? EMPTY_RESUMEN)
  const catalizadores = isDemo ? MOCK_CATALIZADORES : (fsCatalizadores ?? [])
  const stressTest   = isDemo ? MOCK_STRESS_TEST  : fsStressTest
  const fundamental  = isDemo ? MOCK_FUNDAMENTAL  : (fsFundamental  ?? [])

  const refreshFundamentals = useCallback(async () => {
    if (!user) return
    try {
      const result = await apiPost('/api/fundamentals/refresh')
      return result
    } catch (err) {
      console.error('Error actualizando fundamentales:', err)
      throw err
    }
  }, [user])

  const syncPPI = useCallback(async () => {
    if (!user) return
    setSyncing(true)
    setSyncError(null)
    try {
      // Las cotizaciones globales (/market/cotizaciones) las refresca el scheduler de
      // Cloud Functions cada 60s; NO las dispara el sync individual del usuario. Mezclarlas
      // acoplaba una operación de portfolio personal con una escritura global compartida
      // (P0.3). El sync de portfolio lee las cotizaciones ya frescas desde Firestore.
      const result = await syncBrokerPortfolioToDevice(user.uid)
      setSyncDiag(result._diag ?? null)
      // status "sin_datos_frescos": PPI no disponible, Firestore intacto
      if (result.status === 'sin_datos_frescos') {
        setSyncError('Mercado cerrado — mostrando últimos datos conocidos')
        await refreshPortfolio()
        setLastSync(result.ultima_sync_exitosa ?? null)
      } else {
        await refreshPortfolio()
        await refreshStress()
        setLastSync(result.timestamp ?? new Date().toISOString())
      }
    } catch (err) {
      setSyncError(err.message || 'Error al sincronizar con el broker')
      setSyncDiag({ fatalError: err?.message || 'Error al sincronizar con el broker' })
      // Aunque el sync falle, intentar mostrar los datos que ya existen en Firestore.
      // Esto cubre reinstalaciones: SQLite vacío, pero Firestore tiene datos previos
      // descifrables ahora que la DEK está activa.
      try { await refreshPortfolio() } catch {}
    } finally {
      setSyncing(false)
    }
  }, [user, refreshPortfolio, refreshStress])

  // Auto-sync al login: una sola vez, PERO recién cuando la DEK está desbloqueada
  // (después de la passphrase). Antes corría apenas había `user` → la DEK seguía bloqueada
  // → el sync (cifrar/guardar el portfolio) fallaba con DEKLockedError y NO reintentaba.
  const _autoSyncDone = useRef(false)
  useEffect(() => {
    if (!user) { _autoSyncDone.current = false; return }
    const tryAutoSync = () => {
      if (_autoSyncDone.current || !isDEKReady()) return
      _autoSyncDone.current = true
      syncPPI()
    }
    tryAutoSync()                    // si la DEK ya estaba lista
    return onDEKChange(tryAutoSync)  // o en cuanto se desbloquee
  }, [user, syncPPI])

  return (
    <AppContext.Provider value={{
      user, authLoading, signIn, signInWithEmail, signOut, isNativeAuth, isDemo, hasFreshData,
      activeCurrency, setActiveCurrency,
      privacyOn, setPrivacyOn,
      distMode, setDistMode,
      portfolio, cotizaciones, resumen,
      catalizadores, stressTest, fundamental,
      syncPPI, syncing, syncError, lastSync, syncDiag,
      readDiag: !isDemo ? (fsReadDiag ?? null) : null,
      refreshFundamentals,
      isStale: !isDemo && (fsIsStale ?? false),
      ultimaSync: !isDemo ? (fsUltimaSync ?? null) : null,
      rend30d: !isDemo ? (fsRend30d ?? null) : null,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
