import { useNavigate } from 'react-router-dom'
import { useApp } from '../../store/AppContext'
import { usdAtRate, formatPctShort } from '../../utils/formatters'
import ScreenHeader from '../../components/layout/ScreenHeader'
import PrivacyMask from '../../components/ui/PrivacyMask'

const CAT_LABEL = {
  acciones_ar: 'Acción AR', cedears: 'CEDEAR', bonos: 'Bono', ons: 'ON', fci: 'FCI',
}

export default function MayorPosicionDetail() {
  const navigate = useNavigate()
  const { portfolio, cotizaciones, resumen } = useApp()

  const mep = cotizaciones?.dolar_mep ?? 0
  const totalARS = resumen?.valor_total_ars ?? 0

  // Todas las posiciones con ticker (excluye liquidez), ordenadas por valor desc → top 5
  const posiciones = []
  for (const key of ['acciones_ar', 'cedears', 'bonos', 'ons', 'fci']) {
    for (const p of portfolio?.[key]?.posiciones ?? []) {
      if (p.ticker) posiciones.push({ ...p, _cat: key })
    }
  }
  const top = posiciones
    .sort((a, b) => (b.valor_corriente_ars ?? 0) - (a.valor_corriente_ars ?? 0))
    .slice(0, 5)

  const maxPct = top.length
    ? Math.max(...top.map(p => p.pct_cartera ?? (totalARS > 0 ? (p.valor_corriente_ars ?? 0) / totalARS * 100 : 0)))
    : 0

  const goFundamental = (ticker) => navigate('/', { state: { tab: 'fundamental', ticker } })

  return (
    <div className="screen">
      <ScreenHeader title="Mayores posiciones" />
      <div className="appbar-sub" style={{ marginTop: -6, marginBottom: 16 }}>
        Top 5 · % de cartera · valor en MEP
      </div>

      {top.length === 0 ? (
        <div className="state">
          <i className="ti ti-chart-pie-off" aria-hidden="true" />
          <div className="state-title">Sin posiciones</div>
          <div className="state-desc">Sincronizá con PPI para ver tus mayores posiciones.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {top.map((p, i) => {
            const pct = p.pct_cartera ?? (totalARS > 0 ? (p.valor_corriente_ars ?? 0) / totalARS * 100 : 0)
            const valUSD = mep > 0 ? usdAtRate(p.valor_corriente_ars ?? 0, mep) : '—'
            const dia = p.rend_dia_pct
            const diaPos = dia == null || dia >= 0
            return (
              <button key={p.ticker} className="list-row" onClick={() => goFundamental(p.ticker)}>
                <div className="ranknum">{i + 1}</div>
                <div className="list-row-main">
                  <div className="tr-ticker" style={{ fontSize: 15 }}>{p.ticker}</div>
                  <div className="list-row-sub">
                    {CAT_LABEL[p._cat]}{p.descripcion ? ` · ${p.descripcion}` : ''}
                  </div>
                  <div className="weightbar"><span style={{ width: `${maxPct > 0 ? (pct / maxPct) * 100 : 0}%` }} /></div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="tg-val" style={{ fontSize: 15, color: '#fff' }}>{pct.toFixed(1).replace('.', ',')}%</div>
                  <div className="list-row-sub"><PrivacyMask>{valUSD}</PrivacyMask></div>
                  {dia != null && (
                    <div className={`list-row-sub ${diaPos ? '' : ''}`} style={{ color: diaPos ? 'var(--buy)' : 'var(--red)' }}>
                      {formatPctShort(dia)}
                    </div>
                  )}
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
