import { useState } from 'react'
import { useCurrency } from '../../hooks/useCurrency'
import { formatARS, formatARSPrice, formatUSD, formatPctShort } from '../../utils/formatters'
import PrivacyMask from '../ui/PrivacyMask'
import TacticalBadge, { tacticalBarClass } from './TacticalBadge'
import BandaBar from './BandaBar'
import HistoryChart from '../charts/HistoryChart'
import { ROL_LABELS } from '../../data/contratoConfig'

// Bloque táctico estructurado del detalle de una posición: salud de tesis + urgencia
// como chips, la justificación como texto principal, y "en contra" / "esperar" como
// líneas secundarias. Sale del análisis táctico por CP (no del fundamental).
const SALUD_META = {
  intacta:           ['Tesis intacta',    'var(--buy)'],
  en_observacion:    ['En observación',   'var(--warn)'],
  bajo_observacion:  ['En observación',   'var(--warn)'],
  debilitada:        ['Tesis debilitada', 'var(--warn)'],
  en_riesgo:         ['Tesis en riesgo',  'var(--red)'],
  rota:              ['Tesis rota',       'var(--red)'],
}
const URG_META = {
  alta:                 ['Urgencia: alta',  'var(--red)'],
  media:                ['Urgencia: media', 'var(--warn)'],
  baja:                 ['Urgencia: baja',  'var(--muted2)'],
  sin_accion_inmediata: ['Sin apuro',       'var(--muted)'],
}

const _fmtDDMM = (iso) => {
  const [, m, d] = String(iso).split('-')
  return d ? `${d}/${m}` : iso
}
const _pref = (m) => m === 'ARS' ? 'AR$' : m === 'USD' ? 'US$' : '$'

// Bloque táctico completo del expandido: chips → grilla de datos del contrato/contexto
// (rol, rendimiento, catalizador, consenso, peso vs banda como UN dato más) → textos.
function TacticoResumen({ position }) {
  const t = position.tactico ?? {}
  const salud = SALUD_META[t.salud_tesis]
  const urg   = URG_META[t.urgencia]
  const chip = (label, color) => (
    <span style={{ fontSize: 9, color, border: `1px solid ${color}`, opacity: .92, borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap' }}>{label}</span>
  )

  const rol   = position.rol ? (ROL_LABELS[position.rol] ?? position.rol) : null
  const rend  = position.rend_total_usd_pct ?? position.rend_usd_pct ?? null
  const cat   = position.prox_catalizador
  const an    = position.analistas_res
  const item = (label, val, color) => (
    <div>
      <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 12, color: color ?? 'var(--text)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</div>
    </div>
  )
  const hayGrilla = rol || rend != null || cat || an || position.banda

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>Análisis táctico</span>
        {position.accion_tactica && <TacticalBadge accion={position.accion_tactica} />}
        {salud && chip(salud[0], salud[1])}
        {urg && chip(urg[0], urg[1])}
      </div>

      {hayGrilla && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)', padding: '9px 11px', marginBottom: 10,
        }}>
          {rol && item('Rol en tu contrato', rol)}
          {rend != null && item('Rend. total USD', `${rend >= 0 ? '+' : ''}${Number(rend).toFixed(1).replace('.', ',')}%`, rend >= 0 ? 'var(--buy)' : 'var(--red)')}
          {cat && item('Próx. catalizador', `${cat.evento} · ${_fmtDDMM(cat.fecha)}`)}
          {an && item('Consenso analistas', `${_pref(an.moneda)} ${Number(an.target).toLocaleString('es-AR')}${an.upside != null ? ` · ${an.upside >= 0 ? '+' : ''}${Number(an.upside).toFixed(1).replace('.', ',')}%` : ''}`)}
          {position.banda && (
            <BandaBar
              min={position.banda.min}
              objetivo={position.banda.objetivo}
              max={position.banda.max}
              actual={position.pct_cartera}
            />
          )}
        </div>
      )}

      {t.justificacion && (
        <div className="tr-tesis" style={{ border: 'none', margin: 0, paddingTop: 0 }}>{t.justificacion}</div>
      )}
      {t.en_contra && (
        <div className="tr-tesis" style={{ border: 'none', margin: '6px 0 0', paddingTop: 0 }}>
          <b style={{ color: 'var(--warn)', fontWeight: 600 }}>En contra:</b> {t.en_contra}
        </div>
      )}
      {t.condicion_espera && t.condicion_espera !== '—' && (
        <div className="tr-tesis" style={{ border: 'none', margin: '6px 0 0', paddingTop: 0 }}>
          <b style={{ color: 'var(--accent3, var(--muted2))', fontWeight: 600 }}>Esperar:</b> {t.condicion_espera}
        </div>
      )}
    </div>
  )
}

