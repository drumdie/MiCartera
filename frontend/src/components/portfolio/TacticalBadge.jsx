const CONFIG = {
  mantener:                { label: 'Mantener',        cls: 'badge-hold' },
  tomar_parcial:           { label: 'Tomar parcial',   cls: 'badge-sell' },
  compra_tactica:          { label: 'Compra táctica',  cls: 'badge-buy'  },
  compra_escalonada:       { label: 'Compra escal.',   cls: 'badge-buy'  },
  compra_en_correccion:    { label: 'Compra en corr.', cls: 'badge-warn' },
  mantener_tomar_parcial:  { label: 'Mantener/Tomar',  cls: 'badge-warn' },
  vender:                  { label: 'Vender',          cls: 'badge-sell' },
}

const BAR_CLS = {
  'badge-buy':  'buy',
  'badge-hold': 'hold',
  'badge-sell': 'sell',
  'badge-warn': 'warn',
}

export default function TacticalBadge({ accion }) {
  const cfg = CONFIG[accion] ?? { label: accion, cls: 'badge-hold' }
  return <span className={`tr-badge ${cfg.cls}`}>{cfg.label}</span>
}

export function tacticalBarClass(accion) {
  const cfg = CONFIG[accion] ?? { cls: 'badge-hold' }
  return BAR_CLS[cfg.cls] ?? 'hold'
}
