// Formato numérico con convención argentina: punto = miles, coma = decimales

export function formatARS(amount) {
  if (amount == null || isNaN(amount)) return '—'
  return 'AR$ ' + Math.round(amount).toLocaleString('es-AR')
}

export function formatARSPrice(amount) {
  if (amount == null || isNaN(amount)) return '—'
  return 'AR$ ' + amount.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatUSD(amount, decimals = 2) {
  if (amount == null || isNaN(amount)) return '—'
  return 'US$ ' + amount.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatPct(pct, signed = true) {
  if (pct == null || isNaN(pct)) return '—'
  const prefix = signed ? (pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : '') : ''
  return prefix + Math.abs(pct).toFixed(2).replace('.', ',') + '%'
}

export function formatPctShort(pct) {
  if (pct == null || isNaN(pct)) return '—'
  const sign = pct >= 0 ? '+' : ''
  return sign + pct.toFixed(2).replace('.', ',') + '%'
}

// Formatea un valor en ARS a la moneda activa del contexto
export function convertARS(amountARS, currency, cotizaciones) {
  switch (currency) {
    case 'ARS': return formatARS(amountARS)
    case 'MEP': return formatUSD(amountARS / cotizaciones.dolar_mep)
    case 'CCL': return formatUSD(amountARS / cotizaciones.dolar_ccl)
    case 'BNA': return formatARS(amountARS)
    default:    return formatARS(amountARS)
  }
}

// Retorna el rendimiento correcto según la moneda activa.
// Para instrumentos ARS, rend_usd_pct es 0 (no tenemos MEP histórico),
// así que usamos rend_ars_pct como proxy en cualquier moneda.
export function getRendForCurrency(position, currency) {
  if (currency === 'ARS' || currency === 'BNA') return position.rend_ars_pct ?? 0
  return position.rend_usd_pct || position.rend_ars_pct || 0
}
