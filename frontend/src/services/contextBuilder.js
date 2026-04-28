// Genera el texto de contexto para pegar en Claude.ai.
// En Fase 2+ reemplazar por llamada directa a la API de Claude.

export function buildTacticalContext(portfolio, cotizaciones, resumen) {
  const lines = [
    '# Contexto táctico — MiCartera',
    `Fecha: ${new Date().toLocaleDateString('es-AR')}`,
    `Dólar MEP: AR$ ${cotizaciones.dolar_mep.toLocaleString('es-AR')}`,
    `Valor total cartera: US$ ${(resumen.valor_total_ars / cotizaciones.dolar_mep).toFixed(0)} (MEP)`,
    `Rend. 30d USD MEP: +${resumen.rend_30d_usd_mep_pct}%`,
    '',
    '## Posiciones',
  ]

  const allPositions = [
    ...portfolio.acciones_ar.posiciones.map(p => ({ ...p, categoria: 'Acciones AR' })),
    ...portfolio.cedears.posiciones.map(p => ({ ...p, categoria: 'CEDEAR' })),
    ...portfolio.bonos.posiciones.map(p => ({ ...p, categoria: 'Bono' })),
    ...portfolio.ons.posiciones.map(p => ({ ...p, categoria: 'ON' })),
    ...portfolio.fci.posiciones.map(p => ({ ...p, categoria: 'FCI' })),
  ]

  allPositions.forEach(p => {
    lines.push(`- [${p.categoria}] ${p.ticker}: rend USD ${p.rend_usd_pct >= 0 ? '+' : ''}${p.rend_usd_pct}% | señal: ${p.accion_tactica}`)
  })

  lines.push('', `Liquidez disponible: ${portfolio.liquidez.pct_cartera}% (≈ USD ${portfolio.liquidez.usd_total_aprox})`)
  lines.push('', '---', 'Analizá la cartera y recomendá ajustes tácticos en formato JSON.')

  return lines.join('\n')
}

export function buildFundamentalContext(fundamental) {
  const lines = ['# Análisis fundamental — MiCartera', '']
  fundamental.forEach(sector => {
    lines.push(`## ${sector.sector}`)
    sector.posiciones.forEach(p => {
      lines.push(`- ${p.ticker}: EV/EBITDA ${p.ev_ebitda} | tesis: ${p.tesis}`)
    })
    lines.push('')
  })
  lines.push('Actualizá los escenarios de precio y ratios en formato JSON.')
  return lines.join('\n')
}