export default function AssetRow({ position, expanded, onToggle, isCedear, isBono, isON, isFCI, isStale = false, syncDate = null }) {
  const { activeCurrency, getRend, convert, convertPrice, curLabel } = useCurrency()
  const barCls    = tacticalBarClass(position.accion_tactica)
  const isMEPmode = activeCurrency === 'MEP' || activeCurrency === 'CCL'

  // Rendimiento del día → tr-mid (siempre visible)
  //
  // Regla de negocio (mercado argentino, UTC-3):
  //   • Fin de semana o antes de apertura (< 11:00 hs BA) → 0% (sin rueda hoy)
  //   • Mercado abierto (isStale=false)                   → intradiario actual
  //   • Mercado cerrado, mismo día ≥ 11:00                → último intradiario de la rueda
  //
  // IMPORTANTE: la verificación de día/hora va ANTES del flag isStale.
  // is_stale en Firestore refleja el estado al momento del último sync, no el
  // estado actual del mercado. Si el último sync fue viernes con mercado abierto,
  // is_stale queda false → el sábado se leería como mercado abierto sin el check.
  const rendDia = (() => {
    const bueStr = new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
    const bue    = new Date(bueStr)
    const dow    = bue.getDay()    // 0=Dom, 6=Sáb
    const hour   = bue.getHours()

    // Fin de semana o antes de apertura (11:00 hs BA): sin rueda hoy → 0%
    if (dow === 0 || dow === 6 || hour < 11) return 0

    // Día hábil ≥ 11:00: mercado abierto → intradiario actual
    if (!isStale) return position.rend_dia_pct ?? null
    // Mercado cerrado: solo mostrar el último intradiario si el sync fue HOY.
    // Si el sync fue de otro día (ej: domingo), los datos son de la sesión anterior → '—'.
    const todayStr = bue.toISOString().substring(0, 10)
    if (syncDate !== todayStr) return null
    return position.rend_dia_pct ?? 0
  })()
  const isDiaPos = rendDia == null || rendDia >= 0

  // Renta cobrada (cupones + amortizaciones + dividendos). Sigue el toggle: USD en MEP/CCL.
  const rentaCobrada = isMEPmode ? position.renta_cobrada_usd : position.renta_cobrada_ars
  const hasRenta = rentaCobrada != null && rentaCobrada !== 0
  const rentaCobradaFmt = rentaCobrada != null
    ? (isMEPmode ? formatUSD(rentaCobrada) : formatARS(rentaCobrada))
    : null

  // Rendimiento histórico de PRECIO (sin renta). En bonos/ONs con renta se renombra a
  // "Var. precio": el precio cae al amortizar, así que como "rendimiento" engaña.
  const rendHist      = getRend(position)
  const rendHistLabel = hasRenta
    ? `Var. precio ${curLabel}`
    : (isMEPmode ? 'Rend. Histórico USD' : 'Rend. Histórico ARS')

  // Rendimiento TOTAL = precio + renta (campo del backend; es el rend. real del bono).
  const rendTotal = isMEPmode
    ? (position.rend_total_usd_pct ?? position.rend_total_ars_pct ?? null)
    : (position.rend_total_ars_pct ?? null)

  // G/P absoluta en la moneda activa = G/P de precio + renta cobrada. Se calcula en el front
  // sumando la renta (campos presentes) en vez de depender de ganancia_total_* del backend,
  // que puede faltar en datos viejos. Sin renta, es simplemente el G/P de precio.
  const gananciaPrecio = isMEPmode ? position.ganancia_usd_mep : position.ganancia_ars
  const gananciaVal = gananciaPrecio == null
    ? null
    : (hasRenta ? gananciaPrecio + rentaCobrada : gananciaPrecio)
  const ganancia = gananciaVal != null
    ? (isMEPmode ? formatUSD(gananciaVal) : formatARS(gananciaVal))
    : null

  return (
    <div className={`ticker-row ${expanded ? 'expanded' : ''}`} onClick={onToggle}>
      <div className="tr-header">
        <div className={`tr-bar ${barCls}`} />
        <div className="tr-left">
          <div className="tr-ticker">{position.ticker}</div>
          <div className="tr-name">{position.descripcion}</div>
          <div className="tr-meta">
            {position.cantidad != null && `${position.cantidad} ${isCedear ? 'cert.' : isBono || isON ? 'VN' : isFCI ? 'CP' : 'acc.'}`}
            {position.cantidad != null && position.pct_cartera != null && ' · '}
            {position.pct_cartera != null && `${position.pct_cartera.toFixed(1).replace('.', ',')}% cartera`}
          </div>
        </div>
        <div className="tr-mid">
          <div className={`tr-rend ${isDiaPos ? 'pos' : 'neg'}`}>
            {formatPctShort(rendDia)}
          </div>
        </div>
        <div className="tr-right">
          <TacticalBadge accion={position.accion_tactica} />
          <span className="tr-chevron">▼</span>
        </div>
      </div>

      <div className="tr-detail">
        <div className="tr-grid">
          <div>
            <div className="tg-label">Cantidad</div>
            <div className="tg-val">
              {position.cantidad} {isCedear ? 'cert.' : isBono || isON ? 'VN' : isFCI ? 'CP' : 'acc.'}
            </div>
          </div>

          {/* Precio de compra */}
          {position.precio_compra_ars != null && (
            <div>
              <div className="tg-label">P. Compra {curLabel}</div>
              <div className="tg-val">
                <PrivacyMask>
                  {/* En modo MEP/CCL y con USD histórico: mostrar costo real (no ARS ÷ MEP actual) */}
                  {isMEPmode && position.precio_compra_usd != null
                    ? formatUSD(position.precio_compra_usd)
                    : convertPrice(position.precio_compra_ars)}
                </PrivacyMask>
              </div>
            </div>
          )}

          {/* Precio actual */}
          {position.precio_actual_ars != null && (
            <div>
              <div className="tg-label">P. Actual {curLabel}</div>
              <div className="tg-val"><PrivacyMask>{convertPrice(position.precio_actual_ars)}</PrivacyMask></div>
            </div>
          )}

          {/* CEDEAR: precio subyacente USD */}
          {isCedear && position.precio_subyacente_usd != null && (
            <div>
              <div className="tg-label">Subyacente USD ({position.mercado_subyacente})</div>
              <div className="tg-val"><PrivacyMask>${position.precio_subyacente_usd.toLocaleString('es-AR')}</PrivacyMask></div>
            </div>
          )}
          {isCedear && position.ratio_cedear != null && (
            <div>
              <div className="tg-label">Ratio CEDEAR</div>
              <div className="tg-val">{position.ratio_cedear}:1</div>
            </div>
          )}

          {/* Bonos/ONs: precio paridad y TIR */}
          {(isBono || isON) && position.precio_actual != null && (
            <div>
              <div className="tg-label">Precio (paridad)</div>
              <div className="tg-val">{position.precio_actual}</div>
            </div>
          )}
          {(isBono || isON) && position.tir_pct != null && (
            <div>
              <div className="tg-label">TIR</div>
              <div className="tg-val pos">{position.tir_pct.toFixed(1).replace('.', ',')}%</div>
            </div>
          )}
          {(isBono || isON) && position.vencimiento && (
            <div>
              <div className="tg-label">Vencimiento</div>
              <div className="tg-val">{position.vencimiento}</div>
            </div>
          )}

          {/* FCI: precio cuotaparte */}
          {isFCI && position.precio_cuotaparte != null && (
            <div>
              <div className="tg-label">Cuotaparte</div>
              <div className="tg-val">{position.precio_cuotaparte.toFixed(3)}</div>
            </div>
          )}

          {/* Valor corriente */}
          {position.valor_corriente_ars != null && (
            <div>
              <div className="tg-label">Valor {curLabel}</div>
              <div className="tg-val"><PrivacyMask>{convert(position.valor_corriente_ars)}</PrivacyMask></div>
            </div>
          )}

          {/* Ganancia / Pérdida absoluta */}
          {ganancia && (
            <div>
              <div className="tg-label">{hasRenta ? `Ganancia total ${curLabel}` : `Ganancia ${curLabel}`}</div>
              <div className={`tg-val ${(gananciaVal ?? 0) >= 0 ? 'pos' : 'neg'}`}>
                <PrivacyMask>{ganancia}</PrivacyMask>
              </div>
            </div>
          )}

          {/* Rendimiento del día — usa la misma lógica horaria que tr-mid */}
          {rendDia !== null && (
            <div>
              <div className="tg-label">Rend. Día</div>
              <div className={`tg-val ${rendDia >= 0 ? 'pos' : 'neg'}`}>
                {formatPctShort(rendDia)}
              </div>
            </div>
          )}

          {/* Última variación de cierre: visible cuando hoy no hay rueda (finde / pre-apertura)
              y hay un valor registrado de la sesión anterior. Permite ver el rendimiento del
              último día hábil sin confundirlo con la variación de hoy. */}
          {rendDia === 0 && position.rend_dia_pct != null && position.rend_dia_pct !== 0 && (
            <div>
              <div className="tg-label">Últ. Cierre</div>
              <div className={`tg-val ${position.rend_dia_pct >= 0 ? 'pos' : 'neg'}`}>
                {formatPctShort(position.rend_dia_pct)}
              </div>
            </div>
          )}

          {/* Rendimiento histórico: sigue toggle de moneda activa.
              Para bonos/ONs con renta es el rend de PRECIO (sin cupones). */}
          {rendHist != null && (
            <div>
              <div className="tg-label">{rendHistLabel}</div>
              <div className={`tg-val ${rendHist >= 0 ? 'pos' : 'neg'}`}>
                {formatPctShort(rendHist)}
              </div>
            </div>
          )}

          {/* Renta cobrada: cupones + amortizaciones + dividendos acumulados (caja).
              Solo presente en instrumentos que pagaron renta. */}
          {rentaCobradaFmt != null && (
            <div>
              <div className="tg-label">Renta cobrada {curLabel}</div>
              <div className={`tg-val ${rentaCobrada >= 0 ? 'pos' : 'neg'}`}>
                <PrivacyMask>{rentaCobradaFmt}</PrivacyMask>
              </div>
            </div>
          )}

          {/* Rendimiento TOTAL = precio + renta cobrada. Va junto al rend de precio
              para que se vea lo que aportaron los cupones. */}
          {rendTotal != null && (
            <div>
              <div className="tg-label">Rend. Total {curLabel}</div>
              <div className={`tg-val ${rendTotal >= 0 ? 'pos' : 'neg'}`}>
                {formatPctShort(rendTotal)}
              </div>
            </div>
          )}
        </div>

        {(position.tactico || position.tesis_corta || position.banda) && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
            {(position.tactico || position.banda)
              ? <TacticoResumen position={position} />
              : <div className="tr-tesis" style={{ border: 'none', margin: 0, paddingTop: 0 }}>{position.tesis_corta}</div>}
          </div>
        )}

        {/* Gráfico de precio del ticker (solo renta variable; se busca recién al expandir) */}
        {expanded && !isBono && !isON && !isFCI && position.yf_ticker && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 2 }}>
            <HistoryChart
              titulo={`Precio · ${position.ticker}`}
              unidad=""
              defaultRango="3m"
              series={[{
                id: `tk-${position.yf_ticker}`,
                label: position.ticker,
                color: '#00e5a0',
                path: `/api/prices/ticker-series/${encodeURIComponent(position.yf_ticker)}?dias=10000`,
              }]}
            />
          </div>
        )}

        {position.evento_proximo && (
          <div className="tr-event-chip">📅 {position.evento_proximo}</div>
        )}

        <div className="tr-links">
          <a
            className="tr-link"
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            📊 Ver en TradingView
          </a>
        </div>
      </div>
    </div>
  )
}
