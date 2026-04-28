import { useApp } from '../../store/AppContext'
import { formatARS } from '../../utils/formatters'

export default function Header() {
  const { cotizaciones } = useApp()
  const { dolar_mep, riesgo_pais_pb } = cotizaciones

  return (
    <header className="header fade-in">
      <div className="header-top">
        <div>
          <div className="brand">MiCartera<span> · </span>AR</div>
          <div className="brand-sub">Usuario Demo · Broker Ejemplo · Abr 2026</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
            Dólar MEP
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 17, fontWeight: 600, color: 'var(--accent2)' }}>
            {formatARS(dolar_mep)}
          </div>
          <div className="rp-chip">
            <span className="rp-dot" />
            RP <span>{riesgo_pais_pb}</span> pb
          </div>
        </div>
      </div>
    </header>
  )
}
