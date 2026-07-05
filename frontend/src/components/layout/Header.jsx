import { useNavigate } from 'react-router-dom'
import { useApp } from '../../store/AppContext'
import { formatARS } from '../../utils/formatters'

// onDolarClick / onRpClick: abren el panel inline de tipos de cambio / riesgo país (web).
export default function Header({ onSyncDone, onDolarClick, onRpClick }) {
  const navigate = useNavigate()
  const { cotizaciones, user, signOut, isDemo, hasFreshData, syncPPI, syncing, syncError, lastSync, isStale, ultimaSync } = useApp()
  const { dolar_mep, riesgo_pais_pb } = cotizaciones

  const handleSync = async () => {
    try {
      await syncPPI()
      onSyncDone?.('✓ Cartera sincronizada con el broker')
    } catch {
      // syncError ya está en contexto; el botón refleja el estado
    }
  }

  return (
    <header className="header fade-in">
      <div className="header-top">
        <div>
          <div className="brand">MiCartera<span> · </span>AR</div>
          {isDemo ? (
            <div className="brand-sub">Usuario Demo · Datos de ejemplo</div>
          ) : (
            <button
              className="brand-sub"
              onClick={() => navigate('/perfil')}
              title="Abrir perfil y credenciales"
              style={{
                background: 'none', border: 'none', padding: 0, margin: 0,
                cursor: 'pointer', textAlign: 'left', font: 'inherit',
                color: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {user.displayName ?? user.email}
              <span style={{ fontSize: 8, opacity: 0.5 }}>▸ Perfil</span>
            </button>
          )}
          {/* Estado de sincronización — siempre visible */}
          {!isDemo && (() => {
            if (syncing) return (
              <div style={{ fontSize: 8, color: 'var(--accent)', marginTop: 2 }}>
                ⟳ Sincronizando…
              </div>
            )
            const refDate = ultimaSync ?? lastSync
            const label = refDate
              ? new Date(refDate).toLocaleString('es-AR', {
                  weekday: 'short', day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })
              : null
            if (isStale && label) return (
              <div style={{ fontSize: 8, color: '#f7b731', marginTop: 2 }}>
                ⚠ Mercado cerrado · datos del {label}
              </div>
            )
            if (syncError) return (
              <div style={{ fontSize: 8, color: 'var(--red, #e05c5c)', marginTop: 2 }}>
                {syncError}{label ? ` · último sync: ${label}` : ''}
              </div>
            )
            if (label) return (
              <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>
                Último sync: {label}
              </div>
            )
            return (
              <div style={{ fontSize: 8, color: 'var(--muted)', opacity: 0.5, marginTop: 2 }}>
                Sin sincronizar
              </div>
            )
          })()}
        </div>

        <div style={{ textAlign: 'right' }}>
          <button
            onClick={onDolarClick}
            title="Ver tipos de cambio e histórico"
            style={{ background: 'none', border: 'none', padding: 0, textAlign: 'right', cursor: onDolarClick ? 'pointer' : 'default', display: 'block', width: '100%' }}
          >
            <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
              Dólar MEP {onDolarClick && <span style={{ opacity: .5 }}>▸</span>}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 17, fontWeight: 600, color: 'var(--accent2)' }}>
              {hasFreshData ? formatARS(dolar_mep) : '—'}
            </div>
          </button>
          <button
            className="rp-chip"
            onClick={onRpClick}
            title="Ver riesgo país e histórico"
            style={{ cursor: onRpClick ? 'pointer' : 'default' }}
          >
            <span className="rp-dot" />
            RP <span>{hasFreshData && riesgo_pais_pb != null ? riesgo_pais_pb : '—'}</span> pb
          </button>

          {!isDemo && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
              {/* Botón sincronizar PPI */}
              <button
                onClick={handleSync}
                disabled={syncing}
                title="Sincronizar posiciones desde el broker"
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
                {syncing ? 'Sync…' : '↻ Broker'}
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
