// Capa determinística del módulo táctico (Contrato de Inversión).
// La app calcula, no opina: todos los números salen de lo que ya computa
// usePortfolio (pct_cartera, rend_usd_pct, rend_total_usd_pct) cruzado con los
// contratos del usuario. El LLM recibe estos datos y razona dentro de ese marco
// — no inventa números.

import {
  SALUD_TESIS, ACCIONES_TACTICAS, URGENCIAS,
  UMBRAL_MOV_FUERTE, RENDIMIENTO_MAX_CONFIABLE,
} from '../data/contratoConfig'

const CATEGORIAS = [
  ['acciones_ar', 'Acción AR'],
  ['cedears',     'CEDEAR'],
  ['bonos',       'Bono'],
  ['ons',         'ON'],
  ['fci',         'FCI'],
]

// Grupo fallback para tickers sin grupo temático asignado
const GRUPO_FALLBACK = {
  acciones_ar: 'Acciones AR',
  cedears:     'CEDEARs',
  bonos:       'Bonos',
  ons:         'ONs',
  fci:         'FCI',
}

const round2 = (n) => Math.round(n * 100) / 100

// Rendimiento confiable: red de seguridad ante datos corruptos. El bug de
// rendimientos ONs/FCI ya está resuelto (commit 8705834), así que prácticamente
// nunca filtra — pero evita activar flags o priorizar mal si algún dato se rompe.
function rendConfiable(rend) {
  if (rend == null || !Number.isFinite(Number(rend))) return null
  const r = Number(rend)
  return Math.abs(r) > RENDIMIENTO_MAX_CONFIABLE ? null : r
}

/**
 * Cruza el portfolio computado con los contratos por ticker.
 * Devuelve null si no hay portfolio.
 *
 * {
 *   posiciones:   [{ ticker, categoria, descripcion, grupo, peso_actual,
 *                    rend_usd_pct, rend_total_usd_pct, renta_cobrada_usd,
 *                    contrato, clasificacion, pp_liberables, pp_faltantes,
 *                    subio_fuerte, cayo_fuerte }],
 *   grupos:       [{ grupo, pct, posiciones }]   — orden del tab Fundamental
 *   concentracion:[{ grupo, pct }]               — desc por peso
 *   suma_peso_objetivo: number|null              — solo contratos de tickers en cartera
 *   liquidez_pct, liquidez_usd
 * }
 */
