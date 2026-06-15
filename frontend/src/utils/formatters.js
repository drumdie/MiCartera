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

// ARS → USD a una tasa dada. Tasa inválida (≤0 / NaN) → '—' (evita "US$ ∞" al dividir por 0).
export function usdAtRate(amountARS, rate) {
  return rate > 0 ? formatUSD(amountARS / rate) : '—'
}

// Formatea un valor en ARS a la moneda activa del contexto (para totales).
// BNA usa dolar_oficial (BCRA minorista / Banco Nación); dolar_bna está deprecado (var BCRA errónea).
export function convertARS(amountARS, currency, cotizaciones) {
  switch (currency) {
    case 'ARS': return formatARS(amountARS)
    case 'MEP': return usdAtRate(amountARS, cotizaciones.dolar_mep)
    case 'CCL': return usdAtRate(amountARS, cotizaciones.dolar_ccl)
    case 'BNA': return usdAtRate(amountARS, cotizaciones.dolar_oficial)
    default:    return formatARS(amountARS)
  }
}

// Igual que convertARS pero conserva decimales — para precios por unidad
export function convertARSPrice(amountARS, currency, cotizaciones) {
  if (amountARS == null || isNaN(amountARS)) return '—'
  switch (currency) {
    case 'MEP': return usdAtRate(amountARS, cotizaciones.dolar_mep)
    case 'CCL': return usdAtRate(amountARS, cotizaciones.dolar_ccl)
    case 'BNA': return usdAtRate(amountARS, cotizaciones.dolar_oficial)
    default:    return formatARSPrice(amountARS)
  }
}

// Label de moneda activa para columnas dinámicas
export function currencyLabel(currency) {
  return currency === 'MEP' ? 'MEP' : currency === 'CCL' ? 'CCL' : currency === 'BNA' ? 'BNA' : 'ARS'
}

// Retorna el rendimiento correcto según la moneda activa.
// Devuelve null (→ '—') cuando la posición no tiene precio de compra calculado.
export function getRendForCurrency(position, currency) {
  if (currency === 'ARS') return position.rend_ars_pct ?? null
  // Para MEP/CCL/BNA (lentes en USD): preferir rend_usd_pct (CEDEARs/bonos); fallback a rend_ars_pct (acciones)
  return position.rend_usd_pct ?? position.rend_ars_pct ?? null
}
