import { useState } from 'react'
import { useCurrency } from '../../hooks/useCurrency'
import { formatARS, formatARSPrice, formatUSD, formatPctShort } from '../../utils/formatters'
import PrivacyMask from '../ui/PrivacyMask'
import TacticalBadge, { tacticalBarClass } from './TacticalBadge'

export default function AssetRow({ position, expanded, onToggle, isCedear, isBono, isON, isFCI, isStale = false }) {
  const { activeCurrency, getRend, convert, convertPrice, curLabel } = useCurrency()
  const barCls    = tacticalBarClass(position.accion_tactica)
  const isMEPmode = activeCurrency === 'MEP' || activeCurrency === 'CCL'

  // Rendimiento del día → tr-mid (siempre visible)
  //
  // Regla de negocio (mercado argentino, UTC-3):
  //   • Mercado abierto (isStale=false)         → intradiario actual
  //   • Mercado cerrado, mismo día ≥ 11:00      → último intradiario de la rueda
  //   • Después de 00:00 o fin de semana        → 0% (nuevo día sin rueda aún)
  //   • Hora < 11:00 en día hábil               → 0% (mercado todavía no abrió)
  const rendDia = (() => {
    if (!isStale) return position.rend_dia_pct ?? null

    // Mercado cerrado: determinar qué mostrar según la hora en Buenos Aires
    const bueStr = new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
    const bue    = new Date(bueStr)
    const dow    = bue.getDay()    // 0=Dom, 6=Sáb
    const hour   = bue.getHours()

    // Fin de semana o antes de apertura (11:00): no hubo rueda hoy → 0%
    if (dow === 0 || dow === 6 || hour < 11) return 0

    // Día hábil ≥ 11:00: la rueda ocurrió hoy → mostrar el último intradiario
    return position.rend_dia_pct ?? 0
  })()
  const isDiaPos = rendDia == null || rendDia >= 0

  // Rendimiento histórico desde compra → panel expandido, sigue toggle de moneda
  const rendHist      = getRend(position)
  const rendHistLabel = isMEPmode ? 'Rend. Histórico USD' : 'Rend. Histórico ARS'

  // Ganancia/pérdida absoluta en la moneda activa
  const ganancia = isMEPmode
    ? (position.ganancia_usd_mep != null ? formatUSD(position.ganancia_usd_mep) : null)
    : (position.ganancia_ars     != null ? formatARS(position.ganancia_ars)     : null)

  return (
    <div className={`ticker-row ${expanded ? 'expanded' : ''}`} onClick={onToggle}>
      <div className="tr-header">
        <div className={`tr-bar ${barCls}`} />
        <div className="tr-left">
          <div className="tr-ticker">{position.ticker}</div>
          <div className="tr-name">
            {position.descripcion}
            {position.cantidad != null && ` · ${position.cantidad} ${isCedear ? 'cert.' : isBono || isON ? 'VN' : isFCI ? 'CP' : 'acc.'}`}
            {position.pct_cartera != null && ` · ${position.pct_cartera.toFixed(1).replace('.', ',')}% cartera`}
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
              <div className="tg-label">Ganancia {curLabel}</div>
              <div className={`tg-val ${(isMEPmode ? position.ganancia_usd_mep : position.ganancia_ars) >= 0 ? 'pos' : 'neg'}`}>
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

          {/* Rendimiento histórico: sigue toggle de moneda activa */}
          {rendHist != null && (
            <div>
              <div className="tg-label">{rendHistLabel}</div>
              <div className={`tg-val ${rendHist >= 0 ? 'pos' : 'neg'}`}>
                {formatPctShort(rendHist)}
              </div>
            </div>
          )}
        </div>

        {position.tesis_corta && (
          <div className="tr-tesis">{position.tesis_corta}</div>
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
