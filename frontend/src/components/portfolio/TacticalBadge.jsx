const CONFIG = {
  // ── Enums del Contrato de Inversión (spec §4.2 — los 6 oficiales) ──
  comprar_escalonado: { label: 'Comprar escal.',  cls: 'badge-buy'  },
  aumentar:           { label: 'Aumentar',        cls: 'badge-buy'  },
  mantener:           { label: 'Mantener',        cls: 'badge-hold' },
  reducir_parcial:    { label: 'Reducir parcial', cls: 'badge-warn' },
  salir:              { label: 'Salir',           cls: 'badge-sell' },
  observar:           { label: 'Observar',        cls: 'badge-hold' },

  // ── Enums legacy (análisis fundamental previo) — se mantienen mapeados ──
  tomar_parcial:          { label: 'Tomar parcial',   cls: 'badge-sell' },
  compra_tactica:         { label: 'Compra táctica',  cls: 'badge-buy'  },
  compra_escalonada:      { label: 'Compra escal.',   cls: 'badge-buy'  },
  compra_en_correccion:   { label: 'Compra en corr.', cls: 'badge-warn' },
  mantener_tomar_parcial: { label: 'Mantener/Tomar',  cls: 'badge-warn' },
  vender:                 { label: 'Vender',          cls: 'badge-sell' },
}

const BAR_CLS = {
  'badge-buy':  'buy',
  'badge-hold': 'hold',
  'badge-sell': 'sell',
  'badge-warn': 'warn',
}

export default function TacticalBadge({ accion }) {
  if (!accion) return null
  const cfg = CONFIG[accion] ?? { label: accion, cls: 'badge-hold' }
  return <span className={`tr-badge ${cfg.cls}`}>{cfg.label}</span>
}

export function tacticalBarClass(accion) {
  const cfg = CONFIG[accion] ?? { cls: 'badge-hold' }
  return BAR_CLS[cfg.cls] ?? 'hold'
}
