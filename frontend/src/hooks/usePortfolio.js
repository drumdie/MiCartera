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
    _dolar_mep:       cotizaciones.dolar_mep ?? 0,
  }
}

function computeResumen(portfolio) {
  if (!portfolio) return null
  const total     = portfolio._valor_total_ars
  const dolar_mep = portfolio._dolar_mep ?? 0

  // Rendimiento total desde precio de compra — agregado de todas las categorías
  // (excluye liquidez, que no tiene costo promedio)
  const cats = [portfolio.acciones_ar, portfolio.cedears, portfolio.bonos, portfolio.ons, portfolio.fci]
  const totalGananciaARS = cats.reduce((s, c) => s + (c.ganancia_ars     ?? 0), 0)
  const totalGananciaUSD = cats.reduce((s, c) => s + (c.ganancia_usd_mep ?? 0), 0)
  const totalCostoARS    = cats.reduce((s, c) => s + (c.costo_total_ars  ?? 0), 0)

  // null cuando no hay costo de compra (primer sync sin avg_costs calculados)
  const rendARS = totalCostoARS > 0
    ? parseFloat((totalGananciaARS / totalCostoARS * 100).toFixed(2))
    : null

  // rendUSD: ganancia en USD / costo en USD (costo_ars ÷ MEP actual)
  // Nota: con el proxy de MEP constante esto es equivalente a rendARS en %.
  // La diferencia ARS vs USD solo aparece con retornos históricos (feature futuro).
  const totalCostoUSD = dolar_mep > 0 ? totalCostoARS / dolar_mep : 0
  const rendUSD = totalCostoUSD > 0
    ? parseFloat((totalGananciaUSD / totalCostoUSD * 100).toFixed(2))
    : null

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
    ganancia_total_ars:     totalGananciaARS,
    ganancia_total_usd:     totalGananciaUSD,
    costo_total_ars:        totalCostoARS,
    rend_total_ars_pct:     rendARS,
    rend_total_usd_mep_pct: rendUSD,
    // backwards-compat
    rend_30d_ars_pct:       rendARS,
    rend_30d_usd_mep_pct:   rendUSD,
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

  // Leer is_stale y ultima_sync desde cualquier categoría del portfolio raw.
  // El backend escribe estos campos en cada doc; tomamos el más reciente.
  const { isStale, ultimaSync } = useMemo(() => {
    if (!rawPortfolio) return { isStale: false, ultimaSync: null }
    const docs = Object.values(rawPortfolio)
    const stale = docs.some(d => d?.is_stale === true)
    const latest = docs
      .map(d => d?.ultima_sync ?? '')
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
    return { isStale: stale, ultimaSync: latest }
  }, [rawPortfolio])

  return {
    portfolio,
    cotizaciones,
    resumen,
    catalizadores,
    stressTest,
    refreshStress: fetchStress,
    fundamental: MOCK_FUNDAMENTAL,
    loading,
    isStale,
    ultimaSync,
  }
}
