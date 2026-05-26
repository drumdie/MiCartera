const DOT_CLS = {
  urgente:    'urgent',
  cercano:    'near',
  estructural:'structural',
  lejano:     'far',
}

const URGENCIA_LABEL = {
  urgente:    'Urgente',
  cercano:    'Próximo',
  estructural:'Estructural',
  lejano:     'Largo plazo',
}

export default function CatalystItem({ catalyst, onDelete }) {
  const { fecha, evento, descripcion, tickers_afectados = [], urgencia } = catalyst
  const dotCls = DOT_CLS[urgencia] ?? 'far'

  return (
    <div className="tl-item">
      <div className={`tl-dot ${dotCls}`} />
      <div className="tl-card">
        <div className="tl-card-top">
          <div className="tl-date">{fecha} · {URGENCIA_LABEL[urgencia] ?? urgencia}</div>
          {onDelete && (
            <button className="tl-del-btn" onClick={() => onDelete(catalyst)} title="Eliminar evento">×</button>
          )}
        </div>
        <div className="tl-evento">{evento}</div>
        {tickers_afectados.length > 0 && (
          <div className="tl-tickers">
            {tickers_afectados.map(t => (
              <span key={t} className="tl-chip">{t}</span>
            ))}
          </div>
        )}
        {descripcion && <div className="tl-desc">{descripcion}</div>}
      </div>
    </div>
  )
}
