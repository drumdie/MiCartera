import { useState, useEffect, useMemo } from 'react'
import { onSnapshotContratos } from '../services/portfolioService'
import { computeTactico } from '../services/tacticalEngine'
import { _GRUPO_TEMATICO, _GRUPO_ORDEN } from './usePortfolio'

// Suscribe los contratos por ticker del usuario y cruza con el portfolio computado
// para producir la capa determinística (computeTactico): pesos, desvío vs banda,
// pp liberables/faltantes, concentración por grupo temático.
export function useContratos(uid, portfolio) {
  const [contratos, setContratos] = useState({})

  useEffect(() => {
    if (!uid) { setContratos({}); return }
    return onSnapshotContratos(uid, setContratos)
  }, [uid])

  const tactico = useMemo(
    () => computeTactico(portfolio, contratos, {
      grupoTematico: _GRUPO_TEMATICO,
      grupoOrden: _GRUPO_ORDEN,
    }),
    [portfolio, contratos],
  )

  return { contratos, tactico }
}
