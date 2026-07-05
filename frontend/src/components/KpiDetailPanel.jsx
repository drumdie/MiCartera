// Panel de detalle inline para las KPI cards del dashboard WEB.
// Reemplaza toda la zona de KPIs por el detalle de la card seleccionada,
// con un control "← Volver" para regresar a la grilla. Web-native (no router).
//
// La derivación de datos replica las pantallas mobile de pages/detail/*,
// pero el render es propio (sin ScreenHeader ni navigate).
import { useApp } from '../store/AppContext'
import { usePrivacy } from '../hooks/usePrivacy'
import {
  formatARS, formatUSD, formatPctShort, usdAtRate,
} from '../utils/formatters'
import { _GRUPO_TEMATICO, _GRUPO_ORDEN } from '../hooks/usePortfolio'
import PrivacyMask from './ui/PrivacyMask'
import HistoryChart from './charts/HistoryChart'

const SERIE_RP_WEB = [{ id: 'riesgo_pais', label: 'Riesgo país', color: '#00e5a0' }]
const SERIES_DOLAR_WEB = [
  { id: 'mep',     label: 'MEP',     color: '#00e5a0' },
  { id: 'ccl',     label: 'CCL',     color: '#4a9eff' },
  { id: 'oficial', label: 'Oficial', color: '#f7b731' },
]

const CAT_LABEL = {
  acciones_ar: 'Acción AR', cedears: 'CEDEAR', bonos: 'Bono', ons: 'ON', fci: 'FCI',
}

const PANEL_TITLE = {
  liquidez:       'Liquidez disponible',
  posiciones:     'Posiciones',
  mayor_posicion: 'Mayores posiciones',
  gp:             'Ganancia / pérdida (USD MEP)',
  riesgo_pais:    'Riesgo país',
  dolar:          'Tipos de cambio',
}

// ── Helpers de derivación (reutilizan la lógica de los detalles mobile) ──────
function todasLasPosiciones(portfolio) {
  const out = []
  for (const key of ['acciones_ar', 'cedears', 'bonos', 'ons', 'fci']) {
    for (const p of portfolio?.[key]?.posiciones ?? []) {
      if (p.ticker) out.push({ ...p, _cat: key })
    }
  }
  return out
}

// ── Sub-paneles ──────────────────────────────────────────────────────────────

