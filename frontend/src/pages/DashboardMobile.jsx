import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { usePrivacy } from '../hooks/usePrivacy'
import { formatARS, usdAtRate } from '../utils/formatters'
import { TICKERS_TV } from '../data/mockPortfolio'
import { apiPost } from '../services/apiClient'
import { addCatalyst, deleteCatalyst, replaceCatalysts } from '../services/portfolioService'

import Header          from '../components/layout/HeaderMobile'
import BottomNav       from '../components/layout/BottomNav'
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

const CAT_META = {
  acciones_ar: { name: 'Acciones AR', color: '#00e5a0' },
  cedears:     { name: 'CEDEARs',     color: '#4a9eff' },
  liquidez:    { name: 'Liquidez',    color: '#f7b731' },
  ons:         { name: 'ONs',         color: '#c084fc' },
  fci:         { name: 'FCI',         color: '#fb923c' },
  bonos:       { name: 'Bonos',       color: '#f472b6' },
}

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeCurrency, distMode, setDistMode,
          cotizaciones, resumen, portfolio,
          catalizadores, stressTest, fundamental,
          lastSync, rend30d,
          refreshFundamentals, isDemo, user,
          syncPPI, syncing, syncDiag, readDiag } = useApp()
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

  // Deep-link desde un drill-down: { tab:'fundamental', ticker } → cambia de sección y
  // hace scroll a la card del ticker.
  useEffect(() => {
    const st = location.state
    if (st?.tab) {
      setActiveTab(st.tab)
      if (st.ticker) {
        setTimeout(() => {
          document.getElementById(`fund-${st.ticker}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 120)
      }
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSync = async () => {
    try {
      await syncPPI()
    } catch {
      showToast('No se pudo sincronizar con PPI')
    }
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

  // Mostrar toast cuando se completa una sincronización con PPI.
  // setLastSync se llama DESPUÉS de refreshPortfolio en AppContext, así que
  // totalTickers ya refleja el estado real cuando este effect dispara.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!lastSync) return
    const isEmpty = !isDemo && totalTickers === 0 && (portfolio?.liquidez?.detalle?.length ?? 0) === 0
    showToast(isEmpty ? 'PPI sincronizado · cartera vacía' : '✓ Cartera sincronizada con PPI')
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

  // Carga catalizadores desde JSON de Claude (reemplaza la lista completa)
  const handleCatalystLoad = async (jsonStr) => {
    try {
      const parsed   = JSON.parse(jsonStr)
      const catalysts = parsed.catalizadores ?? (Array.isArray(parsed) ? parsed : [parsed])
      await replaceCatalysts(user.uid, catalysts)
      showToast(`✓ ${catalysts.length} catalizadores cargados`)
    } catch (err) {
      showToast(`Error al cargar catalizadores: ${err.message}`)
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
      case 'MEP': return usdAtRate(totalARS, cotizaciones.dolar_mep)
      case 'CCL': return usdAtRate(totalARS, cotizaciones.dolar_ccl)
      case 'BNA': return usdAtRate(totalARS, cotizaciones.dolar_oficial)
      default:    return formatARS(totalARS)
    }
  })()
  const totalSub = (() => {
    switch (activeCurrency) {
      case 'MEP': return `Cotización Dólar MEP: ${formatARS(cotizaciones.dolar_mep)}`
      case 'CCL': return `Cotización Dólar CCL: ${formatARS(cotizaciones.dolar_ccl)}`
      case 'BNA': return `Cotización Dólar BNA: ${formatARS(cotizaciones.dolar_oficial)}`
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
      case 'MEP': return usdAtRate(abs, cotizaciones.dolar_mep)
      case 'CCL': return usdAtRate(abs, cotizaciones.dolar_ccl)
      case 'BNA': return usdAtRate(abs, cotizaciones.dolar_oficial)
      default:    return formatARS(abs)
    }
  })() : null

  // ── Tickers para Tab Gráficos ─────────────────────────────────────────────
  const tickersTV = useMemo(() => {
    if (isDemo) return TICKERS_TV

    const fromFund = {}
    for (const sector of fundamental) {
      for (const pos of sector.posiciones ?? []) {
        if (pos.ticker && pos.tv_symbol) fromFund[pos.ticker] = pos.tv_symbol
      }
    }
    const result = { ...fromFund }
    for (const pos of portfolio?.acciones_ar?.posiciones ?? []) {
      if (pos.ticker && !result[pos.ticker]) result[pos.ticker] = `BCBA:${pos.ticker}`
    }
    for (const pos of portfolio?.cedears?.posiciones ?? []) {
      if (pos.ticker && !result[pos.ticker]) {
        result[pos.ticker] = pos.subyacente_usd || pos.subyacente || pos.ticker
      }
    }
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
  const hasPositions = isDemo
    || totalTickers > 0
    || (portfolio?.liquidez?.detalle?.length ?? 0) > 0

  // ── Mayor posición (excluye liquidez) ──
  const todasLasPosiciones = [
    ...(portfolio?.acciones_ar?.posiciones ?? []),
    ...(portfolio?.cedears?.posiciones     ?? []),
    ...(portfolio?.bonos?.posiciones       ?? []),
    ...(portfolio?.ons?.posiciones         ?? []),
    ...(portfolio?.fci?.posiciones         ?? []),
  ]
  const mayorPos = todasLasPosiciones.reduce((max, p) => {
    const val = p.valor_corriente_ars ?? 0
    return val > (max?.valor_corriente_ars ?? 0) ? p : max
  }, null)
  const mayorPosTicker  = mayorPos?.ticker ?? '—'
  const mayorPosARS     = mayorPos?.valor_corriente_ars ?? 0
  const mayorPosUSD     = cotizaciones.dolar_mep > 0 ? Math.round(mayorPosARS / cotizaciones.dolar_mep) : 0
  const mayorPosPct     = mayorPos?.pct_cartera != null
    ? mayorPos.pct_cartera
    : (resumen?.valor_total_ars > 0 ? (mayorPosARS / resumen.valor_total_ars) * 100 : 0)

  // ── G/P total USD ──
  const gpUSD          = resumen?.ganancia_total_usd ?? null
  const gpUSDPos       = gpUSD != null && gpUSD >= 0
  const gpUSDSigNo     = gpUSD != null ? (gpUSDPos ? '+' : '') : ''
  const invertidoUSD   = resumen?.costo_total_usd_historico != null
    ? Math.round(resumen.costo_total_usd_historico)
    : (cotizaciones.dolar_mep > 0 && (resumen?.costo_total_ars ?? 0) > 0
        ? Math.round(resumen.costo_total_ars / cotizaciones.dolar_mep)
        : null)

  // ── Riesgo país ──
  const riesgoPaisPb       = cotizaciones?.riesgo_pais_pb       ?? null
  const riesgoPaisMinDesde = cotizaciones?.riesgo_pais_min_desde ?? null
  const riesgoPaisMin      = cotizaciones?.riesgo_pais_min       ?? null
  const riesgoPaisEsMin    = riesgoPaisPb != null && riesgoPaisMin != null && riesgoPaisPb <= riesgoPaisMin

  return (
    <div className="app app-m">
      <Header />
      <DemoBanner />

      <main className="screen-body" key={activeTab}>

        {/* ════════ SECCIÓN: POSICIONES (home con hero + KPIs) ════════ */}
        {activeTab === 'posiciones' && (
          <div className="section-fade">
            {/* ── HERO ── */}
            <div className="hero-block">
              <div className="total-card">
                <div className="total-top">
                  <div className="total-top-left">
                    <span className="total-label">Total valorizado</span>
                    <button className="eye-btn" onClick={togglePrivacy} title={privacyOn ? 'Mostrar montos' : 'Ocultar montos'} aria-label={privacyOn ? 'Mostrar montos' : 'Ocultar montos'}>
                      <i className={`ti ${privacyOn ? 'ti-eye-off' : 'ti-eye'}`} aria-hidden="true" />
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
                      : <span style={{ color: 'var(--muted)', fontSize: '0.85em' }}>N/D · sincronizá más días</span>}
                  </span>
                </div>
                {rend30dDisp != null && (
                  <div style={{ fontSize: 11, color: rend30dPos ? 'var(--green)' : 'var(--red)', marginTop: 2, textAlign: 'right' }}>
                    {rend30dPos ? '+' : ''}{rend30dDisp} en {rend30d.days} días
                  </div>
                )}
              </div>

              <div className="dist-card">
                <div className="dist-top">
                  <span className="dist-label">Distribución</span>
                  <div className="segmented">
                    <button className={distMode === 'instrumento' ? 'active' : ''} onClick={() => setDistMode('instrumento')}>Instrumento</button>
                    <button className={distMode === 'moneda' ? 'active' : ''} onClick={() => setDistMode('moneda')}>Moneda</button>
                  </div>
                </div>
                <DonutChart data={distMode === 'instrumento' ? distInstrumento : distMoneda} />
              </div>
            </div>

            {/* ── KPIs (Mayor posición y G/P son tappables → drill-down) ── */}
            <div className="kpis-mini">
              <KPICard
                label="Liquidez"
                value={`${liqPct.toFixed(2).replace('.', ',')}%`}
                sub={<PrivacyMask>≈ USD {liqUSD.toLocaleString('es-AR')} · ARS {Math.round(liqARS / 1000)}K</PrivacyMask>}
                className="warn"
              />
              <KPICard
                label="Posiciones"
                onClick={() => navigate('/detalle/posiciones')}
                value={String(totalTickers + portfolio.liquidez.detalle.length)}
                sub={`${totalTickers} tickers · ver por sector`}
              />
              <KPICard
                label="Mayor posición"
                primary
                onClick={() => navigate('/detalle/mayor-posicion')}
                value={mayorPos
                  ? <>{mayorPosTicker} · <PrivacyMask>US$ {mayorPosUSD.toLocaleString('es-AR')}</PrivacyMask></>
                  : '—'}
                sub={mayorPos ? `${mayorPosPct.toFixed(1).replace('.', ',')}% · ver top 5` : 'sin posiciones'}
              />
              <KPICard
                label="G/P total USD"
                onClick={gpUSD != null ? () => navigate('/detalle/gp') : undefined}
                value={gpUSD != null
                  ? <><PrivacyMask>{gpUSDSigNo}US$ {Math.round(gpUSD).toLocaleString('es-AR')}</PrivacyMask></>
                  : 'N/D'}
                sub={gpUSD != null && invertidoUSD != null
                  ? <PrivacyMask>sobre US$ {invertidoUSD.toLocaleString('es-AR')} invertidos</PrivacyMask>
                  : 'sin datos de costo'}
                className={gpUSD != null ? (gpUSDPos ? 'pos' : 'neg') : ''}
              />
              <KPICard
                label="Riesgo país"
                value={riesgoPaisPb != null ? `${riesgoPaisPb.toLocaleString('es-AR')} pb` : 'N/D'}
                sub={riesgoPaisMinDesde ? `mín desde ${riesgoPaisMinDesde}` : undefined}
                className={riesgoPaisEsMin ? 'pos' : ''}
              />
            </div>

            {/* ── Posiciones ── */}
            <div className="section">
              <CategorySection title="Acciones AR"  category={portfolio.acciones_ar} />
              <CategorySection title="CEDEARs"      category={portfolio.cedears}     isCedear />
              <CategorySection title="Bonos"        category={portfolio.bonos}       isBono />
              <CategorySection title="ONs"          category={portfolio.ons}         isON />
              <CategorySection title="FCI"          category={portfolio.fci}         isFCI />

              {totalTickers === 0 && (
                <div className="state">
                  <i className="ti ti-wallet" aria-hidden="true" />
                  <div className="state-title">Sin posiciones</div>
                  <div className="state-desc">{isDemo ? 'Iniciá sesión para ver tu cartera real.' : 'Sincronizá con PPI (botón central) para traer tus posiciones.'}</div>
                </div>
              )}

              {/* Diagnóstico del último sync (solo usuario real, cartera vacía). No muestra
                  ningún valor secreto: solo qué campos de credenciales hay, status y conteos. */}
              {!isDemo && totalTickers === 0 && syncDiag && (
                <div className="sync-diag">
                  <div className="sync-diag-title">
                    <i className="ti ti-stethoscope" aria-hidden="true" /> Diagnóstico de sync
                  </div>
                  {syncDiag.fatalError ? (
                    <div className="sync-diag-row err">Error: {syncDiag.fatalError}</div>
                  ) : (<>
                    <div className={`sync-diag-row ${syncDiag.credsLoaded ? 'ok' : 'err'}`}>
                      Credenciales en Firestore: {syncDiag.credsLoaded ? 'sí' : 'NO'}
                    </div>
                    {syncDiag.decryptError && (
                      <div className="sync-diag-row err">Descifrado de credenciales: {syncDiag.decryptError}</div>
                    )}
                    <div className={`sync-diag-row ${(syncDiag.missingKeys?.length ?? 1) === 0 ? 'ok' : 'err'}`}>
                      Campos presentes: {syncDiag.presentKeys?.length ?? 0}/5
                      {(syncDiag.missingKeys?.length ?? 0) > 0 && ` · faltan: ${syncDiag.missingKeys.join(', ')}`}
                    </div>
                    <div className="sync-diag-row">Credenciales usadas: {syncDiag.usedUserCreds ? 'las tuyas' : 'las del backend'}</div>
                    <div className="sync-diag-row">Status backend: {syncDiag.status ?? '—'}</div>
                    {syncDiag.backendError && (
                      <div className="sync-diag-row err">Error PPI: {syncDiag.backendError}</div>
                    )}
                    <div className={`sync-diag-row ${(syncDiag.totalPosiciones ?? 0) > 0 ? 'ok' : 'err'}`}>
                      Posiciones traídas: {syncDiag.totalPosiciones ?? 0}
                    </div>
                  </>)}
                </div>
              )}

              {/* Diagnóstico de LECTURA (datos persistidos): muestra por qué no aparece la
                  cartera del último sync exitoso aunque exista en Firestore. */}
              {!isDemo && totalTickers === 0 && readDiag && (
                <div className="sync-diag">
                  <div className="sync-diag-title">
                    <i className="ti ti-database-search" aria-hidden="true" /> Diagnóstico de lectura
                  </div>
                  <div className={`sync-diag-row ${(readDiag.firestoreDocs ?? 0) > 0 ? 'ok' : 'err'}`}>
                    Docs en Firestore: {readDiag.firestoreDocs ?? '—'}
                    {readDiag.docIds?.length ? ` (${readDiag.docIds.join(', ')})` : ''}
                  </div>
                  <div className={`sync-diag-row ${(readDiag.decryptedOk ?? 0) > 0 ? 'ok' : 'err'}`}>
                    Descifrados OK: {readDiag.decryptedOk ?? 0}/{readDiag.firestoreDocs ?? 0}
                  </div>
                  {readDiag.decryptErrors?.length > 0 && (
                    <div className="sync-diag-row err">Error descifrado: {readDiag.decryptErrors[0]}</div>
                  )}
                  {readDiag.cacheErrors?.length > 0 && (
                    <div className="sync-diag-row err">Error cache: {readDiag.cacheErrors[0]}</div>
                  )}
                  <div className="sync-diag-row">Origen: {readDiag.source ?? '—'}</div>
                  {readDiag.legacyError && (
                    <div className="sync-diag-row err">Error legacy: {readDiag.legacyError}</div>
                  )}
                  <div className={`sync-diag-row ${(readDiag.positions ?? 0) > 0 ? 'ok' : 'err'}`}>
                    Posiciones leídas: {readDiag.positions ?? 0}
                  </div>
                </div>
              )}

              {(isDemo || totalTickers > 0) && (<>
              <div className="eyebrow" style={{ margin: '20px 0 10px' }}>
                Stress test
                {isDemo && <span className="demo-chip"><i className="ti ti-flask" aria-hidden="true" />datos de ejemplo</span>}
              </div>
              <div className="stress-row">
                {stressTest.map(s => <StressCard key={s.nombre} scenario={s} />)}
              </div>

              <LiquidezBlock liquidez={portfolio.liquidez} />

              <div className="eyebrow" style={{ margin: '20px 0 10px' }}>Herramientas Claude</div>
              <div className="action-btns">
                <CopyContextBtn tipo="tactico"     onToast={showToast} />
                <PasteResultArea id="paste-tac" label="Pegar resultado táctico" sub="Cargá el JSON de respuesta de Claude" onLoad={() => showToast('✓ Resultado cargado')} />
              </div>
              </>)}
            </div>
          </div>
        )}

        {/* ════════ SECCIÓN: FUNDAMENTAL ════════ */}
        {activeTab === 'fundamental' && (
          <div className="section section-fade">
            {!hasPositions ? (
              <div className="state">
                <i className="ti ti-plug-off" aria-hidden="true" />
                <div className="state-title">Sin posiciones</div>
                <div className="state-desc">Sincronizá con PPI (botón central ↓) para cargar tu cartera.</div>
              </div>
            ) : (<>
            <div className="action-btns" style={{ marginTop: 12 }}>
              <button className="action-btn" onClick={handleRefreshFundamentals} disabled={fundRefreshing}>
                <span className="ab-icon"><i className={`ti ${fundRefreshing ? 'ti-loader-2 spin-ic' : 'ti-chart-dots'}`} aria-hidden="true" /></span>
                <div className="ab-text">
                  <div className="ab-title">{fundRefreshing ? 'Actualizando…' : 'Actualizar fundamentales'}</div>
                  <div className="ab-sub">Fetcha P/E, EV/EBITDA, márgenes desde Yahoo Finance</div>
                </div>
                <span className="ab-arrow"><i className="ti ti-arrow-right" aria-hidden="true" /></span>
              </button>
            </div>

            {fundamental.length === 0 ? (
              <div className="state">
                <i className="ti ti-chart-bar" aria-hidden="true" />
                <div className="state-title">Sin datos fundamentales</div>
                <div className="state-desc">Presioná "Actualizar fundamentales" para cargar métricas reales desde Yahoo Finance.</div>
              </div>
            ) : (
              fundamental.map(sector => (
                <div key={sector.sector}>
                  <div className="eyebrow" style={{ margin: '16px 0 10px' }}>{sector.sector}</div>
                  <div className="fund-grid">
                    {sector.posiciones.map(pos => (
                      <div id={`fund-${pos.ticker}`} key={pos.ticker}>
                        <FundCard position={pos} />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            <div className="eyebrow" style={{ margin: '20px 0 10px' }}>Análisis Claude</div>
            <div className="action-btns">
              <CopyContextBtn tipo="fundamental" onToast={showToast} />
              <PasteResultArea
                id="paste-fund"
                label="Pegar análisis fundamental"
                sub="Pegá el JSON de Claude — guarda tesis, escenarios y acción táctica"
                onLoad={handleFundAnalysisLoad}
              />
            </div>
            </>)}
          </div>
        )}

        {/* ════════ SECCIÓN: CATALIZADORES ════════ */}
        {activeTab === 'catalizadores' && (
          <div className="section section-fade">
            {!hasPositions ? (
              <div className="state">
                <i className="ti ti-plug-off" aria-hidden="true" />
                <div className="state-title">Sin posiciones</div>
                <div className="state-desc">Sincronizá con PPI (botón central ↓) para cargar tu cartera.</div>
              </div>
            ) : (<>
            <div className="cat-header">
              <div className="eyebrow" style={{ margin: 0 }}>Próximos eventos</div>
              {!isDemo && (
                <button className="cat-add-btn" onClick={() => setShowCatForm(v => !v)}>
                  {showCatForm ? '✕ Cancelar' : '+ Agregar'}
                </button>
              )}
            </div>

            {showCatForm && !isDemo && (
              <form className="cat-form" onSubmit={handleAddCatalyst}>
                <div className="cat-form-row">
                  <input className="cat-input" type="date" required value={catForm.fecha}
                    onChange={e => setCatForm(f => ({ ...f, fecha: e.target.value }))} />
                  <select className="cat-input" value={catForm.urgencia}
                    onChange={e => setCatForm(f => ({ ...f, urgencia: e.target.value }))}>
                    <option value="urgente">Urgente</option>
                    <option value="cercano">Próximo</option>
                    <option value="estructural">Estructural</option>
                    <option value="lejano">Largo plazo</option>
                  </select>
                  <select className="cat-input" value={catForm.tipo}
                    onChange={e => setCatForm(f => ({ ...f, tipo: e.target.value }))}>
                    <option value="earnings">Earnings</option>
                    <option value="evento_macro">Macro</option>
                    <option value="rti_tarifario">Regulatorio</option>
                    <option value="vencimiento">Vencimiento</option>
                    <option value="dividendo">Dividendo</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <input className="cat-input cat-input-full" type="text" required placeholder="Nombre del evento"
                  value={catForm.evento} onChange={e => setCatForm(f => ({ ...f, evento: e.target.value }))} />
                <input className="cat-input cat-input-full" type="text" placeholder="Tickers afectados (separados por coma: ALUA, MELI)"
                  value={catForm.tickers} onChange={e => setCatForm(f => ({ ...f, tickers: e.target.value }))} />
                <textarea className="cat-input cat-input-full cat-textarea" placeholder="Descripción (opcional)" rows={2}
                  value={catForm.descripcion} onChange={e => setCatForm(f => ({ ...f, descripcion: e.target.value }))} />
                <button className="cat-submit-btn" type="submit">Guardar evento</button>
              </form>
            )}

            {catalizadores.length === 0 ? (
              <div className="state">
                <i className="ti ti-calendar-off" aria-hidden="true" />
                <div className="state-title">Sin eventos</div>
                <div className="state-desc">{isDemo ? 'Los eventos reales aparecen al iniciar sesión.' : 'Usá "+ Agregar" o cargá desde Claude.'}</div>
              </div>
            ) : (
              <div className="timeline">
                {[...catalizadores]
                  .sort((a, b) => {
                    const aDone = (a.estado ?? a.urgencia) === 'done' ? 1 : 0
                    const bDone = (b.estado ?? b.urgencia) === 'done' ? 1 : 0
                    if (aDone !== bDone) return aDone - bDone
                    return String(a.fecha).localeCompare(String(b.fecha))
                  })
                  .map((cat, i) => (
                    <CatalystItem key={i} catalyst={cat} onDelete={!isDemo ? handleDeleteCatalyst : undefined} />
                  ))}
              </div>
            )}

            {!isDemo && (
              <>
                <div className="eyebrow" style={{ margin: '24px 0 10px' }}>Herramientas Claude</div>
                <div className="action-btns">
                  <CopyContextBtn tipo="catalizadores" onToast={showToast} />
                  <PasteResultArea
                    id="paste-cat"
                    label="Cargar catalizadores Claude"
                    sub="Pegá el JSON de Claude — reemplaza la lista completa"
                    onLoad={handleCatalystLoad}
                  />
                </div>
              </>
            )}
            </>)}
          </div>
        )}

        {/* ════════ SECCIÓN: GRÁFICOS ════════ */}
        {activeTab === 'graficos' && (
          <div className="section section-fade">
            {!hasPositions ? (
              <div className="state">
                <i className="ti ti-plug-off" aria-hidden="true" />
                <div className="state-title">Sin posiciones</div>
                <div className="state-desc">Sincronizá con PPI (botón central ↓) para cargar tu cartera.</div>
              </div>
            ) : (<>
            <div className="eyebrow" style={{ margin: '8px 0 10px' }}>Seleccioná un ticker</div>
            <div className="chart-selector">
              {Object.keys(tickersTV).map(ticker => (
                <button key={ticker}
                  className={`chart-ticker-btn ${selectedTicker === ticker ? 'active' : ''}`}
                  onClick={() => setSelectedTicker(ticker)}>
                  {ticker}
                </button>
              ))}
            </div>
            <div id="chart-content">
              <TradingViewWidget symbol={selectedTicker ? tickersTV[selectedTicker] : null} />
            </div>
            </>)}
          </div>
        )}

        <footer>
          {isDemo
            ? 'Demo · Datos de ejemplo — no reales · No constituye asesoramiento financiero'
            : 'MiCartera · Datos sincronizados desde PPI · No constituye asesoramiento financiero'}
        </footer>
      </main>

      <BottomNav
        active={activeTab}
        onSelect={switchTab}
        onSync={handleSync}
        syncing={syncing}
        canSync={!isDemo}
      />

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
        </div>
      </Modal>

      <Toast message={toastMsg} />
    </div>
  )
}
