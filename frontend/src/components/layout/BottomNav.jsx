// Bottom-nav flotante: 4 secciones + acción central de sync (PPI).
// Reemplaza los tabs sticky de arriba. La pantalla Perfil se abre desde el header.

const LEFT = [
  { id: 'posiciones',  label: 'Posic.', icon: 'ti-stack-2' },
  { id: 'fundamental', label: 'Fund.',  icon: 'ti-chart-bar' },
]
const RIGHT = [
  { id: 'catalizadores', label: 'Catal.', icon: 'ti-calendar-event' },
  { id: 'graficos',      label: 'Gráf.',  icon: 'ti-chart-candle' },
]

function NavBtn({ item, active, onSelect }) {
  return (
    <button
      type="button"
      className={`bottomnav-item ${active ? 'active' : ''}`}
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
    >
      <i className={`ti ${item.icon}`} aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  )
}

export default function BottomNav({ active, onSelect, onSync, syncing = false, canSync = true }) {
  return (
    <nav className="bottomnav" aria-label="Navegación principal">
      {LEFT.map((it) => <NavBtn key={it.id} item={it} active={active === it.id} onSelect={onSelect} />)}

      <button
        type="button"
        className={`bottomnav-center ${syncing ? 'spinning' : ''}`}
        onClick={onSync}
        disabled={syncing || !canSync}
        aria-label={syncing ? 'Sincronizando' : 'Sincronizar con PPI'}
      >
        <i className="ti ti-refresh" aria-hidden="true" />
      </button>

      {RIGHT.map((it) => <NavBtn key={it.id} item={it} active={active === it.id} onSelect={onSelect} />)}
    </nav>
  )
}
