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
  const lines = [
    '# Análisis fundamental — MiCartera',
    `Fecha: ${new Date().toLocaleDateString('es-AR')}`,
    '',
    'Analizá cada posición y devolvé un JSON con el siguiente esquema exacto:',
    '',
    '```json',
    '{',
    '  "analisis": [',
    '    {',
    '      "ticker": "AAPL",',
    '      "accion_tactica": "mantener",',
    '      "sentimiento": "positivo",',
    '      "q1_2026": "Revenue $X (+Y% a/a) · Descripción en una línea (null si no hay datos recientes)",',
    '      "kpis": {',
    '        "ebitda_ttm": "USD Xb",',
    '        "ev_ebitda": "Xx",',
    '        "margen_ebitda": "X%",',
    '        "clave_adicional": "valor"',
    '      },',
    '      "comparable_ev_ebitda": { "nombre": "Peer comparable", "valor": "Xx" },',
    '      "tesis": "2–3 oraciones con la tesis de inversión y catalizadores clave.",',
    '      "escenarios": {',
    '        "bear": "$X — descripción breve",',
    '        "base": "$X–Y — descripción breve",',
    '        "bull": "$Z+ — descripción breve"',
    '      }',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    'Reglas:',
    '  accion_tactica: "comprar" | "mantener" | "tomar_parcial" | "vender"',
    '  sentimiento: "positivo" | "neutral" | "negativo"',
    '  q1_2026: string con earnings más recientes o null',
    '  kpis: objeto con los 4–6 KPIs más relevantes para ese ticker específico (no forzar siempre los mismos)',
    '  comparable_ev_ebitda: peer más relevante del sector, o null si no aplica',
    '  escenarios.bear/base/bull: precio objetivo + descripción en un string',
    '',
    '## Posiciones',
    '',
  ]

  const allPositions = fundamental.flatMap(s => s.posiciones ?? [])
  if (allPositions.length === 0) {
    lines.push('(Sin datos fundamentales aún — ejecutá "Actualizar fundamentales" primero)')
  } else {
    allPositions.forEach(p => {
      lines.push(`### ${p.ticker} — ${p.descripcion || p.nombre || ''}`)
      if (p.sector)        lines.push(`Sector: ${p.sector}`)
      if (p.categoria)     lines.push(`Tipo: ${p.categoria}`)
      if (p.market_cap)    lines.push(`Market Cap: ${p.market_cap}`)
      if (p.ebitda_ttm)    lines.push(`EBITDA TTM: ${p.ebitda_ttm}`)
      if (p.ev_ebitda)     lines.push(`EV/EBITDA: ${p.ev_ebitda}`)
      if (p.mg_ebitda)     lines.push(`Mg. EBITDA: ${p.mg_ebitda}`)
      if (p.trailing_pe)   lines.push(`P/E: ${p.trailing_pe}`)
      if (p.price_to_book) lines.push(`P/Book: ${p.price_to_book}`)
      if (p.roe)           lines.push(`ROE: ${p.roe}`)
      if (p.debt_to_equity) lines.push(`Deuda/Equity: ${p.debt_to_equity}`)
      // KPIs ya enriquecidos por Claude (iteración anterior)
      if (p.kpis) {
        Object.entries(p.kpis).forEach(([k, v]) => {
          if (v != null) lines.push(`${k}: ${v}`)
        })
      }
      if (p.q1_2026)       lines.push(`Q1 2026: ${p.q1_2026}`)
      if (p.tesis)         lines.push(`Tesis actual: ${p.tesis}`)
      lines.push('')
    })
  }

  return lines.join('\n')
}
