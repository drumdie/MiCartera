import { useApp } from '../../store/AppContext'
import ScreenHeader from '../../components/layout/ScreenHeader'

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

export default function RiesgoPaisDetail() {
  const { cotizaciones, isStale, ultimaSync, lastSync } = useApp()
  const { riesgo_pais_pb, riesgo_pais_min, riesgo_pais_min_desde } = cotizaciones

  const refDate = ultimaSync ?? lastSync
  const fechaLabel = refDate
    ? new Date(refDate).toLocaleString('es-AR', {
        weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
    : null

  const enMinimo = riesgo_pais_min != null && riesgo_pais_pb != null && riesgo_pais_pb <= riesgo_pais_min

  return (
    <div className="screen">
      <ScreenHeader title="Riesgo país" />

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

      {riesgo_pais_pb == null ? (
        <div className="state">
          <i className="ti ti-chart-line-off" aria-hidden="true" />
          <div className="state-title">Sin dato de riesgo país</div>
          <div className="state-desc">El spread aparece cuando hay cotizaciones frescas sincronizadas.</div>
        </div>
      ) : (
        <div className="card">
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>
            Riesgo país (EMBI+)
          </div>
          <RateRow
            label="Spread actual"
            value={`${riesgo_pais_pb.toLocaleString('es-AR')} pb`}
            accent={enMinimo}
          />
          {riesgo_pais_min != null && (
            <RateRow
              label="Mínimo histórico"
              value={`${riesgo_pais_min.toLocaleString('es-AR')} pb`}
              sub={riesgo_pais_min_desde ? `desde ${riesgo_pais_min_desde}` : undefined}
            />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, background: 'var(--blue-soft)', border: '1px solid var(--blue-line)', borderRadius: 'var(--r-md)', padding: '11px 12px' }}>
            <i className="ti ti-info-circle" style={{ color: 'var(--accent3)', fontSize: 16 }} aria-hidden="true" />
            <span style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.45 }}>
              El riesgo país mide el spread de los bonos soberanos sobre los Treasuries de EE.UU.
              {enMinimo ? ' Está en su mínimo del período registrado.' : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
