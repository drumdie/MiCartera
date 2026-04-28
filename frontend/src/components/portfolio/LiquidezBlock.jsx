import PrivacyMask from '../ui/PrivacyMask'

export default function LiquidezBlock({ liquidez }) {
  const { pct_cartera, usd_total_aprox, subtotal_ars } = liquidez
  const arsK = Math.round(subtotal_ars / 1000)

  return (
    <div className="liq-block fade-in">
      <div>
        <div className="liq-num">{pct_cartera.toFixed(1).replace('.', ',')}%</div>
        <div className="liq-label">liquidez</div>
      </div>
      <div className="liq-desc">
        <strong className="amount-maskable">
          <PrivacyMask>≈ USD {usd_total_aprox.toLocaleString('es-AR')}</PrivacyMask>
        </strong> disponibles.<br /><br />
        <strong>Uso sugerido:</strong> Compra escalonada en posiciones con pérdida real USD.
        Reservar para correcciones post-earnings.
      </div>
    </div>
  )
}
