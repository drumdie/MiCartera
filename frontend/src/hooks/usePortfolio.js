import { useState, useEffect, useMemo, useCallback } from 'react'
import { MOCK_COTIZACIONES, MOCK_STRESS_TEST, MOCK_FUNDAMENTAL } from '../data/mockPortfolio'
import {
  onSnapshotPortfolio,
  onSnapshotCotizaciones,
  onSnapshotCatalysts,
} from '../services/portfolioService'
import { apiGet } from '../services/apiClient'

const EMPTY_CAT  = { subtotal_ars: 0, pct_cartera: 0, posiciones: [] }
const EMPTY_LIQ  = { subtotal_ars: 0, pct_cartera: 0, usd_total_aprox: 0, detalle: [] }

function buildCategory(raw) {
  const posiciones   = raw?.posiciones ?? []
  const subtotal_ars = posiciones.reduce((s, p) => s + (p.valor_corriente_ars ?? 0), 0)
  return { ...EMPTY_CAT, ...raw, posiciones, subtotal_ars }
}

function computePortfolio(raw, cotizaciones) {
  if (!raw) return null

  const acciones_ar = buildCategory(raw.acciones_ar)
  const cedears     = buildCategory(raw.cedears)
  const bonos       = buildCategory(raw.bonos)
  const ons         = buildCategory(raw.ons)
  const fci         = buildCategory(raw.fci)

  const liqDetalle  = raw.liquidez?.detalle ?? []
  const liqSubtotal = liqDetalle.reduce((s, d) => s + (d.valor_ars ?? 0), 0)
  const liquidez = {
    ...EMPTY_LIQ,
    ...raw.liquidez,
    detalle:         liqDetalle,
    subtotal_ars:    liqSubtotal,
    usd_total_aprox: cotizaciones.dolar_mep > 0
      ? Math.round(liqSubtotal / cotizaciones.dolar_mep)
      : 0,
  }

  const total = [acciones_ar, cedears, bonos, ons, fci, liquidez]
    .reduce((s, c) => s + c.subtotal_ars, 0)

  const pct = (sub) => total > 0 ? (sub / total) * 100 : 0

  const withPosPct = (cat) => ({
    ...cat,
    posiciones: cat.posiciones.map(p => ({
      ...p,
      pct_cartera: total > 0 ? ((p.valor_corriente_ars ?? 0) / total) * 100 : 0,
    })),
    pct_cartera: pct(cat.subtotal_ars),
  })

  return {
    acciones_ar: withPosPct(acciones_ar),
    cedears:     withPosPct(cedears),
    bonos:       withPosPct(bonos),
    ons:         withPosPct(ons),
    fci:         withPosPct(fci),
    liquidez:    { ...liquidez, pct_cartera: pct(liquidez.subtotal_ars) },
    _valor_total_ars: total,
  }
}

function computeResumen(portfolio) {
  if (!portfolio) return null
  const total = portfolio._valor_total_ars
  return {
    valor_total_ars: total,
    composicion_pct: {
      acciones_ar: portfolio.acciones_ar.pct_cartera,
      cedears:     portfolio.cedears.pct_cartera,
      bonos:       portfolio.bonos.pct_cartera,
      ons:         portfolio.ons.pct_cartera,
      fci:         portfolio.fci.pct_cartera,
      liquidez:    portfolio.liquidez.pct_cartera,
    },
    rend_30d_usd_mep_pct: 0,
    rend_30d_ars_pct:     0,
  }
}

// Derivar tipo visual desde impacto porcentual (para StressCard CSS class)
function withTipo(escenario) {
  const pct = escenario.impacto_cartera_pct ?? 0
  const tipo = pct < -10 ? 'danger' : pct < 0 ? 'warn' : ''
  return { ...escenario, tipo }
}

export function usePortfolio(uid) {
  const [rawPortfolio,  setRawPortfolio]  = useState(null)
  const [cotizaciones,  setCotizaciones]  = useState(MOCK_COTIZACIONES)
  const [catalizadores, setCatalizadores] = useState([])
  const [stressTest,    setStressTest]    = useState(MOCK_STRESS_TEST)
  const [loading,       setLoading]       = useState(true)

  // Suscripciones Firestore
  useEffect(() => {
    if (!uid) { setLoading(false); return }
    return onSnapshotPortfolio(uid, (data) => {
      setRawPortfolio(data)
      setLoading(false)
    })
  }, [uid])

  useEffect(() => {
    return onSnapshotCotizaciones((data) => {
      if (data) setCotizaciones(data)
    })
  }, [])

  useEffect(() => {
    if (!uid) return
    return onSnapshotCatalysts(uid, setCatalizadores)
  }, [uid])

  // Stress test desde el backend — se puede refrescar manualmente con refreshStress()
  const fetchStress = useCallback(async () => {
    if (!uid) return
    try {
      const data = await apiGet('/api/stress')
      const escenarios = (data.escenarios ?? []).map(withTipo)
      if (escenarios.length > 0) setStressTest(escenarios)
    } catch {
      // Backend no disponible o cartera vacía → mantener mock/estado anterior
    }
  }, [uid])

  useEffect(() => {
    fetchStress()
  }, [fetchStress])

  const portfolio = useMemo(
    () => computePortfolio(rawPortfolio, cotizaciones),
    [rawPortfolio, cotizaciones]
  )
  const resumen = useMemo(() => computeResumen(portfolio), [portfolio])

  return {
    portfolio,
    cotizaciones,
    resumen,
    catalizadores,
    stressTest,
    refreshStress: fetchStress,
    fundamental: MOCK_FUNDAMENTAL,
    loading,
  }
}
