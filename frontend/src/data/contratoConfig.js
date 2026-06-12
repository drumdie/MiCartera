// Configuración del Contrato de Inversión por ticker.
// Referencia: spec_contrato_inversion.md §1 (roles, bandas default, kill criteria templates).

// ── Rol en cartera (enum cerrado — 5 valores) ──
export const ROLES = [
  { value: 'core_estructural', label: 'Core estructural (~2030)' },
  { value: 'medio_plazo',      label: 'Medio plazo (1–2 años)'   },
  { value: 'especulativa',     label: 'Especulativa / táctica'   },
  { value: 'renta_defensiva',  label: 'Renta / defensiva'        },
  { value: 'cobertura',        label: 'Cobertura'                },
]

export const ROL_LABELS = Object.fromEntries(ROLES.map(r => [r.value, r.label]))

// ── Banda de peso default por rol (§1.2) ──
// El spec define min–max; el objetivo default es el punto medio de la banda.
export const BANDAS_DEFAULT = {
  core_estructural: { peso_min: 10, peso_objetivo: 15,  peso_max: 20 },
  medio_plazo:      { peso_min: 5,  peso_objetivo: 7.5, peso_max: 10 },
  especulativa:     { peso_min: 0,  peso_objetivo: 2.5, peso_max: 5  },
  renta_defensiva:  { peso_min: 5,  peso_objetivo: 10,  peso_max: 15 },
  cobertura:        { peso_min: 0,  peso_objetivo: 5,   peso_max: 10 },
}

// ── Templates de kill criteria por rol (§1.4) ──
// Triggers técnicos ("ruptura de soporte") SOLO para especulativa: una tesis
// core ~2030 no muere por un gráfico — ese es el error que el sistema previene.
const KILL_FUNDAMENTAL = [
  'Deterioro fuerte del balance (márgenes o deuda) sin plan creíble',
  'Cambio regulatorio adverso que afecte el corazón del negocio',
  'Pérdida del catalizador principal de la tesis',
  'Cambio político que afecte estructuralmente el negocio',
]

export const KILL_TEMPLATES = {
  core_estructural: [
    ...KILL_FUNDAMENTAL,
    'Suba excesiva sin mejora de fundamentals (pérdida de margen de seguridad)',
  ],
  medio_plazo: [
    ...KILL_FUNDAMENTAL,
    'Tesis sin avances concretos después de dos balances consecutivos',
  ],
  especulativa: [
    'Pérdida del catalizador principal de la tesis',
    'Ruptura de soporte técnico clave',
    'Suba excesiva sin mejora de fundamentals (tomar ganancia)',
    'Riesgo remanente no compensado por el upside restante',
  ],
  renta_defensiva: [
    'Deterioro de la capacidad de pago del emisor',
    'Carry que deja de compensar el riesgo (TIR vs alternativas)',
    'Cambio regulatorio o cambiario que comprometa el cobro',
  ],
  cobertura: [
    'El riesgo que se cubría dejó de estar vigente',
    'El costo de mantener la cobertura supera el beneficio esperado',
  ],
}

// ── Frecuencia de revisión (v1: frecuencia sugerida + marcado stale) ──
export const REVISION_OPTS = [
  { value: 'trimestral',   label: 'Trimestral',   staleMeses: 3  },
  { value: 'post_balance', label: 'Post-balance', staleMeses: 4  },
  { value: 'semestral',    label: 'Semestral',    staleMeses: 6  },
  { value: 'anual',        label: 'Anual',        staleMeses: 12 },
]

const STALE_MESES = Object.fromEntries(REVISION_OPTS.map(r => [r.value, r.staleMeses]))

// ── Enums cerrados del output del LLM (§4) ──
export const SALUD_TESIS = ['intacta', 'debilitada', 'en_observacion', 'rota']
export const ACCIONES_TACTICAS = [
  'comprar_escalonado', 'aumentar', 'mantener', 'reducir_parcial', 'salir', 'observar',
]
export const URGENCIAS = ['alta', 'media', 'baja', 'sin_accion_inmediata']

export const SALUD_LABELS = {
  intacta:        'Tesis intacta',
  debilitada:     'Tesis debilitada',
  en_observacion: 'En observación',
  rota:           'Tesis rota',
}

// ── Umbrales de la capa determinística ──
// |rend_usd| > UMBRAL_MOV_FUERTE → flag subio_fuerte / cayo_fuerte (momentum de precio)
export const UMBRAL_MOV_FUERTE = 25
// Red de seguridad: |rend_usd| > este valor se trata como dato corrupto. El bug de
// rendimientos ONs/FCI YA está resuelto (commit 8705834), así que esto prácticamente
// no se dispara — queda como guarda ante cualquier glitch futuro de datos.
export const RENDIMIENTO_MAX_CONFIABLE = 500

// ── Helpers de estado del contrato ──

export function mesesDesde(isoDate) {
  if (!isoDate) return null
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

// Completo: rol + banda válida (min ≤ objetivo ≤ max) + tesis + ≥1 kill criterion
export function contratoCompleto(c) {
  if (!c?.rol || !c.tesis?.trim()) return false
  const kills = (c.kill_criteria ?? []).filter(k => (k ?? '').trim())
  if (kills.length === 0) return false
  const { peso_min, peso_objetivo, peso_max } = c
  const nums = [peso_min, peso_objetivo, peso_max].map(Number)
  if (nums.some(n => !Number.isFinite(n))) return false
  return nums[0] <= nums[1] && nums[1] <= nums[2]
}

// Stale: la última actualización supera la ventana de revisión elegida
export function contratoStale(c) {
  if (!c?.actualizado) return false
  const meses = mesesDesde(c.actualizado)
  if (meses == null) return false
  return meses > (STALE_MESES[c.revision] ?? 3)
}
