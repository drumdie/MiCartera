import { useApp } from '../../store/AppContext'
import { formatARS } from '../../utils/formatters'

export default function Header() {
  const { cotizaciones, user, signOut, isDemo } = useApp()
  const { dolar_mep, riesgo_pais_pb } = cotizaciones

  return (
    <header className="header fade-in">
      <div className="header-top">
        <div>
          <div className="brand">MiCartera<span> · </span>AR</div>
          <div className="brand-sub">
            {isDemo
              ? 'Usuario Demo · Datos de ejemplo'
              : `${user.displayName ?? user.email} · Abr 2026`
            }
          </div>
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
          {!isDemo && (
            <button
              onClick={signOut}
              style={{
                marginTop: 6, background: 'none', border: '1px solid var(--border)',
                borderRadius: 6, color: 'var(--muted)', fontFamily: "'DM Mono', monospace",
                fontSize: 9, padding: '3px 8px', cursor: 'pointer', letterSpacing: '.06em',
                textTransform: 'uppercase', transition: 'color .2s, border-color .2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              Salir
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
