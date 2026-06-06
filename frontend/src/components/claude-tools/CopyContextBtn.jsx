import { useApp } from '../../store/AppContext'
import { buildTacticalContext, buildFundamentalContext, buildCatalystContext } from '../../services/contextBuilder'

export default function CopyContextBtn({ tipo = 'tactico', onToast }) {
  const { portfolio, cotizaciones, resumen, fundamental, catalizadores } = useApp()

  const handleCopy = () => {
    const text = tipo === 'fundamental'
      ? buildFundamentalContext(fundamental)
      : tipo === 'catalizadores'
      ? buildCatalystContext(portfolio, catalizadores)
      : buildTacticalContext(portfolio, cotizaciones, resumen)

    navigator.clipboard.writeText(text)
      .then(() => onToast?.('✓ Contexto copiado'))
      .catch(() => onToast?.('Error al copiar'))
  }

  const labels = {
    tactico:       { title: 'Copiar contexto táctico',       sub: 'Texto listo para pegar en Claude.ai' },
    fundamental:   { title: 'Copiar prompt fundamental',     sub: 'Prompt completo para pegar en Claude.ai' },
    catalizadores: { title: 'Copiar contexto catalizadores', sub: 'Cartera + eventos actuales para pegar en Claude.ai' },
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
