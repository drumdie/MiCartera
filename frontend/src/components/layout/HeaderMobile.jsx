import { useNavigate } from 'react-router-dom'
import { useApp } from '../../store/AppContext'
import { formatARS } from '../../utils/formatters'

function initials(name) {
  if (!name) return 'MC'
  const clean = name.split('@')[0].trim()
  const parts = clean.split(/[\s._-]+/).filter(Boolean)
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)
  return chars.toUpperCase()
}

export default function Header() {
  const navigate = useNavigate()
  const { cotizaciones, user, isDemo, hasFreshData, syncing, syncError, lastSync, isStale, ultimaSync } = useApp()
  const { dolar_mep, riesgo_pais_pb } = cotizaciones

  const displayName = isDemo ? 'Usuario Demo' : (user.displayName ?? user.email ?? 'Usuario')

  // ── Línea de estado de sync (explícita, no rota) ──
  const syncStatus = (() => {
    if (isDemo) return null
    if (syncing) return { cls: 'syncing', icon: 'ti-loader-2', text: 'Sincronizando…', spin: true }
    const refDate = ultimaSync ?? lastSync
    const label = refDate
      ? new Date(refDate).toLocaleString('es-AR', {
          weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })
      : null
    if (isStale && label) return { cls: 'warnc', icon: 'ti-alert-triangle', text: `Mercado cerrado · datos del ${label}` }
    if (syncError)        return { cls: 'errc', icon: 'ti-alert-circle', text: `${syncError}${label ? ` · últ: ${label}` : ''}` }
    if (label)            return { cls: 'ok', icon: 'ti-circle-check', text: `Último sync: ${label}` }
    return { cls: 'ok', icon: 'ti-circle', text: 'Sin sincronizar' }
  })()

  return (
    <header className="header fade-in">
      {/* Fila 1: usuario → Perfil */}
      <div className="header-top">
        {isDemo ? (
          <div className="user-btn" style={{ cursor: 'default' }}>
            <div className="avatar" style={{ width: 38, height: 38, fontSize: 14 }}>MC</div>
            <div>
              <div className="user-greet">Modo demo</div>
              <div className="user-name" style={{ color: 'var(--text)' }}>Usuario Demo</div>
            </div>
          </div>
        ) : (
          <button className="user-btn" onClick={() => navigate('/perfil')} aria-label="Abrir perfil">
            <div className="avatar" style={{ width: 38, height: 38, fontSize: 14 }}>{initials(displayName)}</div>
            <div>
              <div className="user-greet">Hola</div>
              <div className="user-name">
                {displayName.split('@')[0]}
              </div>
            </div>
          </button>
        )}
      </div>

      {/* Fila 2: MEP + RP — cada chip navega a su propio detalle */}
      <div className="header-rates" style={!hasFreshData ? { opacity: 0.5 } : undefined}>
        <button
          type="button"
          className="header-rates-item"
          onClick={hasFreshData ? () => navigate('/detalle/mep') : undefined}
          aria-label="Ver tipos de cambio"
          style={!hasFreshData ? { cursor: 'default' } : undefined}
        >
          <span className="header-rates-label">MEP</span>
          <span className="header-rates-val">{hasFreshData ? formatARS(dolar_mep) : '—'}</span>
        </button>
        <span className="header-rates-sep" aria-hidden="true" />
        <button
          type="button"
          className="header-rates-item"
          onClick={hasFreshData ? () => navigate('/detalle/rp') : undefined}
          aria-label="Ver riesgo país"
          style={!hasFreshData ? { cursor: 'default' } : undefined}
        >
          <span className="header-rates-label">RP</span>
          <span className="header-rates-val">{hasFreshData && riesgo_pais_pb != null ? `${riesgo_pais_pb} pb` : '—'}</span>
        </button>
      </div>

      {syncStatus && (
        <div className={`sync-line ${syncStatus.cls}`}>
          <i className={`ti ${syncStatus.icon} ${syncStatus.spin ? 'spin-ic' : ''}`} aria-hidden="true" />
          {syncStatus.text}
        </div>
      )}
    </header>
  )
}
