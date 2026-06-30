// Ordena/agrupa las posiciones del tab Fundamental según el modo elegido, devolviendo
// SIEMPRE la misma forma [{ sector, posiciones }] para un render uniforme.
//
//   'posiciones' (default) → igual que el tab Posiciones: Acciones AR y luego CEDEARs,
//                            en el orden de la cartera.
//   'tipo'                 → por Tipo/sector (lo que ya venía agrupado en `fundamental`).
//   'pct'                  → lista plana ordenada por % de cartera (desc).
//
// `fundamental` ya viene agrupado por sector (usePortfolio.fundamentalData).
// `portfolio` aporta el orden y el % de cartera por ticker (la data fundamental no los tiene).
export function orderedFundamentalGroups(fundamental, portfolio, mode = 'posiciones') {
  const grupos = fundamental ?? []
  if (mode === 'tipo') return grupos

  const flat = []
  for (const g of grupos) for (const p of g.posiciones ?? []) flat.push(p)

  // % de cartera y orden de cartera por ticker (acciones AR primero, luego CEDEARs).
  const pctByTicker = {}
  const ordByTicker = {}
  let idx = 0
  for (const cat of ['acciones_ar', 'cedears']) {
    for (const p of portfolio?.[cat]?.posiciones ?? []) {
      if (!p.ticker) continue
      pctByTicker[p.ticker] = p.pct_cartera ?? 0
      ordByTicker[p.ticker] = { cat, i: idx++ }
    }
  }

  if (mode === 'pct') {
    const sorted = [...flat].sort((a, b) => (pctByTicker[b.ticker] ?? 0) - (pctByTicker[a.ticker] ?? 0))
    return sorted.length ? [{ sector: 'Por % de cartera', posiciones: sorted }] : []
  }

  // mode 'posiciones'
  const byOrder = (a, b) => (ordByTicker[a.ticker]?.i ?? 9999) - (ordByTicker[b.ticker]?.i ?? 9999)
  const acc = flat.filter(p => ordByTicker[p.ticker]?.cat !== 'cedears').sort(byOrder)
  const ced = flat.filter(p => ordByTicker[p.ticker]?.cat === 'cedears').sort(byOrder)
  const out = []
  if (acc.length) out.push({ sector: 'Acciones AR', posiciones: acc })
  if (ced.length) out.push({ sector: 'CEDEARs', posiciones: ced })
  return out
}

export const FUND_SORT_OPTS = [
  { id: 'posiciones', label: 'Posiciones' },
  { id: 'tipo',       label: 'Tipo' },
  { id: 'pct',        label: '% cartera' },
]
