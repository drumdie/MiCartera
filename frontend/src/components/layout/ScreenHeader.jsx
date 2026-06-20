import { useNavigate } from 'react-router-dom'

// Appbar de rutas empujadas (detalle / perfil / contrato): back + título centrado + slot derecho.
export default function ScreenHeader({ title, subtitle, right, onBack, fallback = '/' }) {
  const navigate = useNavigate()
  const handleBack = onBack ?? (() => {
    // Si hay historial propio volvemos; si no (deep-link), al home.
    if (window.history.length > 1) navigate(-1)
    else navigate(fallback)
  })

  return (
    <header className="appbar">
      <button className="iconbtn" onClick={handleBack} aria-label="Volver">
        <i className="ti ti-arrow-left" aria-hidden="true" />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="appbar-title">{title}</div>
        {subtitle && <div className="appbar-sub">{subtitle}</div>}
      </div>
      <div className="appbar-slot">{right}</div>
    </header>
  )
}
