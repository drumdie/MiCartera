import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../store/AppContext'
import { usdAtRate } from '../../utils/formatters'
import { _GRUPO_TEMATICO, _GRUPO_ORDEN } from '../../hooks/usePortfolio'
import ScreenHeader from '../../components/layout/ScreenHeader'
import PrivacyMask from '../../components/ui/PrivacyMask'

export default function PosicionesDetail() {
  const navigate = useNavigate()
  const { portfolio, fundamental, cotizaciones, resumen } = useApp()

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

  // Renta variable (acciones AR + CEDEARs) agrupada por Tipo (igual que el tab Fundamental),
  // y debajo la renta fija + FCI por categoría (Bonos, ONs, FCI).
  const grupos = useMemo(() => {
    const mk = (key, label, posiciones, esRV) => {
      const ps = posiciones.filter(p => p.ticker)
        .sort((a, b) => (b.valor_corriente_ars ?? 0) - (a.valor_corriente_ars ?? 0))
      const valor = ps.reduce((s, p) => s + (p.valor_corriente_ars ?? 0), 0)
      return { key, label, posiciones: ps, valor, esRV, pct: totalCartera > 0 ? (valor / totalCartera) * 100 : 0 }
    }

    const rvByGrupo = {}
    for (const cat of ['acciones_ar', 'cedears']) {
      for (const p of portfolio?.[cat]?.posiciones ?? []) {
        if (!p.ticker) continue
        const key = _GRUPO_TEMATICO[p.ticker] || tickerSector[p.ticker] || (cat === 'cedears' ? 'CEDEARs' : 'Acciones AR')
        ;(rvByGrupo[key] ??= []).push(p)
      }
    }
    const ordenGrupo = (g) => { const i = _GRUPO_ORDEN.indexOf(g); return i === -1 ? _GRUPO_ORDEN.length : i }
    const rv = Object.entries(rvByGrupo)
      .map(([label, ps]) => mk(`rv-${label}`, label, ps, true))
      .sort((a, b) => ordenGrupo(a.label) - ordenGrupo(b.label) || b.valor - a.valor)

    const rf = [['bonos', 'Bonos'], ['ons', 'ONs'], ['fci', 'FCI']]
      .map(([key, label]) => mk(key, label, portfolio?.[key]?.posiciones ?? [], false))
      .filter(g => g.posiciones.length > 0)

    return [...rv, ...rf]
  }, [portfolio, tickerSector, totalCartera])

  const goFundamental = (ticker) => navigate('/', { state: { tab: 'fundamental', ticker } })
  const sinFund = Object.keys(tickerSector).length === 0

  return (
    <div className="screen">
      <ScreenHeader title="Posiciones por tipo" />

      {sinFund && (
        <div className="badge badge-amber" style={{ display: 'flex', width: '100%', justifyContent: 'center', marginBottom: 12 }}>
          <i className="ti ti-info-circle" aria-hidden="true" />
          Actualizá fundamentales para clasificar la renta variable por tipo
        </div>
      )}

      {grupos.length === 0 ? (
        <div className="state">
          <i className="ti ti-chart-pie-off" aria-hidden="true" />
          <div className="state-title">Sin posiciones</div>
          <div className="state-desc">No hay posiciones para mostrar.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grupos.map(g => (
            <div key={g.key} className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--font-head)', fontSize: 13, fontWeight: 700, color: '#fff' }}>{g.label}</span>
                <span style={{ textAlign: 'right' }}>
                  <span className="mo" style={{ fontFamily: 'var(--font-num)', fontSize: 14, color: 'var(--accent)' }}>{g.pct.toFixed(1).replace('.', ',')}%</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}><PrivacyMask>{mep > 0 ? usdAtRate(g.valor, mep) : '—'}</PrivacyMask></span>
                </span>
              </div>
              <div className="weightbar" style={{ marginBottom: 10 }}><span style={{ width: `${Math.min(100, g.pct * 2)}%` }} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.posiciones.map(p => {
                  const inner = (
                    <>
                      <span className="tr-ticker" style={{ fontSize: 13, flexShrink: 0 }}>{p.ticker}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion}</span>
                      <span style={{ fontSize: 12, color: 'var(--text)', flexShrink: 0 }}>{(p.pct_cartera ?? 0).toFixed(1).replace('.', ',')}%</span>
                      {g.esRV && <i className="ti ti-chevron-right" style={{ color: '#3a4655', fontSize: 14, flexShrink: 0 }} aria-hidden="true" />}
                    </>
                  )
                  const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 10px', textAlign: 'left' }
                  return g.esRV ? (
                    <button key={p.ticker} onClick={() => goFundamental(p.ticker)} style={{ ...rowStyle, cursor: 'pointer' }}>{inner}</button>
                  ) : (
                    <div key={p.ticker} style={rowStyle}>{inner}</div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
