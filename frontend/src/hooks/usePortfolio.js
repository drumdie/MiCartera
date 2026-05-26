import { useState, useEffect, useMemo, useCallback } from 'react'
import { MOCK_COTIZACIONES, MOCK_STRESS_TEST, MOCK_FUNDAMENTAL } from '../data/mockPortfolio'
import {
  onSnapshotPortfolio,
  onSnapshotCotizaciones,
  onSnapshotCatalysts,
  onSnapshotPortfolioHistory,
  onSnapshotFundamentals,
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
  const rawRendARS = totalCostoARS > 0
    ? parseFloat((totalGananciaARS / totalCostoARS * 100).toFixed(2))
    : null

  // rendUSD: ganancia en USD / costo en USD (costo_ars ÷ MEP actual)
  // Nota: con el proxy de MEP constante esto es equivalente a rendARS en %.
  // La diferencia ARS vs USD solo aparece con retornos históricos (feature futuro).
  const totalCostoUSD = dolar_mep > 0 ? totalCostoARS / dolar_mep : 0
  const rawRendUSD = totalCostoUSD > 0
    ? parseFloat((totalGananciaUSD / totalCostoUSD * 100).toFixed(2))
    : null

  // Sanidad: si el rendimiento es < −99%, los datos en Firestore son de una versión
  // anterior al fix de doble conversión (avg_cost_ars × MEP para bonos/ONs → costo
  // astronómico → ganancia ≈ −100%). Mostrar null → "N/D" hasta el próximo sync.
  const rendARS = (rawRendARS != null && rawRendARS > -99) ? rawRendARS : null
  const rendUSD = (rawRendUSD != null && rawRendUSD > -99) ? rawRendUSD : null

  // Si el % es inválido, la ganancia absoluta también lo es
  const gananciaARSClean = rendARS !== null ? totalGananciaARS : null
  const gananciaUSDClean = rendUSD !== null ? totalGananciaUSD : null

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
    ganancia_total_ars:     gananciaARSClean,
    ganancia_total_usd:     gananciaUSDClean,
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
  const [rawPortfolio,      setRawPortfolio]      = useState(null)
  const [cotizaciones,      setCotizaciones]      = useState(MOCK_COTIZACIONES)
  const [catalizadores,     setCatalizadores]     = useState([])
  const [stressTest,        setStressTest]        = useState(MOCK_STRESS_TEST)
  const [portfolioHistory,  setPortfolioHistory]  = useState({})
  const [rawFundamentals,   setRawFundamentals]   = useState({})
  const [loading,           setLoading]           = useState(true)

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

  useEffect(() => {
    if (!uid) return
    return onSnapshotPortfolioHistory(uid, setPortfolioHistory)
  }, [uid])

  useEffect(() => {
    if (!uid) return
    return onSnapshotFundamentals(uid, setRawFundamentals)
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

  // Rendimiento de los últimos 30 días (o los días disponibles si hay menos historia).
  // Compara el valor total actual con la entrada del historial más cercana a 30d atrás.
  // Retorna null cuando no hay historia suficiente (primer sync → mostrar N/D).
  const rend30d = useMemo(() => {
    if (!portfolio || !portfolioHistory) return null
    const total = portfolio._valor_total_ars
    if (!total || total <= 0) return null

    const dates = Object.keys(portfolioHistory).sort()
    if (dates.length < 2) return null   // necesitamos al menos 2 puntos

    // Hoy en Buenos Aires (UTC-3)
    const bueStr = new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
    const bue    = new Date(bueStr)
    const todayStr = bue.toISOString().substring(0, 10)

    // Fecha objetivo: 30 días atrás
    const target = new Date(bue)
    target.setDate(target.getDate() - 30)
    const targetStr = target.toISOString().substring(0, 10)

    // Buscar la entrada más reciente que sea ≤ targetStr (exactamente 30d o antes)
    // Si no hay, usar la más antigua disponible (historia parcial < 30d)
    const before = dates.filter(d => d <= targetStr && d < todayStr)
    const refDate = before.length > 0
      ? before[before.length - 1]   // más reciente ≤ 30d atrás
      : dates.find(d => d < todayStr) // más antiguo disponible

    if (!refDate) return null

    const oldValue = portfolioHistory[refDate]
    if (!oldValue || oldValue <= 0) return null

    const msPerDay = 1000 * 60 * 60 * 24
    const days = Math.round((new Date(todayStr) - new Date(refDate)) / msPerDay)
    if (days < 1) return null

    return {
      pct:  parseFloat(((total - oldValue) / oldValue * 100).toFixed(2)),
      absARS: parseFloat((total - oldValue).toFixed(2)),
      days,
    }
  }, [portfolio, portfolioHistory])

  // Fundamentales reales desde Firestore, agrupados por sector para la UI.
  // Si no hay datos aún (pre-refresh) devuelve array vacío → tab muestra botón "Actualizar".
  const fundamentalData = useMemo(() => {
    const entries = Object.values(rawFundamentals)
    if (entries.length === 0) return []

    // Agrupar por sector (o categoria como fallback)
    const bySector = {}
    for (const fund of entries) {
      const key = fund.sector || (fund.categoria === 'cedear' ? 'CEDEARs' : 'Acciones AR')
      if (!bySector[key]) bySector[key] = []
      bySector[key].push(fund)
    }

    return Object.entries(bySector).map(([sector, posiciones]) => ({ sector, posiciones }))
  }, [rawFundamentals])

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
    fundamental: fundamentalData,
    loading,
    isStale,
    ultimaSync,
    rend30d,
  }
}