export function computeTactico(portfolio, contratos, { grupoTematico = {}, grupoOrden = [] } = {}) {
  if (!portfolio) return null

  const posiciones = []

  for (const [key, categoria] of CATEGORIAS) {
    for (const p of portfolio[key]?.posiciones ?? []) {
      if (!p.ticker) continue

      const peso = round2(p.pct_cartera ?? 0)
      const c    = contratos?.[p.ticker] ?? null
      const rend = rendConfiable(p.rend_usd_pct)

      // Desvío vs banda — requiere banda definida en el contrato
      let clasificacion = 'sin_contrato'
      let pp_liberables = 0
      let pp_faltantes  = 0
      const min = Number(c?.peso_min)
      const max = Number(c?.peso_max)
      if (c?.rol && Number.isFinite(min) && Number.isFinite(max)) {
        if (peso < min) {
          clasificacion = 'debajo_de_banda'
          pp_faltantes  = round2(min - peso)
        } else if (peso > max) {
          clasificacion = 'sobreponderada'
          pp_liberables = round2(peso - max)
        } else {
          clasificacion = 'en_banda'
        }
      }

      posiciones.push({
        ticker:       p.ticker,
        categoria,
        descripcion:  p.descripcion ?? '',
        grupo:        grupoTematico[p.ticker] ?? GRUPO_FALLBACK[key],
        peso_actual:  peso,
        rend_usd_pct: rend,
        rend_no_confiable: p.rend_usd_pct != null && rend == null,
        // Rend. total (precio + renta cobrada) y renta, cuando el backend los atribuyó.
        rend_total_usd_pct: p.rend_total_usd_pct ?? null,
        renta_cobrada_usd:  p.renta_cobrada_usd ?? null,
        contrato:     c,
        clasificacion,
        pp_liberables,
        pp_faltantes,
        subio_fuerte: rend != null && rend >  UMBRAL_MOV_FUERTE,
        cayo_fuerte:  rend != null && rend < -UMBRAL_MOV_FUERTE,
      })
    }
  }

  // Agrupación por grupo temático, mismo orden que el tab Fundamental
  const byGrupo = {}
  for (const pos of posiciones) {
    if (!byGrupo[pos.grupo]) byGrupo[pos.grupo] = []
    byGrupo[pos.grupo].push(pos)
  }
  const orden = (g) => {
    const i = grupoOrden.indexOf(g)
    return i === -1 ? grupoOrden.length : i
  }
  const grupos = Object.entries(byGrupo)
    .map(([grupo, pos]) => ({
      grupo,
      pct: round2(pos.reduce((s, p) => s + p.peso_actual, 0)),
      posiciones: pos,
    }))
    .sort((a, b) => orden(a.grupo) - orden(b.grupo) || a.grupo.localeCompare(b.grupo))

  // Concentración por grupo temático (% del total de cartera, desc)
  const concentracion = grupos
    .map(({ grupo, pct }) => ({ grupo, pct }))
    .sort((a, b) => b.pct - a.pct)

  // Suma de pesos objetivo (solo contratos de tickers presentes en la cartera)
  const conObjetivo = posiciones.filter(p => Number.isFinite(Number(p.contrato?.peso_objetivo)))
  const suma_peso_objetivo = conObjetivo.length > 0
    ? round2(conObjetivo.reduce((s, p) => s + Number(p.contrato.peso_objetivo), 0))
    : null

  return {
    posiciones,
    grupos,
    concentracion,
    suma_peso_objetivo,
    liquidez_pct: round2(portfolio.liquidez?.pct_cartera ?? 0),
    liquidez_usd: portfolio.liquidez?.usd_total_aprox ?? 0,
  }
}

/**
 * Valida el JSON táctico pegado desde Claude.ai ANTES de guardar.
 * Enums cerrados (salud_tesis, accion_tactica, urgencia): cualquier valor fuera
 * de enum rechaza la carga completa con detalle de ticker/campo — nunca se
 * guarda silenciosamente un valor inválido.
 *
 * Devuelve { ok, errores, analisis, ranking }.
 */
export function validateTacticalPayload(parsed) {
  const errores = []
  const analisis = Array.isArray(parsed?.analisis_tactico) ? parsed.analisis_tactico : null
  const ranking  = Array.isArray(parsed?.ranking_tactico)  ? parsed.ranking_tactico  : null

  if (!analisis && !ranking) {
    return {
      ok: false,
      errores: ['El JSON no tiene "analisis_tactico" ni "ranking_tactico"'],
      analisis: null, ranking: null,
    }
  }

  const checkEnum = (ticker, campo, valor, enumVals, requerido) => {
    if (valor == null || valor === '') {
      if (requerido) errores.push(`${ticker}: falta el campo "${campo}"`)
      return
    }
    if (!enumVals.includes(valor)) {
      errores.push(`${ticker}: ${campo}="${valor}" fuera de enum (${enumVals.join(' | ')})`)
    }
  }

  for (const item of analisis ?? []) {
    const t = item?.ticker
    if (!t) { errores.push('analisis_tactico: item sin ticker'); continue }
    checkEnum(t, 'salud_tesis',    item.salud_tesis,    SALUD_TESIS,       true)
    checkEnum(t, 'accion_tactica', item.accion_tactica, ACCIONES_TACTICAS, true)
    checkEnum(t, 'urgencia',       item.urgencia,       URGENCIAS,         true)
  }

  for (const item of ranking ?? []) {
    const t = item?.ticker
    if (!t) { errores.push('ranking_tactico: item sin ticker'); continue }
    checkEnum(t, 'accion',   item.accion,   ACCIONES_TACTICAS, true)
    checkEnum(t, 'urgencia', item.urgencia, URGENCIAS,         true)
    if (item.impacto_pp != null && !Number.isFinite(Number(item.impacto_pp))) {
      errores.push(`${t}: impacto_pp="${item.impacto_pp}" no es numérico`)
    }
  }

  return { ok: errores.length === 0, errores, analisis, ranking }
}
