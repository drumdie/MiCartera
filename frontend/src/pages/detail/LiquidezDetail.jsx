import { useApp } from '../../store/AppContext'
import { formatARS } from '../../utils/formatters'
import ScreenHeader from '../../components/layout/ScreenHeader'
import PrivacyMask from '../../components/ui/PrivacyMask'

function RateRow({ label, value, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '13px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 13, fontWeight: 600, color: '#fff' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontFamily: 'var(--font-num)', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

export default function LiquidezDetail() {
  const { portfolio } = useApp()
  const liq = portfolio?.liquidez ?? {}
  const detalle = liq.detalle ?? []
  const pct = liq.pct_cartera ?? 0
  const usd = liq.usd_total_aprox ?? 0
  const ars = liq.subtotal_ars ?? 0

  return (
    <div className="screen">
      <ScreenHeader title="Liquidez" />

      {/* Total de liquidez: % de cartera + ≈USD + ARS */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>
          Liquidez disponible · {pct.toFixed(1).replace('.', ',')}% de la cartera
        </div>
        <div style={{ fontFamily: 'var(--font-num)', fontSize: 26, fontWeight: 700, color: 'var(--warn)', marginTop: 4 }}>
          <PrivacyMask>≈ USD {usd.toLocaleString('es-AR')}</PrivacyMask>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
          <PrivacyMask>{formatARS(ars)}</PrivacyMask>
        </div>
      </div>

      {/* Detalle de efectivo por especie */}
      {detalle.length === 0 ? (
        <div className="state">
          <i className="ti ti-cash-off" aria-hidden="true" />
          <div className="state-title">Sin efectivo registrado</div>
          <div className="state-desc">No hay efectivo registrado en la cartera.</div>
        </div>
      ) : (
        <div className="card">
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>
            Efectivo por especie
          </div>
          {detalle.map((d, i) => (
            <RateRow
              key={i}
              label={d.especie}
              value={<PrivacyMask>{formatARS(d.valor_ars)}</PrivacyMask>}
              sub={d.cantidad != null ? `${Number(d.cantidad).toLocaleString('es-AR')} u.` : undefined}
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, background: 'var(--blue-soft)', border: '1px solid var(--blue-line)', borderRadius: 'var(--r-md)', padding: '11px 12px' }}>
        <i className="ti ti-info-circle" style={{ color: 'var(--accent3)', fontSize: 16 }} aria-hidden="true" />
        <span style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.45 }}>
          Reservar para compra escalonada en posiciones con pérdida real USD y correcciones post-earnings.
        </span>
      </div>
    </div>
  )
}
