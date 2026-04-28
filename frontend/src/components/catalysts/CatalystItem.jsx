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

export default function CatalystItem({ catalyst }) {
  const { fecha, evento, descripcion, tickers_afectados, urgencia } = catalyst
  const dotCls = DOT_CLS[urgencia] ?? 'far'

  return (
    <div className="tl-item">
      <div className={`tl-dot ${dotCls}`} />
      <div className="tl-card">
        <div className="tl-date">{fecha} · {URGENCIA_LABEL[urgencia] ?? urgencia}</div>
        <div className="tl-evento">{evento}</div>
        <div className="tl-tickers">
          {tickers_afectados.map(t => (
            <span key={t} className="tl-chip">{t}</span>
          ))}
        </div>
        {descripcion && <div className="tl-desc">{descripcion}</div>}
      </div>
    </div>
  )
}
