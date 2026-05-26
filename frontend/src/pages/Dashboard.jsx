import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../store/AppContext'
import { usePrivacy } from '../hooks/usePrivacy'
import { formatARS, formatUSD } from '../utils/formatters'
import { TICKERS_TV } from '../data/mockPortfolio'
import { apiPost } from '../services/apiClient'
import { addCatalyst, deleteCatalyst } from '../services/portfolioService'

import Header          from '../components/layout/Header'
import CurrencyToggle  from '../components/layout/CurrencyToggle'
import DemoBanner      from '../components/ui/DemoBanner'
import KPICard         from '../components/ui/KPICard'
import Modal           from '../components/ui/Modal'
import Toast           from '../components/ui/Toast'
import PrivacyMask     from '../components/ui/PrivacyMask'
import StressCard      from '../components/ui/StressCard'
import DonutChart      from '../components/charts/DonutChart'
import TradingViewWidget from '../components/charts/TradingViewWidget'
import CategorySection from '../components/portfolio/CategorySection'
import LiquidezBlock   from '../components/portfolio/LiquidezBlock'
import FundCard        from '../components/fundamental/FundCard'
import CatalystItem    from '../components/catalysts/CatalystItem'
import CopyContextBtn  from '../components/claude-tools/CopyContextBtn'
import PasteResultArea from '../components/claude-tools/PasteResultArea'

const TABS = [
  { id: 'posiciones',    label: 'Posiciones'   },
  { id: 'fundamental',   label: 'Fundamental'  },
  { id: 'catalizadores', label: 'Catalizadores'},
  { id: 'graficos',      label: 'Gráficos'     },
]

const CAT_META = {
  acciones_ar: { name: 'Acciones AR', color: '#00e5a0' },
  cedears:     { name: 'CEDEARs',     color: '#4a9eff' },
  liquidez:    { name: 'Liquidez',    color: '#f7b731' },
  ons:         { name: 'ONs',         color: '#c084fc' },
  fci:         { name: 'FCI',         color: '#fb923c' },
  bonos:       { name: 'Bonos',       color: '#f472b6' },
}

