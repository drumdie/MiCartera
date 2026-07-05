import { useApp } from '../../store/AppContext'
import { formatARS } from '../../utils/formatters'
import ScreenHeader from '../../components/layout/ScreenHeader'
import SerieChart from '../../components/charts/SerieChart'
import HistoryChart from '../../components/charts/HistoryChart'

// Series del gráfico histórico de dólar (colores = los de la distribución)
const SERIES_DOLAR = [
  { id: 'mep',     label: 'MEP',     color: '#00e5a0' },
  { id: 'ccl',     label: 'CCL',     color: '#4a9eff' },
  { id: 'oficial', label: 'Oficial', color: '#f7b731' },
]

function RateRow({ label, value, sub, accent }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '13px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 13, fontWeight: 600, color: '#fff' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontFamily: 'var(--font-num)', fontSize: 18, fontWeight: 700, color: accent ? 'var(--accent2)' : 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

export default function MepDetail() {
  const { cotizaciones, isStale, ultimaSync, lastSync } = useApp()
  const {
    dolar_mep, dolar_ccl, dolar_oficial,
    riesgo_pais_pb, riesgo_pais_min, riesgo_pais_min_desde,
  } = cotizaciones

  const refDate = ultimaSync ?? lastSync
  const fechaLabel = refDate
    ? new Date(refDate).toLocaleString('es-AR', {
        weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <div className="screen">
      <ScreenHeader title="Tipos de cambio" />

      {isStale && fechaLabel && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--amber-soft)', border: '1px solid var(--amber-line)',
          borderRadius: 'var(--r-sm)', padding: '7px 12px', marginBottom: 16, fontSize: 11, color: 'var(--warn)',
        }}>
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          Mercado cerrado · datos del {fechaLabel}
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>
          Dólar financiero
        </div>
        <RateRow label="MEP (AL30)" value={formatARS(dolar_mep)} accent />
        <RateRow
          label="CCL (Cable)"
          value={formatARS(dolar_ccl)}
          sub={dolar_mep && dolar_ccl ? `brecha MEP: ${((dolar_ccl / dolar_mep - 1) * 100).toFixed(1)}%` : undefined}
        />
        <div style={{ paddingTop: 13 }}>
          <RateRow label="Oficial (BNA)" value={formatARS(dolar_oficial)}
            sub={dolar_mep && dolar_oficial ? `brecha vs MEP: ${((dolar_mep / dolar_oficial - 1) * 100).toFixed(1)}%` : undefined}
          />
        </div>
        <HistoryChart titulo="Dólar · histórico" unidad="ARS" series={SERIES_DOLAR} defaultRango="3m" />
      </div>

      {riesgo_pais_pb != null && (
        <div className="card">
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>
            Riesgo país (EMBI+)
          </div>
          <RateRow
            label="Spread"
            value={`${riesgo_pais_pb.toLocaleString('es-AR')} pb`}
            sub={riesgo_pais_min != null && riesgo_pais_min_desde
              ? `mín: ${riesgo_pais_min} pb desde ${riesgo_pais_min_desde}`
              : undefined}
            accent={riesgo_pais_min != null && riesgo_pais_pb <= riesgo_pais_min}
          />
          <SerieChart indicador="riesgo_pais" unidad="pb" />
        </div>
      )}
    </div>
  )
}
