// Genera el texto de contexto para pegar en Claude.ai.
// En Fase 2+ reemplazar por llamada directa a la API de Claude.

import {
  ROL_LABELS, SALUD_TESIS, ACCIONES_TACTICAS, URGENCIAS,
} from '../data/contratoConfig'

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

export function buildCatalystContext(portfolio, catalizadores) {
  const lines = [
    '# Catalizadores — MiCartera',
    `Fecha: ${new Date().toLocaleDateString('es-AR')}`,
    '',
    '## Portfolio actual',
    '',
  ]

  const allPositions = [
    ...(portfolio?.acciones_ar?.posiciones ?? []).map(p => ({ ...p, _cat: 'Acción AR' })),
    ...(portfolio?.cedears?.posiciones     ?? []).map(p => ({ ...p, _cat: 'CEDEAR'   })),
    ...(portfolio?.bonos?.posiciones       ?? []).map(p => ({ ...p, _cat: 'Bono'     })),
    ...(portfolio?.ons?.posiciones         ?? []).map(p => ({ ...p, _cat: 'ON'       })),
  ]

  if (allPositions.length === 0) {
    lines.push('(Sin posiciones cargadas aún)')
  } else {
    allPositions.forEach(p => {
      const rend   = p.rend_usd_pct != null ? ` · ${p.rend_usd_pct >= 0 ? '+' : ''}${p.rend_usd_pct}% USD` : ''
      const accion = p.accion_tactica ? ` · ${p.accion_tactica}` : ''
      lines.push(`- [${p._cat}] ${p.ticker}: ${p.descripcion || ''}${rend}${accion}`)
    })
  }

  lines.push('')
  lines.push('## Catalizadores actualmente registrados')
  lines.push('')

  if (!catalizadores || catalizadores.length === 0) {
    lines.push('(Sin catalizadores registrados aún)')
  } else {
    catalizadores.forEach(c => {
      const statusKey = c.estado ?? c.urgencia ?? 'far'
      const tickers   = [...new Set([...(c.tickers ?? []), ...(c.tickers_afectados ?? [])])].join(', ')
      lines.push(`[${c.fecha}] ${c.evento}${tickers ? ' · ' + tickers : ''} (${statusKey})`)
      const desc = c.descripcion || c.desc
      if (desc) lines.push(`  ${desc}`)
      if (c.resultado) lines.push(`  Resultado: ${c.resultado}`)
    })
  }

  lines.push('')
  lines.push('---')
  lines.push('Actualizá o completá la lista de catalizadores para esta cartera.')
  lines.push('Devolvé SOLO el JSON con este schema exacto (sin texto adicional):')
  lines.push('')
  lines.push('```json')
  lines.push('{')
  lines.push('  "catalizadores": [')
  lines.push('    {')
  lines.push('      "fecha": "2026-08-26",')
  lines.push('      "evento": "Nombre del evento",')
  lines.push('      "tickers": ["TICKER1", "TICKER2"],')
  lines.push('      "estado": "done",')
  lines.push('      "descripcion": "Descripción breve (para eventos pendientes)",')
  lines.push('      "resultado": "Resultado real (solo para estado done)"')
  lines.push('    }')
  lines.push('  ]')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('Valores de estado:')
  lines.push('  "done"       — ya ocurrió, incluir resultado')
  lines.push('  "near"       — próximos ~3 meses')
  lines.push('  "structural" — catalizador estructural sin fecha fija')
  lines.push('  "far"        — largo plazo (>3 meses o 2027+)')
  lines.push('')
  lines.push('Formato de fecha: ISO 8601 (YYYY-MM-DD) si es fecha exacta;')
  lines.push('string descriptivo ("Est. Jul 2026", "Q2–Q3 2026") si es aproximada.')
  lines.push('Incluí todos los eventos relevantes (pasados y futuros) para los tickers del portfolio.')

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
    '      },',
    '      "analisis_extendido": "3–5 párrafos (separados por doble salto de línea): contexto del negocio, drivers del último trimestre, riesgos y racional de los escenarios.",',
    '      "fuentes": [ { "nombre": "SEC 10-Q", "url": "https://..." } ]',
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
    '  analisis_extendido: texto plano, párrafos separados por doble salto de línea',
    '  fuentes: 2–4 links verificables por ticker (filings SEC, IR de la empresa, prensa)',
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

// Prompt táctico basado en el Contrato de Inversión (spec_contrato_inversion.md §3–5).
// Cruza los contratos del usuario + la capa determinística (computeTactico) +
// fundamentals + catalizadores. Devuelve el texto para pegar en Claude.ai; la
// respuesta JSON se valida con validateTacticalPayload antes de guardar.
//   tactico             = salida de computeTactico(portfolio, contratos, ...)
//   fundamentalsByTicker = { TICKER: { q1_2026, escenarios, kpis, ... } }
//   catalizadores       = lista de catalizadores registrados
export function buildContratoContext(tactico, fundamentalsByTicker = {}, catalizadores = []) {
  if (!tactico) return '(Sin datos de cartera aún)'
  const fmtPct = (n) => (n >= 0 ? '+' : '') + n + '%'

  const catByTicker = {}
  for (const c of (catalizadores ?? [])) {
    const tks = [...new Set([...(c.tickers ?? []), ...(c.tickers_afectados ?? [])])]
    for (const t of tks) (catByTicker[t] ??= []).push(c)
  }

  const lines = [
    '# Táctico de cartera por Contrato de Inversión — MiCartera',
    `Fecha: ${new Date().toLocaleDateString('es-AR')}`,
    '',
    '## Concentración de cartera',
    ...tactico.concentracion.map(g => `- ${g.grupo}: ${g.pct}%`),
    `- Liquidez: ${tactico.liquidez_pct}%`,
  ]
  if (tactico.suma_peso_objetivo != null) {
    lines.push(`Suma de pesos objetivo definidos: ${tactico.suma_peso_objetivo}% (referencia vs 100%)`)
  }

  lines.push(
    '',
    '## Cómo razonar (reglas)',
    '1. NO recomiendes sin citar el peso actual vs la banda objetivo y el rol declarado.',
    '2. Ponderá Objetivos × % cartera × resultado:',
    '   - Core / convicción alta + subió fuerte → MANTENER; buscar entrada en correcciones.',
    '   - Core + sobreponderada → recortar SOLO el excedente por riesgo, no la tesis.',
    '   - Especulativa + subió fuerte → tomar parcial / cristalizar antes.',
    '   - Cualquiera + cayó fuerte → ¿tesis intacta (oportunidad) o rota (cortar)? Chequeá kill criteria.',
    '3. Antídoto de sesgo: para cada posición core, dá el dato más fuerte HOY EN CONTRA de la tesis.',
    '4. Noticias/catalizadores: solo importan si activan un kill criterion o adelantan/confirman un catalizador.',
    '5. NO estás obligado a recomendar una operación: "mantener / no tocar" es válido si no hay evidencia.',
    '6. Priorizá por IMPACTO en puntos porcentuales de cartera, no por % de rendimiento aislado.',
    '',
    '## Posiciones (por grupo temático)',
  )

  const clasifTxt = (p) => ({
    debajo_de_banda: `DEBAJO de banda (faltan ${p.pp_faltantes} pp)`,
    en_banda:        'en banda',
    sobreponderada:  `SOBREPONDERADA (recortar ${p.pp_liberables} pp)`,
    sin_contrato:    'sin contrato definido',
  }[p.clasificacion] ?? p.clasificacion)

  for (const g of tactico.grupos) {
    lines.push('', `### ${g.grupo} — ${g.pct}% de la cartera`)
    for (const p of g.posiciones) {
      const c = p.contrato
      lines.push(`- ${p.ticker} (${p.categoria}) · peso ${p.peso_actual}% → ${clasifTxt(p)}`)
      if (c?.rol) {
        lines.push(`  Contrato: ${ROL_LABELS[c.rol] ?? c.rol} · banda ${c.peso_min}–${c.peso_objetivo}–${c.peso_max}%`)
      }
      if (c?.tesis) lines.push(`  Tesis del usuario: ${c.tesis}`)
      const kills = (c?.kill_criteria ?? []).filter(k => (k ?? '').trim())
      if (kills.length) lines.push(`  Kill criteria: ${kills.map(k => `(${k})`).join(' ')}`)

      const rendTxt  = p.rend_no_confiable ? 'N/D' : (p.rend_usd_pct != null ? fmtPct(p.rend_usd_pct) : 's/d')
      const totalTxt = p.rend_total_usd_pct != null ? ` · total ${fmtPct(p.rend_total_usd_pct)}` : ''
      const flag     = p.subio_fuerte ? ' · SUBIÓ FUERTE' : (p.cayo_fuerte ? ' · CAYÓ FUERTE' : '')
      lines.push(`  Rend precio USD: ${rendTxt}${totalTxt}${flag}`)

      const f = fundamentalsByTicker[p.ticker]
      if (f?.q1_2026) lines.push(`  Fundamental Q1: ${f.q1_2026}`)
      if (f?.escenarios && (f.escenarios.bear || f.escenarios.base || f.escenarios.bull)) {
        lines.push(`  Escenarios: bear ${f.escenarios.bear ?? '—'} | base ${f.escenarios.base ?? '—'} | bull ${f.escenarios.bull ?? '—'}`)
      }
      const cats = catByTicker[p.ticker]
      if (cats?.length) lines.push(`  Catalizadores: ${cats.map(c2 => `[${c2.fecha}] ${c2.evento}`).join(' · ')}`)
    }
  }

  lines.push(
    '',
    '---',
    'Devolvé SOLO el JSON con este schema exacto (sin texto adicional):',
    '',
    '```json',
    '{',
    '  "analisis_tactico": [',
    '    {',
    '      "ticker": "YPFD",',
    '      "salud_tesis": "intacta",',
    '      "mejor_argumento_en_contra": "El dato más fuerte HOY en contra de mantener la posición.",',
    '      "accion_tactica": "mantener",',
    '      "justificacion": "Conectá contrato + números + tesis + cartera. Citá peso vs banda.",',
    '      "urgencia": "media",',
    '      "condicion_espera": "Opcional: qué esperar (ej. balance Q2) si la acción es mantener/observar."',
    '    }',
    '  ],',
    '  "ranking_tactico": [',
    '    {',
    '      "prioridad": 1,',
    '      "ticker": "YPFD",',
    '      "accion": "reducir_parcial",',
    '      "impacto_pp": 5.6,',
    '      "urgencia": "alta",',
    '      "motivo": "Qué la hace la acción más importante (impacto en pp de cartera)."',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    `Enums: salud_tesis = ${SALUD_TESIS.join(' | ')}`,
    `       accion_tactica / accion = ${ACCIONES_TACTICAS.join(' | ')}`,
    `       urgencia = ${URGENCIAS.join(' | ')}`,
    'El ranking ordena TODAS las acciones por impacto en pp de cartera (la más importante primero).',
    'Si una posición no requiere acción, igual incluila en analisis_tactico con accion "mantener".',
  )

  return lines.join('\n')
}