export default function Dashboard() {
  const { activeCurrency, distMode, setDistMode,
          cotizaciones, resumen, portfolio,
          catalizadores, stressTest, fundamental,
          lastSync, rend30d,
          refreshFundamentals, isDemo } = useApp()
  const { privacyOn, toggle: togglePrivacy } = usePrivacy()

  const [activeTab,        setActiveTab]        = useState('posiciones')
  const [selectedTicker,   setSelectedTicker]   = useState(null)
  const [modalOpen,        setModalOpen]        = useState(false)
  const [toastMsg,         setToastMsg]         = useState('')
  const [fundRefreshing,   setFundRefreshing]   = useState(false)
  const [showCatForm,      setShowCatForm]      = useState(false)
  const [catForm,          setCatForm]          = useState({
    fecha: '', evento: '', descripcion: '', tickers: '', urgencia: 'cercano', tipo: 'earnings',
  })

  const showToast = (msg) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2500)
  }

  const handleRefreshFundamentals = async () => {
    setFundRefreshing(true)
    try {
      const result = await refreshFundamentals()
      showToast(`✓ Fundamentales actualizados (${result?.tickers_actualizados ?? 0} tickers)`)
    } catch {
      showToast('Error al actualizar fundamentales')
    } finally {
      setFundRefreshing(false)
    }
  }

  // Guarda el análisis Claude (JSON pegado) en Firestore ticker por ticker
  const handleFundAnalysisLoad = async (jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr)
      const analisis = parsed.analisis ?? (Array.isArray(parsed) ? parsed : [parsed])
      let ok = 0
      for (const item of analisis) {
        const { ticker, ...rest } = item
        if (!ticker) continue
        await apiPost(`/api/fundamentals/${ticker}/analysis`, rest)
        ok++
      }
      showToast(`✓ Análisis cargado (${ok} tickers)`)
    } catch (err) {
      showToast(`Error al cargar análisis: ${err.message}`)
    }
  }

  // Mostrar toast cuando se completa una sincronización con PPI
  useEffect(() => {
    if (lastSync) showToast('✓ Cartera sincronizada con PPI')
  }, [lastSync])

  const handleAddCatalyst = async (e) => {
    e.preventDefault()
    if (!catForm.fecha || !catForm.evento) return
    const catalyst = {
      fecha:             catForm.fecha,
      evento:            catForm.evento.trim(),
      descripcion:       catForm.descripcion.trim() || null,
      tickers_afectados: catForm.tickers.split(',').map(t => t.trim()).filter(Boolean),
      urgencia:          catForm.urgencia,
      tipo:              catForm.tipo,
    }
    try {
      await addCatalyst(user.uid, catalyst)
      setCatForm({ fecha: '', evento: '', descripcion: '', tickers: '', urgencia: 'cercano', tipo: 'earnings' })
      setShowCatForm(false)
      showToast('✓ Evento agregado')
    } catch {
      showToast('Error al guardar el evento')
    }
  }

  const handleDeleteCatalyst = async (catalyst) => {
    try {
      await deleteCatalyst(user.uid, catalyst)
      showToast('Evento eliminado')
    } catch {
      showToast('Error al eliminar el evento')
    }
  }

  const switchTab = (id) => {
    setActiveTab(id)
    window.scrollTo(0, 0)
  }

  // ── Distribución para DonutChart (desde datos reales del resumen) ────────
  const distInstrumento = Object.entries(resumen?.composicion_pct ?? {})
    .filter(([, pct]) => pct > 0.1)
    .map(([cat, pct]) => ({
      name:  CAT_META[cat]?.name  ?? cat,
      color: CAT_META[cat]?.color ?? '#888',
      pct:   parseFloat(pct.toFixed(1)),
    }))

  // Aproximación moneda: CEDEARs + ONs → dolarizados; resto → ARS
  const pctUSD = (resumen?.composicion_pct?.cedears ?? 0) + (resumen?.composicion_pct?.ons ?? 0)
  const pctARS = Math.max(0, parseFloat((100 - pctUSD).toFixed(1)))
  const distMoneda = [
    { name: 'Pesos ARS',      pct: pctARS,                         color: '#4a9eff' },
    { name: 'Dólares (aprox)', pct: parseFloat(pctUSD.toFixed(1)), color: '#00e5a0' },
  ]

  // ── Total valorizado según moneda activa ──────────────────────────────────
  const totalARS  = resumen?.valor_total_ars ?? 0
  const totalDisp = (() => {
    switch (activeCurrency) {
      case 'ARS': return formatARS(totalARS)
      case 'MEP': return formatUSD(totalARS / cotizaciones.dolar_mep)
      case 'CCL': return formatUSD(totalARS / cotizaciones.dolar_ccl)
      case 'BNA': return formatARS(totalARS)
      default:    return formatARS(totalARS)
    }
  })()
  const totalSub = (() => {
    switch (activeCurrency) {
      case 'MEP': return `Cotización Dólar MEP: ${formatARS(cotizaciones.dolar_mep)}`
      case 'CCL': return `Cotización Dólar CCL: ${formatARS(cotizaciones.dolar_ccl)}`
      case 'BNA': return 'Ref. tipo de cambio BNA'
      default: return ''
    }
  })()
  // ── Rendimiento 30d desde historial de snapshots ─────────────────────────
  const rend30dPct = rend30d?.pct ?? null
  const rend30dPos = (rend30dPct ?? 0) >= 0
  const rend30dLabel = rend30d
    ? (rend30d.days >= 30 ? 'Rend. 30d' : `Rend. ${rend30d.days}d`)
    : 'Rend. 30d'

  // Ganancia absoluta del período en moneda activa
  const rend30dDisp = rend30d ? (() => {
    const abs = rend30d.absARS
    switch (activeCurrency) {
      case 'MEP': return formatUSD(abs / cotizaciones.dolar_mep)
      case 'CCL': return formatUSD(abs / cotizaciones.dolar_ccl)
      default:    return formatARS(abs)
    }
  })() : null

  // ── Tickers para Tab Gráficos ─────────────────────────────────────────────
  // Demo → usa mock estático. Usuario real → construye desde portfolio + fundamentales.
  // tv_symbol viene de Firestore fundamentals (si el usuario hizo refresh).
  // Fallback: acciones_ar → BCBA:{ticker}, cedears → subyacente_usd directo.
  const tickersTV = useMemo(() => {
    if (isDemo) return TICKERS_TV

    // Primero: tickers con tv_symbol en fundamentals (más preciso, incluye prefijo de exchange)
    const fromFund = {}
    for (const sector of fundamental) {
      for (const pos of sector.posiciones ?? []) {
        if (pos.ticker && pos.tv_symbol) {
          fromFund[pos.ticker] = pos.tv_symbol
        }
      }
    }

    // Segundo: derivar del portfolio para los que no están en fundamentals
    const result = { ...fromFund }

    for (const pos of portfolio?.acciones_ar?.posiciones ?? []) {
      if (pos.ticker && !result[pos.ticker]) {
        result[pos.ticker] = `BCBA:${pos.ticker}`
      }
    }
    for (const pos of portfolio?.cedears?.posiciones ?? []) {
      if (pos.ticker && !result[pos.ticker]) {
        // Subyacente sin prefijo → TradingView resuelve los tickers US conocidos
        const sym = pos.subyacente_usd || pos.subyacente || pos.ticker
        result[pos.ticker] = sym
      }
    }
    // Bonos/ONs no tienen chart de equity — se omiten

    return Object.keys(result).length > 0 ? result : TICKERS_TV
  }, [isDemo, portfolio, fundamental])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const liqPct = portfolio?.liquidez?.pct_cartera    ?? 0
  const liqUSD = portfolio?.liquidez?.usd_total_aprox ?? 0
  const liqARS = portfolio?.liquidez?.subtotal_ars    ?? 0
  const totalTickers =
    (portfolio?.acciones_ar?.posiciones?.length ?? 0) +
    (portfolio?.cedears?.posiciones?.length     ?? 0) +
    (portfolio?.bonos?.posiciones?.length       ?? 0) +
    (portfolio?.ons?.posiciones?.length         ?? 0) +
    (portfolio?.fci?.posiciones?.length         ?? 0)

  return (
    <div className="app">
      <Header onSyncDone={showToast} />
      <DemoBanner />

      {/* ── HERO ── */}
      <div className="hero-block fade-in d1">

        {/* Total valorizado */}
        <div className="total-card">
          <div className="total-top">
            <div className="total-top-left">
              <span className="total-label">Total valorizado</span>
              <button className="eye-btn" onClick={togglePrivacy} title={privacyOn ? 'Mostrar montos' : 'Ocultar montos'}>
                {privacyOn ? '🙈' : '👁'}
              </button>
            </div>
            <CurrencyToggle />
          </div>
          <div className="total-amount"><PrivacyMask>{totalDisp}</PrivacyMask></div>
          <div className="total-sub">{totalSub}</div>
          <div className="total-rend">
            <span className="rend-label">{rend30dLabel}</span>
            <span className={`rend-val${rend30dPct != null ? (rend30dPos ? '' : ' neg') : ''}`}>
              {rend30dPct != null
                ? <>{rend30dPos ? '▲' : '▼'} {rend30dPos ? '+' : ''}{rend30dPct.toFixed(2).replace('.', ',')}%</>
                : <span style={{ color: 'var(--text-muted, #888)', fontSize: '0.85em' }}>N/D · sincronizá más días</span>
              }
            </span>
          </div>
          {rend30dDisp != null && (
            <div style={{ fontSize: 11, color: rend30dPos ? 'var(--green, #00e5a0)' : 'var(--red, #e05c5c)', marginTop: 2, textAlign: 'right' }}>
              {rend30dPos ? '+' : ''}{rend30dDisp} en {rend30d.days} días
            </div>
          )}
        </div>

        {/* Distribución */}
        <div className="dist-card">
          <div className="dist-top">
            <span className="dist-label">Distribución</span>
            <div className="dist-toggle">
              <button className={`dist-btn ${distMode === 'instrumento' ? 'active' : ''}`} onClick={() => setDistMode('instrumento')}>Instrumento</button>
              <button className={`dist-btn ${distMode === 'moneda' ? 'active' : ''}`} onClick={() => setDistMode('moneda')}>Moneda</button>
            </div>
          </div>
          <DonutChart data={distMode === 'instrumento' ? distInstrumento : distMoneda} />
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="kpis-mini fade-in d2">
        <KPICard
          label="Liquidez"
          value={`${liqPct.toFixed(2).replace('.', ',')}%`}
          sub={<PrivacyMask>≈ USD {liqUSD.toLocaleString('es-AR')} · ARS {Math.round(liqARS / 1000)}K</PrivacyMask>}
          className="warn"
        />
        <KPICard
          label="Posiciones"
          value={String(totalTickers + portfolio.liquidez.detalle.length)}
          sub={`5 categorías · ${totalTickers} tickers`}
        />
      </div>

      {/* ── TABS ── */}
      <div className="tabs-bar fade-in d2">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: POSICIONES ── */}
      <div className={`tab-content ${activeTab === 'posiciones' ? 'active' : ''}`}>
        <CategorySection title="Acciones AR"  category={portfolio.acciones_ar} />
        <CategorySection title="CEDEARs"      category={portfolio.cedears}     isCedear />
        <CategorySection title="Bonos"        category={portfolio.bonos}       isBono />
        <CategorySection title="ONs"          category={portfolio.ons}         isON />
        <CategorySection title="FCI"          category={portfolio.fci}         isFCI />

        <div className="sec-title fade-in">Stress test</div>
        <div className="stress-row">
          {stressTest.map(s => <StressCard key={s.nombre} scenario={s} />)}
        </div>

        <LiquidezBlock liquidez={portfolio.liquidez} />

        <div className="sec-title fade-in">Herramientas Claude</div>
        <div className="action-btns fade-in">
          <CopyContextBtn tipo="tactico"     onToast={showToast} />
          <PasteResultArea id="paste-tac" label="Pegar resultado táctico" sub="Cargá el JSON de respuesta de Claude" onLoad={() => showToast('✓ Resultado cargado')} />
        </div>
      </div>

      {/* ── TAB: FUNDAMENTAL ── */}
      <div className={`tab-content ${activeTab === 'fundamental' ? 'active' : ''}`}>

        {/* Botón actualizar métricas yfinance */}
        <div className="action-btns fade-in" style={{ marginTop: 12 }}>
          <button
            className="action-btn"
            onClick={handleRefreshFundamentals}
            disabled={fundRefreshing}
          >
            <span className="ab-icon">{fundRefreshing ? '⏳' : '📊'}</span>
            <div className="ab-text">
              <div className="ab-title">{fundRefreshing ? 'Actualizando…' : 'Actualizar fundamentales'}</div>
              <div className="ab-sub">Fetcha P/E, EV/EBITDA, márgenes desde Yahoo Finance</div>
            </div>
            <span className="ab-arrow">→</span>
          </button>
        </div>

        {/* Cards por sector — solo si hay datos */}
        {fundamental.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted, #888)', padding: '40px 16px' }}>
            Sin datos fundamentales. Presioná "Actualizar fundamentales" para cargar métricas reales.
          </div>
        ) : (
          fundamental.map(sector => (
            <div key={sector.sector}>
              <div className="sec-title" style={{ marginTop: 16 }}>{sector.sector}</div>
              <div className="fund-grid">
                {sector.posiciones.map(pos => <FundCard key={pos.ticker} position={pos} />)}
              </div>
            </div>
          ))
        )}

        {/* Herramientas Claude */}
        <div className="sec-title" style={{ marginTop: 20 }}>Análisis Claude</div>
        <div className="action-btns">
          <CopyContextBtn tipo="fundamental" onToast={showToast} />
          <PasteResultArea
            id="paste-fund"
            label="Pegar análisis fundamental"
            sub="Pegá el JSON de Claude — guarda tesis, escenarios y acción táctica"
            onLoad={handleFundAnalysisLoad}
          />
        </div>
      </div>

      {/* ── TAB: CATALIZADORES ── */}
      <div className={`tab-content ${activeTab === 'catalizadores' ? 'active' : ''}`}>

        <div className="cat-header">
          <div className="sec-title" style={{ margin: 0 }}>Próximos eventos</div>
          {!isDemo && (
            <button className="cat-add-btn" onClick={() => setShowCatForm(v => !v)}>
              {showCatForm ? '✕ Cancelar' : '+ Agregar'}
            </button>
          )}
        </div>

        {/* Formulario inline para agregar catalizador */}
        {showCatForm && !isDemo && (
          <form className="cat-form" onSubmit={handleAddCatalyst}>
            <div className="cat-form-row">
              <input
                className="cat-input" type="date" required
                value={catForm.fecha}
                onChange={e => setCatForm(f => ({ ...f, fecha: e.target.value }))}
              />
              <select
                className="cat-input"
                value={catForm.urgencia}
                onChange={e => setCatForm(f => ({ ...f, urgencia: e.target.value }))}
              >
                <option value="urgente">Urgente</option>
                <option value="cercano">Próximo</option>
                <option value="estructural">Estructural</option>
                <option value="lejano">Largo plazo</option>
              </select>
              <select
                className="cat-input"
                value={catForm.tipo}
                onChange={e => setCatForm(f => ({ ...f, tipo: e.target.value }))}
              >
                <option value="earnings">Earnings</option>
                <option value="evento_macro">Macro</option>
                <option value="rti_tarifario">Regulatorio</option>
                <option value="vencimiento">Vencimiento</option>
                <option value="dividendo">Dividendo</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <input
              className="cat-input cat-input-full" type="text" required
              placeholder="Nombre del evento"
              value={catForm.evento}
              onChange={e => setCatForm(f => ({ ...f, evento: e.target.value }))}
            />
            <input
              className="cat-input cat-input-full" type="text"
              placeholder="Tickers afectados (separados por coma: ALUA, MELI)"
              value={catForm.tickers}
              onChange={e => setCatForm(f => ({ ...f, tickers: e.target.value }))}
            />
            <textarea
              className="cat-input cat-input-full cat-textarea"
              placeholder="Descripción (opcional)"
              rows={2}
              value={catForm.descripcion}
              onChange={e => setCatForm(f => ({ ...f, descripcion: e.target.value }))}
            />
            <button className="cat-submit-btn" type="submit">Guardar evento</button>
          </form>
        )}

        {/* Timeline */}
        {catalizadores.length === 0 ? (
          <div className="cat-empty">
            {isDemo
              ? 'Modo demo — los eventos reales aparecen al iniciar sesión'
              : 'No hay eventos cargados. Usá "+ Agregar" para registrar earnings, vencimientos, etc.'}
          </div>
        ) : (
          <div className="timeline">
            {[...catalizadores]
              .sort((a, b) => a.fecha.localeCompare(b.fecha))
              .map((cat, i) => (
                <CatalystItem
                  key={i}
                  catalyst={cat}
                  onDelete={!isDemo ? handleDeleteCatalyst : undefined}
                />
              ))
            }
          </div>
        )}
      </div>

      {/* ── TAB: GRÁFICOS ── */}
      <div className={`tab-content ${activeTab === 'graficos' ? 'active' : ''}`}>
        <div className="sec-title" style={{ marginTop: 8 }}>Seleccioná un ticker</div>
        <div className="chart-selector">
          {Object.keys(tickersTV).map(ticker => (
            <button
              key={ticker}
              className={`chart-ticker-btn ${selectedTicker === ticker ? 'active' : ''}`}
              onClick={() => setSelectedTicker(ticker)}
            >
              {ticker}
            </button>
          ))}
        </div>
        <div id="chart-content">
          <TradingViewWidget symbol={selectedTicker ? tickersTV[selectedTicker] : null} />
        </div>
      </div>

      <footer>
        {isDemo
          ? 'Demo · Datos de ejemplo — no reales · No constituye asesoramiento financiero'
          : 'MiCartera · Datos sincronizados desde PPI · No constituye asesoramiento financiero'}
      </footer>

      {/* ── MODAL ANÁLISIS PROFUNDO ── */}
      <Modal
        id="modal-profundo"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Análisis Fundamental — Demo"
        subtitle="Datos de ejemplo · Estructura para integración con API real"
      >
        <div className="ab-heading">Empresa A (TKRA) — Tesis estructural</div>
        <div className="ab-content">
          Posición dominante con descuento masivo vs pares regionales. EBITDA TTM USD 4,5B,
          EV/EBITDA 4,2x vs par comparable 6,5x. Catalizador regulatorio pendiente.
          Tesis bull: normalización a 5,5x EV/EBITDA implica precio objetivo ~$75–90.
        </div>
        <div className="ab-heading">Síntesis CEDEARs</div>
        <div className="ab-content">
          <table>
            <thead>
              <tr><th>Ticker</th><th>EV/EBITDA</th><th>Mg. EBITDA</th><th>Rend. USD</th><th>Acción</th></tr>
            </thead>
            <tbody>
              <tr><td>CEDR1</td><td className="td-warn">N/A</td><td className="td-pos">Alta vol.</td><td className="td-pos">+120%</td><td className="td-warn">Parcial</td></tr>
              <tr><td>CEDR2</td><td className="td-neg">42x</td><td className="td-pos">60%</td><td className="td-pos">+40%</td><td className="td-warn">Tomar</td></tr>
              <tr><td>CEDR3</td><td>—</td><td>—</td><td className="td-pos">+25%</td><td>Core · Mantener</td></tr>
            </tbody>
          </table>
        </div>
        <div className="ab-heading">Conclusión estratégica</div>
        <div className="ab-content">
          Cartera bien posicionada. Riesgo principal: concentración en 2 posiciones (31%).
          Recomendación: consolidar parcialmente las posiciones con mayor ganancia USD.
        </div>
      </Modal>

      <Toast message={toastMsg} />
    </div>
  )
}
