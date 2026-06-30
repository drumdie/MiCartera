import { buildContratoContext } from '../../services/contextBuilder'
import { validateTacticalPayload } from '../../services/tacticalEngine'
import { saveTacticoAnalisis } from '../../services/portfolioService'
import PasteResultArea from './PasteResultArea'

// Sección "Análisis Táctico" del tab Posiciones (espejo del "Análisis Fundamental").
// Paso 1: copia el contexto (cartera + contratos + fundamental) para analizar con IA.
// Paso 2: pega el resultado → guarda la justificación por posición (analisis_tactico),
// que es lo que alimenta el texto táctico de cada posición en el tab Posiciones.
export default function AnalisisTacticoPanel({ uid, tactico, fundamentalsByTicker, catalizadores, onToast }) {
  const handleCopy = async () => {
    try {
      const text = buildContratoContext(tactico, fundamentalsByTicker, catalizadores)
      await navigator.clipboard.writeText(text)
      onToast?.('✓ Cartera y contratos copiados — pegalos en tu IA')
    } catch {
      onToast?.('No se pudo copiar al portapapeles')
    }
  }

  const handlePaste = async (jsonStr) => {
    let parsed
    try { parsed = JSON.parse(jsonStr) }
    catch { onToast?.('El texto pegado no es un JSON válido'); return }

    const { ok, errores, ranking, analisis } = validateTacticalPayload(parsed)
    if (!ok) { onToast?.(`Datos inválidos: ${errores[0]}`); return }
    if (!analisis?.length && !ranking?.length) { onToast?.('El análisis no trae datos por posición'); return }

    try {
      await saveTacticoAnalisis(uid, analisis ?? [], ranking ?? [])
      onToast?.(`✓ Análisis táctico cargado (${analisis?.length ?? 0} posiciones)`)
    } catch {
      onToast?.('No se pudo guardar el análisis')
    }
  }

  return (
    <>
      <div className="eyebrow" style={{ margin: '24px 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
        Análisis Táctico
        <span className="badge badge-purple"><i className="ti ti-sparkles" aria-hidden="true" />IA</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 10 }}>
        Cruzá tu cartera con el contrato de cada ticker y su análisis fundamental, usando IA, para
        saber qué conviene hacer con cada posición. El resultado aparece en el texto de cada posición.
      </div>
      <div className="action-btns">
        <button className="action-btn" onClick={handleCopy}>
          <span className="ab-icon"><i className="ti ti-number-1" aria-hidden="true" /></span>
          <div className="ab-text">
            <div className="ab-title">Paso 1 · Copiar cartera y contratos</div>
            <div className="ab-sub">Copia tu cartera, contratos y fundamentales para analizar con IA</div>
          </div>
          <span className="ab-arrow"><i className="ti ti-arrow-right" aria-hidden="true" /></span>
        </button>
        <PasteResultArea
          id="paste-tactico"
          label="Paso 2 · Pegar análisis de la IA"
          sub="Pegá el resultado — guarda la recomendación de cada posición"
          onLoad={handlePaste}
        />
      </div>
    </>
  )
}
