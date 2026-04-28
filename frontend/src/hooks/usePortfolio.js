import { useState, useEffect, useMemo } from 'react'
import { MOCK_COTIZACIONES, MOCK_STRESS_TEST, MOCK_FUNDAMENTAL } from '../data/mockPortfolio'
import {
  onSnapshotPortfolio,
  onSnapshotCotizaciones,
  onSnapshotCatalysts,
} from '../services/portfolioService'

const EMPTY_CAT  = { subtotal_ars: 0, pct_cartera: 0, posiciones: [] }
const EMPTY_LIQ  = { subtotal_ars: 0, pct_cartera: 0, usd_total_aprox: 0, detalle: [] }

function buildCategory(raw) {
  const posiciones  = raw?.posiciones ?? []
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
    detalle:       liqDetalle,
    subtotal_ars:  liqSubtotal,
    usd_total_aprox: cotizaciones.dolar_mep > 0
      ? Math.round(liqSubtotal / cotizaciones.dolar_mep)
      : 0,
  }

  const total = [acciones_ar, cedears, bonos, ons, fci, liquidez]
    .reduce((s, c) => s + c.subtotal_ars, 0)

  const pct = (sub) => total > 0 ? (sub / total) * 100 : 0

  return {
    acciones_ar: { ...acciones_ar, pct_cartera: pct(acciones_ar.subtotal_ars) },
    cedears:     { ...cedears,     pct_cartera: pct(cedears.subtotal_ars)     },
    bonos:       { ...bonos,       pct_cartera: pct(bonos.subtotal_ars)       },
    ons:         { ...ons,         pct_cartera: pct(ons.subtotal_ars)         },
    fci:         { ...fci,         pct_cartera: pct(fci.subtotal_ars)         },
    liquidez:    { ...liquidez,    pct_cartera: pct(liquidez.subtotal_ars)    },
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
    // rend_30d_* calculado por el backend en Fase 2
    rend_30d_usd_mep_pct: 0,
    rend_30d_ars_pct:     0,
  }
}

export function usePortfolio(uid) {
  const [rawPortfolio,  setRawPortfolio]  = useState(null)
  const [cotizaciones,  setCotizaciones]  = useState(MOCK_COTIZACIONES)
  const [catalizadores, setCatalizadores] = useState([])
  const [loading,       setLoading]       = useState(true)

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
    stressTest:  MOCK_STRESS_TEST,
    fundamental: MOCK_FUNDAMENTAL,
    loading,
  }
}
