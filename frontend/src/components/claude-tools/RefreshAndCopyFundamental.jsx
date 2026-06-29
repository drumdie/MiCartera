import { useState, useRef } from 'react'
import { useApp } from '../../store/AppContext'
import { buildFundamentalContext } from '../../services/contextBuilder'

// Paso 1 del flujo fundamental: actualiza las métricas de Yahoo Y copia el prompt en UN click
// (antes eran 2 botones separados). El prompt se arma con la data ya refrescada.
export default function RefreshAndCopyFundamental({ onToast }) {
  const { fundamental, refreshFundamentals } = useApp()
  const [busy, setBusy] = useState(false)
  // Ref a la data fundamental viva: tras el refresh, el onSnapshot la actualiza en un re-render;
  // leemos del ref para armar el prompt con las métricas frescas.
  const fundRef = useRef(fundamental)
  fundRef.current = fundamental

  const handle = async () => {
    setBusy(true)
    try {
      await refreshFundamentals()
      // dar tiempo a que el onSnapshot traiga la data fresca antes de armar el prompt
      await new Promise(r => setTimeout(r, 900))
      await navigator.clipboard.writeText(buildFundamentalContext(fundRef.current))
      onToast?.('✓ Fundamentales actualizados · prompt copiado')
    } catch (err) {
      onToast?.(err?.message || 'No se pudo actualizar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button className="action-btn" onClick={handle} disabled={busy}>
      <span className="ab-icon"><i className={`ti ${busy ? 'ti-loader-2 spin-ic' : 'ti-number-1'}`} aria-hidden="true" /></span>
      <div className="ab-text">
        <div className="ab-title">{busy ? 'Actualizando…' : 'Paso 1 · Actualizar y copiar prompt'}</div>
        <div className="ab-sub">Trae métricas de Yahoo y copia el prompt para Claude.ai</div>
      </div>
      <span className="ab-arrow"><i className="ti ti-arrow-right" aria-hidden="true" /></span>
    </button>
  )
}