function MayorPosicionRows() {
  const { portfolio, cotizaciones, resumen } = useApp()
  const mep = cotizaciones?.dolar_mep ?? 0
  const totalARS = resumen?.valor_total_ars ?? 0

  const top = todasLasPosiciones(portfolio)
    .sort((a, b) => (b.valor_corriente_ars ?? 0) - (a.valor_corriente_ars ?? 0))
    .slice(0, 5)

  const pctOf = (p) => p.pct_cartera ?? (totalARS > 0 ? (p.valor_corriente_ars ?? 0) / totalARS * 100 : 0)
  const maxPct = top.length ? Math.max(...top.map(pctOf)) : 0

  if (top.length === 0) {
    return <div className="kpidp-empty">Sin posiciones. Sincronizá con tu broker para ver tus mayores posiciones.</div>
  }

  return (
    <>
      <div className="kpidp-sub">Top 5 · % de cartera · valor en MEP</div>
      <div className="kpidp-list">
        {top.map((p, i) => {
          const pct = pctOf(p)
          const valUSD = mep > 0 ? usdAtRate(p.valor_corriente_ars ?? 0, mep) : '—'
          const dia = p.rend_dia_pct
          const diaPos = dia == null || dia >= 0
          return (
            <div key={p.ticker} className="kpidp-row">
              <div className="kpidp-rank">{i + 1}</div>
              <div className="kpidp-row-main">
                <div className="kpidp-ticker">{p.ticker}</div>
                <div className="kpidp-row-sub">
                  {CAT_LABEL[p._cat]}{p.descripcion ? ` · ${p.descripcion}` : ''}
                </div>
                <div className="kpidp-bar"><span style={{ width: `${maxPct > 0 ? (pct / maxPct) * 100 : 0}%` }} /></div>
              </div>
              <div className="kpidp-row-right">
                <div className="kpidp-val">{pct.toFixed(1).replace('.', ',')}%</div>
                <div className="kpidp-row-sub"><PrivacyMask>{valUSD}</PrivacyMask></div>
                {dia != null && (
                  <div className="kpidp-row-sub" style={{ color: diaPos ? 'var(--buy)' : 'var(--red)' }}>
                    {formatPctShort(dia)}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function GpRows() {
  const { portfolio, resumen } = useApp()
  // G/P TOTAL por posición = precio (ganancia_usd_mep) + renta cobrada (renta_cobrada_usd)
  const gpUsd = (p) => (p.ganancia_usd_mep ?? 0) + (p.renta_cobrada_usd ?? 0)

  const posiciones = []
  for (const key of ['acciones_ar', 'cedears', 'bonos', 'ons', 'fci']) {
    for (const p of portfolio?.[key]?.posiciones ?? []) {
      if (p.ticker && p.ganancia_usd_mep != null) posiciones.push({ ...p, _cat: key })
    }
  }
  posiciones.sort((a, b) => gpUsd(b) - gpUsd(a))

  const gpTotal = resumen?.ganancia_total_usd ?? null
  const gpPos = (gpTotal ?? 0) >= 0

  return (
    <>
      <div className="kpidp-total">
        <div className="kpidp-total-label">G/P total acumulada (USD MEP)</div>
        <div className="kpidp-total-val" style={{ color: gpPos ? 'var(--buy)' : 'var(--red)' }}>
          <PrivacyMask>{gpTotal != null ? `${gpPos ? '+' : ''}${formatUSD(gpTotal)}` : 'N/D'}</PrivacyMask>
        </div>
      </div>

      {posiciones.length === 0 ? (
        <div className="kpidp-empty">Sin datos de costo. La ganancia por posición aparece cuando hay precio de compra sincronizado.</div>
      ) : (
        <div className="kpidp-list">
          {posiciones.map((p) => {
            const g = gpUsd(p)
            const pos = g >= 0
            const rend = p.rend_total_usd_pct ?? p.rend_usd_pct
            return (
              <div key={p.ticker} className="kpidp-row">
                <div className="kpidp-row-ic" style={{ color: pos ? 'var(--buy)' : 'var(--red)' }}>
                  {pos ? '▲' : '▼'}
                </div>
                <div className="kpidp-row-main">
                  <div className="kpidp-ticker">{p.ticker}</div>
                  <div className="kpidp-row-sub">{CAT_LABEL[p._cat]}{p.descripcion ? ` · ${p.descripcion}` : ''}</div>
                </div>
                <div className="kpidp-row-right">
                  <div className="kpidp-val" style={{ color: pos ? 'var(--buy)' : 'var(--red)' }}>
                    <PrivacyMask>{pos ? '+' : ''}{formatUSD(g)}</PrivacyMask>
                  </div>
                  {rend != null && (
                    <div className="kpidp-row-sub" style={{ color: pos ? 'var(--buy)' : 'var(--red)' }}>
                      {formatPctShort(rend)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function PosicionesRows() {
  const { portfolio, fundamental, cotizaciones, resumen } = useApp()
  const mep = cotizaciones?.dolar_mep ?? 0
  const totalCartera = resumen?.valor_total_ars ?? 0

  // ticker → sector (de los docs fundamentales) para agrupar la renta variable por Tipo.
  const tickerSector = {}
  for (const g of fundamental ?? []) for (const p of g.posiciones ?? []) {
    if (p.ticker && p.sector) tickerSector[p.ticker] = p.sector
  }

  // Renta variable (acciones AR + CEDEARs) agrupada por Tipo, igual que el tab Fundamental.
  const rvByGrupo = {}
  for (const cat of ['acciones_ar', 'cedears']) {
    for (const p of portfolio?.[cat]?.posiciones ?? []) {
      if (!p.ticker) continue
      const key = _GRUPO_TEMATICO[p.ticker] || tickerSector[p.ticker] || (cat === 'cedears' ? 'CEDEARs' : 'Acciones AR')
      ;(rvByGrupo[key] ??= []).push(p)
    }
  }
  const ordenGrupo = (g) => { const i = _GRUPO_ORDEN.indexOf(g); return i === -1 ? _GRUPO_ORDEN.length : i }
  const mkGrupo = (key, label, posiciones) => {
    const ps = posiciones.filter(p => p.ticker).sort((a, b) => (b.valor_corriente_ars ?? 0) - (a.valor_corriente_ars ?? 0))
    const valor = ps.reduce((s, p) => s + (p.valor_corriente_ars ?? 0), 0)
    return { key, label, posiciones: ps, valor, pct: totalCartera > 0 ? (valor / totalCartera) * 100 : 0 }
  }
  const rvGrupos = Object.entries(rvByGrupo)
    .map(([label, posiciones]) => mkGrupo(`rv-${label}`, label, posiciones))
    .sort((a, b) => ordenGrupo(a.label) - ordenGrupo(b.label) || b.valor - a.valor)

  // Renta fija + FCI por categoría, debajo.
  const rfGrupos = [
    { key: 'bonos', label: 'Bonos' },
    { key: 'ons',   label: 'ONs' },
    { key: 'fci',   label: 'FCI' },
  ]
    .map(({ key, label }) => mkGrupo(key, label, portfolio?.[key]?.posiciones ?? []))
    .filter(g => g.posiciones.length > 0)

  const grupos = [...rvGrupos, ...rfGrupos]
  const totalTickers = grupos.reduce((s, g) => s + g.posiciones.length, 0)

  if (grupos.length === 0) {
    return <div className="kpidp-empty">Sin posiciones para mostrar.</div>
  }

  return (
    <>
      <div className="kpidp-sub">Renta variable por tipo · luego renta fija · {totalTickers} posiciones</div>
      <div className="kpidp-list">
        {grupos.map(g => (
          <div key={g.key} className="kpidp-group">
            <div className="kpidp-group-head">
              <span className="kpidp-group-name">{g.label}</span>
              <span className="kpidp-group-meta">
                <span className="kpidp-group-pct">{g.pct.toFixed(1).replace('.', ',')}%</span>
                <span className="kpidp-group-usd"><PrivacyMask>{mep > 0 ? usdAtRate(g.valor, mep) : '—'}</PrivacyMask></span>
              </span>
            </div>
            <div className="kpidp-bar"><span style={{ width: `${Math.min(100, g.pct * 2)}%` }} /></div>
            <div className="kpidp-chips">
              {g.posiciones.map(p => (
                <div key={p.ticker} className="kpidp-chip">
                  <span className="kpidp-ticker" style={{ fontSize: 12 }}>{p.ticker}</span>
                  <span className="kpidp-chip-desc">{p.descripcion}</span>
                  <span className="kpidp-chip-pct">{(p.pct_cartera ?? 0).toFixed(1).replace('.', ',')}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function RiesgoPaisRows() {
  const { cotizaciones } = useApp()
  const { riesgo_pais_pb, riesgo_pais_min, riesgo_pais_min_desde } = cotizaciones
  const enMinimo = riesgo_pais_min != null && riesgo_pais_pb != null && riesgo_pais_pb <= riesgo_pais_min

  if (riesgo_pais_pb == null) {
    return <div className="kpidp-empty">Sin dato de riesgo país. El spread aparece cuando hay cotizaciones frescas sincronizadas.</div>
  }

  return (
    <>
      <div className="kpidp-rate-block">
        <div className="kpidp-rate-cap">Riesgo país (EMBI+)</div>
        <div className="kpidp-rate-row">
          <div className="kpidp-rate-label">Spread actual</div>
          <div className="kpidp-rate-val" style={enMinimo ? { color: 'var(--accent2, var(--buy))' } : undefined}>
            {riesgo_pais_pb.toLocaleString('es-AR')} pb
          </div>
        </div>
        {riesgo_pais_min != null && (
          <div className="kpidp-rate-row">
            <div className="kpidp-rate-label">
              Mínimo histórico
              {riesgo_pais_min_desde && <div className="kpidp-rate-sub">desde {riesgo_pais_min_desde}</div>}
            </div>
            <div className="kpidp-rate-val">{riesgo_pais_min.toLocaleString('es-AR')} pb</div>
          </div>
        )}
      </div>
      <HistoryChart titulo="Riesgo país · histórico" unidad="pb" series={SERIE_RP_WEB} defaultRango="1a" />
      <div className="kpidp-note">
        El riesgo país mide el spread de los bonos soberanos sobre los Treasuries de EE.UU.
        {enMinimo ? ' Está en su mínimo del período registrado.' : ''}
      </div>
    </>
  )
}

function LiquidezRows() {
  const { portfolio } = useApp()
  const liq = portfolio?.liquidez ?? {}
  const detalle = liq.detalle ?? []
  const pct = liq.pct_cartera ?? 0
  const usd = liq.usd_total_aprox ?? 0
  const ars = liq.subtotal_ars ?? 0

  return (
    <>
      <div className="kpidp-total">
        <div className="kpidp-total-label">Liquidez disponible · {pct.toFixed(1).replace('.', ',')}% de la cartera</div>
        <div className="kpidp-total-val" style={{ color: 'var(--warn)' }}>
          <PrivacyMask>≈ USD {usd.toLocaleString('es-AR')}</PrivacyMask>
        </div>
        <div className="kpidp-total-sub"><PrivacyMask>{formatARS(ars)}</PrivacyMask></div>
      </div>

      {detalle.length === 0 ? (
        <div className="kpidp-empty">Sin efectivo registrado en la cartera.</div>
      ) : (
        <div className="kpidp-rate-block">
          <div className="kpidp-rate-cap">Efectivo por especie</div>
          {detalle.map((d, i) => (
            <div key={i} className="kpidp-rate-row">
              <div className="kpidp-rate-label">
                {d.especie}
                {d.cantidad != null && <div className="kpidp-rate-sub">{Number(d.cantidad).toLocaleString('es-AR')} u.</div>}
              </div>
              <div className="kpidp-rate-val">
                <PrivacyMask>{formatARS(d.valor_ars)}</PrivacyMask>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="kpidp-note">
        Reservar para compra escalonada en posiciones con pérdida real USD y correcciones post-earnings.
      </div>
    </>
  )
}

function DolarRows() {
  const { cotizaciones } = useApp()
  const { dolar_mep, dolar_ccl, dolar_oficial } = cotizaciones

  return (
    <>
      <div className="kpidp-rate-block">
        <div className="kpidp-rate-cap">Dólar financiero</div>
        <div className="kpidp-rate-row">
          <div className="kpidp-rate-label">MEP (AL30)</div>
          <div className="kpidp-rate-val" style={{ color: 'var(--accent2, var(--buy))' }}>{formatARS(dolar_mep)}</div>
        </div>
        <div className="kpidp-rate-row">
          <div className="kpidp-rate-label">
            CCL (Cable)
            {dolar_mep > 0 && dolar_ccl > 0 && <div className="kpidp-rate-sub">brecha MEP: {((dolar_ccl / dolar_mep - 1) * 100).toFixed(1)}%</div>}
          </div>
          <div className="kpidp-rate-val">{formatARS(dolar_ccl)}</div>
        </div>
        <div className="kpidp-rate-row">
          <div className="kpidp-rate-label">
            Oficial (BNA)
            {dolar_mep > 0 && dolar_oficial > 0 && <div className="kpidp-rate-sub">brecha vs MEP: {((dolar_mep / dolar_oficial - 1) * 100).toFixed(1)}%</div>}
          </div>
          <div className="kpidp-rate-val">{formatARS(dolar_oficial)}</div>
        </div>
      </div>
      <HistoryChart titulo="Dólar · histórico" unidad="ARS" series={SERIES_DOLAR_WEB} defaultRango="3m" />
    </>
  )
}

const PANELS = {
  liquidez:       LiquidezRows,
  posiciones:     PosicionesRows,
  mayor_posicion: MayorPosicionRows,
  gp:             GpRows,
  riesgo_pais:    RiesgoPaisRows,
  dolar:          DolarRows,
}

export default function KpiDetailPanel({ kpiId, onBack }) {
  const Body = PANELS[kpiId]
  if (!Body) return null

  return (
    <div className="kpi-detail-panel fade-in">
      <div className="kpidp-head">
        <button type="button" className="kpidp-back" onClick={onBack}>
          ← Volver
        </button>
        <div className="kpidp-title">{PANEL_TITLE[kpiId]}</div>
      </div>
      <div className="kpidp-body">
        <Body />
      </div>
    </div>
  )
}
