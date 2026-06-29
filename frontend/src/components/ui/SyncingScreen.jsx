// Pantalla "Actualizando cartera" para el PRIMER sync (al abrir la cartera).
// Donut pulsante con los colores de las categorías (Opción B aprobada). Web + mobile.
// Los refrescos rápidos NO usan esto: ahí alcanza el aviso "actualizado · hora" del header.
export default function SyncingScreen({
  label = 'Actualizando cartera…',
  sub = 'valorizando posiciones · MEP',
}) {
  return (
    <div className="syncing-screen fade-in">
      <div className="syncing-donut-pulse">
        <svg width="118" height="118" viewBox="0 0 118 118" className="syncing-donut" role="img" aria-label="Actualizando">
          <circle className="sd-track" cx="59" cy="59" r="45" />
          <circle className="sd-arc sd-1" cx="59" cy="59" r="45" />
          <circle className="sd-arc sd-2" cx="59" cy="59" r="45" />
          <circle className="sd-arc sd-3" cx="59" cy="59" r="45" />
        </svg>
      </div>
      <div className="syncing-title">{label}</div>
      <div className="syncing-sub">{sub}</div>
      <div className="syncing-legend">
        <span className="syncing-leg"><span className="syncing-sw" style={{ background: '#00e5a0' }} />Acciones</span>
        <span className="syncing-leg"><span className="syncing-sw" style={{ background: '#4a9eff' }} />CEDEARs</span>
        <span className="syncing-leg"><span className="syncing-sw" style={{ background: '#f7b731' }} />Liquidez</span>
      </div>
    </div>
  )
}
