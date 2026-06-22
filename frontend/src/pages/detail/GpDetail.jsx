import { useNavigate } from 'react-router-dom'
import { useApp } from '../../store/AppContext'
import { formatUSD, formatPctShort } from '../../utils/formatters'
import ScreenHeader from '../../components/layout/ScreenHeader'
import PrivacyMask from '../../components/ui/PrivacyMask'

const CAT_LABEL = {
  acciones_ar: 'Acción AR', cedears: 'CEDEAR', bonos: 'Bono', ons: 'ON', fci: 'FCI',
}

export default function GpDetail() {
  const navigate = useNavigate()
  const { portfolio, resumen } = useApp()

  // Posiciones con G/P USD MEP atribuida, ordenadas de mayor aporte a mayor pérdida.
  // Usa el G/P TOTAL (precio + renta cobrada); fallback a solo-precio para datos viejos.
  const gpUsd = (p) => p.ganancia_total_usd ?? p.ganancia_usd_mep ?? 0
  const posiciones = []
  for (const key of ['acciones_ar', 'cedears', 'bonos', 'ons', 'fci']) {
    for (const p of portfolio?.[key]?.posiciones ?? []) {
      if (p.ticker && p.ganancia_usd_mep != null) posiciones.push({ ...p, _cat: key })
    }
  }
  posiciones.sort((a, b) => gpUsd(b) - gpUsd(a))

  const gpTotal = resumen?.ganancia_total_usd ?? null
  const gpPos = (gpTotal ?? 0) >= 0
  const goFundamental = (ticker) => navigate('/', { state: { tab: 'fundamental', ticker } })

  return (
    <div className="screen">
      <ScreenHeader title="Ganancia / pérdida" />

      {/* Resumen total */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="kpi-label" style={{ marginBottom: 4 }}>G/P total acumulada (USD MEP)</div>
        <div className="total-amount" style={{ fontSize: 26, color: gpPos ? 'var(--buy)' : 'var(--red)' }}>
          <PrivacyMask>{gpTotal != null ? `${gpPos ? '+' : ''}${formatUSD(gpTotal)}` : 'N/D'}</PrivacyMask>
        </div>
      </div>

      {posiciones.length === 0 ? (
        <div className="state">
          <i className="ti ti-receipt-off" aria-hidden="true" />
          <div className="state-title">Sin datos de costo</div>
          <div className="state-desc">La ganancia por posición aparece cuando hay precio de compra sincronizado.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {posiciones.map((p) => {
            const g = gpUsd(p)
            const pos = g >= 0
            const rend = p.rend_total_usd_pct ?? p.rend_usd_pct
            return (
              <button key={p.ticker} className="list-row" onClick={() => goFundamental(p.ticker)}>
                <div className="list-row-ic" style={{ color: pos ? 'var(--buy)' : 'var(--red)' }}>
                  <i className={`ti ${pos ? 'ti-trending-up' : 'ti-trending-down'}`} aria-hidden="true" />
                </div>
                <div className="list-row-main">
                  <div className="tr-ticker" style={{ fontSize: 15 }}>{p.ticker}</div>
                  <div className="list-row-sub">{CAT_LABEL[p._cat]}{p.descripcion ? ` · ${p.descripcion}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="tg-val" style={{ fontSize: 14, color: pos ? 'var(--buy)' : 'var(--red)' }}>
                    <PrivacyMask>{pos ? '+' : ''}{formatUSD(g)}</PrivacyMask>
                  </div>
                  {rend != null && <div className="list-row-sub" style={{ color: pos ? 'var(--buy)' : 'var(--red)' }}>{formatPctShort(rend)}</div>}
                </div>
                <i className="ti ti-chevron-right list-row-chev" aria-hidden="true" />
              </button>
            )
          })}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, background: 'var(--blue-soft)', border: '1px solid var(--blue-line)', borderRadius: 'var(--r-md)', padding: '11px 12px' }}>
            <i className="ti ti-info-circle" style={{ color: 'var(--accent3)', fontSize: 16 }} aria-hidden="true" />
            <span style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.45 }}>
              Tocá una posición para ver su <span style={{ color: 'var(--accent3)' }}>análisis fundamental</span>.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
