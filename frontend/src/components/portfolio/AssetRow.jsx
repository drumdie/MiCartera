import { useState } from 'react'
import { useCurrency } from '../../hooks/useCurrency'
import { formatARS, formatPctShort } from '../../utils/formatters'
import PrivacyMask from '../ui/PrivacyMask'
import TacticalBadge, { tacticalBarClass } from './TacticalBadge'

export default function AssetRow({ position, expanded, onToggle, isCedear, isBono, isON, isFCI }) {
  const { activeCurrency, getRend, cotizaciones } = useCurrency()
  const rend   = getRend(position)
  const isPos  = rend >= 0
  const barCls = tacticalBarClass(position.accion_tactica)

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
          <div className={`tr-rend ${isPos ? 'pos' : 'neg'}`}>
            {formatPctShort(rend)}
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

          {/* Precio de compra — acciones y CEDEARs */}
          {position.precio_compra_usd != null && (
            <div>
              <div className="tg-label">P. Compra USD</div>
              <div className="tg-val"><PrivacyMask>${position.precio_compra_usd.toLocaleString('es-AR')}</PrivacyMask></div>
            </div>
          )}
          {position.precio_compra_ars != null && (
            <div>
              <div className="tg-label">P. Compra ARS</div>
              <div className="tg-val"><PrivacyMask>{formatARS(position.precio_compra_ars)}</PrivacyMask></div>
            </div>
          )}

          {/* Precio actual ARS */}
          {position.precio_actual_ars != null && (
            <div>
              <div className="tg-label">P. Actual ARS</div>
              <div className="tg-val"><PrivacyMask>{formatARS(position.precio_actual_ars)}</PrivacyMask></div>
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

          {/* Valor corriente ARS */}
          {position.valor_corriente_ars != null && (
            <div>
              <div className="tg-label">Valor ARS</div>
              <div className="tg-val"><PrivacyMask>{formatARS(position.valor_corriente_ars)}</PrivacyMask></div>
            </div>
          )}

          {/* Rendimiento USD */}
          {position.rend_usd_pct != null && (
            <div>
              <div className="tg-label">Rend. USD</div>
              <div className={`tg-val ${position.rend_usd_pct >= 0 ? 'pos' : 'neg'}`}>
                {formatPctShort(position.rend_usd_pct)}
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
