// Soporta dos schemas:
//   v7 (v7 doc): { estado, tickers, resultado, desc }
//   app form:    { urgencia, tickers_afectados, descripcion }

const DOT_CLS = {
  // form (urgencia)
  urgente:     'urgent',
  cercano:     'near',
  estructural: 'structural',
  lejano:      'far',
  // v7 (estado)
  done:        'done',
  urgent:      'urgent',
  near:        'near',
  structural:  'structural',
  far:         'far',
}

const STATUS_LABEL = {
  urgente:     'Urgente',
  cercano:     'Próximo',
  estructural: 'Estructural',
  lejano:      'Largo plazo',
  done:        'Completado',
  urgent:      'Urgente',
  near:        'Próximo',
  structural:  'Estructural',
  far:         'Largo plazo',
}

export default function CatalystItem({ catalyst, onDelete }) {
  const {
    fecha, evento,
    descripcion, desc,            // ambos campos de descripción
    tickers_afectados = [],       // schema app
    tickers = [],                 // schema v7
    urgencia, estado,             // el que esté presente
    resultado,                    // solo en done
  } = catalyst

  const statusKey = estado ?? urgencia ?? 'far'
  const dotCls    = DOT_CLS[statusKey]    ?? 'far'
  const isDone    = statusKey === 'done'

  // Unificar tickers de ambos schemas (sin duplicados)
  const allTickers = [...new Set([...tickers_afectados, ...tickers])]
  const descText   = descripcion || desc

  return (
    <div className={`tl-item${isDone ? ' tl-done' : ''}`}>
      <div className={`tl-dot ${dotCls}`} />
      <div className="tl-card">
        <div className="tl-card-top">
          <div className="tl-date">
            {fecha} · {STATUS_LABEL[statusKey] ?? statusKey}
          </div>
          {onDelete && !isDone && (
            <button
              className="tl-del-btn"
              onClick={() => onDelete(catalyst)}
              title="Eliminar evento"
            >×</button>
          )}
        </div>

        <div className="tl-evento">{evento}</div>

        {allTickers.length > 0 && (
          <div className="tl-tickers">
            {allTickers.map(t => (
              <span key={t} className="tl-chip">{t}</span>
            ))}
          </div>
        )}

        {descText && <div className="tl-desc">{descText}</div>}

        {isDone && resultado && (
          <div className="tl-result">✅ {resultado}</div>
        )}
      </div>
    </div>
  )
}
