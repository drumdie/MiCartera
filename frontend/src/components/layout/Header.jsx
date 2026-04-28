import { useApp } from '../../store/AppContext'
import { formatARS } from '../../utils/formatters'

export default function Header({ onSyncDone }) {
  const { cotizaciones, user, signOut, isDemo, syncPPI, syncing, syncError, lastSync } = useApp()
  const { dolar_mep, riesgo_pais_pb } = cotizaciones

  const handleSync = async () => {
    try {
      await syncPPI()
      onSyncDone?.('✓ Cartera sincronizada con PPI')
    } catch {
      // syncError ya está en contexto; el botón refleja el estado
    }
  }

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
          {/* Estado de sincronización */}
          {!isDemo && lastSync && !syncing && (
            <div style={{ fontSize: 8, color: 'var(--muted)', opacity: 0.5, marginTop: 2 }}>
              Sync: {new Date(lastSync).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          {syncError && (
            <div style={{ fontSize: 8, color: 'var(--red, #e05c5c)', marginTop: 2 }}>
              {syncError}
            </div>
          )}
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
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
              {/* Botón sincronizar PPI */}
              <button
                onClick={handleSync}
                disabled={syncing}
                title="Sincronizar posiciones desde PPI"
                style={{
                  background: 'none',
                  border: `1px solid ${syncing ? 'var(--muted)' : 'var(--accent)'}`,
                  borderRadius: 6,
                  color: syncing ? 'var(--muted)' : 'var(--accent)',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9,
                  padding: '3px 8px',
                  cursor: syncing ? 'not-allowed' : 'pointer',
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  transition: 'color .2s, border-color .2s',
                  minWidth: 72,
                }}
              >
                {syncing ? 'Sync…' : '↻ PPI'}
              </button>

              {/* Botón salir */}
              <button
                onClick={signOut}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--muted)',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  transition: 'color .2s, border-color .2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                Salir
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
