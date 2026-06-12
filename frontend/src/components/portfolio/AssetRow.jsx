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

    // Día hábil ≥ 11:00: mercado abierto → intradiario actual; cerrado → último de la rueda
    if (!isStale) return position.rend_dia_pct ?? null
    return position.rend_dia_pct ?? 0
  })()
  const isDiaPos = rendDia == null || rendDia >= 0

  // Rendimiento histórico desde compra → panel expandido, sigue toggle de moneda
  const rendHist      = getRend(position)
  const rendHistLabel = isMEPmode ? 'Rend. Histórico USD' : 'Rend. Histórico ARS'

  // Renta cobrada (cupones + amortizaciones + dividendos) y rendimiento TOTAL
  // (precio + renta). Solo se muestra cuando el backend la atribuyó (bonos/ONs y
  // acciones con dividendos). Sigue el toggle: USD en modo MEP/CCL, ARS si no.
  const rentaCobrada = isMEPmode ? position.renta_cobrada_usd : position.renta_cobrada_ars
  const rendTotal    = isMEPmode
    ? (position.rend_total_usd_pct ?? position.rend_total_ars_pct ?? null)
    : (position.rend_total_ars_pct ?? null)
  const rentaCobradaFmt = rentaCobrada != null
    ? (isMEPmode ? formatUSD(rentaCobrada) : formatARS(rentaCobrada))
    : null

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
