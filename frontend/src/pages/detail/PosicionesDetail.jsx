import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../store/AppContext'
import { usdAtRate } from '../../utils/formatters'
import ScreenHeader from '../../components/layout/ScreenHeader'
import PrivacyMask from '../../components/ui/PrivacyMask'

const VIEWS = [
  { id: 'acciones', label: 'Acciones', cats: ['acciones_ar'] },
  { id: 'cedears',  label: 'CEDEARs',  cats: ['cedears'] },
  { id: 'total',    label: 'Total',    cats: ['acciones_ar', 'cedears'] },
]

export default function PosicionesDetail() {
  const navigate = useNavigate()
  const { portfolio, fundamental, cotizaciones, resumen } = useApp()
  const [view, setView] = useState('total')

  const mep = cotizaciones?.dolar_mep ?? 0
  const totalCartera = resumen?.valor_total_ars ?? 0

  // ticker → sector (yfinance, desde los docs de fundamentals)
  const tickerSector = useMemo(() => {
    const map = {}
    for (const g of fundamental ?? []) for (const p of g.posiciones ?? []) {
      if (p.ticker && p.sector) map[p.ticker] = p.sector
    }
    return map
  }, [fundamental])

  const grupos = useMemo(() => {
    const cats = VIEWS.find(v => v.id === view)?.cats ?? []
    const bySector = {}
    for (const cat of cats) {
      for (const p of portfolio?.[cat]?.posiciones ?? []) {
        if (!p.ticker) continue
        const sector = tickerSector[p.ticker] || 'Sin sector'
        ;(bySector[sector] ??= []).push(p)
      }
    }
    return Object.entries(bySector)
      .map(([sector, posiciones]) => {
        const valor = posiciones.reduce((s, p) => s + (p.valor_corriente_ars ?? 0), 0)
        return {
          sector,
          posiciones: posiciones.sort((a, b) => (b.valor_corriente_ars ?? 0) - (a.valor_corriente_ars ?? 0)),
          valor,
          pct: totalCartera > 0 ? (valor / totalCartera) * 100 : 0,
        }
      })
      .sort((a, b) => b.valor - a.valor)
  }, [view, portfolio, tickerSector, totalCartera])

  const goFundamental = (ticker) => navigate('/', { state: { tab: 'fundamental', ticker } })
  const sinFund = Object.keys(tickerSector).length === 0

  return (
    <div className="screen">
      <ScreenHeader title="Posiciones por sector" />

      <div className="segmented" style={{ display: 'flex', width: '100%', marginBottom: 14 }}>
        {VIEWS.map(v => (
          <button key={v.id} className={view === v.id ? 'active' : ''} style={{ flex: 1 }} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {sinFund && (
        <div className="badge badge-amber" style={{ display: 'flex', width: '100%', justifyContent: 'center', marginBottom: 12 }}>
          <i className="ti ti-info-circle" aria-hidden="true" />
          Actualizá fundamentales para clasificar por sector
        </div>
      )}

      {grupos.length === 0 ? (
        <div className="state">
          <i className="ti ti-chart-pie-off" aria-hidden="true" />
          <div className="state-title">Sin posiciones</div>
          <div className="state-desc">No hay {view === 'cedears' ? 'CEDEARs' : view === 'acciones' ? 'acciones' : 'posiciones'} para mostrar.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grupos.map(g => (
            <div key={g.sector} className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--font-head)', fontSize: 13, fontWeight: 700, color: '#fff' }}>{g.sector}</span>
                <span style={{ textAlign: 'right' }}>
                  <span className="mo" style={{ fontFamily: 'var(--font-num)', fontSize: 14, color: 'var(--accent)' }}>{g.pct.toFixed(1).replace('.', ',')}%</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}><PrivacyMask>{mep > 0 ? usdAtRate(g.valor, mep) : '—'}</PrivacyMask></span>
                </span>
              </div>
              <div className="weightbar" style={{ marginBottom: 10 }}><span style={{ width: `${Math.min(100, g.pct * 2)}%` }} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.posiciones.map(p => (
                  <button key={p.ticker} onClick={() => goFundamental(p.ticker)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}>
                    <span className="tr-ticker" style={{ fontSize: 13, flexShrink: 0 }}>{p.ticker}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion}</span>
                    <span style={{ fontSize: 12, color: 'var(--text)', flexShrink: 0 }}>{(p.pct_cartera ?? 0).toFixed(1).replace('.', ',')}%</span>
                    <i className="ti ti-chevron-right" style={{ color: '#3a4655', fontSize: 14, flexShrink: 0 }} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
