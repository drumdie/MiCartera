import { createContext, useContext, useState } from 'react'
import {
  MOCK_COTIZACIONES, MOCK_RESUMEN,
  MOCK_ACCIONES_AR, MOCK_CEDEARS, MOCK_BONOS,
  MOCK_ONS, MOCK_FCI, MOCK_LIQUIDEZ,
  MOCK_CATALIZADORES, MOCK_STRESS_TEST, MOCK_FUNDAMENTAL,
} from '../data/mockPortfolio'

export const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [activeCurrency, setActiveCurrency] = useState('MEP')
  const [privacyOn, setPrivacyOn]           = useState(false)
  const [distMode, setDistMode]             = useState('instrumento')

  // En Fase 2 estos datos vienen de Firestore via onSnapshot
  const cotizaciones = MOCK_COTIZACIONES
  const resumen      = MOCK_RESUMEN
  const portfolio    = {
    acciones_ar: MOCK_ACCIONES_AR,
    cedears:     MOCK_CEDEARS,
    bonos:       MOCK_BONOS,
    ons:         MOCK_ONS,
    fci:         MOCK_FCI,
    liquidez:    MOCK_LIQUIDEZ,
  }
  const catalizadores = MOCK_CATALIZADORES
  const stressTest    = MOCK_STRESS_TEST
  const fundamental   = MOCK_FUNDAMENTAL

  return (
    <AppContext.Provider value={{
      activeCurrency, setActiveCurrency,
      privacyOn, setPrivacyOn,
      distMode, setDistMode,
      cotizaciones, resumen, portfolio,
      catalizadores, stressTest, fundamental,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
