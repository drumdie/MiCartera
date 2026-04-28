import { useApp } from '../../store/AppContext'

// Genera el texto de contexto táctico o fundamental para pegar en Claude.ai.
// En Fase 2+ esto puede reemplazarse por una llamada directa a la API de Claude.
function buildTacticalContext(portfolio, cotizaciones, resumen) {
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

function buildFundamentalContext(fundamental) {
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

export default function CopyContextBtn({ tipo = 'tactico', onToast }) {
  const { portfolio, cotizaciones, resumen, fundamental } = useApp()

  const handleCopy = () => {
    const text = tipo === 'fundamental'
      ? buildFundamentalContext(fundamental)
      : buildTacticalContext(portfolio, cotizaciones, resumen)

    navigator.clipboard.writeText(text)
      .then(() => onToast?.('✓ Contexto copiado'))
      .catch(() => onToast?.('Error al copiar'))
  }

  const labels = {
    tactico:     { title: 'Copiar contexto táctico',     sub: 'Texto listo para pegar en Claude.ai' },
    fundamental: { title: 'Copiar prompt fundamental',   sub: 'Prompt completo para pegar en Claude.ai' },
  }
  const { title, sub } = labels[tipo] ?? labels.tactico

  return (
    <button className="action-btn" onClick={handleCopy}>
      <span className="ab-icon">📋</span>
      <div className="ab-text">
        <div className="ab-title">{title}</div>
        <div className="ab-sub">{sub}</div>
      </div>
      <span className="ab-arrow">→</span>
    </button>
  )
}
